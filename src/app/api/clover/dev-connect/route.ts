import { NextResponse, after } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { CloverClient } from "@/lib/clover/client";
import { upsertMerchant } from "@/lib/clover/merchants";
import {
  initMerchantBackfill,
  runConnectBackfill,
} from "@/lib/clover/syncScheduler";

export const maxDuration = 300; // background backfill on connect

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

  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

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

  await initMerchantBackfill(org.orgId, devMerchantId);
  after(() => runConnectBackfill(org.orgId, [devMerchantId]));

  return NextResponse.json({ connected: true, merchantId: devMerchantId, name });
}
