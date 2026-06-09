import { adminDb } from "@/lib/firebase/admin";

export interface Limits {
  perMinute: number;
  perDay: number;
}

export interface RateResult {
  allowed: boolean;
  reason?: "minute" | "day";
  retryAfterSeconds?: number;
  usedDay: number;
  limits: Limits;
}

/** Global defaults, overridable via env. */
export function defaultLimits(): Limits {
  return {
    perMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10),
    perDay: Number(process.env.RATE_LIMIT_PER_DAY ?? 200),
  };
}

// Accept explicit 0 (a deliberate "block this user"); fall back otherwise.
function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * Effective limits for a user: per-user override → org override → global default.
 * Both are read from the `limits` field on the respective Firestore docs.
 */
export async function getEffectiveLimits(
  orgId: string,
  uid: string
): Promise<Limits> {
  const defs = defaultLimits();
  const orgRef = adminDb.collection("organizations").doc(orgId);
  const [orgSnap, userSnap] = await Promise.all([
    orgRef.get(),
    orgRef.collection("users").doc(uid).get(),
  ]);
  const org = (orgSnap.data()?.limits ?? {}) as Partial<Limits>;
  const usr = (userSnap.data()?.limits ?? {}) as Partial<Limits>;
  return {
    perMinute: numOr(usr.perMinute, numOr(org.perMinute, defs.perMinute)),
    perDay: numOr(usr.perDay, numOr(org.perDay, defs.perDay)),
  };
}

/**
 * Atomically check the per-minute and per-day windows and consume one unit if
 * allowed. Uses a single Firestore transaction on the user's usage doc.
 */
export async function checkAndConsume(
  orgId: string,
  uid: string,
  limits: Limits,
  now: number
): Promise<RateResult> {
  const ref = adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("usage")
    .doc(uid);
  const dayKey = new Date(now).toISOString().slice(0, 10); // UTC day

  return adminDb.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() ?? {};
    let minuteCount: number = d.minuteCount ?? 0;
    let minuteStart: number = d.minuteStart ?? 0;
    let dayCount: number = d.dayCount ?? 0;
    let storedDay: string = d.dayKey ?? "";

    if (now - minuteStart >= 60_000) {
      minuteCount = 0;
      minuteStart = now;
    }
    if (storedDay !== dayKey) {
      dayCount = 0;
      storedDay = dayKey;
    }

    if (dayCount >= limits.perDay) {
      return { allowed: false, reason: "day", usedDay: dayCount, limits };
    }
    if (minuteCount >= limits.perMinute) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((60_000 - (now - minuteStart)) / 1000)
      );
      return {
        allowed: false,
        reason: "minute",
        retryAfterSeconds,
        usedDay: dayCount,
        limits,
      };
    }

    minuteCount++;
    dayCount++;
    tx.set(
      ref,
      { minuteCount, minuteStart, dayCount, dayKey: storedDay, updatedAt: new Date() },
      { merge: true }
    );
    return { allowed: true, usedDay: dayCount, limits };
  });
}

/** Resolve limits, then check + consume in one call. */
export async function enforceRateLimit(
  orgId: string,
  uid: string,
  now: number
): Promise<RateResult> {
  const limits = await getEffectiveLimits(orgId, uid);
  return checkAndConsume(orgId, uid, limits, now);
}
