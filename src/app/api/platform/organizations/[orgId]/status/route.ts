import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { setOrgStatus, MutationError } from "@/lib/platform/mutations";

const schema = z.object({ status: z.enum(["active", "suspended"]) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { orgId } = await params;
  try {
    await setOrgStatus(admin, orgId, body.status);
  } catch (err) {
    if (err instanceof MutationError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, status: body.status });
}
