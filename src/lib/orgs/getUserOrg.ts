import { adminDb } from "@/lib/firebase/admin";

export interface UserOrgResult {
  orgId: string;
  role: string;
  /** Platform suspension state of the org. Suspended orgs are blocked from the request path. */
  suspended: boolean;
}

/**
 * Resolves the organization membership for a given user UID.
 * Queries Firestore for the first organization where the user exists as a member.
 *
 * Returns null if the user does not belong to any organization.
 */
export async function getUserOrg(uid: string): Promise<UserOrgResult | null> {
  // Query all organizations where this user has a user doc
  const orgsSnapshot = await adminDb.collection("organizations").get();

  for (const orgDoc of orgsSnapshot.docs) {
    const userDoc = await adminDb
      .collection("organizations")
      .doc(orgDoc.id)
      .collection("users")
      .doc(uid)
      .get();

    if (userDoc.exists) {
      const data = userDoc.data();
      return {
        orgId: orgDoc.id,
        role: data?.role ?? "member",
        // Org root doc is already loaded in orgsSnapshot — no extra read.
        suspended: orgDoc.data()?.status === "suspended",
      };
    }
  }

  return null;
}

/**
 * Ensures a user has an organization. If they don't, creates one.
 * Used during first login / onboarding.
 */
export async function ensureUserOrg(
  uid: string,
  email: string
): Promise<UserOrgResult> {
  const existing = await getUserOrg(uid);
  if (existing) return existing;

  // Create a new org for the user
  const orgRef = adminDb.collection("organizations").doc();
  const now = new Date();

  await orgRef.set({
    name: email.split("@")[0] + "'s Business",
    createdAt: now,
  });

  await orgRef.collection("users").doc(uid).set({
    email,
    role: "owner",
    createdAt: now,
  });

  return { orgId: orgRef.id, role: "owner", suspended: false };
}
