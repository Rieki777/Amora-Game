/**
 * `pnpm test:full` — the run that is not allowed to be hollow.
 *
 * A bare `pnpm test` on a machine with no MySQL skips every database-backed
 * suite (87 files today, roughly a third of the tests) and still exits 0. That
 * is the right default for a first-time contributor and the wrong default for
 * anyone reporting a result: this project has spent four false greens proving
 * that a skip nobody reads is indistinguishable from a pass.
 *
 * So the obligation gets a name. This sets REQUIRE_TEST_DB=1, which
 * `server/db/provisioningReport.ts`'s teardown reads: if the run provisioned
 * zero scratch schemas it throws instead of exiting 0. Use this before any
 * "the suite is green" claim.
 *
 * Why a script rather than `REQUIRE_TEST_DB=1 vitest run` in package.json:
 * pnpm runs scripts through cmd.exe on Windows, where the shell-prefix form is
 * a syntax error, and this repository is developed on Windows and tested on
 * Linux. One file beats two half-working strings.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: { ...process.env, REQUIRE_TEST_DB: "1" },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
