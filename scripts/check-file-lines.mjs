#!/usr/bin/env node
/**
 * The monolith ratchet: a client file that nobody can read in one sitting is
 * a file that nobody can review, test, or edit alongside somebody else.
 *
 * WHY THIS EXISTS, MEASURED. `client/src/pages/Admin.tsx` was 11,419 lines the
 * day this guard landed, and it is the second-most-edited file in this
 * repository: 124 of 962 commits touch it, behind only `server/index.ts` at
 * 283, and 123 of the last 400 commits that touched `client/src` at all landed
 * in that one file, which is 2.3x the next busiest. It is also the surface a
 * non-technical village steward runs
 * their village from, and the surface a founder rebrands through. Every module
 * contributor has to edit it, so it collects merge conflicts the way the
 * server monolith does, and no agent or human can hold it in one context.
 *
 * DO NOT QUOTE A LINE COUNT FROM THIS COMMENT. The numbers above are a
 * measurement of the day this landed, and CLAUDE.md records what happens to a
 * figure written into a doc: the client-budget section carried a stale one
 * twice and nobody noticed for months. `scripts/file-lines-baseline.json` is
 * the live number, and running this script is how you read today's.
 *
 * WHY A RATCHET AND NOT A CEILING. A ceiling picked out of the air is either
 * so high it never fires or so low it blocks the tree on the day it lands.
 * A ratchet asks for something weaker and more useful: whatever a tracked file
 * weighs today, it never weighs more tomorrow. Extraction work lowers the
 * number and the number stays lowered. That binds the lanes that come after
 * the lane that did the extracting, which is the whole point, because the
 * previous four attempts at this file all grew it back.
 *
 * WHAT COUNTS AS SAFE, AND WHY THE SCOPE IS NARROW. Three deliberate cuts,
 * each one a place a fair complaint would otherwise land:
 *
 *   1. `client/src` only. `server/**` has the same disease and is not this
 *      guard's to treat: two other lanes are editing it right now, and a guard
 *      that fails a sibling lane's build on its first day is a guard somebody
 *      deletes. Widening to `server/**` is a real option for later, taken
 *      deliberately by whoever owns that tree, not folded in here.
 *   2. `client/src/components/ui/**` is exempt. Those are vendored shadcn
 *      primitives (`sidebar.tsx` alone is 734 lines); regenerating one from
 *      upstream is not this repo growing a monolith, and failing that update
 *      would teach people to edit the baseline instead of the code.
 *   3. Test files are exempt. A test file getting longer is a test file
 *      covering more, which is the behaviour this repo wants more of, not
 *      less. `client/src/lib/housingForm.test.ts` is already 639 lines and
 *      should be free to double.
 *
 * WHY THE THRESHOLD IS 1000. It is the band where a file stops being long and
 * starts being a monolith: it no longer fits one reading, one review, or one
 * model's working context. Measured against this tree the day it landed, it
 * tracks four files (Admin.tsx 11419, ProjectHistory.tsx 1991,
 * GameMechanics.tsx 1498, CoCreatorsGuide.tsx 1212) and leaves the next one
 * down (InvestorJourney.tsx at 949) alone, which is the gap that made 1000 the
 * honest place to draw it rather than a round number that happened to fit.
 * Three of those four are prose-heavy content pages that change about 15 times
 * per 400 commits, so the cost of the guard falls almost entirely on the file
 * it was written for.
 *
 * A FILE UNDER THE THRESHOLD IS NOT TRACKED AND CANNOT FAIL. It only enters
 * the baseline by crossing 1000 lines, and the day it crosses is the day this
 * guard fires, which is the earliest anyone can be told. That is also how a
 * brand-new monolith is caught: born over the line, born failing.
 *
 * THE RATCHET, the same discipline as scripts/check-theme-literals.mjs and
 * scripts/check-tailwind-gray.mjs: the baseline in
 * scripts/file-lines-baseline.json is a per-file line count that may only ever
 * fall, and `--update-baseline` REFUSES to write any file higher than the
 * count already committed, and refuses to write a higher total. Unlike those
 * two guards the per-file refusal is the load-bearing one: line counts do not
 * move between files the way a colour class does, so "the total did not rise"
 * would let one file balloon while another shrank, which is exactly the
 * failure this is here to stop.
 *
 * NO WAIVER MARKER, ON PURPOSE. `theme-ok:` and `gray-ok:` exist because those
 * guards match text and text can be matched wrongly. This one counts newlines.
 * There is no such thing as a false positive line, so there is nothing to
 * excuse, and the only way past it is to make the file smaller.
 *
 * Usage:
 *   node scripts/check-file-lines.mjs                    # the gate
 *   node scripts/check-file-lines.mjs --json             # machine readable
 *   node scripts/check-file-lines.mjs --update-baseline  # only ever downward
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The line count at which a file becomes this guard's business. */
const THRESHOLD = 1000;

/**
 * The repo root, overridable so check-file-lines.test.mjs can point the walk
 * at a scratch fixture tree instead of this repository's own files. Nothing in
 * CI sets it; the guard run by the gate always measures the real tree.
 */
const ROOT = process.env.FILE_LINES_ROOT
  ? path.resolve(process.env.FILE_LINES_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = path.join(ROOT, "client", "src");
const BASELINE_PATH = path.join(ROOT, "scripts", "file-lines-baseline.json");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/** Vendored primitives, exempt per cut 2 in the header. */
const isVendored = (relPath) => relPath.startsWith("client/src/components/ui/");
/** Tests, exempt per cut 3 in the header. */
const isTest = (relPath) => /\.(test|spec)\.tsx?$/.test(relPath);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Lines the way an editor shows them, which is NOT the way `wc -l` counts
 * them, and the difference is real in this tree. `wc -l` counts newline
 * CHARACTERS, so a file whose last line has no terminator is reported one
 * short: `wc -l client/src/pages/Admin.tsx` says 11418 while the file holds
 * 11419 lines, the last of them a bare `}` with no newline after it. Three of
 * the four files this guard tracks do end in a newline and agree with wc; that
 * one does not, and the brief that opened this lane inherited wc's number.
 *
 * Counting what a person sees is the right call for a guard whose failure
 * message tells somebody to go make a file shorter: the number in the error
 * has to match the number at the bottom of their editor. A plain
 * `split("\n").length` is the other wrong answer, one too many on every file
 * that does end in a newline.
 */
function countLines(file) {
  const text = fs.readFileSync(file, "utf8");
  if (text === "") return 0;
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") n += 1;
  if (!text.endsWith("\n")) n += 1;
  return n;
}

const counts = {};
for (const file of walk(SCAN_ROOT).sort()) {
  const r = rel(file);
  if (isVendored(r) || isTest(r)) continue;
  const n = countLines(file);
  if (n >= THRESHOLD) counts[r] = n;
}
const total = Object.values(counts).reduce((n, v) => n + v, 0);

const readBaseline = () =>
  fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : null;

if (process.argv.includes("--update-baseline")) {
  const baseline = readBaseline();
  const baselineFiles = baseline?.files ?? {};
  const baselineTotal = baseline
    ? (baseline.totalLines ?? Object.values(baselineFiles).reduce((n, v) => n + v, 0))
    : Infinity;

  const risen = Object.entries(counts).filter(
    ([file, n]) => baselineFiles[file] !== undefined && n > baselineFiles[file],
  );
  if (risen.length > 0) {
    console.error(
      "::error::refusing to raise the file-lines baseline. These numbers only ever fall:",
    );
    for (const [file, n] of risen) {
      console.error(`::error::  ${file}: ${n} lines, baseline holds ${baselineFiles[file]}`);
    }
    console.error(
      "::error::Move the new code into its own file under client/src/components/ instead of " +
        "adding it to a file this guard already tracks. For an admin tab, that is " +
        "client/src/components/admin/<Tab>.tsx with its nav entry in client/src/lib/adminNav.ts. " +
        "Read docs/ARCHITECTURE.md section 3.19 rule 1 before deciding whether the new file is " +
        "imported statically or lazily: the two client budgets pull in opposite directions.",
    );
    process.exit(1);
  }
  if (total > baselineTotal) {
    console.error(
      `::error::refusing to raise the file-lines baseline total: ${total} is above the recorded ` +
        `${baselineTotal}. A file crossing ${THRESHOLD} lines for the first time is a new monolith, ` +
        `not a new baseline entry. Split it before it is born.`,
    );
    process.exit(1);
  }
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ threshold: THRESHOLD, totalLines: total, files: counts }, null, 2)}\n`,
  );
  console.log(
    `file-lines baseline lowered to ${total} line(s) across ${Object.keys(counts).length} tracked file(s).`,
  );
  process.exit(0);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ threshold: THRESHOLD, total, files: counts }));
}

const baseline = readBaseline() ?? { threshold: THRESHOLD, totalLines: 0, files: {} };
const baselineFiles = baseline.files ?? {};
const baselineTotal =
  baseline.totalLines ?? Object.values(baselineFiles).reduce((n, v) => n + v, 0);

const failures = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = baselineFiles[file];
  if (allowed === undefined) {
    failures.push({
      file,
      reason:
        `${n} lines, and this file is not in the baseline. It has just crossed ${THRESHOLD} lines, ` +
        `which is where a file stops fitting one reading, one review, or one context window`,
    });
    continue;
  }
  if (n > allowed) {
    failures.push({
      file,
      reason: `${n} lines, baseline allows ${allowed}, the ratchet only turns down`,
    });
  }
}

if (failures.length) {
  console.error("\nMONOLITH RATCHET FAILED: a tracked client file grew.\n");
  for (const f of failures) console.error(`  ${f.file}: ${f.reason}`);
  console.error(
    "\nPut the new code in its own file rather than on the end of this one. For an admin tab that is",
  );
  console.error(
    "client/src/components/admin/<Tab>.tsx, with its nav entry in client/src/lib/adminNav.ts. Read",
  );
  console.error(
    "docs/ARCHITECTURE.md section 3.19 rule 1 before choosing a static or a lazy import for it: the two",
  );
  console.error("client budgets pull in opposite directions, and splitting helps one while costing the other.");
  console.error(
    "\nIf you SHRANK a tracked file, lower the baseline: node scripts/check-file-lines.mjs --update-baseline\n",
  );
  process.exit(1);
}

const tracked = Object.keys(counts).length;
console.log(
  `Monolith ratchet passed. ${tracked} tracked file(s) at or over ${THRESHOLD} lines, ` +
    `${total} line(s) total (baseline ${baselineTotal}).`,
);
