import { adminDb } from "@/lib/firebase/admin";
import { CloverClient } from "@/lib/clover/client";
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
    return {
      ok: true,
      analytics: createBigQueryAnalytics(),
      timeZone: process.env.ANALYTICS_TZ ?? "America/New_York",
      source,
    };
  }

  const ref = adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("integrations")
    .doc("clover");
  const snap = await ref.get();
  const integration = snap.data();
  if (!integration || integration.status !== "active") {
    return { ok: false, error: "not_connected" };
  }

  let timeZone: string = integration.timezone ?? "UTC";
  if (!integration.timezone) {
    try {
      const tz = await new CloverClient({
        accessToken: integration.accessToken,
        merchantId: integration.merchantId,
      }).getMerchantTimezone();
      if (tz) {
        timeZone = tz;
        await ref.set({ timezone: tz }, { merge: true });
      }
    } catch {
      // fall back to UTC
    }
  }

  return {
    ok: true,
    analytics: createCloverAnalytics(
      new CloverClient({
        accessToken: integration.accessToken,
        merchantId: integration.merchantId,
        timeZone,
      })
    ),
    timeZone,
    source,
  };
}
