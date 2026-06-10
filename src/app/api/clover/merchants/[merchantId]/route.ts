import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { removeMerchant } from "@/lib/clover/merchants";

/** Disconnect a location. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { merchantId } = await params;
  await removeMerchant(org.orgId, merchantId);
  return NextResponse.json({ ok: true });
}
