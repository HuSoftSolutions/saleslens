import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { adminDb } from "@/lib/firebase/admin";

/** Load the messages for a single thread (user/assistant turns + any charts). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { id } = await params;
  const snap = await adminDb
    .collection("organizations")
    .doc(org.orgId)
    .collection("chatThreads")
    .doc(id)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  const messages = snap.docs
    .filter((d) => {
      const role = d.data().role;
      return role === "user" || role === "assistant";
    })
    .map((d) => {
      const data = d.data();
      return {
        role: data.role as "user" | "assistant",
        content: data.content as string,
        chart: data.chart ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

  return NextResponse.json({ threadId: id, messages });
}
