import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { getActiveGrant } from "@/lib/platform/dataAccessGrants";
import { recordAudit } from "@/lib/platform/audit";
import { resolveAnalytics } from "@/lib/analytics/resolve";
import { ymdInTz, addDaysYmd } from "@/lib/analytics/dates";

/**
 * Consented data view: a business's sales overview, accessible to a platform
 * admin ONLY while an active, customer-approved grant exists. This is the single
 * code path by which an admin sees business data — gated on getActiveGrant, not
 * on platform-admin status. Every successful view is audited.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId } = await params;

  // The privacy gate: customer consent, not admin privilege.
  const grant = await getActiveGrant(admin.uid, orgId);
  if (!grant) {
    return NextResponse.json(
      { error: "No active data-access grant for this organization." },
      { status: 403 }
    );
  }

  const r = await resolveAnalytics(orgId);
  if (!r.ok) {
    return NextResponse.json({ connected: false, grantExpiresAt: grant.expiresAt });
  }

  const { analytics, timeZone } = r;
  const today = ymdInTz(new Date(), timeZone);
  const monthStart = addDaysYmd(today, -29);

  try {
    const [todaySum, monthSum] = await Promise.all([
      analytics.getSalesSummary(today, today),
      analytics.getSalesSummary(monthStart, today),
    ]);

    await recordAudit("dataAccess.view", admin, { orgId }, {
      grantId: grant.id,
      view: "overview",
    });

    return NextResponse.json({
      connected: true,
      grantExpiresAt: grant.expiresAt,
      today: { grossTotal: todaySum.grossTotal, paymentCount: todaySum.paymentCount },
      last30Days: {
        grossTotal: monthSum.grossTotal,
        paymentCount: monthSum.paymentCount,
      },
    });
  } catch {
    return NextResponse.json({ connected: true, error: "metrics_failed" });
  }
}
