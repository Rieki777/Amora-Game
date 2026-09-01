/**
 * The database-isolation guard's own fixture suite.
 *
 * The guard's failure mode is the expensive one: a spawned test server with no
 * DATABASE_URL of its own connects to the real one in .env and writes to it. So
 * this proves the guard refuses that, rather than trusting that it would.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GUARD = path.resolve(import.meta.dirname, "check-e2e-db-isolation.mjs");

let checks = 0;
let failures = 0;

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbguard-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  const r = spawnSync(process.execPath, [GUARD, "--dir", dir], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function check(label, got, want) {
  checks += 1;
  if (got === want) return;
  failures += 1;
  console.error(`FAIL: ${label}\n  expected ${JSON.stringify(want)}\n  got      ${JSON.stringify(got)}`);
}

const WITH_DB = [
  "  child = spawn(process.execPath, [DIST], {",
  "    env: {",
  "      ...process.env,",
  "      PORT: String(PORT),",
  "      DATABASE_URL: testDb.url,",
  "    },",
  "  });",
  "",
].join("\n");

const WITHOUT_DB = [
  "  child = spawn(process.execPath, [DIST], {",
  "    env: {",
  "      ...process.env,",
  "      PORT: String(PORT),",
  "    },",
  "  });",
  "",
].join("\n");

// 1. A spawn that names its own scratch schema passes.
{
  const r = run({ "a.e2e.test.ts": WITH_DB });
  check("a scratch schema passes", r.status, 0);
}

// 2. A spawn without one is refused.
{
  const r = run({ "a.e2e.test.ts": WITHOUT_DB });
  check("no DATABASE_URL refused", r.status, 1);
  check("and says what it would connect to", /a real village/.test(r.out), true);
}

// 3. One good file does not cover for a bad one.
{
  const r = run({ "a.e2e.test.ts": WITH_DB, "b.e2e.test.ts": WITHOUT_DB });
  check("a second file is checked too", r.status, 1);
}

// 4. Two spawns in one file are both checked.
{
  const r = run({ "a.e2e.test.ts": WITH_DB + WITHOUT_DB });
  check("a second spawn in the same file is checked", r.status, 1);
}

// 5. Finding no spawning suite at all is a failure, not a clean run: that means
//    the spawn shape changed under the guard, which is exactly when a guard is
//    most likely to be quietly useless.
{
  const r = run({ "a.e2e.test.ts": "// nothing spawns here\n" });
  check("an empty survey refused", r.status, 1);
}

// 6. A DATABASE_URL that belongs to a DIFFERENT spawn further down the file
//    must not cover for one that has none.
{
  const r = run({ "a.e2e.test.ts": WITHOUT_DB + WITH_DB });
  check("a later spawn's DATABASE_URL does not cover an earlier one", r.status, 1);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} check(s) FAILED.`);
  process.exit(1);
}
console.log(`check-e2e-db-isolation: ${checks} check(s) passed`);
