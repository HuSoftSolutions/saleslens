// Generates realistic multi-location data — F&B transactions AND golf-simulator
// bay bookings — and batch-loads it into the raw dev tables.
//
// Bay bookings flow through Clover in production, so each booking here produces a
// Clover-style order + line item (category "Sim Time") + payment, PLUS a row in
// the bookings table for utilization analytics. Decoupled from Clover's sandbox
// so we can test at scale. Config: SEED_DAYS (90), SEED_TX_PER_DAY (300 F&B).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bq, RAW, LOCATION, localToUtcMs } from "./_bq.mjs";

const DAYS = Number(process.env.SEED_DAYS || 90);
const PER_DAY = Number(process.env.SEED_TX_PER_DAY || 300);
const TZ = "America/New_York";
const TAX_RATE = 0.0825;

// 8 locations, each with a different number of simulator bays (4–10).
const BAY_COUNTS = [6, 8, 4, 7, 10, 5, 6, 9];
const LOCATIONS = [
  "Downtown", "Riverside", "Uptown", "Westgate",
  "Lakeside", "Airport", "Midtown", "Northpark",
].map((n, i) => ({
  id: `LOC${i + 1}`,
  name: `The Bunker — ${n}`,
  tz: TZ,
  bayCount: BAY_COUNTS[i],
}));

// Bay tiers: different perks + hourly rates (cents/hour).
const TIERS = {
  Standard: { rate: 4000, maxParty: 4, perks: "2 club sets, full-swing sim, standard seating" },
  Premium: { rate: 5500, maxParty: 6, perks: "Larger HD screen, lounge couch, 4 club sets" },
  "VIP Suite": { rate: 8000, maxParty: 8, perks: "Private suite, premium clubs, dedicated server, bar seating" },
};

function bayTier(i, n) {
  if (n >= 6 && i === n - 1) return "VIP Suite";
  if (i % 3 === 2) return "Premium";
  return "Standard";
}

// F&B menu: [name, price_cents, popularity_weight, category]
const ITEMS = [
  ["Draft Beer", 700, 6, "Drinks"], ["Craft Cocktail", 1300, 4, "Drinks"],
  ["House Old Fashioned", 1400, 3, "Drinks"], ["Bottled Water", 300, 2, "Drinks"],
  ["Wings (10pc)", 1400, 5, "Food"], ["Smash Burger", 1600, 5, "Food"],
  ["Loaded Nachos", 1200, 4, "Food"], ["Caesar Salad", 1100, 3, "Food"],
  ["Margherita Flatbread", 1500, 3, "Food"], ["Soft Pretzel", 900, 2, "Food"],
  ["Truffle Fries", 1000, 3, "Food"],
];
const ITEM_POOL = [];
for (const it of ITEMS) for (let k = 0; k < it[2]; k++) ITEM_POOL.push(it);

const HOUR_WEIGHTS = { 11: 3, 12: 7, 13: 6, 14: 3, 15: 2, 16: 3, 17: 5, 18: 8, 19: 9, 20: 8, 21: 6, 22: 4 };
const HOUR_POOL = [];
for (const [h, w] of Object.entries(HOUR_WEIGHTS)) for (let k = 0; k < w; k++) HOUR_POOL.push(Number(h));

// Booking durations in minutes (15-min increments), weighted toward 1–2 hours.
const DURATIONS = [[30, 2], [45, 2], [60, 5], [90, 5], [120, 4], [150, 2], [180, 2]];
const DUR_POOL = [];
for (const [m, w] of DURATIONS) for (let k = 0; k < w; k++) DUR_POOL.push(m);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pad = (n) => String(n).padStart(2, "0");

const [ty, tmo, td] = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date()).split("-").map(Number);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bqseed-"));
const f = {
  loc: fs.createWriteStream(path.join(dir, "locations.ndjson")),
  bays: fs.createWriteStream(path.join(dir, "bays.ndjson")),
  pay: fs.createWriteStream(path.join(dir, "payments.ndjson")),
  ord: fs.createWriteStream(path.join(dir, "orders.ndjson")),
  li: fs.createWriteStream(path.join(dir, "line_items.ndjson")),
  book: fs.createWriteStream(path.join(dir, "bookings.ndjson")),
};

// Build bays per location and write locations + bays.
for (const loc of LOCATIONS) {
  f.loc.write(JSON.stringify({ location_id: loc.id, name: loc.name, timezone: loc.tz }) + "\n");
  loc.bays = [];
  for (let i = 0; i < loc.bayCount; i++) {
    const tier = bayTier(i, loc.bayCount);
    const bay = {
      bay_id: `${loc.id}-bay-${i + 1}`,
      location_id: loc.id,
      name: `Bay ${i + 1}`,
      tier,
      rate_cents_per_hour: TIERS[tier].rate,
      perks: TIERS[tier].perks,
    };
    loc.bays.push(bay);
    f.bays.write(JSON.stringify(bay) + "\n");
  }
}

let pN = 0, oN = 0, lN = 0, bN = 0;

function emitOrder({ loc, dateStr, createdAt, hour, orderType, lines, refundProb, tipProb }) {
  // lines: [{ name, price, qty, category }]
  const oid = `${loc.id}-o-${++oN}`;
  let subtotal = 0;
  for (const ln of lines) {
    subtotal += ln.price * ln.qty;
    f.li.write(JSON.stringify({
      line_item_id: `${loc.id}-l-${++lN}`, order_id: oid, location_id: loc.id,
      item_name: ln.name, category: ln.category, price_cents: ln.price, quantity: ln.qty,
      created_at: createdAt, created_date: dateStr, local_hour: hour,
    }) + "\n");
  }
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  const tip = Math.random() < tipProb ? Math.round(subtotal * pick([0.15, 0.18, 0.2, 0.22])) : 0;
  const refund = Math.random() < refundProb ? subtotal : 0;
  f.ord.write(JSON.stringify({
    order_id: oid, location_id: loc.id, total_cents: total, order_type: orderType,
    created_at: createdAt, created_date: dateStr, local_hour: hour,
  }) + "\n");
  f.pay.write(JSON.stringify({
    payment_id: `${loc.id}-p-${++pN}`, location_id: loc.id, amount_cents: total,
    tip_cents: tip, tax_cents: tax, refund_cents: refund, result: "SUCCESS",
    created_at: createdAt, created_date: dateStr,
  }) + "\n");
  return { oid, total, subtotal };
}

console.log(`Generating ${DAYS} days × ${LOCATIONS.length} locations (F&B + bay bookings)…`);

for (let dOff = 0; dOff < DAYS; dOff++) {
  const dt = new Date(Date.UTC(ty, tmo - 1, td) - dOff * 86400000);
  const Y = dt.getUTCFullYear(), M = dt.getUTCMonth() + 1, D = dt.getUTCDate();
  const dateStr = `${Y}-${pad(M)}-${pad(D)}`;
  const dow = dt.getUTCDay();
  const mult = dow === 5 || dow === 6 ? 1.4 : dow === 0 ? 1.1 : 1;

  for (const loc of LOCATIONS) {
    // --- F&B orders ---
    const count = Math.round(PER_DAY * mult * (0.85 + Math.random() * 0.3));
    for (let i = 0; i < count; i++) {
      const hour = pick(HOUR_POOL);
      const createdAt = new Date(
        localToUtcMs(Y, M, D, hour, randint(0, 59), randint(0, 59), loc.tz)
      ).toISOString();
      const lines = [];
      const nItems = randint(1, 4);
      for (let j = 0; j < nItems; j++) {
        const it = pick(ITEM_POOL);
        lines.push({ name: it[0], price: it[1], qty: randint(1, 3), category: it[3] });
      }
      emitOrder({ loc, dateStr, createdAt, hour, orderType: "food_beverage", lines, refundProb: 0.03, tipProb: 0.6 });
    }

    // --- bay bookings (per-bay sequential scheduling, evening-weighted) ---
    for (const bay of loc.bays) {
      // Stagger each bay's first slot so opening hour isn't artificially spiked.
      let cursor = 11 * 60 + pick([0, 15, 30, 45, 60, 75, 90]);
      const close = 23 * 60; // 23:00
      const tier = TIERS[bay.tier];
      while (cursor < close - 30) {
        const hourNow = Math.floor(cursor / 60);
        const peak = hourNow >= 17 && hourNow <= 21;
        const evening = hourNow >= 16;
        // Golf bar: quieter daytime, busy evenings.
        const bookProb =
          (peak ? 0.9 : evening ? 0.7 : 0.3) * (dow === 5 || dow === 6 ? 1.15 : 1);
        if (Math.random() < bookProb) {
          const dur = pick(DUR_POOL);
          if (cursor + dur > close) break;
          const hour = Math.floor(cursor / 60);
          const minute = cursor % 60;
          const startMs = localToUtcMs(Y, M, D, hour, minute, 0, loc.tz);
          const createdAt = new Date(startMs).toISOString();
          const endAt = new Date(startMs + dur * 60000).toISOString();
          const price = Math.round((bay.rate_cents_per_hour * dur) / 60);
          const party = randint(1, tier.maxParty);
          const { oid } = emitOrder({
            loc, dateStr, createdAt, hour, orderType: "sim_booking",
            lines: [{
              name: `${bay.name} (${bay.tier}) — ${dur} min`,
              price, qty: 1, category: "Sim Time",
            }],
            refundProb: 0.02, tipProb: 0.3,
          });
          f.book.write(JSON.stringify({
            booking_id: `${loc.id}-bk-${++bN}`, location_id: loc.id,
            bay_id: bay.bay_id, bay_name: bay.name, tier: bay.tier, order_id: oid,
            start_at: createdAt, end_at: endAt, duration_minutes: dur,
            rate_cents_per_hour: bay.rate_cents_per_hour, price_cents: price,
            party_size: party, created_date: dateStr, local_hour: hour,
          }) + "\n");
          cursor += dur + pick([0, 0, 15, 15, 30]); // turnover gap
        } else {
          cursor += 30; // idle slot
        }
      }
    }
  }
  if (dOff % 15 === 0) console.log(`  …through ${dateStr} (orders: ${oN}, bookings: ${bN})`);
}

await Promise.all(Object.values(f).map((s) => new Promise((r) => s.end(r))));
console.log(`Generated ${pN} payments, ${oN} orders, ${lN} line items, ${bN} bookings. Loading into ${RAW}…`);

async function load(table, file) {
  await bq
    .dataset(RAW, { location: LOCATION })
    .table(table)
    .load(path.join(dir, file), {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition: "WRITE_TRUNCATE",
    });
  console.log(`  ✓ loaded ${table}`);
}

await load("locations", "locations.ndjson");
await load("bays", "bays.ndjson");
await load("payments", "payments.ndjson");
await load("orders", "orders.ndjson");
await load("order_line_items", "line_items.ndjson");
await load("bookings", "bookings.ndjson");

fs.rmSync(dir, { recursive: true, force: true });
console.log("Seed complete.");
