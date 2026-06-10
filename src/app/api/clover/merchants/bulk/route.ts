import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import { CloverClient } from "@/lib/clover/client";
import { upsertMerchant } from "@/lib/clover/merchants";

const schema = z.object({
  environment: z.enum(["sandbox", "production"]).optional(),
  entries: z
    .array(
      z.object({
        merchantId: z.string().min(1).max(64),
        accessToken: z.string().min(1).max(512),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Add multiple locations by token in one request — validates each against Clover
 * and reports per-entry success/failure. For fast multi-location onboarding.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensureUserOrg(user.uid, user.email ?? "");
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 403 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const env = body.environment ?? process.env.CLOVER_ENV ?? "sandbox";

  const results = await Promise.all(
    body.entries.map(async (e) => {
      const client = new CloverClient({
        accessToken: e.accessToken,
        merchantId: e.merchantId,
      });
      try {
        const info = await client.getMerchantInfo();
        const name = info?.name ?? null;
        const timezone = await client.getMerchantTimezone().catch(() => null);
        await upsertMerchant(org.orgId, {
          merchantId: e.merchantId,
          name,
          status: "active",
          environment: env,
          source: "token",
          accessToken: e.accessToken,
          timezone,
        });
        return { merchantId: e.merchantId, ok: true, name };
      } catch {
        return {
          merchantId: e.merchantId,
          ok: false,
          error: "Could not reach Clover (check ID, token, environment)",
        };
      }
    })
  );

  const added = results.filter((r) => r.ok).length;
  return NextResponse.json({ added, total: results.length, results });
}
