import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  validateOAuthState,
  exchangeCodeForToken,
  getCloverEnvironment,
} from "@/lib/clover/oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const merchantId = request.nextUrl.searchParams.get("merchant_id");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=missing_params`
    );
  }

  try {
    // Validate the state parameter
    const stateData = await validateOAuthState(state);
    if (!stateData) {
      return NextResponse.redirect(
        `${appUrl}/app/settings?error=invalid_state`
      );
    }

    // Exchange code for access + refresh tokens
    // Per Clover v2 docs: POST to {apiBase}/oauth/v2/token with JSON body
    const tokenData = await exchangeCodeForToken(code);

    if (!merchantId) {
      return NextResponse.redirect(
        `${appUrl}/app/settings?error=missing_merchant`
      );
    }

    // TODO: Move access token storage to Google Secret Manager before production.
    // Storing tokens in Firestore is acceptable for local development only.
    const now = new Date();
    const integrationRef = adminDb
      .collection("organizations")
      .doc(stateData.orgId)
      .collection("integrations")
      .doc("clover");

    await integrationRef.set({
      merchantId,
      status: "active",
      environment: getCloverEnvironment(),
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken ?? null,
      accessTokenExpiration: tokenData.accessTokenExpiration ?? null,
      connectedAt: now,
      updatedAt: now,
    });

    // Also store merchant ID on the org document for quick lookups
    await adminDb
      .collection("organizations")
      .doc(stateData.orgId)
      .update({
        cloverMerchantId: merchantId,
        cloverConnectedAt: now,
      });

    return NextResponse.redirect(`${appUrl}/app/settings?connected=true`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=token_exchange_failed`
    );
  }
}
