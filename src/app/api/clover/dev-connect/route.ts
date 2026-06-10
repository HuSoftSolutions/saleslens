import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { CloverClient } from "@/lib/clover/client";
import { upsertMerchant } from "@/lib/clover/merchants";

/**
 * POST /api/clover/dev-connect
 *
 * Dev convenience: adds the CLOVER_DEV_TOKEN / CLOVER_DEV_MERCHANT_ID merchant
 * as a connected location. Only available when both env vars are set. For adding
 * arbitrary sandbox test merchants, use POST /api/clover/merchants instead.
 */
export async function POST() {
  const devToken = process.env.CLOVER_DEV_TOKEN;
  const devMerchantId = process.env.CLOVER_DEV_MERCHANT_ID;

  if (!devToken || !devMerchantId) {
    return NextResponse.json(
      { error: "Dev token not configured. Set CLOVER_DEV_TOKEN and CLOVER_DEV_MERCHANT_ID in .env.local" },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await ensureUserOrg(user.uid, user.email ?? "");

  // Look up name + timezone for the locations list.
  const client = new CloverClient({ accessToken: devToken, merchantId: devMerchantId });
  const name = await client.getMerchantInfo().then((m) => m?.name ?? null).catch(() => null);
  const timezone = await client.getMerchantTimezone().catch(() => null);

  await upsertMerchant(org.orgId, {
    merchantId: devMerchantId,
    name,
    status: "active",
    environment: process.env.CLOVER_ENV ?? "sandbox",
    source: "token",
    accessToken: devToken,
    timezone,
  });

  return NextResponse.json({ connected: true, merchantId: devMerchantId, name });
}
