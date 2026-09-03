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
 * So the marker is now composed WHOLE in scripts/build-server.mjs and injected.
 * Splitting it across two files is what allowed one half to drift from the
 * other, and this test reads the source to keep it undivided.
 */

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server", "index.ts");
const BUILDER = path.join(ROOT, "scripts", "build-server.mjs");

describe("build marker", () => {
  const server = fs.readFileSync(SERVER, "utf8");
  const builder = fs.readFileSync(BUILDER, "utf8");

  it("reads the real files", () => {
    // Control. Two empty strings contain no hardcoded date either, and would
    // pass every assertion below by being empty rather than by being right.
    expect(server.length).toBeGreaterThan(1000);
    expect(builder.length).toBeGreaterThan(500);
  });

  it("assigns the marker no hand-written date", () => {
    const line = server.split("\n").find((l) => /^const BUILD_MARKER\s*=/.test(l.trim()));
    expect(line, "BUILD_MARKER assignment not found").toBeTruthy();
    expect(line, `BUILD_MARKER carries a literal date: ${line}`).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("composes the marker in the builder rather than the server", () => {
    // Half here and half there is exactly what let the date drift from the SHA.
    expect(server).toContain("__BUILD_MARKER__");
    expect(server, "BUILD_LABEL is back, and with it the split that caused this").not.toContain("BUILD_LABEL");
  });

  it("has the builder actually supply it, from the commit", () => {
    // Without this the server falls back to "dev" forever and nobody notices,
    // which is the same quiet wrongness this replaced, wearing a new coat.
    expect(builder).toContain("__BUILD_MARKER__");
    expect(builder, "the date must come from the commit, not the clock").toContain("format=%cs");
  });
});
