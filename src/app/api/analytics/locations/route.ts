import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAnalyticsSource } from "@/lib/analytics";
import { getLocations } from "@/lib/analytics/bigquery";

/** List locations for the scope selector. Empty in clover (single-merchant) mode. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (getAnalyticsSource() !== "bigquery") {
    return NextResponse.json({ locations: [] });
  }
  try {
    return NextResponse.json({ locations: await getLocations() });
  } catch {
    return NextResponse.json({ locations: [] });
  }
}
