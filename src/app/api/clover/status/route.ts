import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) {
    return NextResponse.json({ connected: false });
  }

  const integrationDoc = await adminDb
    .collection("organizations")
    .doc(org.orgId)
    .collection("integrations")
    .doc("clover")
    .get();

  if (!integrationDoc.exists) {
    return NextResponse.json({ connected: false });
  }

  const data = integrationDoc.data();
  return NextResponse.json({
    connected: data?.status === "active",
    merchantId: data?.merchantId ?? null,
    environment: data?.environment ?? null,
  });
}
