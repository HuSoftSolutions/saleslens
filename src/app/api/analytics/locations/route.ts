import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { getAnalyticsSource } from "@/lib/analytics";
import { getLocations } from "@/lib/analytics/bigquery";
import { getConnectedMerchants } from "@/lib/clover/merchants";

/** List the org's own locations for the scope selector. Empty in clover mode. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) return NextResponse.json({ locations: [] });

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
