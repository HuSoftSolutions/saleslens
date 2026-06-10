import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensurePlatformAdminClaim } from "@/lib/auth/platformAdmin";

/**
 * Bootstraps the platformAdmin claim for an allowlisted operator.
 *
 * Called once after login. If the user's email is in PLATFORM_ADMIN_EMAILS and
 * they aren't a platform admin yet, the claim is minted here. The client must
 * then call getIdToken(true) to refresh the token so the new claim takes effect.
 *
 * Safe for everyone to call: non-allowlisted users simply get { platformAdmin: false }.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Already a platform admin in the current token — nothing to do.
  if (user.platformAdmin) {
    return NextResponse.json({ platformAdmin: true, refreshed: false });
  }

  const granted = await ensurePlatformAdminClaim(user.uid, user.email);
  // `granted` true here means the claim was just set and the client should
  // force-refresh its token to pick it up.
  return NextResponse.json({ platformAdmin: granted, refreshed: granted });
}
