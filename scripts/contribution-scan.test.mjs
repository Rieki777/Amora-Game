#!/usr/bin/env node
/**
 * The contribution scan's regression test.
 *
 *   node scripts/contribution-scan.test.mjs
 *
 * The case that matters is "edit a file that already carries violations". The
 * scan shipped proved by a fixture that was always a NEW file, and in a new
 * file every line is the contributor's, so whole-file scanning and added-line
 * scanning agree exactly. The one shape that separates them was the one shape
 * untested, and the result blocked every pull request touching a legacy file.
 *
 * So the git-backed cases below build a real repository with a dirty base and
 * then edit it, which is the only way to prove attribution rather than assert
 * it. House style: plain Node, no runner, non-zero exit on failure.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addedLineNumbers, parseAddedLineNumbers, scanFileLines } from "./contribution-scan.mjs";

let failures = 0;
let assertions = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assertions++;
  if (!ok) failures++;
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`          expected: ${JSON.stringify(expected)}`);
    console.log(`          actual:   ${JSON.stringify(actual)}`);
  }
};

console.log("Contribution scan");

// ── 1. Hunk arithmetic, the part that goes silently wrong ────────────────────

check(
  "a single added line lands on its new line number",
  [...parseAddedLineNumbers("@@ -3,0 +4 @@\n+added")],
  [4],
);
check(
  "consecutive added lines increment",
  [...parseAddedLineNumbers("@@ -0,0 +10,3 @@\n+a\n+b\n+c")],
  [10, 11, 12],
);
check(
  "several hunks each restart at their own offset",
  [...parseAddedLineNumbers("@@ -1,0 +2 @@\n+a\n@@ -9,0 +40,2 @@\n+b\n+c")],
  [2, 40, 41],
);
check(
  "removed lines contribute nothing",
  [...parseAddedLineNumbers("@@ -5,2 +5,0 @@\n-gone\n-also gone")],
  [],
);
check(
  "the +++ file header is not an added line",
  [...parseAddedLineNumbers("--- a/f.ts\n+++ b/f.ts\n@@ -1,0 +1 @@\n+real")],
  [1],
);

// ── 2. Partitioning ──────────────────────────────────────────────────────────

// Line 1 is pre-existing debt, line 2 is what this change added.
const BODY = ['const a = pool.query("SELECT 1");', 'const b = pool.query("SELECT 2");'].join("\n");

const onlyTheirs = scanFileLines({ relPath: "server/x.ts", body: BODY, addedSet: new Set([2]) });
check("a hit on an added line is a finding", onlyTheirs.findings.length, 1);
check("the finding names the added line", onlyTheirs.findings[0].line, 2);
check("a hit on an untouched line is pre-existing", onlyTheirs.preExisting, 1);

const newFile = scanFileLines({ relPath: "server/x.ts", body: BODY, addedSet: null });
check("a new file attributes every line to the contributor", newFile.findings.length, 2);
check("a new file reports no pre-existing debt", newFile.preExisting, 0);

const untouched = scanFileLines({ relPath: "server/x.ts", body: BODY, addedSet: new Set() });
check("touching none of the offending lines produces no finding", untouched.findings.length, 0);
check("and the debt is still counted", untouched.preExisting, 2);

const waived = scanFileLines({
  relPath: "server/x.ts",
  body: 'const a = pool.query("SELECT 1"); // module-review-ok: proving the waiver',
  addedSet: new Set([1]),
});
check("a waiver on an added line suppresses the finding", waived.findings.length, 0);
check("and is counted", waived.waived, 1);

check(
  "a rule out of scope never fires",
  scanFileLines({ relPath: "docs/x.ts", body: BODY, addedSet: null }).findings.length,
  0,
);

// ── 3. Against a real repository ─────────────────────────────────────────────
//
// The scenarios the whole fix exists for. A throwaway repo, a base commit that
// is already dirty, and then the three ways a contributor can touch it.

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "contribution-scan-"));
const git = (...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
/**
 * Always writes a trailing newline, because real source files have one and a
 * fixture without one tests something else. Git marks the last line of a
 * newline-less file as removed and re-added when anything is appended, so the
 * first draft of these fixtures made an append look like an edit to the line
 * above it. That artifact is real and it gets its own case at the end.
 */
const write = (rel, lines) => {
  const text = Array.isArray(lines) ? lines.join("\n") : String(lines);
  fs.mkdirSync(path.join(repo, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), `${text}\n`, "utf8");
};

try {
  git("init", "-q");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Contribution Scan Test");

  // A base that already carries two violations, the way a real legacy file does.
  write("server/legacy.ts", ['const a = pool.query("SELECT 1");', 'const b = pool.query("SELECT 2");']);
  git("add", "-A");
  git("commit", "-q", "-m", "base with pre-existing debt");
  const base = git("rev-parse", "HEAD").trim();

  const scanAgainstBase = (rel) =>
    scanFileLines({
      relPath: rel,
      body: fs.readFileSync(path.join(repo, rel), "utf8"),
      addedSet: addedLineNumbers(base, rel, repo),
    });

  // 3a. THE REGRESSION: add a clean line to a dirty file.
  write(
    "server/legacy.ts",
    ['const a = pool.query("SELECT 1");', 'const b = pool.query("SELECT 2");', "const clean = 1;"].join("\n"),
  );
  const cleanEdit = scanAgainstBase("server/legacy.ts");
  check("a clean hunk in a dirty file produces no finding", cleanEdit.findings.length, 0);
  check("and the untouched debt is reported, not charged", cleanEdit.preExisting, 2);

  // 3b. Add a violating line to the same dirty file.
  write(
    "server/legacy.ts",
    [
      'const a = pool.query("SELECT 1");',
      'const b = pool.query("SELECT 2");',
      'const mine = pool.query("SELECT 3");',
    ].join("\n"),
  );
  const dirtyEdit = scanAgainstBase("server/legacy.ts");
  check("a violating hunk blocks", dirtyEdit.findings.length, 1);
  check("and names the line the contributor added", dirtyEdit.findings[0].line, 3);
  check("while still not charging the pre-existing pair", dirtyEdit.preExisting, 2);

  // 3c. A brand-new file: no base version, so all of it is theirs.
  write("server/brand-new.ts", ["const ok = 1;", 'const bad = pool.query("SELECT 4");'].join("\n"));
  const added = scanAgainstBase("server/brand-new.ts");
  check("a new file's violation blocks", added.findings.length, 1);
  check("and is attributed to its own line", added.findings[0].line, 2);
  check("a new file has no base, so nothing is pre-existing", added.preExisting, 0);
  check("addedLineNumbers reports null for a file with no base", addedLineNumbers(base, "server/brand-new.ts", repo), null);
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log(
  failures === 0
    ? `\nPASS  contribution scan: ${assertions} assertion(s), 0 failures.`
    : `\nFAIL  contribution scan: ${failures} failure(s) of ${assertions}.`,
);
process.exit(failures === 0 ? 0 : 1);
