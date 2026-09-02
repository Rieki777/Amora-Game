import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The build marker must be stamped, never typed.
 *
 * It read `2026-07-28-wave1-<sha>` for five weeks after that was true. The SHA
 * was derived at build time and stayed correct; the date beside it was a string
 * literal in source, and nobody updated it. On 2026-09-02 a deployment built
 * from a 2026-09-01 commit still announced 2026-07-28, and a reader checking
 * what was live concluded the village had not deployed in five weeks. It had
 * deployed that morning.
 *
 * That string is not decoration. The launch registry reads it, the fork runbook
 * tells people to verify deploys with it, and the feedback relay sends it
 * upstream as the identity of the deployment a bug came from. A marker that
 * lies makes every one of those lie in the same direction.
 *
 * So this test reads the source and refuses a hardcoded date, because the
 * failure was never in the value. It was in the value being writable by hand.
 */

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server", "index.ts");
const BUILDER = path.join(ROOT, "scripts", "build-server.mjs");

describe("build marker", () => {
  const server = fs.readFileSync(SERVER, "utf8");
  const builder = fs.readFileSync(BUILDER, "utf8");

  it("reads the real files", () => {
    // Control. Two empty strings contain no hardcoded date either.
    expect(server.length).toBeGreaterThan(1000);
    expect(builder.length).toBeGreaterThan(500);
  });

  it("does not assign a hand-written date to BUILD_LABEL", () => {
    const line = server.split("\n").find((l) => /^const BUILD_LABEL\s*=/.test(l.trim()));
    expect(line, "BUILD_LABEL assignment not found").toBeTruthy();
    expect(line, `BUILD_LABEL carries a literal date: ${line}`).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("derives both halves of the marker from the build", () => {
    expect(server).toContain("__BUILD_DATE__");
    expect(server).toContain("__BUILD_SHA__");
    // And the builder must actually supply the date, or the server falls back
    // to "dev" forever and nobody notices, which is the same shape of quiet
    // wrongness this replaced.
    expect(builder).toContain("__BUILD_DATE__");
    expect(builder).toMatch(/format=%cs|committer date/i);
  });
});
