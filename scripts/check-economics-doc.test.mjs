/**
 * The economics doc guard's own guard.
 *
 * Two things are being proved, and the second matters more than the first.
 *
 * IT REFUSES. A drifted region fails with BOTH sides printed, a missing marker
 * fails with a DIFFERENT code, a missing document fails, and a tree whose
 * sources are gone fails. Each is run as a child process against real files on
 * disk, reading the real exit code.
 *
 * IT CAN STILL SEE. Every reader in the generator is text-based, so it can
 * lose sight of a fact without losing its green: a reader that returned an
 * empty list would pass every refusal case in this file by finding nothing to
 * object to, and the document would quietly shed a faucet or an invariant.
 * So every refusal case is paired with a positive control that asserts the
 * reader still finds the thing it is supposed to find, by name and by value.
 *
 * THE THIRD EXIT CODE IS THE POINT OF HALF THIS FILE. `check-economics-doc.mjs`
 * exits 2, never 0 and never 1, whenever it could not run: 1 means "I looked
 * and the answer is bad" and 2 means "I could not look", and a red build has to
 * say which. Four separate cases below assert 2 rather than merely non-zero,
 * because "non-zero" is exactly the assertion that would let 2 rot into 1.
 *
 * Run: node scripts/check-economics-doc.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REGION_NAMES,
  ROOT,
  endMarker,
  findRegion,
  invariantChecks,
  occurrenceKeys,
  refusalsFrom,
  renderAll,
  startMarker,
} from "./generate-economics-doc.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "check-economics-doc.mjs");
const GENERATOR = path.join(HERE, "generate-economics-doc.mjs");

let run = 0;
const check = (name, fn) => {
  fn();
  run += 1;
  console.log(`  PASS  ${name}`);
};

console.log("\ncheck-economics-doc: the generated regions still say what the code does\n");

// ── The file itself ─────────────────────────────────────────────────────────

check("the generator carries NO shebang, which a CRLF checkout would break", () => {
  // Same rule and same reason as scripts/generate-token-doc.mjs: this file is
  // imported as well as executed, and a shebang plus CRLF makes a bundler's
  // transform throw. Asserted rather than trusted to a comment.
  const first = fs.readFileSync(GENERATOR, "utf8").split("\n")[0];
  assert.ok(!first.startsWith("#!"), `generate-economics-doc.mjs must not start with a shebang, got: ${first}`);
});

// ── The readers can still see ───────────────────────────────────────────────

check("READER: occurrenceKeys finds the quest key and renders its real shape", () => {
  const keys = occurrenceKeys(ROOT);
  const quest = keys.find((k) => k.name === "questCompleted");
  assert.ok(quest, `keys.questCompleted is gone from the reader's view; it found: ${keys.map((k) => k.name).join(", ")}`);
  assert.strictEqual(quest.shape, "quest.completed:<v>:<questId>:<claimId>:<userId>");
  // The seat key's spelling is load-bearing (renaming it repays every seat), so
  // it is pinned here as well as described in the document.
  const seat = keys.find((k) => k.name === "roleCycle");
  assert.ok(seat, "keys.roleCycle is gone from the reader's view");
  assert.strictEqual(seat.shape, "role.cycle:<v>:<cycleKey>:<seatId>:<userId>");
  assert.ok(keys.length >= 8, `expected at least 8 occurrence keys, read ${keys.length}`);
});

check("READER: invariantChecks pairs every boot read with the refusal it produces", () => {
  const checks = invariantChecks(ROOT);
  assert.ok(checks.length >= 6, `expected at least 6 boot invariants, read ${checks.length}`);
  const all = checks.map((c) => c.message).join("\n");
  // Conservation itself, by name. If this sentence stops being found, the
  // document's central claim is being printed by a reader that cannot see it.
  assert.match(all, /conservation broken for/, "the conservation refusal is no longer being read");
  assert.match(all, /cache drift/, "the cache-drift refusal is no longer being read");
  assert.match(all, /this platform must never move it/, "the hypha refusal is no longer being read");
  // Every entry must carry the SQL it came from, or the "reads" column is a guess.
  for (const c of checks) {
    assert.ok(/select/i.test(c.sql), `an invariant was paired with something that is not a read: ${c.sql.slice(0, 80)}`);
  }
});

check("READER: refusalsFrom reads BOTH branches of a ternary refusal", () => {
  // This is the case that caught the first draft of the reader: sendRefusal
  // returns two of its sentences out of a ternary, and a reader that skipped
  // what it could not resolve dropped the recognition refusal, which is the
  // single most load-bearing sentence in the send path, while still printing a
  // list that looked complete.
  const send = refusalsFrom(ROOT, "server/lib/spending.ts", "sendRefusal");
  const joined = send.join("\n");
  assert.match(joined, /recognition is a record of what happened/, "the ternary's TRUE branch was dropped");
  assert.match(joined, /is not a token members send to each other/, "the ternary's FALSE branch was dropped");
  assert.ok(send.length >= 8, `sendRefusal has at least 8 sentences, the reader found ${send.length}`);
});

check("READER: refusalsFrom joins a refusal wrapped across a + concatenation", () => {
  // checkGive's share refusal is one sentence written across two template
  // literals to fit the line. Half a sentence in the document is worse than
  // none, so the join is asserted on its real text.
  const give = refusalsFrom(ROOT, "server/lib/economy.ts", "checkGive");
  const share = give.find((s) => s.includes("is the most you can give one person"));
  assert.ok(share, `the share refusal is gone from the reader's view; it found: ${give.join(" | ")}`);
  assert.match(share, /That leaves <left> for them$/, "the second half of the concatenated refusal was lost");
});

check("READER: pointed at a function that yields no sentence, it THROWS", () => {
  // `sendableTokens` returns a filtered list, not a refusal. Whichever guard
  // fires first (the unreadable-return one or the found-nothing one), the
  // requirement is the same and it is the whole reason the readers are
  // written this way: a reader that found nothing must say so rather than
  // report an empty list, which would render as a section that lost its
  // contents while still looking deliberate.
  assert.throws(
    () => refusalsFrom(ROOT, "server/lib/spending.ts", "sendableTokens"),
    (err) => {
      assert.match(String(err.message), /economics-doc:/);
      assert.match(String(err.message), /sendableTokens/, "the error must name the function it could not read");
      return true;
    },
  );
});

check("READER: a reader whose anchor is gone throws, naming what it wanted", () => {
  assert.throws(
    () => refusalsFrom(ROOT, "server/lib/spending.ts", "aFunctionThatDoesNotExist"),
    /no longer declares function aFunctionThatDoesNotExist/,
  );
});

// ── findRegion ──────────────────────────────────────────────────────────────

const wrap = (name, body) => `${startMarker(name)}\n${body}\n${endMarker(name)}`;

check("findRegion reads the body between the markers", () => {
  const r = findRegion(`before\n${wrap("tokens", "the body")}\nafter`, "tokens");
  assert.strictEqual(r.body, "the body");
});

check("findRegion calls a MISSING marker a problem, never an empty region", () => {
  // The whole pipeline turns on this. An empty region would compare equal to
  // nothing, so deleting the markers would delete a table the code still
  // guarantees and the guard would call it a pass.
  const r = findRegion("a document with no markers at all", "tokens");
  assert.ok(r.problem, "a missing marker must be a problem");
  assert.match(r.problem, /is not in the document/);
  assert.strictEqual(r.body, undefined);
});

check("findRegion refuses a start marker with no end", () => {
  const r = findRegion(`${startMarker("tokens")}\nbody but no close`, "tokens");
  assert.match(r.problem, /is there but .* is not/);
});

check("findRegion refuses a DUPLICATED marker", () => {
  // Two copies of a region is two answers to one question, and the splice
  // would silently write only the first.
  const twice = `${wrap("tokens", "a")}\n${wrap("tokens", "b")}`;
  assert.match(findRegion(twice, "tokens").problem, /appears more than once/);
});

// ── The gate, against real documents, reading the exit code ─────────────────

const FIXTURES = fs.mkdtempSync(path.join(os.tmpdir(), "economics-doc-test-"));

/**
 * spawnSync, not execFileSync: execFileSync throws away stderr on a SUCCESSFUL
 * run, and both streams matter here because the guard prints its verdict on
 * stdout and any escape on either.
 */
function runGuard(args) {
  const r = spawnSync(process.execPath, [GUARD, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** A whole document with every region rendered from the REAL code. */
const rendered = renderAll(ROOT);
const goodDoc = [
  "# a fixture document",
  "",
  "Prose the guard must not care about.",
  "",
  ...REGION_NAMES.map((n) => `${wrap(n, rendered[n])}\n`),
  "More prose.",
].join("\n");

function docAt(label, text) {
  const dir = path.join(FIXTURES, label);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "ECONOMICS.md");
  if (text !== null) fs.writeFileSync(p, text);
  return p;
}

check("FIXTURE: a document matching the code exits 0 and says how many regions", () => {
  const { code, out } = runGuard(["--doc", docAt("match", goodDoc)]);
  assert.strictEqual(code, 0, out);
  assert.match(out, /Economics doc guard passed/);
  // "none found" must never read as success, so the count is part of the pass.
  assert.match(out, new RegExp(`${REGION_NAMES.length} generated region\\(s\\) match`));
});

check("FIXTURE: a DRIFTED region exits 1 and prints BOTH sides", () => {
  const drifted = goodDoc.replace("| `credits` |", "| `credits-renamed-by-hand` |");
  assert.notStrictEqual(drifted, goodDoc, "the fixture must actually differ, or this proves nothing");
  const { code, out } = runGuard(["--doc", docAt("drift", drifted)]);
  assert.strictEqual(code, 1, out);
  assert.match(out, /have come apart/);
  assert.match(out, /the code says:.*`credits`/, "the generated side must be printed");
  assert.match(out, /the file says:.*credits-renamed-by-hand/, "the committed side must be printed");
  assert.match(out, /generated:tokens/, "the failing region must be named");
  assert.match(out, /node scripts\/generate-economics-doc\.mjs/, "the way out must be printed");
});

check("FIXTURE: drift in a LATER region is found too, not just the first", () => {
  // A guard that stopped at the first region would pass a document whose last
  // table was rewritten by hand, and the last table is the one nobody rereads.
  const last = REGION_NAMES[REGION_NAMES.length - 1];
  const drifted = goodDoc.replace(rendered[last], `${rendered[last]}\n\nA line somebody typed.`);
  const { code, out } = runGuard(["--doc", docAt("drift-last", drifted)]);
  assert.strictEqual(code, 1, out);
  assert.match(out, new RegExp(`generated:${last}`));
});

check("FIXTURE: a MISSING marker exits 2, not 1, and names every missing region", () => {
  const stripped = goodDoc.replace(startMarker("faucets"), "").replace(endMarker("faucets"), "");
  const { code, out } = runGuard(["--doc", docAt("nomarker", stripped)]);
  assert.strictEqual(code, 2, `a missing marker must be 2 (could not look), not 1 (looked and it was bad). Got ${code}:\n${out}`);
  assert.match(out, /cannot be found, so the check did not run/);
  assert.match(out, /generated:faucets/);
  assert.match(out, /Exit 2: nothing was compared/);
});

check("FIXTURE: a DUPLICATED marker exits 2", () => {
  const doubled = goodDoc.replace(endMarker("tokens"), `${endMarker("tokens")}\n${startMarker("tokens")}`);
  const { code, out } = runGuard(["--doc", docAt("dupmarker", doubled)]);
  assert.strictEqual(code, 2, out);
  assert.match(out, /appears more than once/);
});

check("FIXTURE: a MISSING document exits 2, not 1", () => {
  const gone = path.join(FIXTURES, "absent", "ECONOMICS.md");
  fs.mkdirSync(path.dirname(gone), { recursive: true });
  const { code, out } = runGuard(["--doc", gone]);
  assert.strictEqual(code, 2, out);
  assert.match(out, /is not there/);
  assert.match(out, /has not "drifted"/);
});

check("FIXTURE: sources it cannot read exit 2, and the DOCUMENT is not blamed", () => {
  // The failure mode this pins: a rename in server/lib/ making the guard red
  // with a message telling somebody to regenerate a document that was never
  // the problem. The sources are read BEFORE the document is opened, so the
  // message names the code.
  const emptyTree = path.join(FIXTURES, "empty-root");
  fs.mkdirSync(emptyTree, { recursive: true });
  const { code, out } = runGuard(["--root", emptyTree, "--doc", docAt("orphan", goodDoc)]);
  assert.strictEqual(code, 2, out);
  assert.match(out, /could not be regenerated, so it cannot be checked/);
  assert.match(out, /is gone; the generator reads it/, "the missing SOURCE must be named");
  assert.match(out, /nothing was compared/);
});

check("FIXTURE: CRLF line endings compare equal to LF", () => {
  // core.autocrlf is true on the Windows checkouts this repository is
  // developed on, and the same carriage-return class has produced a
  // per-machine answer in this repository's guards twice before.
  const crlf = goodDoc.replace(/\n/g, "\r\n");
  const { code, out } = runGuard(["--doc", docAt("crlf", crlf)]);
  assert.strictEqual(code, 0, `a Windows checkout must read the same as a Linux one:\n${out}`);
});

check("FIXTURE: the real committed document matches the real code", () => {
  // The positive control for the whole file. Every case above builds its own
  // fixture, so all of them could pass against a repository whose actual
  // document had drifted.
  const { code, out } = runGuard([]);
  assert.strictEqual(code, 0, `docs/ECONOMICS.md has drifted from the code:\n${out}`);
});

fs.rmSync(FIXTURES, { recursive: true, force: true });

console.log(`\n${run} check(s) passed\n`);
