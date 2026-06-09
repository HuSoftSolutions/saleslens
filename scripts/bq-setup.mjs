// Creates the dev datasets, raw tables (partitioned + clustered), and rollup
// views. Idempotent — safe to re-run.
import { PROJECT, RAW, MARTS, LOCATION, runDDL } from "./_bq.mjs";

console.log(`Setting up BigQuery in ${PROJECT} (${LOCATION})…`);

// --- datasets ---
await runDDL(`CREATE SCHEMA IF NOT EXISTS \`${PROJECT}.${RAW}\``, `dataset ${RAW}`);
await runDDL(`CREATE SCHEMA IF NOT EXISTS \`${PROJECT}.${MARTS}\``, `dataset ${MARTS}`);

// --- raw tables ---
await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.locations\` (
    location_id STRING NOT NULL,
    name STRING,
    timezone STRING
  )`,
  "table locations"
);

await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.bays\` (
    bay_id STRING NOT NULL,
    location_id STRING NOT NULL,
    name STRING,
    tier STRING,
    rate_cents_per_hour INT64,
    perks STRING
  )`,
  "table bays"
);

await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.payments\` (
    payment_id STRING NOT NULL,
    location_id STRING NOT NULL,
    amount_cents INT64,
    tip_cents INT64,
    tax_cents INT64,
    refund_cents INT64,
    result STRING,
    created_at TIMESTAMP,
    created_date DATE
  )
  PARTITION BY created_date
  CLUSTER BY location_id`,
  "table payments"
);

await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.orders\` (
    order_id STRING NOT NULL,
    location_id STRING NOT NULL,
    total_cents INT64,
    order_type STRING,
    created_at TIMESTAMP,
    created_date DATE,
    local_hour INT64
  )
  PARTITION BY created_date
  CLUSTER BY location_id`,
  "table orders"
);

await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.order_line_items\` (
    line_item_id STRING NOT NULL,
    order_id STRING NOT NULL,
    location_id STRING NOT NULL,
    item_name STRING,
    category STRING,
    price_cents INT64,
    quantity INT64,
    created_at TIMESTAMP,
    created_date DATE,
    local_hour INT64
  )
  PARTITION BY created_date
  CLUSTER BY location_id`,
  "table order_line_items"
);
// Backfill the category column on pre-existing tables (idempotent).
await runDDL(
  `ALTER TABLE \`${PROJECT}.${RAW}.order_line_items\` ADD COLUMN IF NOT EXISTS category STRING`,
  "order_line_items.category"
);
await runDDL(
  `ALTER TABLE \`${PROJECT}.${RAW}.orders\` ADD COLUMN IF NOT EXISTS order_type STRING`,
  "orders.order_type"
);

await runDDL(
  `CREATE TABLE IF NOT EXISTS \`${PROJECT}.${RAW}.bookings\` (
    booking_id STRING NOT NULL,
    location_id STRING NOT NULL,
    bay_id STRING,
    bay_name STRING,
    tier STRING,
    order_id STRING,
    start_at TIMESTAMP,
    end_at TIMESTAMP,
    duration_minutes INT64,
    rate_cents_per_hour INT64,
    price_cents INT64,
    party_size INT64,
    created_date DATE,
    local_hour INT64
  )
  PARTITION BY created_date
  CLUSTER BY location_id`,
  "table bookings"
);

// --- rollup views (always-fresh; cheap over partitioned/clustered raw) ---
await runDDL(
  `CREATE OR REPLACE VIEW \`${PROJECT}.${MARTS}.daily_sales_by_location\` AS
   SELECT
     location_id,
     created_date AS date,
     COUNT(*) AS payment_count,
     SUM(amount_cents) AS gross_cents,
     SUM(tip_cents) AS tip_cents,
     SUM(tax_cents) AS tax_cents,
     SUM(refund_cents) AS refund_cents
   FROM \`${PROJECT}.${RAW}.payments\`
   WHERE result = 'SUCCESS' OR result IS NULL
   GROUP BY location_id, date`,
  "view daily_sales_by_location"
);

await runDDL(
  `CREATE OR REPLACE VIEW \`${PROJECT}.${MARTS}.item_sales_daily\` AS
   SELECT
     location_id,
     created_date AS date,
     item_name,
     category,
     SUM(quantity) AS quantity,
     SUM(price_cents * quantity) AS gross_cents
   FROM \`${PROJECT}.${RAW}.order_line_items\`
   GROUP BY location_id, date, item_name, category`,
  "view item_sales_daily"
);

await runDDL(
  `CREATE OR REPLACE VIEW \`${PROJECT}.${MARTS}.category_sales_daily\` AS
   SELECT
     location_id,
     created_date AS date,
     COALESCE(category, 'Uncategorized') AS category,
     SUM(quantity) AS quantity,
     SUM(price_cents * quantity) AS gross_cents
   FROM \`${PROJECT}.${RAW}.order_line_items\`
   GROUP BY location_id, date, category`,
  "view category_sales_daily"
);

await runDDL(
  `CREATE OR REPLACE VIEW \`${PROJECT}.${MARTS}.hourly_sales_daily\` AS
   WITH li AS (
     SELECT location_id, created_date AS date, local_hour AS hour,
       SUM(quantity) AS item_count,
       SUM(price_cents * quantity) AS gross_cents
     FROM \`${PROJECT}.${RAW}.order_line_items\`
     GROUP BY 1, 2, 3
   ),
   ord AS (
     SELECT location_id, created_date AS date, local_hour AS hour,
       COUNT(*) AS order_count
     FROM \`${PROJECT}.${RAW}.orders\`
     GROUP BY 1, 2, 3
   )
   SELECT
     COALESCE(li.location_id, ord.location_id) AS location_id,
     COALESCE(li.date, ord.date) AS date,
     COALESCE(li.hour, ord.hour) AS hour,
     IFNULL(ord.order_count, 0) AS order_count,
     IFNULL(li.item_count, 0) AS item_count,
     IFNULL(li.gross_cents, 0) AS gross_cents
   FROM li
   FULL OUTER JOIN ord
     ON li.location_id = ord.location_id AND li.date = ord.date AND li.hour = ord.hour`,
  "view hourly_sales_daily"
);

await runDDL(
  `CREATE OR REPLACE VIEW \`${PROJECT}.${MARTS}.bay_utilization_daily\` AS
   SELECT
     b.location_id,
     b.created_date AS date,
     b.bay_id,
     ANY_VALUE(b.bay_name) AS bay_name,
     ANY_VALUE(b.tier) AS tier,
     COUNT(*) AS bookings,
     SUM(b.duration_minutes) AS booked_minutes,
     SUM(b.price_cents) AS gross_cents,
     SUM(b.party_size) AS guests
   FROM \`${PROJECT}.${RAW}.bookings\` b
   GROUP BY b.location_id, date, b.bay_id`,
  "view bay_utilization_daily"
);

console.log("BigQuery schema ready.");
