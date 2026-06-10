// Assigns Clover categories (Food / Drinks / Sim Time) to the sandbox merchant's
// items, so synced data is properly categorized — mimicking how a real merchant's
// catalog is organized. Idempotent. Run: npm run clover:categorize
import fs from "node:fs";
import path from "node:path";

// minimal .env.local loader
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOKEN = process.env.CLOVER_DEV_TOKEN;
const MID = process.env.CLOVER_DEV_MERCHANT_ID;
const BASE =
  (process.env.CLOVER_ENV ?? "sandbox") === "production"
    ? "https://api.clover.com"
    : "https://apisandbox.dev.clover.com";

if (!TOKEN || !MID) {
  console.error("Set CLOVER_DEV_TOKEN and CLOVER_DEV_MERCHANT_ID in .env.local");
  process.exit(1);
}

const CATEGORY_OF = {
  "Draft Beer": "Drinks", "Craft Cocktail": "Drinks", "House Old Fashioned": "Drinks", "Bottled Water": "Drinks",
  "Wings (10pc)": "Food", "Smash Burger": "Food", "Loaded Nachos": "Food", "Caesar Salad": "Food",
  "Margherita Flatbread": "Food", "Soft Pretzel": "Food", "Truffle Fries": "Food",
  "Sim Rental (1hr)": "Sim Time",
};
const CATEGORY_NAMES = ["Food", "Drinks", "Sim Time"];

const api = (q, init) =>
  fetch(`${BASE}/v3/merchants/${MID}${q}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const main = async () => {
  // existing categories
  let cats = (await (await api("/categories?limit=1000")).json()).elements ?? [];

  // clean up any probe categories
  for (const c of cats.filter((c) => c.name?.startsWith("__probe"))) {
    await api(`/categories/${c.id}`, { method: "DELETE" });
  }
  cats = cats.filter((c) => !c.name?.startsWith("__probe"));

  // ensure our categories exist
  const idByName = {};
  for (const name of CATEGORY_NAMES) {
    const existing = cats.find((c) => c.name === name);
    if (existing) {
      idByName[name] = existing.id;
    } else {
      const created = await (await api("/categories", { method: "POST", body: JSON.stringify({ name }) })).json();
      idByName[name] = created.id;
      console.log("  + category", name);
    }
  }

  // items
  const items = (await (await api("/items?limit=1000")).json()).elements ?? [];
  const elements = [];
  let mapped = 0;
  for (const it of items) {
    const cat = CATEGORY_OF[it.name];
    if (cat && idByName[cat]) {
      elements.push({ category: { id: idByName[cat] }, item: { id: it.id } });
      mapped++;
    }
  }

  // bulk associate (chunks of 100)
  for (let i = 0; i < elements.length; i += 100) {
    const chunk = elements.slice(i, i + 100);
    const res = await api("/category_items", { method: "POST", body: JSON.stringify({ elements: chunk }) });
    if (!res.ok) console.error("  ! association failed:", res.status, (await res.text()).slice(0, 120));
  }

  console.log(`Categorized ${mapped}/${items.length} items across ${CATEGORY_NAMES.length} categories.`);
};

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
