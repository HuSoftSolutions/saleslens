import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Append-only audit log of platform-admin actions. Every sensitive mutation
 * (granting platform access, suspending an org, disabling an account, changing
 * a role) writes one entry here. Stored at the top-level `platformAuditLog`
 * collection — outside any org, since these are platform-level events.
 */

export type AuditAction =
  | "platformAdmin.grant"
  | "platformAdmin.revoke"
  | "org.role.change"
  | "org.suspend"
  | "org.unsuspend"
  | "user.disable"
  | "user.enable"
  | "dataAccess.request"
  | "dataAccess.view";

export interface AuditTarget {
  /** Affected user UID, when applicable. */
  uid?: string;
  /** Affected org, when applicable. */
  orgId?: string;
}

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorUid: string;
  actorEmail: string | null;
  target: AuditTarget;
  details: Record<string, unknown>;
  createdAt: string | null;
}

export async function recordAudit(
  action: AuditAction,
  actor: { uid: string; email: string | undefined },
  target: AuditTarget,
  details: Record<string, unknown> = {}
): Promise<void> {
  await adminDb.collection("platformAuditLog").add({
    action,
    actorUid: actor.uid,
    actorEmail: actor.email ?? null,
    target,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function tsToIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Most recent audit entries, newest first. */
export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const snap = await adminDb
    .collection("platformAuditLog")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: data.action,
      actorUid: data.actorUid,
      actorEmail: data.actorEmail ?? null,
      target: data.target ?? {},
      details: data.details ?? {},
      createdAt: tsToIso(data.createdAt),
    };
  });
}
