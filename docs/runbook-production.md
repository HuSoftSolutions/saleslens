# Production Runbook — Operator

How to take SalesLens live: the Clover app side, deployment, and operations.
See also [credentials-and-auth.md](./credentials-and-auth.md),
[known-issues.md](./known-issues.md), [data-flow.md](./data-flow.md).

---

## Do I have to publish an app to the Clover App Market?

**It depends on who connects:**

- **Distributing to other businesses (multi-tenant SaaS) → YES.** For merchants
  you don't own to connect via OAuth, your app must be created in the Clover
  Developer Dashboard, pass Clover's **app review/approval**, and be **published**
  to the Clover App Market. Merchants then **install it from the App Market**,
  which runs the OAuth flow and redirects to your callback. There is no way around
  the review to let arbitrary merchants authorize you.
- **Just your own business(es) → NO publishing required.** For merchants you own,
  you can connect with a **merchant API token** (the "Add by token" path) without
  listing the app. Generate a production token in each location's Clover dashboard.

SalesLens supports both. The OAuth path (below) is what you need for a real product.

---

## Part A — Clover app (production)

1. **Create/promote the app** in the [Clover Developer Dashboard](https://www.clover.com/developer)
   (production, not sandbox). Note the **production App ID** and **App Secret**
   (these differ from sandbox).
2. **App Type:** REST Clients.
3. **Requested Permissions (read-only):** Merchant, Orders, Payments, **Inventory**
   (Inventory is required for category mapping).
4. **REST Configuration:**
   - **Site URL:** your production domain, e.g. `https://app.saleslens.com`
   - **Default OAuth Response:** **Code** (NOT Token — Code gives refresh tokens
     and matches our auth-code flow).
   - Redirect URI used by the app: `https://app.saleslens.com/api/clover/oauth/callback`
     (must be a subpath of the Site URL).
5. **Listing assets:** app name, icon, description, **privacy policy URL**,
   support contact, screenshots, and pricing (free or paid — Clover handles
   billing + revenue share for paid apps).
6. **Submit for review.** Clover reviews changes to Site URL and listing. Approval
   can take time and may require revisions. (Sandbox needs no review — that's why
   testing there is instant.)
7. **Publish.** Once approved, the app is installable from the App Market.

> Verify exact review requirements in Clover's current docs — they change.

---

## Part B — Deploy SalesLens (Vercel)

1. **Connect the repo to Vercel**, set production branch.
2. **Environment variables** (Vercel → Project → Settings → Environment Variables):
   ```
   # Firebase client (public)
   NEXT_PUBLIC_FIREBASE_*=…
   # Firebase Admin (server) — FULL service-account JSON, one line
   FIREBASE_PROJECT_ID=…
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   # BigQuery — FULL service-account JSON (roles: BigQuery Data Editor + Job User)
   GOOGLE_CLOUD_PROJECT=…
   GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}
   BIGQUERY_DATASET_RAW=clover_raw
   BIGQUERY_DATASET_MARTS=clover_marts
   # Analytics + cost guards
   ANALYTICS_SOURCE=bigquery
   ANALYTICS_TZ=America/New_York
   RATE_LIMIT_PER_MINUTE=10
   RATE_LIMIT_PER_DAY=200
   OPENAI_MAX_OUTPUT_TOKENS=800
   BIGQUERY_MAX_BYTES_BILLED=1073741824
   # OpenAI
   OPENAI_API_KEY=…
   OPENAI_MODEL=gpt-4o-mini
   # Clover (PRODUCTION app)
   CLOVER_ENV=production
   CLOVER_CLIENT_ID=<prod app id>
   CLOVER_CLIENT_SECRET=<prod app secret>
   CLOVER_REDIRECT_URI=https://app.saleslens.com/api/clover/oauth/callback
   # App
   NEXT_PUBLIC_APP_URL=https://app.saleslens.com
   ```
   (Locally you use `gcloud` ADC instead of the two service-account JSONs.)
3. **Create the BigQuery datasets + schema** in the prod project:
   `BIGQUERY_DATASET_RAW=clover_raw BIGQUERY_DATASET_MARTS=clover_marts npm run bq:setup`
   (Do **not** run `bq:seed` in production — that's synthetic demo data.)
4. **Firestore security rules:** lock down so each org reads/writes only its own
   `organizations/{orgId}/…` docs. (Still open in dev — see known-issues.)
5. **Domain:** point `app.saleslens.com` at Vercel; confirm it matches the Clover
   Site URL + redirect URI exactly.

---

## Part C — Cost & safety caps (set once, in dashboards)

These are the real ceilings (code guards bound abuse, but these stop spend):
1. **OpenAI** → Billing → **monthly hard limit** (e.g. $50).
2. **Vercel** → **Spend Management** → spend cap.
3. **BigQuery** → Quotas → **query-bytes-per-day** cap.
4. **GCP Billing** → budget alert (covers BigQuery + Firestore).

---

## Part D — Operations

- **Onboarding a customer:** they sign in → Settings → Connect with Clover (OAuth)
  per location → Sync. See [runbook-end-user.md](./runbook-end-user.md).
- **Syncing:** manual per-location **Sync** button (no scheduler by design). Each
  sync is idempotent for its date range.
- **Token refresh:** automatic — OAuth tokens are refreshed before expiry; a
  merchant that fails refresh is flagged `error` (customer re-connects).
- **Tenant isolation:** every analytics query is scoped to the org's connected
  merchant IDs; one customer can't read another's data.
- **Model/cost:** `gpt-4o-mini` keeps per-question cost ~$0.001; tune via
  `OPENAI_MODEL`. Per-user rate limits in Settings.

## Known limitations to track before/at launch
See [known-issues.md](./known-issues.md) and [production-readiness.md](./production-readiness.md):
- **Token storage** is plaintext in Firestore → move to a secrets manager / encrypt.
- **Bay/booking modeling** + how sim time appears in Clover still needs the
  real-data audit (synthetic seed assumptions today).
- Firestore security rules must be tightened for production.
