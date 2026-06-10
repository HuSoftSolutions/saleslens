import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { getOrganizationDetail } from "@/lib/platform/accounts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId } = await params;
  const detail = await getOrganizationDetail(orgId);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
