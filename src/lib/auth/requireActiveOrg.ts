import { NextResponse } from "next/server";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg, type UserOrgResult } from "@/lib/orgs/getUserOrg";

/**
 * Single entry point for the customer request path. Bundles authentication,
 * org resolution, and SUSPENSION enforcement so every customer route shares one
 * gate — and future routes inherit enforcement by using this instead of hand-
 * rolling the auth/org boilerplate.
 *
 * A suspended org is blocked here with a 403; the account stays intact.
 *
 * Usage:
 *   const ctx = await requireActiveOrg();
 *   if (!ctx.ok) return ctx.response;
 *   const { user, org } = ctx;
 */
export type CustomerContext =
  | { ok: true; user: AuthenticatedUser; org: UserOrgResult }
  | { ok: false; response: NextResponse };

export async function requireActiveOrg(): Promise<CustomerContext> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No organization" }, { status: 403 }),
    };
  }

  if (org.suspended) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This account is suspended. Please contact support.", suspended: true },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user, org };
}
