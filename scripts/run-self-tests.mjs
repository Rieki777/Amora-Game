/**
 * Run EVERY guard self-test, found by glob rather than named one at a time.
 *
 * `scripts/` holds the meta-tests: the files that prove a guard can actually go
 * red. Nothing else in this repository can reach them. vitest.config.ts's
 * include globs cover `server/`, `shared/` and `client/` only, and none of these
 * files end in `.ts` anyway, so `pnpm test` cannot see them by two independent
 * rules. There are no git hooks. So they run only if ci.yml names them.
 *
 * ci.yml named four of nine. The other five ran nowhere at all, and two of them
 * are the ones that matter most: `check-voice.test.mjs` guards the house writing
 * rules on all shipped copy, and `check-migration-compat.test.mjs` guards "a
 * migration leaves the previous release able to run", which is the only thing
 * standing between a bad migration and a village that cannot roll back. All
 * five were green when this was written, so this starts from a known state.
 *
 * Naming them individually is what left the gap, and it would leave it again
 * for the tenth self-test somebody writes. This globs, so a new self-test is
 * wired the moment it is saved. It also prints the count, so "none found"
 * (a rename, a moved directory) reads as the failure it would be rather than
 * as a silent pass.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, ".");
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

if (files.length === 0) {
  console.error(
    "FAIL -- no scripts/*.test.mjs found at all. Either every guard self-test was deleted or " +
      "this script is looking in the wrong place. Both are failures, not a clean run.",
  );
  process.exit(1);
}

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed += 1;
  const all = `${r.stdout ?? ""}${r.stderr ?? ""}`
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  console.log(`${ok ? "ok  " : "FAIL"}  ${f}  ${all[all.length - 1]?.trim() ?? ""}`);
  // On failure, print what the child actually said.
  //
  // This kept ONLY that last line on BOTH paths. A passing guard ends with its
  // own summary, so the output looked deliberate, and nobody noticed that the
  // failing path was discarding every line naming WHICH assertion failed and
  // why. CI then said `check-migration-compat: 2 failure(s) of 24` and stopped:
  // a red build carrying no way to act on it. The failure that exposed this
  // could not be reproduced locally either, because CI runs mysql:8 and this
  // machine's test database is MariaDB, so the single place the reason existed
  // was the log that was throwing it away.
  if (!ok) {
    for (const l of all) console.log(`        ${l}`);
    if (r.status === null) console.log(`        (killed by signal ${r.signal})`);
  }
}

console.log(`\n${files.length} guard self-test(s) run, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
