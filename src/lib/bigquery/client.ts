import { BigQuery } from "@google-cloud/bigquery";

/**
 * Shared BigQuery client.
 *
 * - Locally: uses Application Default Credentials (gcloud auth
 *   application-default login).
 * - On Vercel: set GOOGLE_CLOUD_CREDENTIALS to the service-account JSON and
 *   GOOGLE_CLOUD_PROJECT to the project id.
 */
let client: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (!client) {
    const credsJson = process.env.GOOGLE_CLOUD_CREDENTIALS;
    let credentials: Record<string, unknown> | undefined;
    if (credsJson && credsJson.trim()) {
      try {
        credentials = JSON.parse(credsJson);
      } catch (err) {
        // A malformed value here used to surface as a cryptic JSON.parse error on
        // every query. Fail loudly with the actual cause instead. The most common
        // mistake is pasting the service-account JSON twice (two objects back to
        // back) or leaving trailing characters after the closing brace.
        throw new Error(
          "GOOGLE_CLOUD_CREDENTIALS is set but is not valid JSON. It must be the full " +
            "service-account JSON object exactly once (no duplicate paste, no trailing " +
            `characters). Underlying parse error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    client = new BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      ...(credentials ? { credentials } : {}),
    });
  }
  return client;
}

export const RAW_DATASET =
  process.env.BIGQUERY_DATASET_RAW ?? "clover_raw_dev";
export const MARTS_DATASET =
  process.env.BIGQUERY_DATASET_MARTS ?? "clover_marts_dev";
export const BQ_LOCATION = process.env.BIGQUERY_LOCATION ?? "US";
