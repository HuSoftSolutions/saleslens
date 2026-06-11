import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { resolveAnalytics } from "@/lib/analytics/resolve";
import { createBigQueryAnalytics } from "@/lib/analytics";
import { ymdInTz, addDaysYmd } from "@/lib/analytics/dates";

/** Dashboard KPI tiles: today's sales, week-over-week, top item, top location. */
export async function GET() {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  const r = await resolveAnalytics(org.orgId);
  if (!r.ok) return NextResponse.json({ connected: false });

  const { analytics, timeZone, source, allowedLocationIds } = r;
  const today = ymdInTz(new Date(), timeZone);
  const weekStart = addDaysYmd(today, -6);
  const prevStart = addDaysYmd(today, -13);
  const prevEnd = addDaysYmd(today, -7);

  try {
    const [todaySum, weekCompare, topItems] = await Promise.all([
      analytics.getSalesSummary(today, today),
      analytics.compareSalesPeriods(
        { startDate: prevStart, endDate: prevEnd },
        { startDate: weekStart, endDate: today }
      ),
      analytics.getTopSellingItems(weekStart, today, 1),
    ]);

    let topLocation: { name: string; grossSales: number } | null = null;
    if (source === "bigquery") {
      const locs = await createBigQueryAnalytics(
        allowedLocationIds
      ).getSalesByLocation(weekStart, today);
      if (locs.length)
        topLocation = { name: locs[0].name, grossSales: locs[0].grossSales };
    }

    return NextResponse.json({
      connected: true,
      today: {
        grossTotal: todaySum.grossTotal,
        paymentCount: todaySum.paymentCount,
      },
      week: {
        grossTotal: weekCompare.periodB.grossTotal,
        deltaPct: weekCompare.deltas.grossTotal,
      },
      topItem: topItems[0]
        ? { name: topItems[0].name, quantity: topItems[0].quantity }
        : null,
      topLocation,
    });
  } catch (err) {
    console.error(`[overview] metrics failed (org=${org.orgId}, source=${source}):`, err);
    return NextResponse.json({ connected: true, error: "metrics_failed" });
  }
}
