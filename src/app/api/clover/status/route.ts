import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { getConnectedMerchants } from "@/lib/clover/merchants";

export async function GET() {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

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
