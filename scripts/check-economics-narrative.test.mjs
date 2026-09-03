/**
 * The economics narrative guard's own guard.
 *
 * This one needs a REAL git repository to prove anything, because everything
 * the guard does is a git question: what is the base, what changed against it,
 * and did the document change too. So each case below runs `git init` in a
 * fresh temp directory, commits a small tree, makes a specific change, copies
 * the guard in, and reads the real exit code out of a child process.
 *
 * ── WHAT IS BEING PROVED ───────────────────────────────────────────────────
 *
 * IT REFUSES. Changing `server/lib/economy.ts` alone fails, and names the file.
 *
 * IT DOES NOT CRY WOLF. Changing economy.ts AND the document passes; changing
 * nothing passes; changing a file that is not on the surface passes. A guard
 * that fired on everything would be satisfied with a space character within a
 * week, which is worse than no guard because it would look like one.
 *
 * IT SAYS WHEN IT COULD NOT LOOK. An unresolvable base ref is exit 2, never 0
 * and never 1. This is the case that matters most and it is the easiest to get
 * wrong, because "no files changed" and "I could not read the diff" both
 * produce an empty list, and a guard that reports the second as the first has
 * silently stopped guarding while still printing green.
 *
 * THE HUNK RULE IS PROVED IN BOTH DIRECTIONS. `server/index.ts` is on the
 * surface only when its CHANGED LINES mention an economy symbol. Both halves
 * are asserted here, because a hunk rule that always matched would be the
 * whole-file rule that was deliberately rejected, and one that never matched
 * would silently drop the mint-rule routes off the surface entirely.
 *
 * ── ENVIRONMENT ────────────────────────────────────────────────────────────
 *
 * GITHUB_BASE_REF and ECONOMICS_BASE_REF are CLEARED for every child process.
 * CI sets the first on every pull_request event, and a test whose base
 * resolution changed depending on where it ran would be worse than no test.
 *
 * Run: node scripts/check-economics-narrative.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DOC,
  HUNK_FILES,
  MIGRATION_NAME_HINT,
  SURFACE_FILES,
  SURFACE_MIGRATIONS,
} from "./check-economics-narrative.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, "check-economics-narrative.mjs");
const REPO_ROOT = path.resolve(HERE, "..");

let run = 0;
const check = (name, fn) => {
  fn();
  run += 1;
  console.log(`  PASS  ${name}`);
};

console.log("\ncheck-economics-narrative: the code moved and the document did not\n");

// ── The surface list is a list of real files ───────────────────────────────

check("every whole-file surface entry exists in this repository", () => {
  // A surface entry that has been renamed away silently stops guarding
  // anything, and nothing else would ever say so: the guard would keep
  // passing, for the reason that it can no longer see the file.
  for (const rel of SURFACE_FILES) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, rel)),
      `${rel} is on the economy surface and is not on disk. Either it moved (update the ` +
        "list in check-economics-narrative.mjs) or it went (remove it deliberately).",
    );
  }
});

check("every named token registry migration exists", () => {
  for (const rel of SURFACE_MIGRATIONS) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `${rel} is named on the surface and is not on disk`);
  }
});

check("the named migrations really are the ones that write the tokens table", () => {
  // The list was found with a grep. This re-runs that grep so a NEW migration
  // touching `tokens` cannot sit outside the list unnoticed.
  const dir = path.join(REPO_ROOT, "drizzle");
  const writes = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /\b(INTO|UPDATE|TABLE)\s+(IF\s+NOT\s+EXISTS\s+)?`?tokens`?(?![\w-])/i.test(fs.readFileSync(path.join(dir, f), "utf8")))
    .map((f) => `drizzle/${f}`)
    .sort();
  const missing = writes.filter((f) => !SURFACE_MIGRATIONS.includes(f) && !MIGRATION_NAME_HINT.test(f));
  assert.deepStrictEqual(
    missing,
    [],
    "these migrations write the tokens table and are on neither the named list nor caught by the " +
      "name pattern in check-economics-narrative.mjs",
  );
});

check("the migration name pattern catches a new registry migration", () => {
  assert.ok(MIGRATION_NAME_HINT.test("drizzle/0199_new_token_thing.sql"));
  assert.ok(MIGRATION_NAME_HINT.test("drizzle/0200_ledger_repair.sql"));
  // And does NOT catch an unrelated one, or the pattern is the whole directory.
  assert.ok(!MIGRATION_NAME_HINT.test("drizzle/0201_add_place_photos.sql"));
});

check("the hunk symbol list names the mint-rule routes it exists for", () => {
  const syms = HUNK_FILES["server/index.ts"];
  assert.ok(syms, "server/index.ts must be hunk-matched, or the mint-rule routes are off the surface");
  for (const needed of ["queueRuleChange", "applyMintRuleChanges", "sweepBalances", "postTransfer"]) {
    assert.ok(syms.includes(needed), `${needed} must be in the hunk symbol list`);
  }
});

// ── The gate, against real git repositories ────────────────────────────────

const FIXTURES = fs.mkdtempSync(path.join(os.tmpdir(), "economics-narrative-test-"));

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.strictEqual(
    r.status,
    0,
    `git ${args.join(" ")} failed in the fixture:\n${r.stdout ?? ""}${r.stderr ?? ""}`,
  );
  return (r.stdout ?? "").trim();
}

/**
 * A tiny repository with the guard in it and one commit of every file the
 * surface names, so a later edit is a real diff against a real base.
 */
function newRepo(label) {
  const root = path.join(FIXTURES, label);
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(GUARD, path.join(root, "scripts", "check-economics-narrative.mjs"));

  const write = (rel, body) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  write(DOC, "# the document\n\nthe prose that has to be kept true\n");
  for (const rel of SURFACE_FILES) write(rel, `// a stand-in for ${rel}\nexport const x = 1;\n`);
  write("server/index.ts", "// a stand-in\nconst a = 1;\nconst b = 2;\n");
  write("README.md", "not on the surface\n");
  write(SURFACE_MIGRATIONS[0], "-- a stand-in migration\n");

  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "guard-self-test@example.invalid"]);
  git(root, ["config", "user.name", "guard self test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  git(root, ["checkout", "-q", "-b", "work"]);
  return { root, base, write };
}

/**
 * Run the guard inside a fixture repo.
 *
 * The env is scrubbed of both base-ref variables: CI sets GITHUB_BASE_REF on
 * every pull_request event, and a self-test whose answer depended on where it
 * ran would prove nothing about either place.
 */
function runGuard(repo, args = []) {
  const env = { ...process.env };
  delete env.GITHUB_BASE_REF;
  delete env.ECONOMICS_BASE_REF;
  const r = spawnSync(
    process.execPath,
    [path.join(repo.root, "scripts", "check-economics-narrative.mjs"), ...args],
    { cwd: repo.root, encoding: "utf8", env },
  );
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const commitAll = (repo, message) => {
  git(repo.root, ["add", "-A"]);
  git(repo.root, ["commit", "-m", message]);
};

check("FIXTURE: nothing changed at all exits 0", () => {
  const repo = newRepo("nochange");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 0, out);
  assert.match(out, /Nothing on the economy surface changed/);
});

check("FIXTURE: a file OFF the surface changed, alone, exits 0", () => {
  // The wolf-crying case. If this ever goes red the guard is a whole-repo
  // guard wearing a surface list.
  const repo = newRepo("offsurface");
  repo.write("README.md", "edited, and nothing to do with the economy\n");
  commitAll(repo, "docs: readme");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 0, out);
  assert.match(out, /Nothing on the economy surface changed/);
});

check("FIXTURE: economy.ts changed and the document did NOT exits 1, naming the file", () => {
  const repo = newRepo("stale");
  repo.write("server/lib/economy.ts", "// changed\nexport const x = 2;\n");
  commitAll(repo, "feat: change the mint");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 1, out);
  assert.match(out, new RegExp(`${DOC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} did not change`));
  assert.match(out, /server\/lib\/economy\.ts/, "the guard must name the file that moved");
  assert.match(out, /on the economy surface/);
});

check("FIXTURE: economy.ts AND the document changed exits 0", () => {
  const repo = newRepo("both");
  repo.write("server/lib/economy.ts", "// changed\nexport const x = 2;\n");
  repo.write(DOC, "# the document\n\nthe prose, updated for the change\n");
  commitAll(repo, "feat: change the mint, and say so");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 0, out);
  assert.match(out, /changed with them/);
  // The guard must be honest about what its own green means.
  assert.match(out, /cannot tell whether what you wrote is true/);
});

check("FIXTURE: an UNCOMMITTED change to economy.ts is caught too", () => {
  // A developer who runs this before committing must get the same answer CI
  // will give them, or they learn to ignore it.
  const repo = newRepo("dirty");
  repo.write("server/lib/economy.ts", "// changed but never committed\n");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 1, out);
  assert.match(out, /working tree/, "the guard must say the change is uncommitted");
});

check("FIXTURE: every whole-file surface entry actually fires", () => {
  // One case per entry. A list nobody exercises is a list where one typo
  // silently removes a file from the surface forever.
  for (const rel of SURFACE_FILES) {
    const repo = newRepo(`each-${rel.replace(/[\\/.]/g, "_")}`);
    repo.write(rel, "// changed\nexport const x = 2;\n");
    commitAll(repo, `feat: touch ${rel}`);
    const { code, out } = runGuard(repo, ["--base", "main"]);
    assert.strictEqual(code, 1, `${rel} is on the surface but did not fire:\n${out}`);
    assert.ok(out.includes(rel), `${rel} fired but was not named in the output`);
  }
});

check("FIXTURE: a named token registry migration fires", () => {
  const repo = newRepo("migration");
  repo.write(SURFACE_MIGRATIONS[0], "-- edited\n");
  commitAll(repo, "chore: touch a registry migration");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 1, out);
  assert.match(out, /a token registry migration/);
});

check("FIXTURE: a NEW migration named for the registry fires without being listed", () => {
  const repo = newRepo("newmigration");
  repo.write("drizzle/0999_a_new_token_thing.sql", "-- brand new\n");
  commitAll(repo, "feat: a new token migration");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 1, out);
  assert.match(out, /named for the registry or the ledger/);
});

check("FIXTURE: HUNK RULE fires when a changed line mentions an economy symbol", () => {
  const repo = newRepo("hunk-hit");
  repo.write("server/index.ts", "// a stand-in\nconst a = 1;\nawait postTransfer(pool, {});\n");
  commitAll(repo, "feat: post a transfer from the server file");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 1, out);
  assert.match(out, /server\/index\.ts/);
  assert.match(out, /changed lines mention postTransfer/);
});

check("FIXTURE: HUNK RULE stays quiet when the changed lines are unrelated", () => {
  // The whole reason server/index.ts is hunk-matched. If this goes red, the
  // guard fires on nearly every pull request in the repository and will be
  // satisfied with a space character within a week.
  const repo = newRepo("hunk-miss");
  repo.write("server/index.ts", "// a stand-in\nconst a = 1;\nconst c = 3;\n");
  commitAll(repo, "chore: an unrelated line in the server file");
  const { code, out } = runGuard(repo, ["--base", "main"]);
  assert.strictEqual(code, 0, `an unrelated edit to server/index.ts must not fire:\n${out}`);
});

check("FIXTURE: HUNK RULE reads changed lines, not their CONTEXT", () => {
  // `-U0` is what makes this true. With any context at all, an edit three
  // lines away from a postTransfer call would count, and in a 28,000 line file
  // almost every edit is three lines away from something.
  const repo = newRepo("hunk-context");
  repo.write(
    "server/index.ts",
    ["// a stand-in", "await postTransfer(pool, {});", "const a = 1;", "const b = 2;"].join("\n"),
  );
  commitAll(repo, "base: a file that already mentions postTransfer");
  const withContext = git(repo.root, ["rev-parse", "HEAD"]);
  repo.write(
    "server/index.ts",
    ["// a stand-in", "await postTransfer(pool, {});", "const a = 1;", "const b = 99;"].join("\n"),
  );
  commitAll(repo, "chore: edit a line NEXT TO the transfer, not the transfer");
  const { code, out } = runGuard(repo, ["--base", withContext]);
  assert.strictEqual(code, 0, `only the CHANGED line may count, not its neighbours:\n${out}`);
});

check("FIXTURE: a base ref that does not resolve exits 2, and says so", () => {
  // THE CASE THIS FILE EXISTS FOR. Not 0, because nothing was examined; not 1,
  // because the document is not what failed.
  const repo = newRepo("nobase");
  const { code, out } = runGuard(repo, ["--base", "origin/a-branch-that-was-never-pushed"]);
  assert.strictEqual(code, 2, `an unresolvable base must be 2, got ${code}:\n${out}`);
  assert.match(out, /could not decide what to compare against/);
  assert.match(out, /origin\/a-branch-that-was-never-pushed/);
  assert.match(out, /Exit 2, never 0/);
});

check("FIXTURE: with NO base ref resolvable at all, it exits 2 rather than passing", () => {
  // A fixture on a branch called `work` with no `origin` and no `main`: the
  // default candidate list finds nothing. A shallow CI checkout looks exactly
  // like this, which is why it must be loud.
  const root = path.join(FIXTURES, "orphan");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(GUARD, path.join(root, "scripts", "check-economics-narrative.mjs"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, DOC), "# doc\n");
  git(root, ["init", "-b", "solo"]);
  git(root, ["config", "user.email", "guard-self-test@example.invalid"]);
  git(root, ["config", "user.name", "guard self test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "only commit"]);
  const { code, out } = runGuard({ root });
  assert.strictEqual(code, 2, `no resolvable base must be 2, got ${code}:\n${out}`);
  assert.match(out, /could not resolve any of: origin\/main, main/);
});

check("FIXTURE: outside a git checkout entirely, it exits 2", () => {
  const root = path.join(FIXTURES, "notgit");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(GUARD, path.join(root, "scripts", "check-economics-narrative.mjs"));
  const { code, out } = runGuard({ root });
  assert.strictEqual(code, 2, `no git checkout must be 2, got ${code}:\n${out}`);
  assert.match(out, /did not run/);
});

check("FIXTURE: ECONOMICS_BASE_REF is honoured when no flag is given", () => {
  const repo = newRepo("envbase");
  repo.write("server/lib/economy.ts", "// changed\n");
  commitAll(repo, "feat: change the mint");
  const env = { ...process.env, ECONOMICS_BASE_REF: "main" };
  delete env.GITHUB_BASE_REF;
  const r = spawnSync(
    process.execPath,
    [path.join(repo.root, "scripts", "check-economics-narrative.mjs")],
    { cwd: repo.root, encoding: "utf8", env },
  );
  assert.strictEqual(r.status, 1, `${r.stdout}${r.stderr}`);
});

check("FIXTURE: GITHUB_BASE_REF is honoured, which is how CI supplies the base", () => {
  // GitHub sets this to the pull request's BASE BRANCH NAME on a
  // pull_request event. The guard tries `origin/<name>` first and falls back
  // to the bare name, which is what makes it work in a fixture with no remote.
  const repo = newRepo("ghbase");
  repo.write("server/lib/economy.ts", "// changed\n");
  commitAll(repo, "feat: change the mint");
  const env = { ...process.env, GITHUB_BASE_REF: "main" };
  delete env.ECONOMICS_BASE_REF;
  const r = spawnSync(
    process.execPath,
    [path.join(repo.root, "scripts", "check-economics-narrative.mjs")],
    { cwd: repo.root, encoding: "utf8", env },
  );
  assert.strictEqual(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(`${r.stdout}`, /base: main @/);
});

check("FIXTURE: --list prints the surface and exits 0 without judging anything", () => {
  const repo = newRepo("list");
  repo.write("server/lib/economy.ts", "// changed and NOT documented\n");
  commitAll(repo, "feat: change the mint");
  const { code, out } = runGuard(repo, ["--list"]);
  assert.strictEqual(code, 0, out);
  assert.match(out, /The ECONOMY SURFACE/);
  for (const rel of SURFACE_FILES) assert.ok(out.includes(rel), `--list must print ${rel}`);
  assert.match(out, /matched by changed line, not by file/);
});

fs.rmSync(FIXTURES, { recursive: true, force: true });

console.log(`\n${run} check(s) passed\n`);
