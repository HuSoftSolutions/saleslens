import { adminDb } from "@/lib/firebase/admin";
import crypto from "crypto";

/**
 * Clover environment configuration.
 *
 * Per Clover docs (https://docs.clover.com/dev/docs/use-oauth):
 * - Authorization endpoint: sandbox.dev.clover.com (or www.clover.com for prod)
 * - Token/API endpoint: apisandbox.dev.clover.com (or api.clover.com for prod)
 *
 * These are DIFFERENT hosts. The authorize URL uses the web domain,
 * while token exchange and API calls use the API domain.
 */
const CLOVER_ENVS = {
  sandbox: {
    authorizeBase: "https://sandbox.dev.clover.com",
    apiBase: "https://apisandbox.dev.clover.com",
  },
  production: {
    authorizeBase: "https://www.clover.com",
    apiBase: "https://api.clover.com",
  },
} as const;

type CloverEnv = keyof typeof CLOVER_ENVS;

function getCloverEnv(): CloverEnv {
  const env = process.env.CLOVER_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`Invalid CLOVER_ENV: ${env}`);
  }
  return env;
}

export function getCloverUrls() {
  return CLOVER_ENVS[getCloverEnv()];
}

export function getCloverEnvironment(): CloverEnv {
  return getCloverEnv();
}

/**
 * Generate a signed OAuth state parameter.
 * Stores the state in Firestore to prevent CSRF and replay attacks.
 */
export async function generateOAuthState(
  uid: string,
  orgId: string
): Promise<string> {
  const stateId = crypto.randomUUID();
  const payload = { uid, orgId, createdAt: new Date() };

  await adminDb.collection("oauthStates").doc(stateId).set(payload);

  return stateId;
}

/**
 * Validate and consume an OAuth state parameter.
 * Returns the uid and orgId if valid, null otherwise.
 * Deletes the state document to prevent reuse.
 */
export async function validateOAuthState(
  stateId: string
): Promise<{ uid: string; orgId: string } | null> {
  const doc = await adminDb.collection("oauthStates").doc(stateId).get();

  if (!doc.exists) return null;

  const data = doc.data();
  if (!data?.uid || !data?.orgId) return null;

  // Check expiry — states are valid for 10 minutes
  const createdAt = data.createdAt?.toDate?.() ?? new Date(data.createdAt);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (createdAt < tenMinutesAgo) {
    await adminDb.collection("oauthStates").doc(stateId).delete();
    return null;
  }

  // Delete after validation (single-use)
  await adminDb.collection("oauthStates").doc(stateId).delete();

  return { uid: data.uid, orgId: data.orgId };
}

/**
 * Build the Clover OAuth v2 authorization URL.
 *
 * Per docs: https://docs.clover.com/dev/docs/high-trust-app-auth-flow
 * Format: {authorizeBase}/oauth/v2/authorize?client_id={APP_ID}&redirect_uri={URL}
 *
 * Note: redirect_uri must be a valid subpath of your registered Site URL.
 */
export function buildAuthorizationUrl(state: string): string {
  const { authorizeBase } = getCloverUrls();
  const clientId = process.env.CLOVER_CLIENT_ID;
  const redirectUri = process.env.CLOVER_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Missing CLOVER_CLIENT_ID or CLOVER_REDIRECT_URI");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });

  return `${authorizeBase}/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for Clover access + refresh tokens.
 *
 * Per docs: https://docs.clover.com/dev/docs/high-trust-app-auth-flow
 * - Endpoint: POST {apiBase}/oauth/v2/token (NOT the authorize domain!)
 * - Content-Type: application/json
 * - Body: { client_id, client_secret, code }
 * - Response: { access_token, access_token_expiration, refresh_token, refresh_token_expiration }
 *
 * We also echo redirect_uri: the authorize request includes it, so per OAuth 2.0
 * the code is bound to it and it must match on exchange (otherwise Clover returns
 * 401 "Failed to validate authentication code").
 */
export async function exchangeCodeForToken(
  code: string
): Promise<{ accessToken: string; refreshToken?: string; accessTokenExpiration?: number }> {
  const { apiBase } = getCloverUrls();
  const clientId = process.env.CLOVER_CLIENT_ID;
  const clientSecret = process.env.CLOVER_CLIENT_SECRET;
  const redirectUri = process.env.CLOVER_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error("Missing CLOVER_CLIENT_ID or CLOVER_CLIENT_SECRET");
  }

  const res = await fetch(`${apiBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clover token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiration: data.access_token_expiration,
  };
}

/**
 * Refresh an expired/expiring OAuth access token using the refresh token.
 *
 * Per Clover v2: POST {apiBase}/oauth/v2/refresh with JSON { client_id, refresh_token }.
 * Returns the new access token (+ possibly a rotated refresh token) and expiry.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiration?: number;
}> {
  const { apiBase } = getCloverUrls();
  const clientId = process.env.CLOVER_CLIENT_ID;
  if (!clientId) throw new Error("Missing CLOVER_CLIENT_ID");

  const res = await fetch(`${apiBase}/oauth/v2/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clover token refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiration: data.access_token_expiration,
  };
}
