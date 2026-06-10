import { adminDb } from "@/lib/firebase/admin";
import { getConnectedMerchants, type ConnectedMerchant } from "@/lib/clover/merchants";
import { syncMerchants } from "@/lib/clover/sync";

/**
 * Automatic per-merchant sync orchestration.
 *
 * Two jobs, both watermark-driven so they need zero per-client setup:
 *  - Incremental: keep each merchant current (sync from the forward watermark to
 *    today, with a 2-day overlap to catch late-posted transactions).
 *  - Backfill: walk history backward in chunks from the earliest synced date
 *    toward a target (default 1 year), resumable across invocations.
 *
 * Watermarks live on the merchant doc (organizations/{orgId}/cloverMerchants/{id})
 * under sync* fields. upsertMerchant uses merge writes and never touches these,
 * so token rotation / status changes leave sync state intact.
 *
 * The underlying syncMerchants() is idempotent (delete-in-range then append), so
 * re-running any chunk or overlap is always safe.
 */

export const DEFAULT_BACKFILL_DAYS = 365;
const CHUNK_DAYS = 30; // history walked one month per chunk
const INCREMENTAL_OVERLAP_DAYS = 2;

export type BackfillStatus = "pending" | "running" | "complete" | "error";

export interface MerchantSyncState {
  lastDate: string | null; // forward watermark (latest date synced)
  historyStart: string | null; // backward watermark (earliest date synced)
  backfillTarget: string | null; // earliest date we aim to reach
  backfillStatus: BackfillStatus | null;
}

// ── date helpers (UTC calendar dates, matching sync.ts) ──────────────────────
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function todayYmd(now: number): string {
  return ymd(new Date(now));
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
/** Later of two YYYY-MM-DD dates (string compare is valid for this format). */
function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function merchantDoc(orgId: string, merchantId: string) {
  return adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("cloverMerchants")
    .doc(merchantId);
}

export async function readSyncState(
  orgId: string,
  merchantId: string
): Promise<MerchantSyncState> {
  const snap = await merchantDoc(orgId, merchantId).get();
  const d = snap.data() ?? {};
  return {
    lastDate: d.syncLastDate ?? null,
    historyStart: d.syncHistoryStart ?? null,
    backfillTarget: d.syncBackfillTarget ?? null,
    backfillStatus: d.syncBackfillStatus ?? null,
  };
}

async function writeSyncState(
  orgId: string,
  merchantId: string,
  patch: Partial<{
    syncLastDate: string;
    syncHistoryStart: string;
    syncBackfillTarget: string;
    syncBackfillStatus: BackfillStatus;
  }>
): Promise<void> {
  await merchantDoc(orgId, merchantId).set(
    { ...patch, syncUpdatedAt: new Date() },
    { merge: true }
  );
}

/** Mark a freshly-connected merchant for a backfill of the last `days` days. */
export async function initMerchantBackfill(
  orgId: string,
  merchantId: string,
  days = DEFAULT_BACKFILL_DAYS,
  now = Date.now()
): Promise<void> {
  await writeSyncState(orgId, merchantId, {
    syncBackfillTarget: addDays(todayYmd(now), -days),
    syncBackfillStatus: "pending",
  });
}

/** Push an existing merchant's backfill target further back (Import more history). */
export async function extendBackfill(
  orgId: string,
  merchantId: string,
  days: number,
  now = Date.now()
): Promise<void> {
  const state = await readSyncState(orgId, merchantId);
  const newTarget = addDays(todayYmd(now), -days);
  // Only ever move the target earlier.
  const target =
    state.backfillTarget && state.backfillTarget < newTarget
      ? state.backfillTarget
      : newTarget;
  await writeSyncState(orgId, merchantId, {
    syncBackfillTarget: target,
    syncBackfillStatus: "pending",
  });
}

/** Sync from the forward watermark up to today. Keeps a merchant current. */
export async function runIncremental(
  orgId: string,
  merchant: ConnectedMerchant,
  now = Date.now()
): Promise<{ ok: boolean; error?: string }> {
  const today = todayYmd(now);
  const state = await readSyncState(orgId, merchant.merchantId);
  const startDate = state.lastDate
    ? addDays(state.lastDate, -INCREMENTAL_OVERLAP_DAYS)
    : today;

  const res = await syncMerchants(orgId, {
    merchantId: merchant.merchantId,
    startDate,
    endDate: today,
    now,
  });
  const err = res.errors.find((e) => e.merchantId === merchant.merchantId);
  if (err) return { ok: false, error: err.message };

  await writeSyncState(orgId, merchant.merchantId, {
    syncLastDate: today,
    // First-ever sync seeds the backward watermark at today.
    ...(state.historyStart ? {} : { syncHistoryStart: today }),
  });
  return { ok: true };
}

/** Walk history backward in chunks toward the target, until done or out of time. */
export async function runBackfill(
  orgId: string,
  merchant: ConnectedMerchant,
  opts: { now?: number; deadlineMs: number }
): Promise<{ complete: boolean; chunks: number; error?: string }> {
  const now = opts.now ?? Date.now();
  let state = await readSyncState(orgId, merchant.merchantId);
  const target = state.backfillTarget;
  // Nothing to do without a target, or already reached.
  if (!target) return { complete: true, chunks: 0 };

  let historyStart = state.historyStart ?? todayYmd(now);
  let chunks = 0;

  if (historyStart <= target) {
    await writeSyncState(orgId, merchant.merchantId, { syncBackfillStatus: "complete" });
    return { complete: true, chunks: 0 };
  }

  await writeSyncState(orgId, merchant.merchantId, { syncBackfillStatus: "running" });

  while (historyStart > target && Date.now() < opts.deadlineMs) {
    const chunkEnd = addDays(historyStart, -1);
    const chunkStart = maxDate(target, addDays(chunkEnd, -(CHUNK_DAYS - 1)));

    const res = await syncMerchants(orgId, {
      merchantId: merchant.merchantId,
      startDate: chunkStart,
      endDate: chunkEnd,
      now,
    });
    const err = res.errors.find((e) => e.merchantId === merchant.merchantId);
    if (err) {
      await writeSyncState(orgId, merchant.merchantId, { syncBackfillStatus: "error" });
      return { complete: false, chunks, error: err.message };
    }

    historyStart = chunkStart;
    chunks++;
    await writeSyncState(orgId, merchant.merchantId, { syncHistoryStart: historyStart });
    state = { ...state, historyStart };
  }

  const complete = historyStart <= target;
  await writeSyncState(orgId, merchant.merchantId, {
    // "running" leaves it for the next cron tick to resume.
    syncBackfillStatus: complete ? "complete" : "running",
  });
  return { complete, chunks };
}

/**
 * Connect-time kick (run in the background via after()): get every named merchant
 * current immediately, then spend the remaining budget walking history backward.
 */
export async function runConnectBackfill(
  orgId: string,
  merchantIds: string[],
  opts: { now?: number; budgetMs?: number } = {}
): Promise<void> {
  const now = opts.now ?? Date.now();
  const deadlineMs = Date.now() + (opts.budgetMs ?? 230_000);

  const merchants = (await getConnectedMerchants(orgId)).filter((m) =>
    merchantIds.includes(m.merchantId)
  );

  // Recent data first, for every merchant, so the dashboard lights up fast.
  for (const m of merchants) {
    await runIncremental(orgId, m, now);
  }
  // Then deep history within whatever time is left; the nightly cron finishes any remainder.
  for (const m of merchants) {
    if (Date.now() >= deadlineMs) break;
    await runBackfill(orgId, m, { now, deadlineMs });
  }
}

export interface NightlySummary {
  orgs: number;
  merchants: number;
  incremental: number;
  backfillChunks: number;
  errors: number;
  completed: boolean;
}

/**
 * The nightly job. Enumerates every active merchant across all NON-suspended
 * orgs at run time — so newly-registered clients are picked up automatically
 * with zero setup. Keeps everyone current first (cheap), then advances any
 * in-progress backfills with the remaining time budget. Idempotent and
 * self-healing: a missed or truncated run is finished on the next tick.
 */
export async function runNightlySync(
  opts: { now?: number; budgetMs?: number } = {}
): Promise<NightlySummary> {
  const now = opts.now ?? Date.now();
  const deadlineMs = Date.now() + (opts.budgetMs ?? 270_000);

  const orgsSnap = await adminDb.collection("organizations").get();
  const activeOrgs = orgsSnap.docs.filter(
    (d) => d.data()?.status !== "suspended"
  );

  const tasks: { orgId: string; merchant: ConnectedMerchant }[] = [];
  for (const orgDoc of activeOrgs) {
    const merchants = (await getConnectedMerchants(orgDoc.id)).filter(
      (m) => m.status === "active"
    );
    for (const merchant of merchants) tasks.push({ orgId: orgDoc.id, merchant });
  }

  let incremental = 0;
  let backfillChunks = 0;
  let errors = 0;

  // Pass 1: keep everyone current (small, fast).
  for (const t of tasks) {
    if (Date.now() >= deadlineMs) break;
    const r = await runIncremental(t.orgId, t.merchant, now);
    if (r.ok) incremental++;
    else errors++;
  }

  // Pass 2: advance unfinished backfills with whatever time remains.
  for (const t of tasks) {
    if (Date.now() >= deadlineMs) break;
    const state = await readSyncState(t.orgId, t.merchant.merchantId);
    if (state.backfillStatus && state.backfillStatus !== "complete") {
      const r = await runBackfill(t.orgId, t.merchant, { now, deadlineMs });
      backfillChunks += r.chunks;
      if (r.error) errors++;
    }
  }

  return {
    orgs: activeOrgs.length,
    merchants: tasks.length,
    incremental,
    backfillChunks,
    errors,
    completed: Date.now() < deadlineMs,
  };
}
