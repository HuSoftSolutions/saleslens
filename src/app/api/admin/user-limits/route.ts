import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getUserOrg } from "@/lib/orgs/getUserOrg";
import { adminDb } from "@/lib/firebase/admin";
import { defaultLimits } from "@/lib/limits/rateLimit";

function isAdmin(role: string) {
  return role === "owner" || role === "admin";
}

/** List org members with their effective-override limits and today's usage. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserOrg(user.uid);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!isAdmin(org.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgRef = adminDb.collection("organizations").doc(org.orgId);
  const [usersSnap, usageSnap] = await Promise.all([
    orgRef.collection("users").get(),
    orgRef.collection("usage").get(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const usageByUid = new Map(
    usageSnap.docs.map((d) => [d.id, d.data()] as const)
  );

  const users = usersSnap.docs.map((d) => {
    const data = d.data();
    const usage = usageByUid.get(d.id);
    return {
      uid: d.id,
      email: data.email ?? null,
      role: data.role ?? "member",
      limits: data.limits ?? null,
      usedToday: usage?.dayKey === today ? usage.dayCount ?? 0 : 0,
    };
  });

  return NextResponse.json({ defaults: defaultLimits(), users });
}

const patchSchema = z.object({
  uid: z.string().min(1),
  perMinute: z.number().int().min(0).max(10000).nullable(),
  perDay: z.number().int().min(0).max(1000000).nullable(),
});

/** Set (or clear) a user's per-user limit overrides. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserOrg(user.uid);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!isAdmin(org.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userRef = adminDb
    .collection("organizations")
    .doc(org.orgId)
    .collection("users")
    .doc(body.uid);

  // Only allow editing members of the same org.
  if (!(await userRef.get()).exists) {
    return NextResponse.json({ error: "User not in organization" }, { status: 404 });
  }

  const limits: Record<string, number> = {};
  if (typeof body.perMinute === "number") limits.perMinute = body.perMinute;
  if (typeof body.perDay === "number") limits.perDay = body.perDay;

  if (Object.keys(limits).length === 0) {
    await userRef.update({ limits: FieldValue.delete() });
  } else {
    await userRef.update({ limits });
  }

  return NextResponse.json({ ok: true, limits: limits });
}
