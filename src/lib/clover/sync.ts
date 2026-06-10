import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CloverClient } from "@/lib/clover/client";
import {
  getConnectedMerchants,
  upsertMerchant,
  ensureValidAccessToken,
} from "@/lib/clover/merchants";
import {
  getBigQuery,
  RAW_DATASET,
  BQ_LOCATION,
} from "@/lib/bigquery/client";

const PROJECT = () => process.env.GOOGLE_CLOUD_PROJECT;
const RAW = () => `${PROJECT()}.${RAW_DATASET}`;

/** Local calendar date + hour for a UTC ms instant in a timezone. */
function localParts(utcMs: number, tz: string): { date: string; hour: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const x of dtf.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: p.hour === "24" ? 0 : Number(p.hour),
  };
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export interface SyncResult {
  merchants: number;
  payments: number;
  orders: number;
  lineItems: number;
  errors: { merchantId: string; message: string }[];
  startDate: string;
  endDate: string;
}

/**
 * Pull each connected merchant's payments + orders from Clover into the BigQuery
 * raw tables, tagged location_id = merchantId. Idempotent for the date range
 * (deletes the synced merchants' rows in-range, then load-appends fresh data).
 *
 * NOTE: bays/bookings are not synced — how Clover represents sim-bay bookings is
 * still an open question (see docs/production-readiness.md). Categories are left
 * null pending the item→category mapping from the audit.
 */
export async function syncMerchants(
  orgId: string,
  opts: { days?: number; merchantId?: string; now?: number } = {}
): Promise<SyncResult> {
  const { days = 90, merchantId, now = Date.now() } = opts;
  let merchants = await getConnectedMerchants(orgId);
  if (merchantId) merchants = merchants.filter((m) => m.merchantId === merchantId);
  const endDate = ymd(new Date(now));
  const startDate = ymd(new Date(now - days * 86_400_000));

  const result: SyncResult = {
    merchants: 0,
    payments: 0,
    orders: 0,
    lineItems: 0,
    errors: [],
    startDate,
    endDate,
  };
  if (!merchants.length) return result;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloversync-"));
  const fPay = fs.createWriteStream(path.join(dir, "payments.ndjson"));
  const fOrd = fs.createWriteStream(path.join(dir, "orders.ndjson"));
  const fLi = fs.createWriteStream(path.join(dir, "line_items.ndjson"));
  const fLoc = fs.createWriteStream(path.join(dir, "locations.ndjson"));
  const syncedIds: string[] = [];

  for (const m of merchants) {
    const tz = m.timezone ?? "UTC";
    try {
      // Refresh the OAuth token first if it's expiring (no-op for dev tokens).
      const accessToken = await ensureValidAccessToken(orgId, m);
      const client = new CloverClient({
        accessToken,
        merchantId: m.merchantId,
        timeZone: tz,
      });

      // Build an item → category map so synced line items are tagged.
      const items = await client.getItems().catch(() => []);
      const catById = new Map<string, string>();
      const catByName = new Map<string, string>();
      for (const it of items) {
        if (it.category) {
          if (it.id) catById.set(it.id, it.category);
          if (it.name) catByName.set(it.name, it.category);
        }
      }
      const categoryFor = (li: { name?: string; item?: { id?: string } }) =>
        (li.item?.id && catById.get(li.item.id)) ||
        (li.name && catByName.get(li.name)) ||
        null;

      const [payments, orders] = await Promise.all([
        client.getPayments(startDate, endDate),
        client.getOrders(startDate, endDate),
      ]);

      for (const p of payments.elements ?? []) {
        const { date } = localParts(p.createdTime, tz);
        const refund = (p.refunds?.elements ?? []).reduce(
          (s, r) => s + (r.amount ?? 0),
          0
        );
        fPay.write(
          JSON.stringify({
            payment_id: p.id,
            location_id: m.merchantId,
            amount_cents: p.amount ?? 0,
            tip_cents: p.tipAmount ?? 0,
            tax_cents: p.taxAmount ?? 0,
            refund_cents: refund,
            result: p.result ?? "SUCCESS",
            created_at: new Date(p.createdTime).toISOString(),
            created_date: date,
          }) + "\n"
        );
        result.payments++;
      }

      for (const o of orders.elements ?? []) {
        const { date, hour } = localParts(o.createdTime, tz);
        fOrd.write(
          JSON.stringify({
            order_id: o.id,
            location_id: m.merchantId,
            total_cents: o.total ?? 0,
            order_type: null,
            created_at: new Date(o.createdTime).toISOString(),
            created_date: date,
            local_hour: hour,
          }) + "\n"
        );
        result.orders++;
        const lines = o.lineItems?.elements ?? [];
        lines.forEach((li, i) => {
          const qty = li.unitQty ? Math.max(1, Math.round(li.unitQty / 1000)) : 1;
          fLi.write(
            JSON.stringify({
              line_item_id: `${o.id}-${i}`,
              order_id: o.id,
              location_id: m.merchantId,
              item_name: li.name ?? null,
              category: categoryFor(li),
              price_cents: li.price ?? 0,
              quantity: qty,
              created_at: new Date(o.createdTime).toISOString(),
              created_date: date,
              local_hour: hour,
            }) + "\n"
          );
          result.lineItems++;
        });
      }

      fLoc.write(
        JSON.stringify({
          location_id: m.merchantId,
          name: m.name ?? m.merchantId,
          timezone: tz,
        }) + "\n"
      );
      syncedIds.push(m.merchantId);
      result.merchants++;
      if (m.status !== "active") {
        await upsertMerchant(orgId, { ...m, status: "active" });
      }
    } catch (e) {
      // Likely an expired/invalid token — mark for reconnect, keep going.
      result.errors.push({
        merchantId: m.merchantId,
        message: e instanceof Error ? e.message.slice(0, 200) : "sync failed",
      });
      await upsertMerchant(orgId, { ...m, status: "error" });
    }
  }

  await Promise.all(
    [fPay, fOrd, fLi, fLoc].map((s) => new Promise((r) => s.end(r)))
  );

  if (syncedIds.length) {
    const bq = getBigQuery();
    const params = { ids: syncedIds, s: startDate, e: endDate };
    // Idempotent: clear the synced merchants' rows in-range (load-job data is
    // immediately DML-able), then append fresh. Synthetic/other locations untouched.
    await bq.query({
      query: `DELETE FROM \`${RAW()}.payments\` WHERE location_id IN UNNEST(@ids) AND created_date BETWEEN @s AND @e`,
      params,
      location: BQ_LOCATION,
    });
    await bq.query({
      query: `DELETE FROM \`${RAW()}.orders\` WHERE location_id IN UNNEST(@ids) AND created_date BETWEEN @s AND @e`,
      params,
      location: BQ_LOCATION,
    });
    await bq.query({
      query: `DELETE FROM \`${RAW()}.order_line_items\` WHERE location_id IN UNNEST(@ids) AND created_date BETWEEN @s AND @e`,
      params,
      location: BQ_LOCATION,
    });
    await bq.query({
      query: `DELETE FROM \`${RAW()}.locations\` WHERE location_id IN UNNEST(@ids)`,
      params: { ids: syncedIds },
      location: BQ_LOCATION,
    });

    const load = async (table: string, file: string, count: number) => {
      if (count === 0) return;
      await bq
        .dataset(RAW_DATASET, { location: BQ_LOCATION })
        .table(table)
        .load(path.join(dir, file), {
          sourceFormat: "NEWLINE_DELIMITED_JSON",
          writeDisposition: "WRITE_APPEND",
        });
    };
    await load("payments", "payments.ndjson", result.payments);
    await load("orders", "orders.ndjson", result.orders);
    await load("order_line_items", "line_items.ndjson", result.lineItems);
    await load("locations", "locations.ndjson", syncedIds.length);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}
