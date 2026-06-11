import { NextRequest, NextResponse } from "next/server";
import { runNightlySync } from "@/lib/clover/syncScheduler";

export const maxDuration = 300;

/**
 * Nightly Clover→warehouse sync for every active merchant across all
 * non-suspended orgs. Scheduled by vercel.json. Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` to cron invocations when CRON_SECRET is
 * set; we reject anything else so the endpoint can't be triggered externally.
 *
 * Fully dynamic: merchants are enumerated from Firestore at run time, so new
 * clients are included automatically with no per-client configuration.
 */
export async function GET(request: NextRequest) {
  // Fail closed: a missing CRON_SECRET must never leave this endpoint open —
  // it triggers a 300s all-org sync and is otherwise publicly reachable.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runNightlySync({ budgetMs: 270_000 });
  return NextResponse.json({ ok: true, ...summary });
}
