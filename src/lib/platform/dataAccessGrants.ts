import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Customer-consented data-access grants.
 *
 * The ONLY way a platform admin gains insight into a business's data. A grant
 * is requested by the admin, but only becomes active when the org owner/admin
 * explicitly approves it — the admin can never self-serve into data. Grants are
 * time-boxed and revocable by the customer at any time.
 *
 * Enforcement: business-data endpoints call hasActiveGrant() at request time.
 * Platform-admin status alone never satisfies that check.
 *
 * Stored at organizations/{orgId}/dataAccessGrants/{grantId}.
 */

export type GrantStatus =
  | "requested"
  | "active"
  | "denied"
  | "revoked"
  | "expired";

export interface DataAccessGrant {
  id: string;
  orgId: string;
  orgName: string | null;
  grantedToUid: string;
  grantedToEmail: string | null;
  reason: string;
  requestedDurationHours: number;
  status: GrantStatus;
  createdAt: string | null;
  decidedByEmail: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
}

type Actor = { uid: string; email: string | undefined };

function tsToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Compute the effective status, lazily treating elapsed active grants as expired. */
function effectiveStatus(data: FirebaseFirestore.DocumentData): GrantStatus {
  const raw = data.status as GrantStatus;
  if (raw === "active") {
    const exp = data.expiresAt?.toDate?.() as Date | undefined;
    if (exp && exp.getTime() <= Date.now()) return "expired";
  }
  return raw;
}

function mapGrant(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
): DataAccessGrant {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    orgId: data.orgId,
    orgName: data.orgName ?? null,
    grantedToUid: data.grantedToUid,
    grantedToEmail: data.grantedToEmail ?? null,
    reason: data.reason ?? "",
    requestedDurationHours: data.requestedDurationHours ?? 24,
    status: effectiveStatus(data),
    createdAt: tsToIso(data.createdAt),
    decidedByEmail: data.decidedByEmail ?? null,
    decidedAt: tsToIso(data.decidedAt),
    expiresAt: tsToIso(data.expiresAt),
  };
}

function grantsRef(orgId: string) {
  return adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("dataAccessGrants");
}

/** Admin requests data access. Creates a pending grant the customer must approve. */
export async function createAccessRequest(
  admin: Actor,
  orgId: string,
  orgName: string | null,
  reason: string,
  durationHours: number
): Promise<string> {
  const ref = await grantsRef(orgId).add({
    orgId,
    orgName,
    grantedToUid: admin.uid,
    grantedToEmail: admin.email ?? null,
    reason,
    requestedDurationHours: durationHours,
    status: "requested",
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** All grants for an org (customer-facing list). Newest first. */
export async function listGrantsForOrg(orgId: string): Promise<DataAccessGrant[]> {
  const snap = await grantsRef(orgId).orderBy("createdAt", "desc").limit(50).get();
  return snap.docs.map(mapGrant);
}

/** Customer approves or denies a pending request. */
export async function decideGrant(
  actor: Actor,
  orgId: string,
  grantId: string,
  approve: boolean
): Promise<DataAccessGrant | null> {
  const ref = grantsRef(orgId).doc(grantId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (effectiveStatus(snap.data()!) !== "requested") return mapGrant(snap);

  if (approve) {
    const hours = snap.data()?.requestedDurationHours ?? 24;
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + hours * 3600_000));
    await ref.update({
      status: "active",
      expiresAt,
      decidedByUid: actor.uid,
      decidedByEmail: actor.email ?? null,
      decidedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.update({
      status: "denied",
      decidedByUid: actor.uid,
      decidedByEmail: actor.email ?? null,
      decidedAt: FieldValue.serverTimestamp(),
    });
  }

  return mapGrant(await ref.get());
}

/** Customer revokes an active grant before it expires. */
export async function revokeGrant(
  actor: Actor,
  orgId: string,
  grantId: string
): Promise<DataAccessGrant | null> {
  const ref = grantsRef(orgId).doc(grantId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  await ref.update({
    status: "revoked",
    revokedByUid: actor.uid,
    revokedAt: FieldValue.serverTimestamp(),
  });
  return mapGrant(await ref.get());
}

/**
 * The enforcement primitive. Returns the active, unexpired grant this admin
 * holds for the org, or null. Uses a single equality filter (grantedToUid) so
 * no composite index is required; status/expiry are checked in code.
 */
export async function getActiveGrant(
  adminUid: string,
  orgId: string
): Promise<DataAccessGrant | null> {
  const snap = await grantsRef(orgId)
    .where("grantedToUid", "==", adminUid)
    .get();
  for (const doc of snap.docs) {
    if (effectiveStatus(doc.data()) === "active") return mapGrant(doc);
  }
  return null;
}

export async function hasActiveGrant(
  adminUid: string,
  orgId: string
): Promise<boolean> {
  return (await getActiveGrant(adminUid, orgId)) !== null;
}

/** This admin's own grants for an org (for status display in the console). */
export async function listGrantsForAdmin(
  adminUid: string,
  orgId: string
): Promise<DataAccessGrant[]> {
  const snap = await grantsRef(orgId)
    .where("grantedToUid", "==", adminUid)
    .get();
  return snap.docs
    .map(mapGrant)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
