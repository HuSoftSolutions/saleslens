import { NextRequest, NextResponse } from "next/server";
import {
  validateOAuthState,
  exchangeCodeForToken,
  getCloverEnvironment,
} from "@/lib/clover/oauth";
import { CloverClient } from "@/lib/clover/client";
import { upsertMerchant } from "@/lib/clover/merchants";

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
    // Fetch the merchant's name + timezone for the locations list.
    const env = getCloverEnvironment();
    const client = new CloverClient({
      accessToken: tokenData.accessToken,
      merchantId,
    });
    const name = await client.getMerchantInfo().then((m) => m?.name ?? null).catch(() => null);
    const timezone = await client.getMerchantTimezone().catch(() => null);

    // Upsert keyed by merchantId — connecting another location ADDS a row
    // instead of overwriting, so multi-location businesses accumulate locations.
    await upsertMerchant(stateData.orgId, {
      merchantId,
      name,
      status: "active",
      environment: env,
      source: "oauth",
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken ?? null,
      accessTokenExpiration: tokenData.accessTokenExpiration ?? null,
      timezone,
    });

    return NextResponse.redirect(`${appUrl}/app/settings?connected=true`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=token_exchange_failed`
    );
  }
}
