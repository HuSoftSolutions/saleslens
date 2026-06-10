import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { setOrgRole, ORG_ROLES, MutationError } from "@/lib/platform/mutations";

const schema = z.object({ role: z.enum(ORG_ROLES) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; uid: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { orgId, uid } = await params;
  try {
    await setOrgRole(admin, orgId, uid, body.role);
  } catch (err) {
    if (err instanceof MutationError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, role: body.role });
}
