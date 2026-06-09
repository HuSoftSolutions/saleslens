// Shared helpers for the BigQuery dev scripts (Node ESM).
import fs from "node:fs";
import path from "node:path";
import { BigQuery } from "@google-cloud/bigquery";

// Minimal .env.local loader (no dependency) — only fills vars not already set.
export function loadEnvLocal() {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

export const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "clover-ai-edae3";
export const RAW = process.env.BIGQUERY_DATASET_RAW || "clover_raw_dev";
export const MARTS = process.env.BIGQUERY_DATASET_MARTS || "clover_marts_dev";
export const LOCATION = process.env.BIGQUERY_LOCATION || "US";

export const bq = new BigQuery({ projectId: PROJECT });

export async function runDDL(sql, label) {
  await bq.query({ query: sql, location: LOCATION });
  if (label) console.log("  ✓", label);
}

// Offset (localWall - UTC) in ms for an instant in a timezone.
export function tzOffsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const x of dtf.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  const h = p.hour === "24" ? 0 : Number(p.hour);
  return (
    Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second) - utcMs
  );
}

// Convert a local wall-clock time in `tz` to a UTC millisecond timestamp.
export function localToUtcMs(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  return guess - tzOffsetMs(guess, tz);
}
