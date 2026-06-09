import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { adminDb } from "@/lib/firebase/admin";
import { CloverClient } from "@/lib/clover/client";

/**
 * POST /api/clover/dev-connect
 *
 * Development-only endpoint that provisions a Clover connection
 * using CLOVER_DEV_TOKEN and CLOVER_DEV_MERCHANT_ID env vars.
 * Skips the OAuth flow entirely — only available when both env vars are set.
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

  // Look up the merchant timezone so date ranges follow its local calendar day.
  let timezone: string | null = null;
  try {
    timezone = await new CloverClient({
      accessToken: devToken,
      merchantId: devMerchantId,
    }).getMerchantTimezone();
  } catch {
    // Non-fatal; the chat route will backfill it later if missing.
  }

  const now = new Date();
  const integrationRef = adminDb
    .collection("organizations")
    .doc(org.orgId)
    .collection("integrations")
    .doc("clover");

  await integrationRef.set({
    merchantId: devMerchantId,
    status: "active",
    environment: process.env.CLOVER_ENV ?? "sandbox",
    accessToken: devToken,
    timezone: timezone ?? null,
    connectedAt: now,
    updatedAt: now,
  });

  await adminDb.collection("organizations").doc(org.orgId).update({
    cloverMerchantId: devMerchantId,
    cloverConnectedAt: now,
  });

  return NextResponse.json({ connected: true, merchantId: devMerchantId });
}
