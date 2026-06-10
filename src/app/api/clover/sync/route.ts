import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { syncMerchants } from "@/lib/clover/sync";

export const maxDuration = 300; // sync can take a while for large ranges

const schema = z.object({
  days: z.number().int().min(1).max(400).optional(),
  merchantId: z.string().max(64).optional(),
});

/**
 * Pull connected merchants' Clover data into the BigQuery warehouse.
 * Triggered from Settings (and, in production, a Vercel Cron on a schedule).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await syncMerchants(org.orgId, {
      days: parsed.days ?? 90,
      merchantId: parsed.merchantId,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("Clover sync error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
