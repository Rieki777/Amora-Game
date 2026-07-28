/**
 * Prove that the newest migrations survive a table that already has rows.
 *
 * A migration that only ever runs against an empty scratch schema is
 * untested where it matters: production applies it at boot, fail-loud, to
 * tables full of real data. An ALTER that a fresh table accepts can still
 * fail on a populated one — a NOT NULL without a default, a UNIQUE over
 * existing duplicates, a MODIFY that narrows a column past what is stored.
 *
 * This applies every migration up to a chosen cut, inserts representative
 * rows into the tables the remaining migrations touch, and only then applies
 * the rest. A failure here is the boot failure, caught before the deploy.
 *
 *   node scripts/verify-migration-on-data.mjs 0038
 */
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const SCHEMA = "village_migrationcheck";
const cutPrefix = process.argv[2];
if (!cutPrefix) {
  console.error("usage: node scripts/verify-migration-on-data.mjs <first-new-migration-prefix, e.g. 0038>");
  process.exit(1);
}

const env = fs.readFileSync(".env", "utf8");
const m = env.match(/^TEST_DATABASE_URL=(.+)$/m);
if (!m) {
  console.error("TEST_DATABASE_URL is not set in .env — refusing to guess at a database");
  process.exit(1);
}
const url = new URL(m[1].trim());
const base = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  multipleStatements: true,
};

const admin = await mysql.createConnection(base);
await admin.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\`; CREATE DATABASE \`${SCHEMA}\``);
await admin.end();

const conn = await mysql.createConnection({ ...base, database: SCHEMA });

/** The same splitter the real runner uses (server/db/migrate.ts). */
function splitStatements(sql) {
  return sql
    .split("\n")
    .filter(l => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(Boolean);
}

const dir = path.resolve(process.cwd(), "drizzle");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
const cutAt = files.findIndex(f => f.startsWith(cutPrefix));
if (cutAt < 0) {
  console.error(`no migration starting with "${cutPrefix}"`);
  process.exit(1);
}

async function apply(file) {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  for (const stmt of splitStatements(sql)) {
    try {
      await conn.query(stmt);
    } catch (e) {
      console.error(`\nFAILED in ${file}:\n  ${stmt.slice(0, 200)}\n  -> ${e.message}`);
      process.exit(1);
    }
  }
}

console.log(`applying ${cutAt} migration(s) up to the cut...`);
for (const f of files.slice(0, cutAt)) await apply(f);

// Representative rows in every table the new migrations touch. Values chosen
// to be the awkward ones: a NULL-heavy log row, a charge already reversed.
console.log("seeding rows so the new migrations meet real data...");
await conn.query(
  "INSERT INTO payments_log (id, stripe_event_id, module, order_id, type, outcome) VALUES " +
    "('pl-1','evt_seed_1','commerce','ord-1','checkout.session.completed','ok')," +
    "('pl-2',NULL,NULL,NULL,'signature','sig_fail')",
);
await conn.query(
  "INSERT INTO fiat_charges (id, user_id, module, order_id, amount_minor, stripe_payment_intent_id, status) VALUES " +
    "('fch-1','usr-1','commerce','ord-1#pi_1',1000,'pi_1','paid')," +
    "('fch-2','usr-2','stays','ord-2',5000,NULL,'reversed')",
);
await conn.query(
  "INSERT INTO payment_products (id, kind, name, amount_minor, created_by) VALUES ('prd-1','fee','A fee',500,'usr-1')",
);
await conn.query(
  "INSERT INTO product_purchases (id, product_id, user_id, amount_minor, receipt_no) VALUES " +
    "('pp-1','prd-1','usr-1',500,1)," +
    "('pp-2','prd-1',NULL,500,2)",
);

console.log(`applying the new migration(s) from ${files[cutAt]}...`);
for (const f of files.slice(cutAt)) {
  await apply(f);
  console.log(`  ok ${f}`);
}

// The rows must still be there and must still say what they said.
const [[log]] = await conn.query("SELECT COUNT(*) AS n, SUM(handled_at IS NOT NULL) AS handled FROM payments_log");
const [[chg]] = await conn.query("SELECT COUNT(*) AS n FROM fiat_charges WHERE status = 'reversed'");
await conn.query("INSERT INTO fiat_charges (id, user_id, module, order_id, amount_minor) VALUES ('fch-3',NULL,'commerce','ord-3#pi_3',700)");
const [[anon]] = await conn.query("SELECT COUNT(*) AS n FROM fiat_charges WHERE user_id IS NULL");

console.log(`\npayments_log: ${log.n} row(s), ${log.handled} backfilled as handled`);
console.log(`fiat_charges: ${chg.n} still reversed, ${anon.n} anonymous row(s) accepted`);
if (Number(log.n) !== 2 || Number(log.handled) !== 2 || Number(chg.n) !== 1 || Number(anon.n) !== 1) {
  console.error("data did not survive the migrations as expected");
  process.exit(1);
}
console.log("\nall migrations apply cleanly to populated tables.");

await conn.end();
const cleanup = await mysql.createConnection(base);
await cleanup.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
await cleanup.end();
