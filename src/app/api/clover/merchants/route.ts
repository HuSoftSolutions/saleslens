import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { CloverClient } from "@/lib/clover/client";
import { getConnectedMerchants, upsertMerchant } from "@/lib/clover/merchants";
import {
  initMerchantBackfill,
  runConnectBackfill,
} from "@/lib/clover/syncScheduler";

export const maxDuration = 300; // background backfill on connect

/** List connected Clover merchants (locations) for the org. */
export async function GET() {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  const merchants = (await getConnectedMerchants(org.orgId)).map((m) => ({
    merchantId: m.merchantId,
    name: m.name,
    status: m.status,
    environment: m.environment,
    source: m.source,
    timezone: m.timezone ?? null,
    sync: {
      lastDate: m.syncLastDate ?? null,
      historyStart: m.syncHistoryStart ?? null,
      backfillTarget: m.syncBackfillTarget ?? null,
      backfillStatus: m.syncBackfillStatus ?? null,
    },
  }));
  return NextResponse.json({ merchants });
}

const addSchema = z.object({
  merchantId: z.string().min(1).max(64),
  accessToken: z.string().min(1).max(512),
  environment: z.enum(["sandbox", "production"]).optional(),
});

/**
 * Add a location via API token (dev / sandbox path). Validates the token by
 * fetching merchant info from Clover, then stores it. In production this is the
 * OAuth callback's job; this endpoint reproduces the multi-location shape in
 * sandbox by letting you add each test merchant's token.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { org } = ctx;

  let body: z.infer<typeof addSchema>;
  try {
    body = addSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate the token against Clover and capture name + timezone.
  const client = new CloverClient({
    accessToken: body.accessToken,
    merchantId: body.merchantId,
  });
  let name: string | null = null;
  let timezone: string | null = null;
  try {
    const info = await client.getMerchantInfo();
    name = info?.name ?? null;
    timezone = await client.getMerchantTimezone().catch(() => null);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Clover with that token + merchant ID. Check both and the environment." },
      { status: 400 }
    );
  }

  await upsertMerchant(org.orgId, {
    merchantId: body.merchantId,
    name,
    status: "active",
    environment: body.environment ?? process.env.CLOVER_ENV ?? "sandbox",
    source: "token",
    accessToken: body.accessToken,
    timezone,
  });

  await initMerchantBackfill(org.orgId, body.merchantId);
  after(() => runConnectBackfill(org.orgId, [body.merchantId]));

  return NextResponse.json({ ok: true, merchantId: body.merchantId, name });
}
