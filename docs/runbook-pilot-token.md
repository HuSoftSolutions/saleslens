# Pilot Customer Runbook — Connect via API Token (Production)

For your **first production pilot**: a real business connects their live Clover
data using a **merchant API token** (no Clover App Market publishing required).
Great for design partners / early customers. When you scale to self-serve, switch
to OAuth (see [runbook-production.md](./runbook-production.md)).

> Token vs OAuth tradeoffs: [credentials-and-auth.md](./credentials-and-auth.md).
> Tokens are fine for a willing, hands-on pilot customer; confirm Clover's terms
> before doing this at scale.

**This pilot: 7 locations.** Each Clover location is a **separate merchant** with
its own Merchant ID and its own token, so the customer generates **7 tokens** and
you add **7 locations**. It's the same steps repeated 7×. They likely access all 7
from one Clover login (a "merchant group") by switching the active location.

---

## 0. Key constraint (read first)

The app talks to **one Clover environment per deployment**, set by `CLOVER_ENV`.
A **production** customer token only validates against `api.clover.com`, so the
deployment they connect to **must have `CLOVER_ENV=production`**.

→ Run the pilot on a **production deployment** (`CLOVER_ENV=production`), separate
from your local sandbox dev. Don't try to mix a production token into a
sandbox-configured instance — validation will fail with "Could not reach Clover."

---

## 1. Operator prep (you)

Stand up a production SalesLens deployment (see [runbook-production.md](./runbook-production.md) Part B), with at minimum:
- `CLOVER_ENV=production`
- `ANALYTICS_SOURCE=bigquery`, prod BigQuery datasets created (`npm run bq:setup`)
- Firebase Admin + BigQuery service-account creds, OpenAI key
- The four spend caps enabled (OpenAI hard limit, Vercel, BigQuery, GCP budget)
- Firestore security rules locked down

You do **not** need a published Clover app or `CLOVER_CLIENT_ID/SECRET` for the
token path.

## 2. Customer generates a Clover API token — **once per location (×7)**

Send the customer these steps. They repeat this for **each of the 7 locations**,
switching the active location in their Clover dashboard between each:
1. Log in to the Clover web dashboard and **select the location** (top-of-page
   location switcher).
2. Go to **Account & Setup → API Tokens** (may be under **Setup**).
3. **Create a new token**, name it **"SalesLens"**.
4. Grant **read-only** permissions: **Inventory, Orders, Payments, Merchants**
   (Inventory is needed for item categories).
5. **Copy the token** (a UUID like `xxxxxxxx-xxxx-…`).
6. Note the **Merchant ID** (the 13-character ID in the dashboard URL
   `.../m/XXXXXXXXXXXXX/...`, or under Account & Setup).

Have them record the **7 pairs** as `Location name → Merchant ID → token` (e.g. in
a shared password manager). Tip: tokens look alike — labeling each with its
location name avoids mix-ups.

> If they don't see **API Tokens**, that feature may not be enabled for their
> plan — they can contact Clover to enable it, or fall back to OAuth.

## 3. Securely hand off the token

The token grants read access to their sales data — **don't send it over plain
email/Slack**. Use a secure channel: a password-manager share (1Password/Bitwarden
"send"), or have the customer paste it themselves (next step).

## 4. Connect the locations in SalesLens — **add all 7**

Either the **customer** (after signing in) or **you** (on their behalf), for
**each of the 7 pairs**:
1. **Settings → Locations → Add by token**.
2. Enter the **Merchant ID** and **API token**, set **Environment = production**.
3. **Add location.** SalesLens validates the token against Clover, captures the
   business name + timezone, and lists it. Repeat until all **7 locations** show
   **Active**.

## 5. Pull in the data — **Sync all**

- With multiple locations connected, click **Sync all** (top of the Locations
  card) to import all 7 at once — or **Sync** an individual location.
- Each sync imports recent orders, payments, items, and categories into the
  warehouse (`location_id = merchant ID`). Re-run anytime for fresh numbers
  (manual; no scheduler).

## 6. Use it

- **Chat:** "What were my total sales this week across all locations?",
  "Which location did the most sales?", "Top items at [location]?", "Busiest
  hours?". Use the **location selector** to focus on one of the 7, or **All
  locations** to roll them up.

---

## Security & data handling (share with the customer)
- **Read-only.** SalesLens never modifies anything in Clover.
- Their data is isolated to their organization — no other customer can see it
  (queries are scoped to their merchant IDs).
- **To revoke access:** delete the "SalesLens" token in their Clover dashboard
  (Account & Setup → API Tokens), and/or Disconnect the location in SalesLens.
- Note: tokens are currently stored encrypted-at-rest only as far as Firestore
  provides — hardening (secrets manager) is on the roadmap; mention this honestly
  to a security-conscious pilot.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| "Could not reach Clover with that token + merchant ID" | Wrong Merchant ID, missing permissions, or the deployment is **sandbox** while the token is **production** (`CLOVER_ENV` mismatch). |
| Location added but **Sync** returns 0 / errors | Token lacks **Orders/Payments/Inventory** read; regenerate with those permissions. |
| Categories show "Uncategorized" | The customer's Clover items aren't assigned to categories; that's their catalog setup, not a bug. |
| Token stops working later | Clover may expire it; have them generate a new token and re-add (or move them to OAuth). |

## Operator checklist (7-location pilot)
- [ ] Production deployment up, `CLOVER_ENV=production`, spend caps on
- [ ] Customer generated **7** read-only tokens (Inventory/Orders/Payments/Merchants) + the 7 Merchant IDs, labeled by location
- [ ] All 7 token pairs transferred securely
- [ ] All **7 locations** added + validated (Active), **Sync all** run
- [ ] Spot-check 2–3 locations' totals vs their Clover dashboard for the same range
- [ ] Customer can sign in and get answers in Chat (try "sales by location this week")
