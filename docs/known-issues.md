# Known Issues & Hardening Backlog

Prioritized list of architectural pitfalls. See [data-flow.md](./data-flow.md) for context.

## ✅ Fixed

- **Silent 1000-record truncation** — `CloverClient` now paginates (offset+limit) up to a
  50k-record ceiling and returns a `truncated` flag. `getSalesSummary`/`getRefundSummary`
  surface `truncated` so the model can warn instead of reporting wrong totals.
- **Refunds always $0** — `getPayments` now sends `expand=refunds`.
- **Voided/declined payments inflating totals** — `getSalesSummary` skips payments whose
  `result` is present and not `SUCCESS`.
- **Conversation memory starved by tool messages** — history load widened to 80 docs, then
  sliced to the last 20 user/assistant turns.
- **UTC vs merchant-local date ranges** — date filters and the prompt's "today" now use the
  merchant timezone.
- **Rate limiting (cost/abuse)** — per-user + per-day/min limits on `/api/chat`
  (`src/lib/limits/rateLimit.ts`), configurable per user in Settings → Usage limits.
- **Per-request cost caps** — OpenAI `max_completion_tokens` + BigQuery `maximumBytesBilled`.

## 🔴 High priority (do before real merchants)

### Production data fidelity ← **new, important**
Our schema + seed are assumptions and don't model The Bunker's simulator-bay bookings.
Audit the real Clover data and seed realistic bay-booking data before trusting analytics.
**See [production-readiness.md](./production-readiness.md).**

### OAuth token refresh (connections die silently)
`refreshToken` + `accessTokenExpiration` are stored but **never used**. When a production
OAuth access token expires, every Clover call 401s and the integration silently breaks.
- Add a refresh helper in `oauth.ts` (POST `/oauth/v2/refresh` with the refresh token).
- In the chat route, refresh when `accessTokenExpiration` is near, persist the new token.
- On a 401 from Clover, attempt one refresh-and-retry, else mark integration `status: "error"`.

### Platform spend caps (only settable in dashboards)
Code guards bound abuse, but the real ceilings are dashboard toggles: OpenAI monthly hard
limit, Vercel Spend Management, BigQuery query-bytes-per-day quota, GCP budget alert.

## 🟠 Medium

- **No caching** — identical questions re-fetch Clover and re-call OpenAI. Add a short-TTL
  cache keyed by `(merchantId, tool, startDate, endDate)`; invalidate on a sensible window.
- **Plaintext Clover tokens in Firestore** — move to a secrets manager (GCP Secret Manager)
  or at minimum encrypt at rest; lock down Firestore security rules.
- **Firebase ID token in URL** — OAuth start passes the token as `?token=` (lands in logs).
  Use a short-lived signed state or a POST instead.
- **Opaque Clover errors** — tool failures become vague model text. Distinguish auth vs
  transient vs truncation, and log structured errors for ops.

## 🟡 Lower

- **Unbounded message growth** — no archival/TTL on `chatThreads/*/messages`.
- **No idempotency** — a double-send can duplicate messages/threads.
- **No streaming** — the full tool loop runs before any text appears; no request cancellation.
- **LLM-driven date math** — "last month"/week boundaries are model-computed and unverified.
- **Firebase Admin on Vercel** — set `FIREBASE_SERVICE_ACCOUNT_KEY` (ADC won't be present).
- **50k pagination ceiling** — very high, but still a cap; `truncated` surfaces it for the
  scalar-total tools (top-items / hourly tools don't yet propagate the flag).
