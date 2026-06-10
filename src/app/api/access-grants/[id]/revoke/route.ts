import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getUserOrg } from "@/lib/orgs/getUserOrg";
import { revokeGrant } from "@/lib/platform/dataAccessGrants";

function isOrgAdmin(role: string) {
  return role === "owner" || role === "admin";
}

/** Customer revokes an active support data-access grant before it expires. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserOrg(user.uid);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!isOrgAdmin(org.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const grant = await revokeGrant(user, org.orgId, id);
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 });

  return NextResponse.json({ ok: true, grant });
}
