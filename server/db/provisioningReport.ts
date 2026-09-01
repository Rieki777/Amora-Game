/**
 * What provisioning costs, printed at the end of every run that pays it.
 *
 * The cost was invisible and it grew silently. `vitest.config.ts` documents
 * provisioning as "GROWS WITH EVERY MIGRATION ANYONE ADDS" and it was right:
 * 87 migration files, 44 provisions per full run, about 12s each on a local
 * MySQL and about 7.5s on a CI runner, which is roughly five minutes of every
 * CI run spent replaying the same migrations forty-four times. Nothing printed
 * that number, so the only symptom was a job that crept toward the
 * fifteen-minute cap and one that was cancelled at it.
 *
 * `server/db/testDb.ts` now builds the schema ONCE per (migration set,
 * collation) and hands each suite a clone. This module is the receipt. Each
 * provision appends one line here; vitest's globalSetup prints the totals when
 * the run ends, including the per-migration cost, so the next person who adds
 * ten migrations reads the price in their own terminal.
 *
 * The log lives under `node_modules/.cache/` deliberately: every worker
 * process can find it with no environment variable to propagate, it is already
 * gitignored, and it is per-worktree, so two lanes running at once do not
 * write into each other's numbers.
 */
/*
 * WHY THIS FILE LOADS dotenv ITSELF.
 *
 * `vitest.config.ts` loads `.env` through `setupFiles`, and setupFiles run in
 * the WORKER processes. globalSetup and globalTeardown run in the MAIN
 * process, which never sees them. So this module read `process.env` and found
 * nothing, and the first version of the guard below announced that
 * TEST_DATABASE_URL was unset on a machine whose .env sets it.
 *
 * That is the same trapdoor as any standalone script here: dotenv is loaded by
 * vitest's setupFiles and by nothing else, so anything running outside a worker
 * inherits the silent-skip state it is trying to detect.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { assertFreshDist } from "./distFreshness";

export const PROVISION_LOG = path.resolve(
  process.cwd(),
  "node_modules",
  ".cache",
  "village-provisioning.jsonl",
);

export type ProvisionKind =
  /** The one full migration run that builds a template. */
  | "template"
  /** A scratch schema copied from a template. */
  | "clone"
  /** A scratch schema that ran every migration itself (no template available). */
  | "full";

export interface ProvisionRecord {
  kind: ProvisionKind;
  ms: number;
  migrations: number;
}

/** Bookkeeping only. A failure here never fails a suite. */
export function noteProvision(rec: ProvisionRecord): void {
  try {
    fs.mkdirSync(path.dirname(PROVISION_LOG), { recursive: true });
    fs.appendFileSync(PROVISION_LOG, `${JSON.stringify(rec)}\n`);
  } catch {
    /* a run with no writable cache directory still runs its tests */
  }
}

export function readProvisionLog(): ProvisionRecord[] {
  try {
    return fs
      .readFileSync(PROVISION_LOG, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ProvisionRecord)
      .filter((r) => r && typeof r.ms === "number" && typeof r.kind === "string");
  } catch {
    return [];
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The lines vitest prints at the end of a run. Exported separately from
 * `teardown` so `scripts/measure-provisioning.mjs` and the harness test can
 * check the arithmetic without spawning a suite.
 */
export function summarise(rows: ProvisionRecord[]): string[] {
  if (rows.length === 0) return [];
  const templates = rows.filter((r) => r.kind === "template");
  const clones = rows.filter((r) => r.kind === "clone");
  const fulls = rows.filter((r) => r.kind === "full");
  const sum = (rs: ProvisionRecord[]) => rs.reduce((a, r) => a + r.ms, 0);
  const migrations = Math.max(...rows.map((r) => r.migrations || 0), 0);
  const total = sum(rows);
  // What the same run cost before templates existed: every provision paid a
  // full migration run, and a full run is what a template build still is.
  const perFullRun =
    templates.length > 0
      ? sum(templates) / templates.length
      : fulls.length > 0
        ? sum(fulls) / fulls.length
        : 0;
  /** Scratch schemas handed to suites. Template builds are overhead, never a schema a suite uses. */
  const provisions = clones.length + fulls.length;
  const oldWay = perFullRun * Math.max(provisions, 1);
  const perMigration = migrations > 0 && perFullRun > 0 ? Math.round(perFullRun / migrations) : 0;

  const out = [
    "",
    "provisioning, this run",
    `  migration files        ${migrations}`,
    `  template builds        ${templates.length}, ${seconds(sum(templates))}`,
    `  scratch clones         ${clones.length}, ${seconds(sum(clones))}`,
    `  full migration runs    ${fulls.length}, ${seconds(sum(fulls))}`,
    `  total                  ${seconds(total)}`,
  ];
  if (perFullRun > 0) {
    out.push(
      `  one full run costs     ${seconds(perFullRun)} (${perMigration}ms per migration file)`,
      `  without templates      ${provisions} x ${seconds(perFullRun)} = ${seconds(oldWay)}`,
      `  so one new migration   adds about ${perMigration}ms per run, once, in place of ${provisions} times`,
    );
  } else {
    // Zero template builds means the template was already on the server from an
    // earlier run, so this run has no full-run timing of its own to compare
    // against. Say that, because a summary that just stops looks like a bug.
    out.push(
      "  template               reused from an earlier run, so nothing here timed a full migration run",
      "  for the comparison     pnpm measure:provisioning (it drops the template first, then times both)",
    );
  }
  if (fulls.length > 0) {
    out.push(
      "  NOTE: a full migration run per suite means the template was unavailable. Read the",
      "  [testDb] warning above it: that is the five minutes this mechanism exists to save.",
    );
  }
  return out;
}

/**
 * vitest globalSetup: start each run with an empty ledger, and refuse a run
 * whose built bundle is not the code in the tree.
 *
 * The freshness check is here rather than in 42 beforeAll hooks because here
 * it runs ONCE, before any file loads, and fails in under a second with one
 * message naming the offending source file. See ./distFreshness for what it
 * compares and, more importantly, what it deliberately does not.
 */
export async function setup(): Promise<void> {
  try {
    fs.mkdirSync(path.dirname(PROVISION_LOG), { recursive: true });
    fs.writeFileSync(PROVISION_LOG, "");
  } catch {
    /* see noteProvision */
  }
  assertFreshDist();
  warnOnRuntimeMismatch();
}

/**
 * One line when this Node is not the Node that decides.
 *
 * `.node-version` says 22 and ci.yml pins 22. package.json has no `engines`
 * field, nothing reads process.version, and the machine this is developed on
 * runs a different major. So every local gate runs on a runtime CI does not
 * use, and a dependency whose behaviour differs across that gap builds green
 * here and red there with no local signal at all.
 *
 * Not a refusal: `engines` plus engine-strict would block every run on this
 * machine today and be routed around within the hour. A warning that appears
 * on every run gets read; a paragraph in a document gets read once.
 */
function warnOnRuntimeMismatch(): void {
  try {
    const pinned = fs.readFileSync(path.resolve(process.cwd(), ".node-version"), "utf8").trim();
    const want = pinned.replace(/^v/, "").split(".")[0];
    const have = process.version.replace(/^v/, "").split(".")[0];
    if (!want || want === have) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[runtime] Node ${process.version}, but this repository pins ${pinned} (.node-version) ` +
        `and CI decides on ${pinned}. A green run here is not a green run there.`,
    );
  } catch {
    /* no .node-version, nothing to compare against */
  }
}

/**
 * The trapdoor this closes: dozens of suites gate on
 * `describe.skipIf(!testDbConfigured())` (server/db/testDb.ts), which is a
 * bare truthiness check on TEST_DATABASE_URL. Locally that is correct and
 * must stay silent: no database, a smaller suite, still green. In CI,
 * `.github/workflows/ci.yml` sets TEST_DATABASE_URL as a job env var, so
 * every DB-backed suite is expected to run there. If that variable is ever
 * renamed, mistyped, or dropped in a workflow edit, `testDbConfigured()`
 * quietly returns false, every one of those suites skips, and vitest still
 * exits 0: the acceptance loop test, every routes e2e suite and the whole
 * economy suite gone with nothing louder than a skip count in a wall of
 * green. `noteProvision` (above) already records one line per schema this
 * run actually provisioned; a CI run that provisioned zero is that trapdoor,
 * not a fast run, so it must fail the build rather than just report a number
 * nobody is obligated to read.
 */

/**
 * A live count, not a number frozen into this file the day it was written
 * and wrong a month later. Every `describe.skipIf` in this tree today gates
 * on `testDbConfigured()`; there is no other reason a whole describe block
 * is conditionally skipped here, so counting the call site is an exact
 * stand-in for "how many suites just went dark", read from the tree that
 * actually ran rather than asserted from memory.
 */
function countDbGatedSuites(): { guards: number; files: number } {
  const SKIP_RE = /describe\.skipIf\(/g;
  const TEST_FILE_RE = /\.test\.tsx?$/;
  let count = 0;
  let files = 0;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a root that does not exist contributes nothing, not a crash
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!TEST_FILE_RE.test(entry.name)) continue;
      try {
        const hits = fs.readFileSync(full, "utf8").match(SKIP_RE);
        if (hits) {
          count += hits.length;
          files += 1;
        }
      } catch {
        /* an unreadable file does not change the count meaningfully here */
      }
    }
  };
  for (const root of ["server", "shared", "client"]) walk(path.resolve(process.cwd(), root));
  return { guards: count, files };
}

/**
 * What a run that provisioned NOTHING has to say for itself.
 *
 * The receipt used to go quiet here: `summarise([])` returns no lines, so the
 * one run whose composition a reader most needs to know about printed less
 * than any other. The only signal that a local run had been hollow was the
 * ABSENCE of a skip clause on vitest's summary line, which is a fact you have
 * to notice is missing. This prints instead, always, and it prints AFTER
 * vitest's own summary, so it is the last thing on screen.
 */
/**
 * Did the caller ask for a SUBSET of the suite?
 *
 * The zero-provision guard below is a statement about a whole run. A single
 * non-database file run on its own legitimately provisions nothing, and the
 * guard firing there would be a false red, which is the failure mode this
 * whole lane exists to remove rather than to add. So the guard applies to an
 * unfiltered run only, read from the main process's own argv.
 *
 * A flag's VALUE (`--exclude <glob>`) reads as a filter here, which is the
 * safe direction: it relaxes a guard on a run that was already a subset.
 */
function runIsFiltered(): boolean {
  const argv = process.argv.slice(2);
  const start = argv.indexOf("run");
  const rest = start === -1 ? argv : argv.slice(start + 1);
  return rest.some((a, i) => !a.startsWith("-") && !(i > 0 && rest[i - 1]!.startsWith("-")));
}

function hollowRunReport(): string[] {
  const { guards, files } = countDbGatedSuites();
  const head = ["", "provisioning, this run", "  scratch schemas        0"];
  if (process.env.TEST_DATABASE_URL) {
    // The variable is set and nothing asked for a schema. On a filtered run
    // that is ordinary; on a whole run the guard below has already thrown.
    return [
      ...head,
      "  reason                 no database-backed file ran (a filtered run, or none of them matched)",
      `  not run                ${files} database-gated files (${guards} guarded describe blocks)`,
    ];
  }
  return [
    ...head,
    `  database-gated files   ${files} (${guards} guarded describe blocks) did not run`,
    "  why                    TEST_DATABASE_URL is unset, so testDbConfigured() is false",
    "  what that costs        roughly a third of this suite, the ledger and every route among it",
    "  to run them            set TEST_DATABASE_URL in .env (see .env.example) and run again",
    "  to make this a failure REQUIRE_TEST_DB=1, which is what `pnpm test:full` does and what CI is",
  ];
}

/** vitest globalTeardown: print what the run paid, and refuse to stay green when a run that was REQUIRED to touch the database never did. */
export async function teardown(): Promise<void> {
  const rows = readProvisionLog();
  const provisions = rows.filter((r) => r.kind === "clone" || r.kind === "full").length;
  const lines = provisions === 0 ? hollowRunReport() : summarise(rows);
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  try {
    fs.rmSync(PROVISION_LOG, { force: true });
  } catch {
    /* see noteProvision */
  }
  /*
   * WHO IS OBLIGED TO TOUCH THE DATABASE.
   *
   * Gating on `process.env.CI` alone put the exact population that produced
   * this project's false greens (a founder, a contributor, an agent in a
   * worktree) on the silent side of the guard, because GitHub sets CI and a
   * laptop does not. So intent gets its own switch and CI stays one way of
   * expressing it. `pnpm test:full` sets REQUIRE_TEST_DB=1; a bare `pnpm test`
   * on a machine with no MySQL still skips, still exits 0, and now says so in
   * words (hollowRunReport, above) rather than by omission.
   *
   * The guard keeps measuring PROVISIONS rather than the variable, on purpose:
   * that also catches a variable that is set and a database that is
   * unreachable, and it needs no maintenance when files are added.
   */
  const mustHaveRun = !!(process.env.CI || process.env.REQUIRE_TEST_DB);
  if (mustHaveRun && !process.env.TEST_DATABASE_URL) {
    const { guards, files } = countDbGatedSuites();
    throw new Error(
      `[provisioningReport] this run was required to touch the database ` +
        `(${process.env.CI ? "CI is set" : "REQUIRE_TEST_DB is set"}) and TEST_DATABASE_URL is ` +
        `not set at all, so all ${files} database-gated files (${guards} guarded describe blocks) ` +
        `skipped. A skip is not a pass. Set TEST_DATABASE_URL, or drop REQUIRE_TEST_DB and accept ` +
        `that this run proves nothing about the ledger, the economy or any route.`,
    );
  }
  if (mustHaveRun && provisions === 0 && !runIsFiltered()) {
    const { guards, files } = countDbGatedSuites();
    const why = process.env.CI
      ? "CI is set"
      : "REQUIRE_TEST_DB is set (pnpm test:full, or a lane that must not report a hollow green)";
    throw new Error(
      `[provisioningReport] ${why} and zero DB-backed suites provisioned a schema this run. ` +
        `That almost certainly means TEST_DATABASE_URL is missing, misspelled, or the mysql ` +
        `service is unreachable, and all ${files} files carrying one of this tree's ${guards} ` +
        `\`describe.skipIf(!testDbConfigured())\` guards (the economy suite and every routes e2e ` +
        `suite among them) silently ` +
        `skipped instead of running. A skip is not a pass: fix the database connection, do not ` +
        `relax this check.`,
    );
  }
}
