/** Calendar date (YYYY-MM-DD) for an instant in a timezone. */
export function ymdInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Shift a YYYY-MM-DD string by N calendar days (UTC-safe). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ── period math for comparisons ──────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
function parts(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}
function mk(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based here
}

/** First day of the calendar week (Sunday by default) containing `ymd`. */
export function startOfWeekYmd(ymd: string, weekStartsOn = 0): string {
  const { y, m, d } = parts(ymd);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysYmd(ymd, -((dow - weekStartsOn + 7) % 7));
}
export function startOfMonthYmd(ymd: string): string {
  const { y, m } = parts(ymd);
  return mk(y, m, 1);
}
export function startOfYearYmd(ymd: string): string {
  return mk(parts(ymd).y, 1, 1);
}
/** Shift by N months, clamping the day to the target month's last day. */
export function addMonthsYmd(ymd: string, n: number): string {
  const { y, m, d } = parts(ymd);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return mk(ny, nm, Math.min(d, lastDayOfMonth(ny, nm)));
}
export function addYearsYmd(ymd: string, n: number): string {
  return addMonthsYmd(ymd, n * 12);
}
/** Inclusive day count of a range, e.g. [2025-01-01, 2025-01-07] → 7. */
export function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface ResolvedPeriod {
  startDate: string;
  endDate: string;
  label: string;
}

/** Named base periods, relative to `today` (already in the merchant's timezone). */
export type BasePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days";

export function resolveBasePeriod(preset: string, today: string): ResolvedPeriod {
  switch (preset) {
    case "yesterday": {
      const d = addDaysYmd(today, -1);
      return { startDate: d, endDate: d, label: "yesterday" };
    }
    case "this_week":
      return { startDate: startOfWeekYmd(today), endDate: today, label: "this week" };
    case "last_week": {
      const sow = startOfWeekYmd(today);
      return {
        startDate: addDaysYmd(sow, -7),
        endDate: addDaysYmd(sow, -1),
        label: "last week",
      };
    }
    case "this_month":
      return { startDate: startOfMonthYmd(today), endDate: today, label: "this month" };
    case "last_month": {
      const end = addDaysYmd(startOfMonthYmd(today), -1);
      return { startDate: startOfMonthYmd(end), endDate: end, label: "last month" };
    }
    case "this_year":
      return { startDate: startOfYearYmd(today), endDate: today, label: "this year" };
    case "last_year": {
      const end = addDaysYmd(startOfYearYmd(today), -1);
      return { startDate: startOfYearYmd(end), endDate: end, label: "last year" };
    }
    case "last_7_days":
      return { startDate: addDaysYmd(today, -6), endDate: today, label: "last 7 days" };
    case "last_30_days":
      return { startDate: addDaysYmd(today, -29), endDate: today, label: "last 30 days" };
    case "last_90_days":
      return { startDate: addDaysYmd(today, -89), endDate: today, label: "last 90 days" };
    case "today":
    default:
      return { startDate: today, endDate: today, label: "today" };
  }
}

/**
 * Resolve the comparison side. Relative presets are computed FROM the base
 * period so lengths always match; anything else falls back to a base preset.
 */
export function resolveComparePeriod(
  preset: string,
  base: { startDate: string; endDate: string },
  today: string
): ResolvedPeriod {
  switch (preset) {
    case "previous_period": {
      const len = daysInclusive(base.startDate, base.endDate);
      const endDate = addDaysYmd(base.startDate, -1);
      return {
        startDate: addDaysYmd(endDate, -(len - 1)),
        endDate,
        label: "previous period",
      };
    }
    case "same_period_last_week":
      return {
        startDate: addDaysYmd(base.startDate, -7),
        endDate: addDaysYmd(base.endDate, -7),
        label: "same period last week",
      };
    case "same_period_last_month":
      return {
        startDate: addMonthsYmd(base.startDate, -1),
        endDate: addMonthsYmd(base.endDate, -1),
        label: "same period last month",
      };
    case "same_period_last_year":
      return {
        startDate: addYearsYmd(base.startDate, -1),
        endDate: addYearsYmd(base.endDate, -1),
        label: "same period last year",
      };
    default:
      return resolveBasePeriod(preset, today);
  }
}
