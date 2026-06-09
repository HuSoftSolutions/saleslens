# Production Readiness — Data Fidelity

Our sandbox + BigQuery schema + synthetic seed are currently **assumptions**. Before
trusting any analytics in production, we must confirm they actually match how The
Bunker's real Clover data is structured. See also [data-flow.md](./data-flow.md),
[known-issues.md](./known-issues.md), [credentials-and-auth.md](./credentials-and-auth.md).

---

## Context: what The Bunker actually is

The Bunker is an **indoor golf-simulator + bar** company. Each location has **4–10
simulator bays**, each with **different perks and different hourly rates**, booked in
**15-minute to multi-hour increments**. So revenue is two very different shapes:

1. **Food & beverage** — standard POS items (what the current seed models).
2. **Simulator bay time** — time-based, variable-price bookings (the current seed only
   fakes this with a flat "Sim Rental (1hr)" item — **not realistic**).

This dual model has to be reflected in the schema, the seed, and the analytics, or the
insights will be wrong/misleading for the part of the business that likely matters most.

---

## TODO 1 — Audit the real Bunker Clover data

Connect to the **real** Bunker Clover (read-only) and inventory how data is actually
stored, then reconcile against our schema/seed. Questions to answer:

- **Multi-location:** Is each location a separate `merchantId` (merchant group), or one
  merchant? How many merchants, and their IDs/names/timezones?
- **Volume & size:** Real orders/payments per location per day; record sizes; busiest
  ranges. Confirms our pagination/cost assumptions.
- **Item catalog & categories:** What items exist, and **what Clover categories** group
  them (e.g., "Beer", "Food", "Sim Time")? We currently have no category dimension.
- **Order/line-item structure:** Are modifiers, service charges, discounts, comps, and
  gift cards used? Do line items carry `unitQty`, per-unit pricing, or variable pricing?
- **Payments & tenders:** Which tenders are real (card vs cash vs external)? How are
  **tips** and **tax** represented? Are there **partial/split payments**?
- **Refunds/voids:** How are refunds actually recorded (the field/shape our tools read)?
- **Employees / order types:** Dine-in vs to-go vs booking? Server attribution?

**Goal:** a written diff between "what production Clover returns" and "what our
`raw.payments` / `raw.orders` / `raw.order_line_items` schema + seed assume," then update
the schema, seed, and (eventually) the Clover→BigQuery sync to match.

## TODO 2 — Model & seed simulator bay bookings

The biggest gap. **Confirmed: bay-booking revenue ultimately flows through Clover** (it
may originate in a booking system, but it lands in Clover). So the question is not
*whether* but **how it's represented in Clover** — find out:

- Is a booking a **variable-price item** (price = rate × duration), a set of
  **per-increment items** (e.g. "Bay – 30 min"), a **service charge**, or something else?
- Where do **bay identity**, **duration**, **rate**, and **perks** live — item name,
  **Clover category**, modifiers, or order notes?
- If bookings originate upstream, how do they appear once in Clover (one line item per
  booking? bundled with F&B on the same order/tab? a distinct order type?), and is there
  any lag/reconciliation we should know about for "today" accuracy.

Once understood, extend the model to represent:
- **Bays per location** (4–10), each with a rate/hour and perks.
- **Bookings** with start time, **duration (15-min increments → multi-hour)**, computed
  price, and the bay booked — so we can answer "utilization by bay," "peak booking
  hours," "revenue from sim time vs F&B," "average booking length," etc.
- Seed realistic booking data alongside the F&B data (booking demand curve, weekend/
  evening peaks, variable durations), so analytics can be tested against it.

This likely needs **new dimensions/tables** (e.g. `bays`, `bookings`) and possibly new
analytics tools/questions beyond the current five.

---

## Current best-guess seed (ASSUMPTIONS — verify against real Clover)

A simulator-booking seed is now in BigQuery (`scripts/bq-seed.mjs`). It encodes
**guesses** that the TODO 1 audit must confirm or correct:

- **Bays** (`raw.bays`): 4–10 per location; tiers **Standard $40/hr**, **Premium $55/hr**,
  **VIP Suite $80/hr**, each with perks text. (Real rates/tiers/perks unknown.)
- **Bookings** (`raw.bookings`): 15-min increments, 30–180 min (avg ~90), evening/weekend
  weighted, non-overlapping per bay; party size by tier.
- **In Clover:** each booking = its own **order** (`order_type='sim_booking'`) + one **line
  item** named `Bay N (Tier) — D min`, **category `Sim Time`**, + a payment (8.25% tax,
  ~30% tipped). **Assumes bookings are separate orders from F&B** and that sim time is a
  variable-price line item — both unconfirmed.
- **Categories**: F&B tagged `Food`/`Drinks`, sim tagged `Sim Time` (`raw.order_line_items.category`).

Known rough edges to fix once real data is seen:
- Booking line-item names are unique per duration, so they fragment the generic
  `getTopSellingItems` tool. Sim analytics should use `bay_utilization_daily` /
  `category_sales_daily`, and we likely want **sim-specific chat tools** (utilization,
  sim-vs-F&B revenue, peak booking hours) rather than lumping bays into "top items".

## Acceptance criteria

- [ ] Documented inventory of real Bunker Clover structure (TODO 1).
- [ ] Confirmed how simulator bay time is sold/recorded (TODO 2).
- [ ] Schema + seed updated to mirror production (categories, bay bookings, real tender/
      refund/modifier shapes).
- [ ] Analytics verified against a sample of real data (numbers match the Clover
      dashboard for the same date range/location).

## Related / dependencies

- Multi-location integration model (store N merchants per org) — [known-issues.md](./known-issues.md).
- Clover → BigQuery sync (backfill + incremental) replaces the synthetic seed.
- Until this is done, treat all dashboard/chat numbers as **demo data, not real**.
