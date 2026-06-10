import { adminDb } from "@/lib/firebase/admin";
import { refreshAccessToken } from "./oauth";

export interface ConnectedMerchant {
  merchantId: string;
  name: string | null;
  status: "active" | "error";
  environment: string;
  source: "oauth" | "token";
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiration?: number | null;
  timezone?: string | null;
}

function merchantsRef(orgId: string) {
  return adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("cloverMerchants");
}

/**
 * List a org's connected Clover merchants (one per location).
 *
 * Lazily migrates the legacy single `integrations/clover` doc into the
 * collection on first read, so existing connections keep working.
 */
export async function getConnectedMerchants(
  orgId: string
): Promise<ConnectedMerchant[]> {
  const snap = await merchantsRef(orgId).get();
  if (!snap.empty) {
    return snap.docs.map((d) => d.data() as ConnectedMerchant);
  }

  // Legacy migration: copy the old single integration doc, if active.
  const legacy = await adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("integrations")
    .doc("clover")
    .get();
  const data = legacy.data();
  if (data && data.status === "active" && data.merchantId) {
    const migrated: ConnectedMerchant = {
      merchantId: data.merchantId,
      name: null,
      status: "active",
      environment: data.environment ?? "sandbox",
      source: data.refreshToken ? "oauth" : "token",
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      accessTokenExpiration: data.accessTokenExpiration ?? null,
      timezone: data.timezone ?? null,
    };
    await upsertMerchant(orgId, migrated);
    return [migrated];
  }
  return [];
}

/** Create/update a connected merchant (keyed by merchantId). */
export async function upsertMerchant(
  orgId: string,
  m: ConnectedMerchant
): Promise<void> {
  const now = new Date();
  await merchantsRef(orgId)
    .doc(m.merchantId)
    .set(
      {
        merchantId: m.merchantId,
        name: m.name ?? null,
        status: m.status,
        environment: m.environment,
        source: m.source,
        accessToken: m.accessToken,
        refreshToken: m.refreshToken ?? null,
        accessTokenExpiration: m.accessTokenExpiration ?? null,
        timezone: m.timezone ?? null,
        updatedAt: now,
        connectedAt: now,
      },
      { merge: true }
    );
}

export async function removeMerchant(
  orgId: string,
  merchantId: string
): Promise<void> {
  await merchantsRef(orgId).doc(merchantId).delete();
}

/**
 * Return a valid access token for a merchant, refreshing it first if it's an
 * OAuth connection whose token is expired/expiring. Persists the rotated token.
 * Token-based (dev) connections are returned as-is (long-lived).
 */
export async function ensureValidAccessToken(
  orgId: string,
  m: ConnectedMerchant
): Promise<string> {
  if (m.source !== "oauth" || !m.refreshToken) return m.accessToken;

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = m.accessTokenExpiration ?? 0;
  // Only refresh when we know it's within 5 min of expiry.
  if (!exp || nowSec < exp - 300) return m.accessToken;

  const refreshed = await refreshAccessToken(m.refreshToken);
  await upsertMerchant(orgId, {
    ...m,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? m.refreshToken,
    accessTokenExpiration: refreshed.accessTokenExpiration ?? m.accessTokenExpiration,
    status: "active",
  });
  return refreshed.accessToken;
}

/** The merchant used for single-merchant live Clover mode (first active). */
export async function getPrimaryMerchant(
  orgId: string
): Promise<ConnectedMerchant | null> {
  const all = await getConnectedMerchants(orgId);
  return all.find((m) => m.status === "active") ?? all[0] ?? null;
}
