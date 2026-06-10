import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { getPlatformOverview } from "@/lib/platform/accounts";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const overview = await getPlatformOverview();
  return NextResponse.json(overview);
}
