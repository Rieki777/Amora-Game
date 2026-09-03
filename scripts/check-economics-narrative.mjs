#!/usr/bin/env node
/**
 * THE ECONOMY'S CODE MOVED AND docs/ECONOMICS.md DID NOT.
 *
 * `scripts/check-economics-doc.mjs` guards the generated half of that
 * document. This guards the other half, and the other half is most of it: the
 * prose that says why a lock that correctly stops one member racing themselves
 * is what makes the village fail against each other, what a departing member is
 * owed, what a member sees when a spend refuses. None of that can be derived
 * from a switch statement, so none of it can be generated, so nothing but a
 * person can keep it true.
 *
 * What a machine CAN do is refuse to let it go stale in silence. When a file on
 * the ECONOMY SURFACE below changes against the base ref and the document does
 * not change in the same diff, this fails and names the files.
 *
 * ── WHAT THIS GUARD CANNOT DO, STATED PLAINLY ──────────────────────────────
 *
 * It cannot tell whether the words somebody added are TRUE. It cannot tell
 * whether they are ABOUT the change. A one-word edit to the document satisfies
 * it completely. It is a prompt, not a proof, and anybody who reads its green
 * as "the document is correct" has read it wrong. What it buys is that the
 * change and the document are looked at in the same sitting by the same
 * person, which is the only moment the two are cheap to reconcile.
 *
 * ── WHY THE SURFACE IS A LIST AND NOT A PATTERN ────────────────────────────
 *
 * A pattern like `server/lib/*economy*` is unreviewable: nobody can tell from
 * reading it which files are in and which are out, and it silently grows and
 * shrinks as files are renamed. This list is typed out so a reviewer can argue
 * with any entry. Adding a file to it is a deliberate act.
 *
 * ── WHY server/index.ts IS MATCHED BY HUNK AND NOT WHOLE ───────────────────
 *
 * The mint-rule routes, the exit routes, the cycle-close route and the admin
 * mint all live in `server/index.ts`, so the surface genuinely includes them.
 * That file is also the most-edited file in the repository by a wide margin
 * (283 of 962 commits at the time the file-lines ratchet measured it), and
 * almost none of those edits are about the economy. Putting it on the surface
 * whole would fire this guard on nearly every pull request, and a guard that
 * cries wolf on every pull request is a guard somebody deletes or learns to
 * satisfy with a space character.
 *
 * So `server/index.ts` counts only when the CHANGED LINES mention one of the
 * economy symbols in INDEX_SYMBOLS below. That list is as reviewable as the
 * file list, it is matched against the added and removed lines of the diff
 * rather than against the whole file, and it errs toward firing: `postTransfer`
 * and `memberAccount` are on it, and any change touching either of those in
 * that file genuinely is an economy change.
 *
 * ── THE EXIT CODES ─────────────────────────────────────────────────────────
 *
 *   0  the surface did not change, or it changed and so did the document.
 *   1  the surface changed and the document did not. The files are listed.
 *   2  THE CHECK COULD NOT RUN: not a git checkout, git missing, or a base ref
 *      that will not resolve. Never 0. A guard that reports "I could not look"
 *      as "I looked and it was fine" is the failure this repository has
 *      catalogued more than any other, and this one would be especially quiet
 *      about it, because "no files changed" and "I could not read the diff"
 *      produce the same empty list.
 *
 * ── HOW CI SUPPLIES THE BASE REF ───────────────────────────────────────────
 *
 * The same way `scripts/check-migration-compat.mjs` and
 * `scripts/check-migration-numbers.mjs` already get theirs, so ci.yml needs no
 * new plumbing: `actions/checkout@v4` is configured with `fetch-depth: 0`
 * (a shallow clone cannot resolve `origin/main` and both existing guards would
 * already be red), and this resolves, in order:
 *
 *   1. `--base <ref>` on the command line
 *   2. `$ECONOMICS_BASE_REF`
 *   3. `$GITHUB_BASE_REF`, which GitHub sets to the PULL REQUEST'S BASE BRANCH
 *      name on a `pull_request` event, tried as `origin/<name>` then `<name>`
 *   4. `origin/main`, then `main`
 *
 * On a `push` event GITHUB_BASE_REF is empty, so a push to a branch compares
 * against origin/main, which is what a reader of that run wants to know.
 *
 * WHOSE MERGE BASE WINS. The newest one, not the first that resolves. On a CI
 * runner only `origin/main` exists and the two are identical. On a development
 * machine here, where a dozen worktrees share one object store and nothing is
 * pushed for days, local `main` runs ahead of `origin/main`, and taking the
 * first match would compare against a base nobody is merging into. Copied
 * deliberately from check-migration-compat.mjs's `resolveBase`, which found
 * that the hard way.
 *
 * ── WHAT IT READS, AND WHY IT READS THE WORKING TREE TOO ───────────────────
 *
 * Committed changes between the merge base and HEAD, PLUS anything uncommitted
 * in the working tree. CI only ever has the first. A developer running this
 * before committing has only the second, and a guard that told them "clean"
 * and then went red in CI would teach them to ignore it.
 *
 * Usage:
 *   node scripts/check-economics-narrative.mjs
 *   node scripts/check-economics-narrative.mjs --base origin/main
 *   node scripts/check-economics-narrative.mjs --list   print the surface and stop
 */
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

/** The document this guard protects. */
export const DOC = "docs/ECONOMICS.md";

/**
 * ── THE ECONOMY SURFACE ────────────────────────────────────────────────────
 *
 * Every file whose change makes some sentence in docs/ECONOMICS.md possibly
 * wrong. Reviewable on purpose: argue with any line of it.
 *
 * The engine itself. Each of these has at least one section of the document
 * describing what it does in prose that a machine cannot regenerate.
 */
export const SURFACE_FILES = [
  // The mint, the rules, the cycle, the allowance, the occurrence keys.
  "server/lib/economy.ts",
  // postTransfer, the invariants, the account constants, the registry.
  "server/lib/ledger.ts",
  // The sinks, the sending firewall, and every refusal a member reads.
  "server/lib/spending.ts",
  // sweepBalances and the open-state enumeration (section 14).
  "server/lib/exit.ts",
  // The published exit terms, which are what the village owes (section 14).
  // NOT in the brief's list and added deliberately: section 14's central
  // claim, that nothing is decided in code, is a claim about THIS file's
  // DEFAULT_EXIT_POLICY, and it would become false the moment somebody wrote
  // a real valuation method into it.
  "server/lib/exitPolicy.ts",
  // The one-way bridge, the claim states, BRIDGE_DISPATCH_BUILT (section 6).
  "server/lib/voiceClaim.ts",
  // The budgeted send path and the heart door (sections 5 and 10.2).
  "server/lib/gratitude.ts",
  // The seeded rules and their amounts (section 4, section 15).
  "server/lib/economySeed.ts",
  // The ballot keys a governed mint-rule change may move. This is the mint
  // rule route's contract, and it lives in shared/ rather than in a route.
  "shared/mintRuleKeys.ts",
];

/**
 * The token registry migrations, named rather than globbed.
 *
 * Found at 45869ad with:
 *   grep -lE "\b(INTO|UPDATE|TABLE)\s+(IF\s+NOT\s+EXISTS\s+)?`?tokens`?" drizzle/*.sql
 *
 * A NEW migration touching `tokens` is caught by the rule below rather than by
 * this list, which is the point of having both: this list cannot go stale in
 * the direction that matters, because the direction that matters is somebody
 * adding a migration and this list not knowing about it.
 */
export const SURFACE_MIGRATIONS = [
  "drizzle/0006_token_registry.sql",
  "drizzle/0007_village_credits_token.sql",
  "drizzle/0047_example_market.sql",
  "drizzle/0071_economy_core.sql",
  "drizzle/0092_token_sinks.sql",
  "drizzle/0124_the_equity_token_names_no_village.sql",
];

/**
 * ANY migration whose name suggests it touches the registry or the ledger.
 *
 * Deliberately a NAME test and not a content test, because a migration that is
 * added and not yet committed has no content this guard can read from the base
 * ref, and because a name is what a reviewer sees. It is a widening of the
 * list above, never a replacement: a migration named `0155_add_widget.sql`
 * that quietly alters `tokens` is caught by the token doc guard instead, which
 * reads every migration's SQL.
 */
export const MIGRATION_NAME_HINT = /^drizzle\/\d{4}.*(token|ledger|econom|mint|faucet|voice|gratitude|credit).*\.sql$/i;

/**
 * Files matched by HUNK rather than whole. See the header.
 *
 * The value is the list of symbols that make a changed line count. Matched
 * case-sensitively against the added and removed lines of the diff.
 */
export const HUNK_FILES = {
  "server/index.ts": [
    // The mint-rule routes (PATCH /api/admin/economy/rules/:id, and the
    // governed path that lands a ballot).
    "queueRuleChange",
    "applyMintRuleChanges",
    "mintRulesByIds",
    // The mints themselves.
    "mintForConfirmedClaim",
    "runSettlement",
    "startEconomyEpoch",
    "admin_mint",
    "mintedThisCycle",
    "pendingMints",
    "exchange_stock",
    // The cycle close and its pool.
    "gratitude.pool_per_cycle",
    "gratitude.pool_token",
    "gratitude_pool",
    "quest_consent",
    // Exit.
    "sweepBalances",
    "exitOpenState",
    "blockingStates",
    "createExit",
    // Anything that moves value at all, in that file.
    "postTransfer",
    "postTransferPair",
    "memberAccount",
    "CYCLE_POOL_FAUCET",
    "RECOGNITION_FAUCET",
    "MINT_FAUCET",
    "member_send",
    // Units.
    "toLedgerUnits",
    "fromLedgerUnits",
  ],
};

export const EXIT_OK = 0;
export const EXIT_STALE = 1;
export const EXIT_CANNOT_RUN = 2;

const say = (...lines) => process.stdout.write(`${lines.join("\n")}\n`);

/*
 * TRAILING whitespace only, never leading, and this cost a real debugging pass.
 *
 * `git status --porcelain` prefixes every line with a TWO-character status
 * field, and for an unstaged modification the first of those characters is a
 * SPACE: " M server/lib/economy.ts". A `.trim()` on the whole output eats that
 * space off the FIRST line only, so the path parser below then cut one
 * character too many and reported "erver/lib/economy.ts", which matches
 * nothing on the surface. The guard printed "Nothing on the economy surface
 * changed" over a modified economy.ts, which is the exact false green this
 * whole file exists to prevent, and it would have been invisible in CI because
 * CI's working tree is always clean.
 *
 * Caught by check-economics-narrative.test.mjs's uncommitted-change case.
 * `trimEnd` keeps every other caller (rev-parse, merge-base) unchanged, since
 * none of their output begins with whitespace.
 */
function git(args, cwd = ROOT) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) return { ok: false, text: String(r.error.message ?? r.error) };
  if (r.status !== 0) return { ok: false, text: `${r.stderr ?? ""}${r.stdout ?? ""}`.trim() };
  return { ok: true, text: (r.stdout ?? "").trimEnd() };
}

function valueOf(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/**
 * What is the base? Copied from check-migration-compat.mjs's resolveBase for
 * the reasons in the header: the newest merge base wins.
 */
export function resolveBase() {
  const explicit = valueOf("--base") || process.env.ECONOMICS_BASE_REF;
  const candidates = explicit
    ? [explicit]
    : process.env.GITHUB_BASE_REF
      ? [`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF]
      : ["origin/main", "main"];

  const head = git(["rev-parse", "HEAD"]);
  if (!head.ok) return { error: `not a git checkout (git rev-parse HEAD failed: ${head.text})` };

  const found = [];
  for (const ref of candidates) {
    if (!git(["rev-parse", "--verify", `${ref}^{commit}`]).ok) continue;
    const mb = git(["merge-base", "HEAD", ref]);
    if (mb.ok) found.push({ ref, sha: mb.text });
  }
  if (found.length === 0) {
    return {
      error:
        `could not resolve any of: ${candidates.join(", ")}. ` +
        "In CI this means the checkout was shallow (`fetch-depth: 0` is required, and " +
        "check-migration-compat.mjs would be failing for the same reason).",
    };
  }
  let best = found[0];
  for (const c of found.slice(1)) {
    if (git(["merge-base", "--is-ancestor", best.sha, c.sha]).ok) best = c;
  }
  return best;
}

/** Files changed between the base and HEAD, and files dirty in the tree. */
export function changedFiles(baseSha) {
  const committed = git(["diff", "--name-only", `${baseSha}`, "HEAD"]);
  if (!committed.ok) return { error: `git diff against ${baseSha.slice(0, 8)} failed: ${committed.text}` };

  // Staged, unstaged and untracked, all at once. `--porcelain` prefixes each
  // line with a two-character status, so the path starts at column 3; a rename
  // reads `R  old -> new` and the NEW path is the one that matters.
  const dirty = git(["status", "--porcelain"]);
  if (!dirty.ok) return { error: `git status failed: ${dirty.text}` };

  const set = new Map();
  for (const f of committed.text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    set.set(f, "committed");
  }
  /*
   * Parsed with a regex that ASSERTS the shape rather than slicing a fixed
   * width, and a line that does not match is an ERROR rather than a skip.
   *
   * Slicing three characters is what let the trimmed leading space (see the
   * note on git() above) silently truncate a path into something that matched
   * nothing. A parser that cannot read a line has to say so, because the
   * alternative is a file quietly falling off the surface.
   */
  for (const raw of dirty.text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const m = /^(..) (.+)$/.exec(line);
    if (!m) {
      return {
        error:
          `git status printed a line this parser cannot read: ${JSON.stringify(line)}. ` +
          "Refusing to guess at a path, because a misread path matches nothing on the surface " +
          "and would read as a clean run.",
      };
    }
    let p = m[2].trim();
    const arrow = p.indexOf(" -> ");
    if (arrow !== -1) p = p.slice(arrow + 4).trim();
    p = p.replace(/^"(.*)"$/, "$1");
    if (!set.has(p)) set.set(p, "working tree");
  }
  return { files: set };
}

/**
 * Did the changed lines of a hunk-matched file mention an economy symbol?
 *
 * `-U0` so only changed lines are read, never their context: a change three
 * lines away from `postTransfer` is not a change to it, and counting context
 * would put this file back to firing on every pull request.
 *
 * A file that is dirty in the working tree is diffed against HEAD as well, so
 * an uncommitted edit is read the same way a committed one is.
 */
export function hunkMentions(file, symbols, baseSha) {
  const seen = new Set();
  const scan = (text) => {
    for (const line of text.split("\n")) {
      if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue;
      const body = line.slice(1);
      for (const s of symbols) if (body.includes(s)) seen.add(s);
    }
  };
  const committed = git(["diff", "-U0", baseSha, "HEAD", "--", file]);
  if (!committed.ok) return { error: `git diff -U0 for ${file} failed: ${committed.text}` };
  scan(committed.text);
  const working = git(["diff", "-U0", "HEAD", "--", file]);
  // A path that is untracked has no HEAD side; that is not an error worth
  // stopping for, and the committed diff above already spoke.
  if (working.ok) scan(working.text);
  return { symbols: Array.from(seen).sort() };
}

function main() {
  if (process.argv.includes("--list")) {
    say(
      `The ECONOMY SURFACE guarded against ${DOC}:`,
      "",
      "  whole files:",
      ...SURFACE_FILES.map((f) => `    ${f}`),
      "",
      "  token registry migrations:",
      ...SURFACE_MIGRATIONS.map((f) => `    ${f}`),
      `    plus any drizzle/*.sql matching ${MIGRATION_NAME_HINT}`,
      "",
      "  matched by changed line, not by file:",
      ...Object.entries(HUNK_FILES).map(
        ([f, syms]) => `    ${f}  (${syms.length} symbol(s): ${syms.join(", ")})`,
      ),
    );
    return EXIT_OK;
  }

  const base = resolveBase();
  if (base.error) {
    say(
      "check-economics-narrative could not decide what to compare against, so it did not run.",
      "",
      `  ${base.error}`,
      "",
      "Exit 2, never 0: 'no files changed' and 'I could not read the diff' produce the same",
      "empty list, and reporting the second as the first is how a guard stops guarding.",
    );
    return EXIT_CANNOT_RUN;
  }

  const changed = changedFiles(base.sha);
  if (changed.error) {
    say(
      "check-economics-narrative could not read the diff, so it did not run.",
      "",
      `  base: ${base.ref} @ ${base.sha.slice(0, 8)}`,
      `  ${changed.error}`,
      "",
      "Exit 2: this is the guard failing, not the document failing.",
    );
    return EXIT_CANNOT_RUN;
  }

  const hits = [];
  for (const [file, where] of changed.files) {
    if (SURFACE_FILES.includes(file)) {
      hits.push({ file, why: "on the economy surface", where });
      continue;
    }
    if (SURFACE_MIGRATIONS.includes(file)) {
      hits.push({ file, why: "a token registry migration", where });
      continue;
    }
    if (MIGRATION_NAME_HINT.test(file)) {
      hits.push({ file, why: "a migration named for the registry or the ledger", where });
      continue;
    }
    if (HUNK_FILES[file]) {
      const m = hunkMentions(file, HUNK_FILES[file], base.sha);
      if (m.error) {
        say(
          "check-economics-narrative could not read a hunk, so it did not run.",
          "",
          `  ${m.error}`,
          "",
          "Exit 2: this is the guard failing, not the document failing.",
        );
        return EXIT_CANNOT_RUN;
      }
      if (m.symbols.length) {
        hits.push({ file, why: `changed lines mention ${m.symbols.join(", ")}`, where });
      }
    }
  }

  const docChanged = changed.files.has(DOC);

  if (!hits.length) {
    say(
      `Economics narrative guard passed. Nothing on the economy surface changed against ` +
        `${base.ref} @ ${base.sha.slice(0, 8)} ` +
        `(${changed.files.size} file(s) changed in total, ${SURFACE_FILES.length} whole-file surface ` +
        `entries and ${Object.keys(HUNK_FILES).length} hunk-matched file(s) examined).`,
    );
    return EXIT_OK;
  }

  if (docChanged) {
    say(
      `Economics narrative guard passed. ${hits.length} economy surface file(s) changed against ` +
        `${base.ref} @ ${base.sha.slice(0, 8)}, and ${DOC} changed with them:`,
      "",
      ...hits.map((h) => `  ${h.file}  (${h.why}, ${h.where})`),
      "",
      "This guard cannot tell whether what you wrote is true or even related. It only",
      "insists that somebody looked at the document in the same sitting.",
    );
    return EXIT_OK;
  }

  say(
    `${DOC} did not change, and ${hits.length} file(s) on the economy surface did.`,
    "",
    `  base: ${base.ref} @ ${base.sha.slice(0, 8)}`,
    "",
    "The files, and why each one counts:",
    ...hits.map((h) => `  ${h.file}\n      ${h.why}, changed in the ${h.where}`),
    "",
    `${DOC} describes every one of those in prose that no generator can rebuild:`,
    "the spend side, the exit path, the worked examples, the failure modes a member meets.",
    "A change to the code above makes some sentence in it possibly wrong, and nothing else",
    "in this repository will ever say so.",
    "",
    "What to do:",
    `  1. Read the sections of ${DOC} that name the file you changed.`,
    "  2. Correct what is now wrong, or add what is now missing.",
    "  3. If the change genuinely does not touch anything the document claims, say so in",
    "     the document: one line in the section it belongs to is cheaper than the next",
    "     person trusting a stale paragraph.",
    "",
    "If a generated region is what needs updating, run:",
    "    node scripts/generate-economics-doc.mjs",
    "",
    "The surface is listed at the top of this script and with --list. If a file is on it",
    "that should not be, that is a change to argue for in review, not a flag to pass.",
  );
  return EXIT_STALE;
}

/*
 * Run as a gate only when invoked directly. Imported (by its own self-test,
 * which reads SURFACE_FILES to prove every entry is a real file and every one
 * of them fires) this is a library of lists with no side effects.
 *
 * scripts/check-identity-keys.mjs carries the same line for the same reason.
 * Without it, importing this module runs the gate and calls process.exit, and
 * the self-test dies before its first assertion with the gate's own output,
 * which reads exactly like a passing run.
 */
const SELF = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === SELF;

if (invokedDirectly) {
  /*
   * The last exit path, and the one that matters most. Anything that escapes
   * main() is a check that did not finish, so it can never be 0, and it is not
   * 1 either: without this the process would exit 1 on an uncaught throw,
   * which reads in CI exactly like "the document went stale" and sends the
   * next person to edit a document that was never the problem.
   */
  try {
    process.exit(main());
  } catch (err) {
    process.stdout.write(
      [
        "check-economics-narrative.mjs did not finish, so it is making no claim about the document.",
        "",
        String(err?.stack ?? err?.message ?? err),
        "",
        "Exit 2: this is the guard failing, not the document failing.",
        "",
      ].join("\n"),
    );
    process.exit(EXIT_CANNOT_RUN);
  }
}
