/**
 * Build the server bundle, stamping the git SHA into it.
 *
 * The build marker used to be a hand-edited string, so it was accurate only
 * when somebody remembered. Six commits once shipped under a stale one and
 * /health cheerfully reported an old build while new code served. The marker
 * is load-bearing — the launch registry reads it, FORK_RUNBOOK tells forks to
 * verify a deploy with it, and the feedback relay sends it upstream as the
 * identity of the deployment a bug came from — so it must not depend on
 * discipline.
 *
 * Railway builds from a git checkout, so `git rev-parse` is available there.
 * Where it is not (a tarball, a Docker layer without .git), the marker falls
 * back to "dev" rather than guessing: an honest "unknown" beats a confident
 * wrong answer about which code is running.
 */
import { execSync } from "child_process";
import { build } from "esbuild";

function gitSha() {
  // Railway and most CI providers expose the commit; prefer that over git.
  const fromEnv =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.SOURCE_VERSION ||
    "";
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const sha = gitSha();

await build({
  entryPoints: ["server/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
  define: {
    // JSON.stringify, not a bare quote: an empty SHA must compile to a
    // valid empty string literal, and the server treats "" as "dev".
    __BUILD_SHA__: JSON.stringify(sha),
  },
});

console.log(`  dist/index.js built${sha ? ` @ ${sha}` : " (no git context — marker will read 'dev')"}`);
