import { adminAuth } from "@/lib/firebase/admin";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/getCurrentUser";

/**
 * Platform super-admin — the operator(s) of SalesLens itself.
 *
 * This is a SEPARATE axis from org roles (owner/admin/member). A platform admin
 * can centrally manage accounts, organizations, users, and connections across
 * the whole platform. It deliberately grants NO insight into any business's
 * sales, analytics, or chat data — that access is default-deny and only ever
 * obtained through an explicit, customer-consented data-access grant.
 */

/** Emails allowed to bootstrap themselves into the platformAdmin claim. */
function bootstrapAllowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Authenticates the request and requires the platformAdmin claim.
 * Returns the user, or null if unauthenticated or not a platform admin.
 * Callers should respond 401/403 on null.
 */
export async function requirePlatformAdmin(): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.platformAdmin) return null;
  return user;
}

/**
 * Bootstrap mechanism: if this user's email is in PLATFORM_ADMIN_EMAILS and the
 * claim isn't set yet, mint the platformAdmin custom claim. This is how the
 * first operator(s) get elevated without a redeploy; thereafter admins are
 * granted from the console itself.
 *
 * Returns true if the claim is now set (whether it was just granted or already
 * present). The caller must force a client token refresh for a newly-granted
 * claim to take effect in the ID token.
 */
export async function ensurePlatformAdminClaim(
  uid: string,
  email: string | undefined
): Promise<boolean> {
  const allow = bootstrapAllowlist();
  if (!email || !allow.includes(email.toLowerCase())) return false;

  const userRecord = await adminAuth.getUser(uid);
  if (userRecord.customClaims?.platformAdmin === true) return true;

  await adminAuth.setCustomUserClaims(uid, {
    ...userRecord.customClaims,
    platformAdmin: true,
  });
  return true;
}
