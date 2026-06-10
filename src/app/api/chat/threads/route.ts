import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { adminDb } from "@/lib/firebase/admin";

/** List recent chat threads for the user's org. */
export async function GET() {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  const snap = await adminDb
    .collection("organizations")
    .doc(org.orgId)
    .collection("chatThreads")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();

  const threads = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      let title: string | undefined = data.title;
      // Older threads predate titles — derive a preview from the first message.
      if (!title) {
        const firstMsgs = await d.ref
          .collection("messages")
          .orderBy("createdAt", "asc")
          .limit(3)
          .get();
        const firstUser = firstMsgs.docs.find(
          (m) => m.data().role === "user"
        );
        title = firstUser?.data()?.content?.slice(0, 80);
      }
      return {
        id: d.id,
        title: title || "New conversation",
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    })
  );

  return NextResponse.json({ threads });
}
