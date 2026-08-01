#!/usr/bin/env node
/**
 * Prove standing examples are inert.
 *
 *   node scripts/check-examples.mjs --url "mysql://…"
 *
 * The whole premise of standing examples is that they render fully and create
 * no economic state. This asserts that: zero ledger rows, zero loans, stays,
 * orders, purchases, fiat charges or badge awards attributable to examples,
 * and no example badge carrying a capability (which would let a definition
 * grant real permissions the moment anyone awarded it).
 *
 * Exits non-zero on any violation, so it can gate a seed run.
 */
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const i = args.indexOf("--url");
let url = i >= 0 && args[i + 1] ? args[i + 1] : process.env.DATABASE_URL;
if (!url) {
  const f = path.resolve(__dirname, "..", ".demo-db-url");
  if (fs.existsSync(f)) url = fs.readFileSync(f, "utf8").trim();
}
if (!url) {
  console.error("need --url, DATABASE_URL, or a .demo-db-url file");
  process.exit(2);
}

const c = await mysql.createConnection({ uri: url, timezone: "Z" });

const CONTENT_TABLES = [
  "users", "circles", "roles", "quests", "forum_threads", "forum_replies", "tools",
  "library_categories", "library_items", "accommodations", "accommodation_prices",
  "payment_products", "badges", "regen_entries", "health_snapshots", "health_events",
  "recordings", "call_syntheses", "call_tasks", "shared_items", "peer_instances",
  "token_exchange_settings", "currency_prices",
];

console.log("EXAMPLE ROWS PER TABLE");
let total = 0;
for (const t of CONTENT_TABLES) {
  const [[r]] = await c.query("SELECT COUNT(*) n FROM `" + t + "` WHERE is_example = 1");
  if (r.n) {
    console.log("  " + t.padEnd(24) + r.n);
    total += r.n;
  }
}
console.log("  " + "TOTAL".padEnd(24) + total);

/** Tables where a row IS economic state. An example must never produce one. */
const ECONOMIC = [
  "token_ledger", "library_loans", "stays", "stay_purchases", "exchange_orders",
  "product_purchases", "fiat_charges", "badge_awards", "gratitude_log",
];

console.log("\nECONOMIC SAFETY — every count must be 0");
let violations = 0;
for (const t of ECONOMIC) {
  const [[r]] = await c.query("SELECT COUNT(*) n FROM `" + t + "`");
  const ok = r.n === 0;
  if (!ok) violations++;
  console.log("  " + t.padEnd(24) + String(r.n).padEnd(6) + (ok ? "OK" : "<-- VIOLATION"));
}

// A definition alone grants nothing, but a capability-bearing example badge is
// one admin click from real permissions — and an unknown key refuses boot.
const [[cap]] = await c.query(
  "SELECT COUNT(*) n FROM badges WHERE is_example = 1 AND JSON_LENGTH(capabilities) > 0",
);
if (cap.n > 0) violations++;
console.log("\n  example badges granting capabilities: " + cap.n + (cap.n ? "  <-- VIOLATION" : "  OK"));

const [ex] = await c.query(
  "SELECT module_id, retired_at FROM example_state WHERE seeded_at IS NOT NULL ORDER BY module_id",
);
console.log("  modules seeded (" + ex.length + "): " + ex.map((r) => r.module_id).join(", "));
const retired = ex.filter((r) => r.retired_at);
if (retired.length) console.log("  retired: " + retired.map((r) => r.module_id).join(", "));

await c.end();
console.log(violations === 0 ? "\nPASS — every example is inert" : `\nFAIL — ${violations} violation(s)`);
process.exit(violations === 0 ? 0 : 1);
