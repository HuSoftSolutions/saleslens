import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { adminDb } from "@/lib/firebase/admin";
import {
  createAccessRequest,
  listGrantsForAdmin,
} from "@/lib/platform/dataAccessGrants";
import { recordAudit } from "@/lib/platform/audit";

const schema = z.object({
  reason: z.string().min(3).max(500),
  durationHours: z.number().int().min(1).max(168),
});

/** GET: this admin's grant history for the org (status display). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId } = await params;
  const grants = await listGrantsForAdmin(admin.uid, orgId);
  return NextResponse.json({ grants });
}

/** POST: request customer-consented data access. Creates a pending request. */
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
  const orgSnap = await adminDb.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  const orgName = orgSnap.data()?.name ?? null;

  const grantId = await createAccessRequest(
    admin,
    orgId,
    orgName,
    body.reason,
    body.durationHours
  );

  await recordAudit("dataAccess.request", admin, { orgId }, {
    grantId,
    reason: body.reason,
    durationHours: body.durationHours,
  });

  return NextResponse.json({ ok: true, grantId });
}
