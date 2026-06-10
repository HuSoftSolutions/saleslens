import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getUserOrg } from "@/lib/orgs/getUserOrg";
import { listGrantsForOrg } from "@/lib/platform/dataAccessGrants";

function isOrgAdmin(role: string) {
  return role === "owner" || role === "admin";
}

/**
 * Customer-facing list of support data-access grants for the caller's org.
 * Owner/admin only. Intentionally does NOT block suspended orgs — an owner may
 * need to approve support access precisely while suspended.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserOrg(user.uid);
  if (!org) return NextResponse.json({ grants: [] });
  if (!isOrgAdmin(org.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grants = await listGrantsForOrg(org.orgId);
  return NextResponse.json({ grants });
}
