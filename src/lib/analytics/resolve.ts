import { CloverClient } from "@/lib/clover/client";
import {
  getPrimaryMerchant,
  getConnectedMerchants,
} from "@/lib/clover/merchants";
import {
  type AnalyticsProvider,
  type AnalyticsSource,
  getAnalyticsSource,
  createCloverAnalytics,
  createBigQueryAnalytics,
} from "./index";

export type ResolvedAnalytics =
  | {
      ok: true;
      analytics: AnalyticsProvider;
      timeZone: string;
      source: AnalyticsSource;
      /** The org's owned location IDs (= its connected merchant IDs). */
      allowedLocationIds: string[];
    }
  | { ok: false; error: "not_connected" };

/**
 * Build the analytics provider for an org based on ANALYTICS_SOURCE.
 * - bigquery: the warehouse (no Clover connection required).
 * - clover: live REST — requires an active Clover integration, returns
 *   { ok:false, error:"not_connected" } otherwise. Lazily backfills timezone.
 */
export async function resolveAnalytics(
  orgId: string
): Promise<ResolvedAnalytics> {
  const source = getAnalyticsSource();

  if (source === "bigquery") {
    // Tenant isolation: scope analytics to ONLY this org's connected merchants.
    const owned = (await getConnectedMerchants(orgId)).map((m) => m.merchantId);
    // DEV-ONLY toggle: include extra seed/demo location IDs for testing the
    // multi-location warehouse data. MUST be unset in production (otherwise the
    // listed locations would be visible to every org). Isolation logic is
    // unchanged — this just widens the allowed list.
    const demo = (process.env.DEMO_LOCATION_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedLocationIds = Array.from(new Set([...owned, ...demo]));
    if (allowedLocationIds.length === 0) {
      return { ok: false, error: "not_connected" };
    }
    return {
      ok: true,
      analytics: createBigQueryAnalytics(allowedLocationIds),
      timeZone: process.env.ANALYTICS_TZ ?? "America/New_York",
      source,
      allowedLocationIds,
    };
  }

  // Live Clover mode is single-merchant: use the primary connected location.
  // (Multi-location analytics run through the BigQuery warehouse, fed by sync.)
  const primary = await getPrimaryMerchant(orgId);
  if (!primary) {
    return { ok: false, error: "not_connected" };
  }

  const timeZone = primary.timezone ?? "UTC";
  return {
    ok: true,
    analytics: createCloverAnalytics(
      new CloverClient({
        accessToken: primary.accessToken,
        merchantId: primary.merchantId,
        timeZone,
      })
    ),
    timeZone,
    source,
    allowedLocationIds: [primary.merchantId],
  };
}
