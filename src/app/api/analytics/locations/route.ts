import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { getAnalyticsSource } from "@/lib/analytics";
import { getLocations } from "@/lib/analytics/bigquery";
import { getConnectedMerchants } from "@/lib/clover/merchants";

/** List the org's own locations for the scope selector. Empty in clover mode. */
export async function GET() {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  if (getAnalyticsSource() !== "bigquery") {
    return NextResponse.json({ locations: [] });
  }
  try {
    // Scope strictly to the org's connected merchant IDs (tenant isolation).
    const allowedIds = (await getConnectedMerchants(org.orgId)).map(
      (m) => m.merchantId
    );
    return NextResponse.json({ locations: await getLocations(allowedIds) });
  } catch {
    return NextResponse.json({ locations: [] });
  }
}
