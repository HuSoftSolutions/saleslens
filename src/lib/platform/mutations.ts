import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { recordAudit } from "@/lib/platform/audit";

/**
 * Platform-admin mutations. Every action here is account/lifecycle management
 * and is recorded to the audit log. None of these grant or expose business data.
 *
 * `actor` is the authenticated platform admin performing the action; it is used
 * for guards (no self-targeting destructive ops) and audit attribution.
 */

type Actor = { uid: string; email: string | undefined };

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Thrown for invalid/guarded requests; routes translate to a 400/409. */
export class MutationError extends Error {}

/** Grant or revoke the platformAdmin custom claim. */
export async function setPlatformAdmin(
  actor: Actor,
  targetUid: string,
  grant: boolean
): Promise<void> {
  if (!grant && targetUid === actor.uid) {
    throw new MutationError("You cannot revoke your own platform access.");
  }

  const record = await adminAuth.getUser(targetUid);
  await adminAuth.setCustomUserClaims(targetUid, {
    ...record.customClaims,
    platformAdmin: grant,
  });
  // Note: an existing ID token keeps the old claim until it refreshes (≤1h).
  // We intentionally do not revoke refresh tokens, to avoid signing the user
  // out of all sessions.

  await recordAudit(
    grant ? "platformAdmin.grant" : "platformAdmin.revoke",
    actor,
    { uid: targetUid },
    { targetEmail: record.email ?? null }
  );
}

/** Change a member's role within an organization. */
export async function setOrgRole(
  actor: Actor,
  orgId: string,
  targetUid: string,
  role: OrgRole
): Promise<void> {
  if (!ORG_ROLES.includes(role)) {
    throw new MutationError("Invalid role.");
  }

  const userRef = adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("users")
    .doc(targetUid);

  const snap = await userRef.get();
  if (!snap.exists) {
    throw new MutationError("User is not a member of this organization.");
  }
  const previousRole = snap.data()?.role ?? "member";

  await userRef.update({ role });

  await recordAudit(
    "org.role.change",
    actor,
    { uid: targetUid, orgId },
    { from: previousRole, to: role }
  );
}

/** Suspend or reactivate an organization. */
export async function setOrgStatus(
  actor: Actor,
  orgId: string,
  status: "active" | "suspended"
): Promise<void> {
  const orgRef = adminDb.collection("organizations").doc(orgId);
  const snap = await orgRef.get();
  if (!snap.exists) {
    throw new MutationError("Organization not found.");
  }

  if (status === "suspended") {
    await orgRef.update({
      status: "suspended",
      suspendedAt: FieldValue.serverTimestamp(),
      suspendedBy: actor.uid,
    });
  } else {
    await orgRef.update({
      status: "active",
      suspendedAt: FieldValue.delete(),
      suspendedBy: FieldValue.delete(),
    });
  }

  await recordAudit(
    status === "suspended" ? "org.suspend" : "org.unsuspend",
    actor,
    { orgId },
    { orgName: snap.data()?.name ?? null }
  );
}

/** Enable or disable a user's account (disabled accounts cannot sign in). */
export async function setUserDisabled(
  actor: Actor,
  targetUid: string,
  disabled: boolean
): Promise<void> {
  if (disabled && targetUid === actor.uid) {
    throw new MutationError("You cannot disable your own account.");
  }

  const record = await adminAuth.updateUser(targetUid, { disabled });

  await recordAudit(
    disabled ? "user.disable" : "user.enable",
    actor,
    { uid: targetUid },
    { targetEmail: record.email ?? null }
  );
}
