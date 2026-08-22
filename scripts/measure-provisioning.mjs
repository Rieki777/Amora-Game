/**
 * The recompute `vitest.config.ts` asks for by name.
 *
 * Its rule is `hookTimeout > provisioning + E2E_BOOT_DEADLINE_MS`, and its
 * instruction is: time one `provisionTestDb()`, add the boot deadline, and if
 * the total is within ~40% of `hookTimeout`, raise `hookTimeout`. Never lower
 * the boot deadline instead, because the boot deadline is the error that
 * prints the server's own log.
 *
 * WHAT THIS MEASURES NOW. Provisioning used to be one number, because every
 * suite ran every migration. It is two numbers since 2026-08-22:
 *
 *   TEMPLATE  one full migration run, paid once for the whole test run.
 *   CLONE     what each of the 44 DB-backed suites pays after that.
 *
 * So this script times both, and prints what the run costs in total against
 * what the same run cost when every suite migrated for itself. That second
 * figure is the one that matters to the fifteen-minute cap in
 * `.github/workflows/ci.yml`.
 *
 *   node scripts/measure-provisioning.mjs
 *
 * Needs TEST_DATABASE_URL, the same as the DB-backed suites.
 *
 * NOTE ON HOW TO RUN IT. `server/db/testDb.ts` imports `./migrate` with no
 * extension, which plain `node` will not resolve even with TypeScript stripping
 * on. Run it through tsx, which is already a devDependency:
 *
 *   ./node_modules/.bin/tsx scripts/measure-provisioning.mjs
 *
 * The npm script `measure:provisioning` does that for you.
 */
import "dotenv/config";
import fs from "fs";
import { performance } from "perf_hooks";
import mysql from "mysql2/promise";

const { provisionTestDb, testDbConfigured, E2E_BOOT_DEADLINE_MS } = await import("../server/db/testDb.ts");

if (!testDbConfigured()) {
  console.error("TEST_DATABASE_URL is not set; nothing to measure.");
  process.exit(1);
}

const files = fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length;

/**
 * How many suites pay for a schema. Counted from the source so it cannot drift:
 * the number is the whole argument for the template, and a stale one would
 * quietly overstate or understate the saving.
 */
function countProvisionCallSites() {
  let sites = 0;
  let suites = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(`${dir}/${e.name}`);
      } else if (/\.test\.tsx?$/.test(e.name)) {
        const body = fs.readFileSync(`${dir}/${e.name}`, "utf-8");
        const n = (body.match(/await provisionTestDb\(/g) || []).length;
        if (n > 0) {
          sites += n;
          suites += 1;
        }
      }
    }
  };
  for (const root of ["server", "shared", "client"]) {
    if (fs.existsSync(root)) walk(root);
  }
  return { sites, suites };
}

const { sites, suites } = countProvisionCallSites();

// Drop any template first, so the TEMPLATE number below is a cold build and
// never a stale reading of yesterday's cached one.
const u = new URL(process.env.TEST_DATABASE_URL);
const admin = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  timezone: "Z",
});
const [templates] = await admin.query(
  "SELECT schema_name AS s FROM information_schema.schemata WHERE schema_name LIKE 'village\\_tpl\\_%'",
);
for (const row of templates) await admin.query(`DROP DATABASE IF EXISTS \`${row.s}\``);
await admin.end();
for (const f of fs.existsSync("node_modules/.cache") ? fs.readdirSync("node_modules/.cache") : []) {
  if (f.startsWith("village_tpl_")) fs.rmSync(`node_modules/.cache/${f}`, { force: true });
}

// COLD: builds the template, then clones it.
const t0 = performance.now();
const cold = await provisionTestDb();
const coldMs = performance.now() - t0;
await cold.drop();

// WARM: the template is there now, so this is what suites 2..41 each pay.
const t1 = performance.now();
const warm = await provisionTestDb();
const warmMs = performance.now() - t1;
await warm.drop();

const templateMs = Math.max(coldMs - warmMs, 0);
const HOOK_TIMEOUT_MS = 240_000;
const worstCase = coldMs + E2E_BOOT_DEADLINE_MS; // the first suite to provision pays both
const usedPct = (worstCase / HOOK_TIMEOUT_MS) * 100;
const runNow = templateMs + warmMs * sites;
const runBefore = (templateMs + warmMs) * sites;

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;

console.log(`migration files      ${files}   (62 when this was first measured, 2026-08-11)`);
console.log(`DB-backed suites     ${suites}   (${sites} calls to provisionTestDb)`);
console.log("");
console.log(`template build       ${s(templateMs)}   (${(templateMs / files).toFixed(0)}ms per migration file)`);
console.log(`clone, per suite     ${s(warmMs)}`);
console.log(`first provision      ${s(coldMs)}   (template + clone, the worst case in a run)`);
console.log("");
console.log(`whole run, now       ${s(runNow)}   (one template, ${sites} clones)`);
console.log(`whole run, before    ${s(runBefore)}   (${sites} full migration runs)`);
console.log(`saved per run        ${s(runBefore - runNow)}`);
console.log("");
console.log(`boot deadline        ${(E2E_BOOT_DEADLINE_MS / 1000).toFixed(0)}s`);
console.log(`worst case           ${s(worstCase)}`);
console.log(`hookTimeout          ${(HOOK_TIMEOUT_MS / 1000).toFixed(0)}s`);
console.log(`worst case uses      ${usedPct.toFixed(0)}% of hookTimeout`);
console.log(
  usedPct > 60
    ? "\nWithin ~40% of the ceiling. Raise hookTimeout, per the rule in vitest.config.ts."
    : "\nComfortable. No change needed to hookTimeout.",
);
console.log(
  `\nEach migration added from here costs about ${(templateMs / files).toFixed(0)}ms per run.`,
  `\nBefore the template it cost that ${sites} times over, on every run, forever.`,
);
console.log(
  "\nNOTE: this measures THIS box against TEST_DATABASE_URL. The boot deadline",
  "\nmust be sized against CONTENTION, not a quiet machine, and CI is a",
  "\ndifferent machine again. A green here is not a green there.",
);
