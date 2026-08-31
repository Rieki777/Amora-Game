/**
 * The guard's own guard.
 *
 * check-hyphen-dash.mjs has run against `client/src` only since it was
 * written, with no comment explaining why and no CI step name that says so
 * ("Dash guard" reads repo-wide). That is a real gap, not a design choice:
 * SEASON2_FLEET_LEDGER.md section 8a's guard audit measured 111 raw hits if
 * the walk were pointed at server/scripts/docs/shared with the SAME regex,
 * and every single one sampled was a false positive (test fixture ids like
 * "place-a"/"rec-a", URL fragments, legitimate compounds like
 * "use-it-or-lose-it" and "held-versus-not"), so widening the walk as-is
 * would drown the one real signal in noise, not surface it. The honest fix is
 * documentation, not scope: the script's header now says "client/src only",
 * and this file makes that boundary a tested fact instead of a claim nobody
 * checks. The CI step's name ("Dash guard") still needs the same fix; that
 * change belongs to the release lane, who owns .github/workflows/**.
 *
 * This spawns the real script against scratch fixture trees (never against
 * this repo's own files) so a future change to the walk root is caught here
 * FIRST, whichever direction it moves:
 *   - shrink the walk further and a live violation goes unseen in the SAME
 *     `client/src` fixture that is supposed to catch it: RED, and this test
 *     fails.
 *   - widen the walk to `server/` and the twin violation planted there
 *     (currently invisible) starts being reported: this test's "must stay
 *     invisible" assertion fails, which is the prompt to update this file
 *     alongside the widened scope, not a false alarm.
 *
 * Run: node scripts/check-hyphen-dash.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("./check-hyphen-dash.mjs", import.meta.url));
let run = 0;
const check = (name, fn) => { fn(); run += 1; console.log(`  PASS  ${name}`); };

/** A scratch tree with client/src AND server siblings, torn down after. */
function withFixtureTree(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hyphen-dash-test-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
    fn(result);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log("\ncheck-hyphen-dash: a glued compound, and the boundary of what it can see\n");

check("catches a glued compound in client/src and exits 1", () => {
  withFixtureTree(
    { "client/src/Fixture.tsx": `export const copy = "a heartfelt covenant-a living agreement";\n` },
    (r) => {
      assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}`);
      assert.match(r.stdout, /covenant-a/);
      assert.match(r.stdout, /1 hyphen\(s\)/);
    },
  );
});

check("leaves the allowlisted compounds alone and exits 0", () => {
  withFixtureTree(
    {
      "client/src/Fixture.tsx":
        `export const copy = "well-being, decision-making, one-on-one, and a thank-you note";\n`,
    },
    (r) => {
      assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
      assert.match(r.stdout, /0 hyphen\(s\)/);
    },
  );
});

check("the SAME glued compound in server/ is invisible: the walk is client/src only", () => {
  withFixtureTree(
    {
      // An empty client/src alongside it: the script's own walk() throws on
      // a MISSING client/src (proven below), so this isolates "is server/
      // scanned" from "does client/src exist": two different questions.
      "client/src/.gitkeep": "",
      "server/fixture.ts": `export const copy = "a heartfelt covenant-a living agreement";\n`,
    },
    (r) => {
      assert.strictEqual(r.status, 0, `expected exit 0 (server/ unscanned), got ${r.status}\n${r.stdout}`);
      assert.doesNotMatch(r.stdout, /covenant-a/);
    },
  );
});

check("the SAME glued compound in scripts/ is also invisible", () => {
  withFixtureTree(
    {
      "client/src/.gitkeep": "",
      "scripts/fixture.mjs": `export const copy = "we do not just sustain-we heal";\n`,
    },
    (r) => {
      assert.strictEqual(r.status, 0, `expected exit 0 (scripts/ unscanned), got ${r.status}\n${r.stdout}`);
    },
  );
});

check("a MISSING client/src crashes rather than silently reporting 0 hyphens", () => {
  // walk() calls fs.readdirSync("client/src") with no existence guard, so
  // "the check did not run" and "the check ran and found nothing" are NOT
  // the same output here, a real distinguishing property this file pins
  // down so nobody quietly adds a guard clause that collapses them.
  withFixtureTree({ "server/fixture.ts": "export const copy = 'unrelated';\n" }, (r) => {
    assert.notStrictEqual(r.status, 0, `expected a non-zero (crash) exit, got ${r.status}\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /0 hyphen\(s\)/, "a crash must never print the clean-pass line");
  });
});

check("an empty client/src exits 0 with a zero count, not a crash", () => {
  withFixtureTree({ "client/src/.gitkeep": "" }, (r) => {
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /0 hyphen\(s\)/);
  });
});

console.log(`\n${run} check(s) passed\n`);
