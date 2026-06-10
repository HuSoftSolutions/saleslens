import {
  getBigQuery,
  RAW_DATASET,
  MARTS_DATASET,
  BQ_LOCATION,
} from "@/lib/bigquery/client";
import type {
  SalesSummary,
  PeriodComparison,
  TopSellingItem,
  RefundSummary,
  HourlySalesBreakdown,
} from "@/types";

const PROJECT = () => process.env.GOOGLE_CLOUD_PROJECT;
const RAW = () => `${PROJECT()}.${RAW_DATASET}`;
const MARTS = () => `${PROJECT()}.${MARTS_DATASET}`;

// Hard cap on bytes a single query may bill — a runaway query fails instead of
// running up cost. Default 1 GB (queries here scan ~MBs).
const MAX_BYTES_BILLED = process.env.BIGQUERY_MAX_BYTES_BILLED ?? "1073741824";

async function q<T>(
  query: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const [rows] = await getBigQuery().query({
    query,
    params,
    location: BQ_LOCATION,
    maximumBytesBilled: MAX_BYTES_BILLED,
  });
  return rows as T[];
}

/**
 * List warehouse locations the org owns. ALWAYS scoped to allowedIds — never
 * returns locations belonging to other tenants. Empty list → no locations.
 */
export async function getLocations(
  allowedIds: string[]
): Promise<{ id: string; name: string }[]> {
  if (!allowedIds.length) return [];
  const rows = await q<{ location_id: string; name: string }>(
    `SELECT location_id, name FROM \`${RAW()}.locations\`
     WHERE location_id IN UNNEST(@ids) ORDER BY location_id`,
    { ids: allowedIds }
  );
  return rows.map((r) => ({ id: r.location_id, name: r.name }));
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/**
 * BigQuery-backed analytics provider, **scoped to a single org's location IDs**
 * (its connected Clover merchant IDs). Every query is filtered to allowedIds so
 * one tenant can never read another tenant's data from the shared warehouse.
 */
export function createBigQueryAnalytics(allowedIds: string[]) {
  // Tenant isolation: every query ANDs `location_id IN @__locs`. Empty allowedIds
  // matches nothing (safe default).
  const scopeParams = { __locs: allowedIds };
  const scope = (col = "location_id") => ` AND ${col} IN UNNEST(@__locs)`;

  let locCache: { id: string; name: string }[] | null = null;

  async function resolveLocation(location?: string): Promise<{
    where: string;
    params: Record<string, unknown>;
  }> {
    if (!location || !location.trim()) return { where: "", params: {} };
    if (!locCache) locCache = await getLocations(allowedIds);
    const t = location.trim().toLowerCase();
    const match =
      locCache.find((l) => l.id.toLowerCase() === t) ??
      locCache.find((l) => l.name.toLowerCase() === t) ??
      locCache.find((l) => l.name.toLowerCase().includes(t));
    if (!match) return { where: "", params: {} }; // unknown → all (still org-scoped)
    return { where: " AND location_id = @loc", params: { loc: match.id } };
  }

  async function getSalesSummary(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<SalesSummary> {
    const loc = await resolveLocation(location);
    const [row] = await q<{
      gross: number | null;
      cnt: number | null;
      tip: number | null;
      tax: number | null;
      refund: number | null;
    }>(
      `SELECT
         SUM(gross_cents) AS gross, SUM(payment_count) AS cnt,
         SUM(tip_cents) AS tip, SUM(tax_cents) AS tax, SUM(refund_cents) AS refund
       FROM \`${MARTS()}.daily_sales_by_location\`
       WHERE date BETWEEN @start AND @end${scope()}${loc.where}`,
      { start: startDate, end: endDate, ...scopeParams, ...loc.params }
    );
    const gross = Number(row?.gross ?? 0);
    const count = Number(row?.cnt ?? 0);
    return {
      grossTotal: gross / 100,
      paymentCount: count,
      averagePayment: count > 0 ? gross / 100 / count : 0,
      tipTotal: Number(row?.tip ?? 0) / 100,
      taxTotal: Number(row?.tax ?? 0) / 100,
      refundTotal: Number(row?.refund ?? 0) / 100,
      startDate,
      endDate,
    };
  }

  async function compareSalesPeriods(
    periodA: { startDate: string; endDate: string },
    periodB: { startDate: string; endDate: string },
    location?: string
  ): Promise<PeriodComparison> {
    const [a, b] = await Promise.all([
      getSalesSummary(periodA.startDate, periodA.endDate, location),
      getSalesSummary(periodB.startDate, periodB.endDate, location),
    ]);
    const pct = (x: number, y: number) =>
      x === 0 ? (y === 0 ? 0 : 100) : ((y - x) / Math.abs(x)) * 100;
    return {
      periodA: a,
      periodB: b,
      deltas: {
        grossTotal: pct(a.grossTotal, b.grossTotal),
        paymentCount: pct(a.paymentCount, b.paymentCount),
        averagePayment: pct(a.averagePayment, b.averagePayment),
        tipTotal: pct(a.tipTotal, b.tipTotal),
        taxTotal: pct(a.taxTotal, b.taxTotal),
        refundTotal: pct(a.refundTotal, b.refundTotal),
      },
    };
  }

  async function getTopSellingItems(
    startDate: string,
    endDate: string,
    limit = 10,
    location?: string
  ): Promise<TopSellingItem[]> {
    const loc = await resolveLocation(location);
    const rows = await q<{ name: string; quantity: number; gross: number }>(
      `SELECT item_name AS name, SUM(quantity) AS quantity, SUM(gross_cents) AS gross
       FROM \`${MARTS()}.item_sales_daily\`
       WHERE date BETWEEN @start AND @end
         AND (category IS NULL OR category != 'Sim Time')${scope()}${loc.where}
       GROUP BY name ORDER BY quantity DESC LIMIT @limit`,
      { start: startDate, end: endDate, limit, ...scopeParams, ...loc.params }
    );
    return rows.map((r) => ({
      name: r.name,
      quantity: Number(r.quantity),
      grossSales: Math.round(Number(r.gross)) / 100,
    }));
  }

  async function getRefundSummary(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<RefundSummary> {
    const loc = await resolveLocation(location);
    const [row] = await q<{ cnt: number | null; total: number | null }>(
      `SELECT COUNT(*) AS cnt, SUM(refund_cents) AS total
       FROM \`${RAW()}.payments\`
       WHERE created_date BETWEEN @start AND @end AND refund_cents > 0${scope()}${loc.where}`,
      { start: startDate, end: endDate, ...scopeParams, ...loc.params }
    );
    return {
      refundCount: Number(row?.cnt ?? 0),
      refundTotal: Number(row?.total ?? 0) / 100,
      startDate,
      endDate,
    };
  }

  async function getSalesByHour(
    startDate: string,
    endDate: string,
    itemName?: string,
    location?: string
  ): Promise<HourlySalesBreakdown[]> {
    const loc = await resolveLocation(location);
    const base = { start: startDate, end: endDate, ...scopeParams, ...loc.params };

    const orderRows = await q<{ hour: number; order_count: number }>(
      `SELECT local_hour AS hour, COUNT(*) AS order_count
       FROM \`${RAW()}.orders\`
       WHERE created_date BETWEEN @start AND @end${scope()}${loc.where}
       GROUP BY hour`,
      base
    );

    const itemFilter = itemName ? " AND LOWER(item_name) = @item" : "";
    const itemRows = await q<{
      hour: number;
      item_name: string;
      qty: number;
      gross: number;
    }>(
      `SELECT local_hour AS hour, item_name, SUM(quantity) AS qty,
              SUM(price_cents * quantity) AS gross
       FROM \`${RAW()}.order_line_items\`
       WHERE created_date BETWEEN @start AND @end${scope()}${loc.where}${itemFilter}
       GROUP BY hour, item_name`,
      itemName ? { ...base, item: itemName.toLowerCase() } : base
    );

    const buckets = new Map<
      number,
      {
        orderCount: number;
        itemCount: number;
        grossCents: number;
        items: Map<string, number>;
      }
    >();
    const bucket = (h: number) => {
      let b = buckets.get(h);
      if (!b) {
        b = { orderCount: 0, itemCount: 0, grossCents: 0, items: new Map() };
        buckets.set(h, b);
      }
      return b;
    };

    for (const r of orderRows) bucket(Number(r.hour)).orderCount = Number(r.order_count);
    for (const r of itemRows) {
      const b = bucket(Number(r.hour));
      const qty = Number(r.qty);
      b.itemCount += qty;
      b.grossCents += Number(r.gross);
      b.items.set(r.item_name, (b.items.get(r.item_name) ?? 0) + qty);
    }

    return Array.from(buckets.entries())
      .map(([hour, b]) => ({
        hour,
        label: hourLabel(hour),
        orderCount: b.orderCount,
        itemCount: Math.round(b.itemCount),
        grossSales: Math.round(b.grossCents) / 100,
        topItems: Array.from(b.items.entries())
          .map(([name, quantity]) => ({ name, quantity: Math.round(quantity) }))
          .sort((x, y) => y.quantity - x.quantity)
          .slice(0, 3),
      }))
      .filter((h) => h.orderCount > 0 || h.itemCount > 0)
      .sort((a, b) => a.hour - b.hour);
  }

  async function getRevenueByCategory(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<{ category: string; grossSales: number; quantity: number }[]> {
    const loc = await resolveLocation(location);
    const rows = await q<{ category: string; gross: number; qty: number }>(
      `SELECT category, SUM(gross_cents) AS gross, SUM(quantity) AS qty
       FROM \`${MARTS()}.category_sales_daily\`
       WHERE date BETWEEN @start AND @end${scope()}${loc.where}
       GROUP BY category ORDER BY gross DESC`,
      { start: startDate, end: endDate, ...scopeParams, ...loc.params }
    );
    return rows.map((r) => ({
      category: r.category,
      grossSales: Number(r.gross) / 100,
      quantity: Number(r.qty),
    }));
  }

  async function getBayUtilization(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<
    {
      location: string;
      bayName: string;
      tier: string;
      bookings: number;
      bookedHours: number;
      grossSales: number;
      utilizationPct: number;
    }[]
  > {
    const loc = await resolveLocation(location);
    const [y1, m1, d1] = startDate.split("-").map(Number);
    const [y2, m2, d2] = endDate.split("-").map(Number);
    const days =
      Math.round(
        (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
      ) + 1;
    const availableMins = 12 * 60 * days;
    const rows = await q<{
      name: string;
      bay_name: string;
      tier: string;
      bookings: number;
      mins: number;
      gross: number;
    }>(
      `SELECT COALESCE(l.name, u.location_id) AS name, u.bay_name, ANY_VALUE(u.tier) AS tier,
              SUM(u.bookings) AS bookings, SUM(u.booked_minutes) AS mins,
              SUM(u.gross_cents) AS gross
       FROM \`${MARTS()}.bay_utilization_daily\` u
       LEFT JOIN \`${RAW()}.locations\` l ON l.location_id = u.location_id
       WHERE u.date BETWEEN @start AND @end${scope("u.location_id")}${loc.where.replace(/location_id/g, "u.location_id")}
       GROUP BY name, u.bay_name
       ORDER BY gross DESC LIMIT 50`,
      { start: startDate, end: endDate, ...scopeParams, ...loc.params }
    );
    return rows.map((r) => ({
      location: r.name,
      bayName: r.bay_name,
      tier: r.tier,
      bookings: Number(r.bookings),
      bookedHours: Math.round((Number(r.mins) / 60) * 10) / 10,
      grossSales: Number(r.gross) / 100,
      utilizationPct:
        availableMins > 0
          ? Math.round((Number(r.mins) / availableMins) * 1000) / 10
          : 0,
    }));
  }

  async function getPeakBookingHours(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<
    { hour: number; label: string; bookings: number; grossSales: number }[]
  > {
    const loc = await resolveLocation(location);
    const rows = await q<{ hour: number; bookings: number; gross: number }>(
      `SELECT local_hour AS hour, COUNT(*) AS bookings, SUM(price_cents) AS gross
       FROM \`${RAW()}.bookings\`
       WHERE created_date BETWEEN @start AND @end${scope()}${loc.where}
       GROUP BY hour ORDER BY hour`,
      { start: startDate, end: endDate, ...scopeParams, ...loc.params }
    );
    return rows.map((r) => ({
      hour: Number(r.hour),
      label: hourLabel(Number(r.hour)),
      bookings: Number(r.bookings),
      grossSales: Number(r.gross) / 100,
    }));
  }

  async function getSalesByLocation(
    startDate: string,
    endDate: string
  ): Promise<
    { locationId: string; name: string; grossSales: number; paymentCount: number }[]
  > {
    const rows = await q<{
      location_id: string;
      name: string;
      gross: number;
      cnt: number;
    }>(
      `SELECT d.location_id, COALESCE(l.name, d.location_id) AS name,
              SUM(d.gross_cents) AS gross, SUM(d.payment_count) AS cnt
       FROM \`${MARTS()}.daily_sales_by_location\` d
       LEFT JOIN \`${RAW()}.locations\` l ON l.location_id = d.location_id
       WHERE d.date BETWEEN @start AND @end${scope("d.location_id")}
       GROUP BY d.location_id, name
       ORDER BY gross DESC`,
      { start: startDate, end: endDate, ...scopeParams }
    );
    return rows.map((r) => ({
      locationId: r.location_id,
      name: r.name,
      grossSales: Number(r.gross) / 100,
      paymentCount: Number(r.cnt),
    }));
  }

  return {
    getSalesSummary,
    compareSalesPeriods,
    getTopSellingItems,
    getRefundSummary,
    getSalesByHour,
    getSalesByLocation,
    getRevenueByCategory,
    getBayUtilization,
    getPeakBookingHours,
  };
}
