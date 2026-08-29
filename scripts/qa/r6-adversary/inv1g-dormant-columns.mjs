/**
 * "A dormant column is an ARMED column." gratitude sat transferable = 1 for
 * eighty-five migrations while nothing read it, and the build that closed the
 * economy's loop would have made recognition sellable.
 *
 * This reads the LIVE schema of the scratch database, keeps the columns that
 * look like a policy switch, and asks whether anything in the product reads
 * each one. Every negative is fired in the same sweep as a control column that
 * IS read, so a zero is a zero and not a broken pattern.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import mysql from "mysql2/promise";

const ROOT = "C:/Users/taren/Desktop/Amora/wt-r5-qa2";
const c = await mysql.createConnection({ host: "127.0.0.1", port: 3307, user: "root", password: "amoratest", database: "village_qa6_2" });
const [cols] = await c.query(
  "SELECT table_name t, column_name col, column_default d, is_nullable n, data_type dt FROM information_schema.columns " +
  "WHERE table_schema = 'village_qa6_2' ORDER BY table_name, ordinal_position",
);

// A column that carries a POLICY: a switch, a permission, a visibility, a price.
const POLICY = /^(transferable|requires?_?request|enabled|active|is_[a-z_]+|allow[a-z_]*|can_[a-z_]+|public[a-z_]*|visible|binding|locked|hidden|blocked|denied|suppressed[a-z_]*|approved|verified|featured|default[a-z_]*|[a-z_]+_default|mandatory|required|readonly|immutable|sealed|frozen|exempt|override[a-z_]*|admin_only|members_only|auto_[a-z_]+|[a-z_]+_enabled|[a-z_]+_allowed|[a-z_]+_locked)$/;

const candidates = cols.filter((r) => POLICY.test(String(r.col ?? r.COLUMN_NAME ?? "")));
const name = (r) => String(r.col ?? r.COLUMN_NAME);
const table = (r) => String(r.t ?? r.TABLE_NAME);
const dflt = (r) => (r.d ?? r.COLUMN_DEFAULT);

// Read every source file once; a NUL byte makes ripgrep skip a file silently,
// so this reads the bytes itself rather than shelling out to a search tool.
const files = [];
const p0 = (dir, n) => path.join(dir, n).includes(path.join("scripts", "qa", "r6-adversary"));
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules","dist",".git",".qa2"].includes(e.name)) continue;
    if (p0(dir, e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js|sql)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);
const drizzleOnly = (f) => f.includes(path.sep + "drizzle" + path.sep);
const corpus = files.filter((f) => !drizzleOnly(f)).map((f) => ({ f, s: fs.readFileSync(f, "latin1") }));
console.log("read " + corpus.length + " non-migration source files (" + files.length + " total; the reader is fs, not a search tool, so a NUL byte cannot hide a file)");

const camel = (s) => s.replace(/_([a-z])/g, (_, x) => x.toUpperCase());
const readers = (col) => {
  const snake = col, cc = camel(col);
  const hits = [];
  for (const { f, s } of corpus) {
    if (s.includes("`" + snake + "`") || s.includes('"' + snake + '"') || s.includes("'" + snake + "'") ||
        new RegExp("\\b" + cc + "\\b").test(s) || new RegExp("\\b" + snake + "\\b").test(s)) {
      hits.push(path.relative(ROOT, f));
    }
  }
  return hits;
};

// CONTROLS: columns that are certainly read, and one that certainly is not.
const CONTROL_READ = ["capabilities", "lifecycle", "quorum_pct"];
const CONTROL_ABSENT = "zzz_this_column_does_not_exist";
for (const ctl of CONTROL_READ) console.log("control (must be > 0): " + ctl + " -> " + readers(ctl).length + " file(s)");
console.log("control (must be 0): " + CONTROL_ABSENT + " -> " + readers(CONTROL_ABSENT).length + " file(s)");

const dormant = [];
for (const r of candidates) {
  const col = name(r);
  const hits = readers(col);
  const nonSchema = hits.filter((h) => !h.startsWith("drizzle"));
  if (nonSchema.length === 0) dormant.push({ table: table(r), column: col, default: dflt(r), type: String(r.dt ?? r.DATA_TYPE) });
}
console.log("\npolicy-shaped columns in the live schema: " + candidates.length);
console.log("of those, read by NOTHING outside the migrations: " + dormant.length);
for (const d of dormant) console.log("  DORMANT  " + d.table + "." + d.column + "  type=" + d.type + "  default=" + JSON.stringify(d.default));

// And the specific shape the brief names: a flag SEEDED to a permissive value.
const armed = [];
for (const r of candidates) {
  const col = name(r), t = table(r), def = dflt(r);
  if (def === null || def === undefined) continue;
  const permissive = String(def) === "1" || String(def).toLowerCase() === "true";
  if (!permissive) continue;
  const hits = readers(col).filter((h) => !h.startsWith("drizzle"));
  armed.push({ table: t, column: col, default: String(def), readers: hits.length });
}
console.log("\ncolumns DEFAULTING to a permissive value (1/true):");
for (const a of armed.sort((x, y) => x.readers - y.readers)) {
  console.log("  " + (a.readers === 0 ? "ARMED   " : "read    ") + a.table + "." + a.column + " default=" + a.default + " readers=" + a.readers);
}
// And the actual seeded values in the tables that carry value.
for (const [t, col] of [["tokens", "transferable"], ["investor_docs", "requires_request"], ["badges", "active"], ["mint_rules", "enabled"]]) {
  try {
    const [rows] = await c.query("SELECT * FROM `" + t + "` LIMIT 20");
    console.log("\n" + t + " rows (" + rows.length + "): " + JSON.stringify(rows.map((x) => ({ id: x.id ?? x.slug, [col]: x[col] }))));
  } catch (e) { console.log("\n" + t + ": " + e.message); }
}
fs.writeFileSync(path.join(ROOT, ".qa2/r6/dormant.json"), JSON.stringify({ candidates: candidates.length, dormant, armed }, null, 2));
await c.end();
