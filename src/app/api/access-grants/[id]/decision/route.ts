import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getUserOrg } from "@/lib/orgs/getUserOrg";
import { decideGrant } from "@/lib/platform/dataAccessGrants";

const schema = z.object({ decision: z.enum(["approve", "deny"]) });

function isOrgAdmin(role: string) {
  return role === "owner" || role === "admin";
}

/** Customer approves or denies a pending support data-access request. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserOrg(user.uid);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!isOrgAdmin(org.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const grant = await decideGrant(user, org.orgId, id, body.decision === "approve");
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 });

  return NextResponse.json({ ok: true, grant });
}
