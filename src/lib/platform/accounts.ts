import { adminAuth } from "@/lib/firebase/admin";
import { adminDb } from "@/lib/firebase/admin";

/**
 * ── PRIVACY FIREWALL ────────────────────────────────────────────────────────
 * This module is the ONLY data source for the platform-admin console. By design
 * it reads account/lifecycle METADATA only. It must never read business data:
 *   - never chat message contents (the chatThreads messages subcollection)
 *   - never analytics / BigQuery (sales results)
 *   - never merchant access/refresh tokens
 *
 * Being a platform admin grants account management, not data insight. Data
 * insight is default-deny and only obtainable through an explicit,
 * customer-consented data-access grant (a separate, later mechanism).
 *
 * Keep this invariant when extending: if a function here would expose what a
 * business sold or asked, it belongs behind a consent grant, not here.
 * ────────────────────────────────────────────────────────────────────────────
 */

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type OrgStatus = "active" | "suspended";

export interface OrgSummary {
  orgId: string;
  name: string | null;
  createdAt: string | null;
  status: OrgStatus;
  memberCount: number;
  merchantCount: number;
  activeMerchantCount: number;
}

export interface PlatformOverview {
  orgCount: number;
  userCount: number;
  merchantCount: number;
  activeMerchantCount: number;
  requestsToday: number;
}

/** Connection status only — no tokens, no transaction data. */
export interface MerchantStatus {
  merchantId: string;
  name: string | null;
  status: "active" | "error";
  environment: "sandbox" | "production";
  source: "oauth" | "token";
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export interface OrgMember {
  uid: string;
  email: string | null;
  role: string;
  /** Request volume today — a count, never the questions asked. */
  requestsToday: number;
}

export interface OrgDetail {
  orgId: string;
  name: string | null;
  createdAt: string | null;
  status: OrgStatus;
  members: OrgMember[];
  merchants: MerchantStatus[];
}

export interface PlatformUser {
  uid: string;
  email: string | null;
  role: string;
  orgId: string;
  orgName: string | null;
  platformAdmin: boolean;
  disabled: boolean;
}

function tsToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function usageToday(data: FirebaseFirestore.DocumentData | undefined): number {
  if (!data) return 0;
  return data.dayKey === todayKey() ? (data.dayCount ?? 0) : 0;
}

function normalizeStatus(value: unknown): OrgStatus {
  return value === "suspended" ? "suspended" : "active";
}

/**
 * Whether an org is suspended. Used by the customer request path to block
 * access while keeping the account intact. Default (absent field) = active.
 */
export async function isOrgSuspended(orgId: string): Promise<boolean> {
  const snap = await adminDb.collection("organizations").doc(orgId).get();
  return snap.exists && normalizeStatus(snap.data()?.status) === "suspended";
}

/** Lists every organization with member/merchant counts. Metadata only. */
export async function listOrganizations(): Promise<OrgSummary[]> {
  const orgsSnap = await adminDb.collection("organizations").get();

  return Promise.all(
    orgsSnap.docs.map(async (orgDoc) => {
      const orgRef = orgDoc.ref;
      const [usersSnap, merchantsSnap] = await Promise.all([
        orgRef.collection("users").get(),
        orgRef.collection("cloverMerchants").get(),
      ]);
      const activeMerchantCount = merchantsSnap.docs.filter(
        (d) => d.data().status === "active"
      ).length;
      const data = orgDoc.data();
      return {
        orgId: orgDoc.id,
        name: data.name ?? null,
        createdAt: tsToIso(data.createdAt),
        status: normalizeStatus(data.status),
        memberCount: usersSnap.size,
        merchantCount: merchantsSnap.size,
        activeMerchantCount,
      };
    })
  );
}

/** Platform-wide rollups for the overview dashboard. Counts only. */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const orgsSnap = await adminDb.collection("organizations").get();
  const today = todayKey();

  let userCount = 0;
  let merchantCount = 0;
  let activeMerchantCount = 0;
  let requestsToday = 0;

  await Promise.all(
    orgsSnap.docs.map(async (orgDoc) => {
      const orgRef = orgDoc.ref;
      const [usersSnap, merchantsSnap, usageSnap] = await Promise.all([
        orgRef.collection("users").get(),
        orgRef.collection("cloverMerchants").get(),
        orgRef.collection("usage").get(),
      ]);
      userCount += usersSnap.size;
      merchantCount += merchantsSnap.size;
      activeMerchantCount += merchantsSnap.docs.filter(
        (d) => d.data().status === "active"
      ).length;
      for (const u of usageSnap.docs) {
        const d = u.data();
        if (d.dayKey === today) requestsToday += d.dayCount ?? 0;
      }
    })
  );

  return {
    orgCount: orgsSnap.size,
    userCount,
    merchantCount,
    activeMerchantCount,
    requestsToday,
  };
}

/** One org's members + connection statuses. Metadata only — no tokens, no data. */
export async function getOrganizationDetail(
  orgId: string
): Promise<OrgDetail | null> {
  const orgRef = adminDb.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) return null;

  const [usersSnap, merchantsSnap, usageSnap] = await Promise.all([
    orgRef.collection("users").get(),
    orgRef.collection("cloverMerchants").get(),
    orgRef.collection("usage").get(),
  ]);

  const usageByUid = new Map(usageSnap.docs.map((d) => [d.id, d.data()] as const));

  const members: OrgMember[] = usersSnap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? null,
      role: data.role ?? "member",
      requestsToday: usageToday(usageByUid.get(d.id)),
    };
  });

  // Project ONLY safe connection fields — explicitly omit accessToken / refreshToken.
  const merchants: MerchantStatus[] = merchantsSnap.docs.map((d) => {
    const data = d.data();
    return {
      merchantId: data.merchantId ?? d.id,
      name: data.name ?? null,
      status: data.status === "error" ? "error" : "active",
      environment: data.environment === "production" ? "production" : "sandbox",
      source: data.source === "token" ? "token" : "oauth",
      connectedAt: tsToIso(data.connectedAt),
      lastSyncAt: tsToIso(data.updatedAt),
    };
  });

  const orgData = orgSnap.data() ?? {};
  return {
    orgId,
    name: orgData.name ?? null,
    createdAt: tsToIso(orgData.createdAt),
    status: normalizeStatus(orgData.status),
    members,
    merchants,
  };
}

/**
 * Cross-org user roster with the platformAdmin flag. Reads the `platformAdmin`
 * custom claim via the Auth Admin SDK (batched) so the console can show who
 * holds platform access. Metadata only.
 */
export async function listAllUsers(): Promise<PlatformUser[]> {
  const orgsSnap = await adminDb.collection("organizations").get();

  const users: PlatformUser[] = [];
  await Promise.all(
    orgsSnap.docs.map(async (orgDoc) => {
      const orgName = orgDoc.data().name ?? null;
      const usersSnap = await orgDoc.ref.collection("users").get();
      for (const u of usersSnap.docs) {
        const data = u.data();
        users.push({
          uid: u.id,
          email: data.email ?? null,
          role: data.role ?? "member",
          orgId: orgDoc.id,
          orgName,
          platformAdmin: false,
          disabled: false,
        });
      }
    })
  );

  // Resolve platformAdmin claims + disabled state in batches of 100 (getUsers limit).
  const uniqueUids = [...new Set(users.map((u) => u.uid))];
  const adminUids = new Set<string>();
  const disabledUids = new Set<string>();
  for (let i = 0; i < uniqueUids.length; i += 100) {
    const batch = uniqueUids.slice(i, i + 100).map((uid) => ({ uid }));
    const result = await adminAuth.getUsers(batch);
    for (const record of result.users) {
      if (record.customClaims?.platformAdmin === true) adminUids.add(record.uid);
      if (record.disabled) disabledUids.add(record.uid);
    }
  }
  for (const u of users) {
    if (adminUids.has(u.uid)) u.platformAdmin = true;
    if (disabledUids.has(u.uid)) u.disabled = true;
  }

  return users;
}
