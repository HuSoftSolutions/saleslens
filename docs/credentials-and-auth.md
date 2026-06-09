# Credentials & Authentication

How every integration authenticates, what's needed **locally** vs **in production**,
and the Clover **API token vs OAuth** decision. See also [data-flow.md](./data-flow.md)
and [known-issues.md](./known-issues.md).

---

## 1. Firebase Admin (Auth + Firestore)

The server verifies Firebase ID tokens and reads/writes Firestore via the Firebase
Admin SDK (`src/lib/firebase/admin.ts`). It needs Google credentials.

| Environment | How it authenticates | What to set |
|---|---|---|
| **Local dev** | Application Default Credentials (ADC) | Run `gcloud auth application-default login` once. Leave `FIREBASE_SERVICE_ACCOUNT_KEY` **empty**. |
| **Production (Vercel)** | Service-account JSON | Set `FIREBASE_SERVICE_ACCOUNT_KEY` to the **full** service-account JSON (one line). ADC is not available on Vercel. |

### ⚠️ The gotcha we hit
`FIREBASE_SERVICE_ACCOUNT_KEY` must be the **entire service-account JSON object**:

```json
{ "type": "service_account", "project_id": "...", "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...@...iam.gserviceaccount.com", "client_id": "...", ... }
```

Pasting **only the private key** (`-----BEGIN PRIVATE KEY-----…`) makes `JSON.parse`
fail with *"No number after minus sign in JSON"* and 500s every request. A private
key alone also can't authenticate (it's missing `client_email`/`project_id`).

`admin.ts` is now hardened: a malformed key logs a warning and **falls back to ADC**
instead of crashing. Locally the var is intentionally left empty (ADC handles it).

### Getting the real key (for production)
Firebase Console → Project Settings → **Service accounts** → **Generate new private
key** → downloads the complete JSON. Paste that whole object as the env value.

---

## 2. BigQuery (analytics warehouse)

Same Google-credentials story (`src/lib/bigquery/client.ts`).

| Environment | How | What to set |
|---|---|---|
| **Local dev** | ADC | `gcloud auth application-default login` (same login as Firebase). |
| **Production** | Service-account JSON | `GOOGLE_CLOUD_CREDENTIALS` = full service-account JSON. Grant it **BigQuery Data Editor** + **BigQuery Job User**. |

Also set `GOOGLE_CLOUD_PROJECT`, `BIGQUERY_DATASET_RAW`, `BIGQUERY_DATASET_MARTS`.

---

## 3. Clover — API token vs OAuth

Both produce a `Bearer` token the `CloverClient` uses identically. They differ only
in **how a merchant connects**. The right choice depends on **tenancy**, not devices
(a web app reading the REST API needs no Clover device either way).

| | **Merchant API token** | **OAuth** |
|---|---|---|
| How the merchant connects | Generates a token in their Clover dashboard; you paste it in (the app's **Dev Connect** flow) | Clicks "install/authorize"; Clover hands your server tokens |
| Best for | **Your own merchant(s)** — a handful you control | **Distributing to many merchants** (multi-tenant SaaS) |
| Token lifetime | Long-lived (Clover trending toward expiry — verify) | Access token **expires**; needs refresh-token rotation |
| UX | Manual copy/paste per merchant | One-click, self-serve |
| Production gate | None for your own merchant | App must be set to **Production** and pass Clover's **app review** before others can install |

### Which to use
- **One business (yours), staff log into the web app** → **API token** (Dev Connect with
  a production token; simplest).
- **Many separate businesses each connect their own Clover** → **OAuth** (App Market).

### Production requirements
- **API token path:** set `CLOVER_ENV=production`, point at `api.clover.com`, set
  `CLOVER_DEV_TOKEN` / `CLOVER_DEV_MERCHANT_ID` to production values.
- **OAuth path:** production app credentials (`CLOVER_CLIENT_ID` / `CLOVER_CLIENT_SECRET`),
  production redirect URI, Clover **app review**, and you must **implement token refresh**
  (see [known-issues.md](./known-issues.md) — OAuth tokens expire and the current code
  never refreshes, so connections would silently die). Move tokens out of plaintext
  Firestore for real merchant data.

> Note: With `ANALYTICS_SOURCE=bigquery`, the chat reads the warehouse and does **not**
> require a live Clover connection at request time. Clover is then only the **sync
> source** that feeds BigQuery (backfill + incremental cron/webhooks).

---

## 4. Production environment variables (checklist)

```bash
# Firebase (client — public)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin (server) — FULL service-account JSON, one line
FIREBASE_PROJECT_ID=...
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# BigQuery — FULL service-account JSON (BigQuery Data Editor + Job User)
GOOGLE_CLOUD_PROJECT=...
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}
BIGQUERY_DATASET_RAW=clover_raw
BIGQUERY_DATASET_MARTS=clover_marts

# Analytics + cost guards
ANALYTICS_SOURCE=bigquery        # or "clover"
ANALYTICS_TZ=America/New_York
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_DAY=200
OPENAI_MAX_OUTPUT_TOKENS=800
BIGQUERY_MAX_BYTES_BILLED=1073741824

# OpenAI
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini

# Clover (API-token path)
CLOVER_ENV=production
CLOVER_DEV_TOKEN=...
CLOVER_DEV_MERCHANT_ID=...
# Clover (OAuth path) — instead of the above
# CLOVER_CLIENT_ID=...
# CLOVER_CLIENT_SECRET=...
# CLOVER_REDIRECT_URI=https://yourdomain.com/api/clover/oauth/callback

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

**Locally**, leave `FIREBASE_SERVICE_ACCOUNT_KEY` and `GOOGLE_CLOUD_CREDENTIALS`
unset/empty and rely on `gcloud auth application-default login`.
