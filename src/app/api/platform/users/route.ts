import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { listAllUsers } from "@/lib/platform/accounts";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await listAllUsers();
  return NextResponse.json({ users });
}
