/**
 * Is `dist/` the code that is in the tree, or the code that was in the tree
 * last time somebody built?
 *
 * WHAT THIS FIXES. Forty-one e2e suites boot the BUILT `dist/index.js`, and
 * every one of them checks only `fs.existsSync(DIST)`. `server/trackerPrivacy
 * .test.ts` does the same against `dist/public/assets`. None of them compares a
 * timestamp or a hash, and `"test": "vitest run"` does not build. So editing
 * source and running the suite returns a verdict on the PREVIOUS build.
 *
 * Reproduced both directions on 2026-08-31: a forbidden private-document link
 * appended to a client page left `trackerPrivacy` green with the violation
 * sitting in the source tree, and the same test failed with three named
 * assertions one `vite build` later. CI is safe only by accident of ordering
 * (`pnpm build` happens to precede `pnpm test` in ci.yml); every local run and
 * every agent lane is exposed.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not ask whether dist is newer
 * than everything in the repository. That question answers "stale" for a README
 * edit, a test file, a branch switch, or another lane's document, and a check
 * that cries wolf is a check somebody deletes. The bundle is compared only
 * against ITS OWN INPUTS. The server half is recorded by scripts/build-server.mjs
 * from esbuild's own metafile, exact. The client half is recorded separately by
 * scripts/build-client-manifest.mjs the moment vite finishes, as a directory
 * walk that over-approximates in the safe direction. Two receipts, because a
 * server-only rebuild must not be able to vouch for a client bundle it did not
 * build.
 *
 * mtime is a pre-filter and the hash is the verdict, because `git checkout` and
 * `git worktree add` rewrite the mtime of every file they touch even when the
 * bytes end up identical to what the bundle was built from.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ServerManifest {
  sha: string;
  builtAt: number;
  server: Record<string, string>;
  lockfile: string | null;
}

export interface ClientManifest {
  builtAt: number;
  client: Record<string, string>;
}

const ROOT = process.cwd();
const DIST_ENTRY = path.resolve(ROOT, "dist", "index.js");
const MANIFEST = path.resolve(ROOT, "dist", ".build-inputs.json");
// Deliberately NOT inside dist/public: that directory is served, and a list of
// every client source path with its hash is not something a village should
// publish.
const CLIENT_MANIFEST = path.resolve(ROOT, "dist", ".build-inputs.client.json");

/** How many offending files a message names before it stops listing. */
const NAMED = 5;

function digest(file: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function changedSince(
  entries: Record<string, string>,
  builtAt: number,
): string[] {
  const changed: string[] = [];
  for (const [rel, want] of Object.entries(entries)) {
    const abs = path.resolve(ROOT, rel);
    let mtime: number;
    try {
      mtime = fs.statSync(abs).mtimeMs;
    } catch {
      changed.push(`${rel} (gone since the build)`);
      continue;
    }
    // Untouched since the build: no hash needed. This is the common case and it
    // is what keeps the check under a second on a 500-file manifest.
    if (mtime <= builtAt) continue;
    const have = digest(abs);
    if (have !== want) changed.push(rel);
  }
  return changed;
}

/**
 * The sentence to print, or null when the bundle matches the tree.
 *
 * Returns a message rather than throwing so callers can choose: the vitest
 * globalSetup throws, and anything that wants to warn can.
 */
export function distFreshnessProblem(): string | null {
  // No bundle at all is somebody else's error to report: 42 files already throw
  // `dist/index.js is missing. Run pnpm build`, and that message is the right
  // one. Saying it twice, differently, helps nobody.
  if (!fs.existsSync(DIST_ENTRY)) return null;

  let manifest: ServerManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as ServerManifest;
  } catch {
    return (
      `dist/index.js exists but dist/.build-inputs.json does not, so nothing here can say ` +
      `WHICH source this bundle was built from. That file is written by every build since ` +
      `2026-08-31, so this bundle predates the receipt. Run \`pnpm build\`.`
    );
  }

  const problems: string[] = [];

  const lock = path.resolve(ROOT, "pnpm-lock.yaml");
  if (manifest.lockfile && fs.existsSync(lock) && digest(lock) !== manifest.lockfile) {
    problems.push(
      `pnpm-lock.yaml has changed since the build. The bundle is built with ` +
        `\`packages: "external"\`, so dependencies are resolved from node_modules at RUNTIME: ` +
        `an install after a build changes the code that runs while leaving every bundle input ` +
        `untouched.`,
    );
  }

  const staleServer = changedSince(manifest.server ?? {}, manifest.builtAt);
  if (staleServer.length > 0) {
    problems.push(
      `${staleServer.length} source file(s) that went INTO dist/index.js have changed since it ` +
        `was built: ${staleServer.slice(0, NAMED).join(", ")}` +
        `${staleServer.length > NAMED ? `, and ${staleServer.length - NAMED} more` : ""}. ` +
        `The 41 e2e suites boot that bundle, so they would be reporting on the previous build.`,
    );
  }

  // The client receipt is stamped by vite's own step, so a server-only
  // rebuild cannot vouch for it.
  let client: ClientManifest | null = null;
  try {
    client = JSON.parse(fs.readFileSync(CLIENT_MANIFEST, "utf8")) as ClientManifest;
  } catch {
    client = null;
  }
  if (!client && fs.existsSync(path.resolve(ROOT, "dist", "public"))) {
    problems.push(
      `dist/public exists but carries no receipt, so nothing can say which client source ` +
        `built it. Run \`pnpm build\`.`,
    );
  }
  const staleClient = client ? changedSince(client.client ?? {}, client.builtAt) : [];
  if (staleClient.length > 0) {
    problems.push(
      `${staleClient.length} client source file(s) have changed since dist/public was built: ` +
        `${staleClient.slice(0, NAMED).join(", ")}` +
        `${staleClient.length > NAMED ? `, and ${staleClient.length - NAMED} more` : ""}. ` +
        `server/trackerPrivacy.test.ts asserts on the BUILT chunks, and it goes green against a ` +
        `violation that is sitting in the source tree.`,
    );
  }

  if (problems.length === 0) return null;
  return (
    `[stale dist] the built bundle is not the code in this tree.\n  ` +
    problems.join("\n  ") +
    `\n  Fix: \`pnpm build\`, then run again.` +
    `\n  Or, if you know the difference does not matter to what you are running, ` +
    `ALLOW_STALE_DIST=1 downgrades this to a warning. A result produced that way is ` +
    `not evidence about the code in the tree.`
  );
}

/**
 * Throw once, before any test file loads, when dist is stale.
 *
 * One check per run rather than 42 identical hook failures spread over half an
 * hour, and it names the offending file instead of failing on an assertion
 * three layers downstream.
 */
export function assertFreshDist(): void {
  const problem = distFreshnessProblem();
  if (!problem) return;
  if (process.env.ALLOW_STALE_DIST) {
    // eslint-disable-next-line no-console
    console.warn(`${problem}\n  (ALLOW_STALE_DIST is set, so this run continues anyway.)`);
    return;
  }
  throw new Error(problem);
}
