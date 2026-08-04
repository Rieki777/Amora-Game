import { defineConfig } from "vitest/config";

/**
 * Amora had vitest installed and zero tests. This config exists to make the
 * server testable at all, ahead of Phase 1b moving ~78 route handlers off JSON
 * and onto MySQL. Moving that much code with no safety net is how a live site
 * breaks.
 *
 * Node environment, not jsdom: the tests that matter here drive the real HTTP
 * API of the real built server, not React components.
 */
export default defineConfig({
  test: {
    environment: "node",
    // S5: load .env so TEST_DATABASE_URL reaches the DB-backed suites locally
    // (CI sets it as a job env var; both paths land in process.env).
    setupFiles: ["dotenv/config"],
    // Client tests are pure-logic only (no jsdom, see above): helpers like
    // the nav's gesture thresholds, which are far easier to check against
    // numbers than by waving a thumb at a phone.
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "client/**/*.test.ts"],
    // The end-to-end loop test builds and boots the server, so it needs room.
    testTimeout: 120_000,
    /*
     * 300s, and it must stay comfortably ABOVE the e2e boot deadline.
     *
     * The e2e hooks do two slow things in series: provision a scratch schema
     * (drop, create, ~50 migrations) and then wait for the server to answer
     * /health. Against a hosted MySQL the round trip is ~130ms, so provisioning
     * alone can run a minute or more.
     *
     * When the boot deadline was raised from 60s to 120s, the two together
     * started clearing the old 180s ceiling, and this timeout fired FIRST. That
     * is the worse failure: the boot deadline reports the server's own log and
     * says what it was doing, while this one says only "Hook timed out" and
     * throws that log away. Keep the headroom so the informative error is
     * always the one that wins.
     */
    hookTimeout: 300_000,
    // One server process per file, no parallel port fights.
    fileParallelism: false,
  },
});
