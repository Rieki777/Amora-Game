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
    hookTimeout: 180_000,
    // One server process per file, no parallel port fights.
    fileParallelism: false,
  },
});
