/**
 * The recompute `vitest.config.ts` asks for by name.
 *
 * Its rule is `hookTimeout > provisioning + E2E_BOOT_DEADLINE_MS`, and its
 * instruction is: time one `provisionTestDb()`, add the boot deadline, and if
 * the total is within ~40% of `hookTimeout`, raise `hookTimeout`. Never lower
 * the boot deadline instead, because the boot deadline is the error that
 * prints the server's own log.
 *
 * Both numbers grow with every migration anyone adds, and nothing re-measured
 * them between 2026-08-11 (62 migration files) and now. This script is that
 * missing step, kept so the next person adding a migration can run one command
 * instead of rediscovering the procedure in a comment.
 *
 *   node scripts/measure-provisioning.mjs
 *
 * Needs TEST_DATABASE_URL, the same as the DB-backed suites.
 */
import "dotenv/config";
import fs from "fs";
import { performance } from "perf_hooks";

const { provisionTestDb, testDbConfigured, E2E_BOOT_DEADLINE_MS } = await import("../server/db/testDb.ts");

if (!testDbConfigured()) {
  console.error("TEST_DATABASE_URL is not set; nothing to measure.");
  process.exit(1);
}

const files = fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length;

const t0 = performance.now();
const db = await provisionTestDb();
const provisioning = performance.now() - t0;
await db.drop();

const HOOK_TIMEOUT_MS = 240_000;
const worstCase = provisioning + E2E_BOOT_DEADLINE_MS;
const usedPct = (worstCase / HOOK_TIMEOUT_MS) * 100;

console.log(`migration files      ${files}   (62 when this was last measured, 2026-08-11)`);
console.log(`provisioning         ${(provisioning / 1000).toFixed(1)}s   (${(provisioning / files).toFixed(0)}ms per migration file)`);
console.log(`boot deadline        ${(E2E_BOOT_DEADLINE_MS / 1000).toFixed(0)}s`);
console.log(`worst case           ${(worstCase / 1000).toFixed(1)}s`);
console.log(`hookTimeout          ${(HOOK_TIMEOUT_MS / 1000).toFixed(0)}s`);
console.log(`worst case uses      ${usedPct.toFixed(0)}% of hookTimeout`);
console.log(
  usedPct > 60
    ? "\nWithin ~40% of the ceiling. Raise hookTimeout, per the rule in vitest.config.ts."
    : "\nComfortable. No change needed to hookTimeout.",
);
console.log(
  "\nNOTE: this measures THIS box against TEST_DATABASE_URL. The boot deadline",
  "\nmust be sized against CONTENTION, not a quiet machine, and CI is a",
  "\ndifferent machine again. A green here is not a green there.",
);
