import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { getConnectedMerchants } from "@/lib/clover/merchants";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) {
    return NextResponse.json({ connected: false, count: 0 });
  }

  const merchants = await getConnectedMerchants(org.orgId);
  const active = merchants.filter((m) => m.status === "active");
  const primary = active[0] ?? merchants[0] ?? null;

  return NextResponse.json({
    connected: active.length > 0,
    count: active.length,
    // Back-compat single-merchant fields (dashboard still reads these).
    merchantId: primary?.merchantId ?? null,
    environment: primary?.environment ?? null,
  });
}
