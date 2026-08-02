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

/** Tables where a row IS economic state. An example must never produce one.
 *  badge_awards left this list on purpose (Rye, 2026-08-02): example awards
 *  are seeded so the badge page can demonstrate a held badge. Their own
 *  invariant is checked separately below. */
const ECONOMIC = [
  "token_ledger", "library_loans", "stays", "stay_purchases", "exchange_orders",
  "product_purchases", "fiat_charges", "gratitude_log",
];

// NOTE: these counts are UNSCOPED — they ask "is this table empty?", not
// "did an example put anything here?". That is the right question against a
// virgin schema (which is what this script is for) and the wrong one against
// a running village, where a single real loan or ledger row reads as a
// violation while the examples are perfectly inert. Point it at a scratch
// database, not at production.
console.log("\nECONOMIC SAFETY — every count must be 0 (virgin schema only)");
let violations = 0;
for (const t of ECONOMIC) {
  const [[r]] = await c.query("SELECT COUNT(*) n FROM `" + t + "`");
  const ok = r.n === 0;
  if (!ok) violations++;
  console.log("  " + t.padEnd(24) + String(r.n).padEnd(6) + (ok ? "OK" : "<-- VIOLATION"));
}

// Example badges CARRY capabilities now (Rye, 2026-08-02) — the page must
// demonstrate what a badge grants. What keeps that safe is the award-side
// invariant, and THAT is what gets asserted:
//   1. every example award points at an example user (the gate reads awards
//      per authenticated user, and example identities never authenticate);
//   2. no example award sits on a warning badge (a warning award is open
//      state and would wedge the module's off switch);
//   3. no REAL award row exists on a virgin schema at all.
const [[leak]] = await c.query(
  "SELECT COUNT(*) n FROM badge_awards a JOIN users u ON u.id = a.user_id " +
    "WHERE a.is_example = 1 AND u.is_example = 0",
);
if (leak.n > 0) violations++;
console.log("\n  example awards held by REAL users: " + leak.n + (leak.n ? "  <-- VIOLATION" : "  OK"));
const [[warnAward]] = await c.query(
  "SELECT COUNT(*) n FROM badge_awards a JOIN badges b ON b.id = a.badge_id " +
    "WHERE a.is_example = 1 AND b.kind = 'warning'",
);
if (warnAward.n > 0) violations++;
console.log("  example awards on warning badges: " + warnAward.n + (warnAward.n ? "  <-- VIOLATION" : "  OK"));
const [[realAward]] = await c.query(
  "SELECT COUNT(*) n FROM badge_awards WHERE is_example = 0",
);
if (realAward.n > 0) violations++;
console.log("  real award rows (virgin schema): " + realAward.n + (realAward.n ? "  <-- VIOLATION" : "  OK"));

const [ex] = await c.query(
  "SELECT module_id, retired_at FROM example_state WHERE seeded_at IS NOT NULL ORDER BY module_id",
);
console.log("  modules seeded (" + ex.length + "): " + ex.map((r) => r.module_id).join(", "));
const retired = ex.filter((r) => r.retired_at);
if (retired.length) console.log("  retired: " + retired.map((r) => r.module_id).join(", "));

await c.end();
console.log(violations === 0 ? "\nPASS — every example is inert" : `\nFAIL — ${violations} violation(s)`);
process.exit(violations === 0 ? 0 : 1);
