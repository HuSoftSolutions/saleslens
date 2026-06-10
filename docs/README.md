# SalesLens Docs

AI analytics for Clover POS. Operator + reference documentation.

## Runbooks
- **[runbook-end-user.md](./runbook-end-user.md)** — for a customer: sign in,
  connect Clover locations, sync, ask questions.
- **[runbook-production.md](./runbook-production.md)** — for the operator: Clover
  app publishing, Vercel deploy, env vars, cost caps, operations.
- **[runbook-pilot-token.md](./runbook-pilot-token.md)** — first production pilot
  via merchant API token (no app publishing); multi-location.

## Reference
- **[data-flow.md](./data-flow.md)** — how a chat question travels through the app
  (browser → API → AI tool loop → analytics → response).
- **[credentials-and-auth.md](./credentials-and-auth.md)** — Firebase Admin,
  BigQuery, and Clover (API token vs OAuth) auth; production env-var checklist.
- **[known-issues.md](./known-issues.md)** — hardening backlog (token refresh ✓,
  rate limiting ✓, tenant isolation ✓, token storage, etc.).
- **[production-readiness.md](./production-readiness.md)** — data-fidelity TODOs:
  audit real Clover structure; model simulator-bay bookings.

## Architecture at a glance
- **Next.js (App Router) on Vercel** — frontend + API routes (all server logic).
- **Firebase Auth + Firestore** — users, orgs, connected merchants, chat threads,
  usage limits (isolated per org).
- **BigQuery** — analytics warehouse; connected merchants' data synced in,
  `location_id = merchantId`; every query scoped to the org's merchant IDs.
- **OpenAI** — tool-calling chat over the warehouse (`gpt-4o-mini`).
- **Clover** — data source: OAuth (production, per location) or API token (dev /
  owned merchants) → manual **Sync** into BigQuery.
