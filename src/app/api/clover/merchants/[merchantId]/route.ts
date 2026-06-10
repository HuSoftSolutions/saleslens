import { NextRequest, NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { removeMerchant } from "@/lib/clover/merchants";

/** Disconnect a location. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  const { merchantId } = await params;
  await removeMerchant(org.orgId, merchantId);
  return NextResponse.json({ ok: true });
}
