import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { listAuditLog } from "@/lib/platform/audit";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await listAuditLog();
  return NextResponse.json({ entries });
}
