import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { extendBackfill, runConnectBackfill } from "@/lib/clover/syncScheduler";

export const maxDuration = 300;

const schema = z.object({
  merchantId: z.string().min(1).max(64),
  days: z.number().int().min(1).max(1825), // up to ~5 years
});

/**
 * "Import more history": push a merchant's backfill target further back and run
 * the work in the background. Idempotent — re-importing an overlapping range
 * never duplicates rows.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  await extendBackfill(org.orgId, body.merchantId, body.days);
  after(() => runConnectBackfill(org.orgId, [body.merchantId]));

  return NextResponse.json({ ok: true });
}
