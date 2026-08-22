import path from "node:path";
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
  /*
   * The same aliases vite.config.ts builds with. Without them a client module
   * that imports `@shared/...` typechecks (tsconfig paths) and builds (vite)
   * and then fails to COLLECT under vitest, which reports as "no tests" rather
   * than as a resolution error. Keep this list in step with vite.config.ts.
   */
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // S5: load .env so TEST_DATABASE_URL reaches the DB-backed suites locally
    // (CI sets it as a job env var; both paths land in process.env).
    setupFiles: ["dotenv/config"],
    /*
     * Prints what provisioning cost when the run ends: template builds, clones,
     * and the per-migration-file price. The cost this comment block warns about
     * below was real and invisible, which is how it reached five minutes of
     * every CI job. A number nobody prints is a number nobody defends.
     */
    globalSetup: ["server/db/provisioningReport.ts"],
    // Client tests are pure-logic only (no jsdom, see above): helpers like
    // the nav's gesture thresholds, which are far easier to check against
    // numbers than by waving a thumb at a phone.
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "client/**/*.test.ts"],
    // The end-to-end loop test builds and boots the server, so it needs room.
    testTimeout: 120_000,
    /*
     * This ceiling must stay comfortably ABOVE (provisioning + boot deadline),
     * and provisioning GROWS WITH EVERY MIGRATION ANYONE ADDS.
     *
     * An e2e hook does two slow things in series: provision a scratch schema
     * (drop, create, then run every migration) and then wait for the server to
     * answer /health. The second has its own deadline, and that deadline is now
     * ONE exported number, `E2E_BOOT_DEADLINE_MS` in `server/db/testDb.ts`. It
     * used to be five hand-copied literals and they had drifted: three files
     * said 180s and two said 120s, so two suites sat below the floor this
     * comment describes as the rule. So:
     *
     *     hookTimeout  >  provisioning  +  E2E_BOOT_DEADLINE_MS
     *
     * Measured 2026-08-11, at rest, against the hosted MySQL:
     *     round trip     140ms
     *     migrations     62 files
     *     provisioning   77.6s          (about 1.25s per migration file)
     *     worst case     257.6s         (77.6 + 180)
     *
     * Against the old 300s that left 42s of margin, roughly 14%, and it had
     * already stopped being enough: with three suites sharing this database
     * `examples.routes.e2e` failed on THIS timeout, then passed alone in 227s.
     * At the rate migrations land (0049 to 0062 in one week) 300s would have
     * been short at rest within a fortnight.
     *
     * Why raise this rather than shorten the boot deadline: when a server
     * genuinely will not start, the boot deadline prints the server's own log
     * and says what it was doing, while this timeout says only "Hook timed out"
     * and throws that log away. The informative error has to be the one that
     * fires, so this number stays the outer bound.
     *
     * TO RECOMPUTE: time one `provisionTestDb()` and add E2E_BOOT_DEADLINE_MS.
     * If that is within ~40% of this number, raise it. Do not lower the boot
     * deadline instead.
     *
     * WHAT CHANGED, 2026-08-22 (88 migration files). Provisioning no longer
     * runs the migrations per suite. `server/db/testDb.ts` migrates ONCE into a
     * template schema and clones it per suite, so the growth this comment
     * warned about is now paid once per run instead of once per DB-backed
     * suite, of which there are 44. The worst case that sizes THIS number is
     * therefore the FIRST suite to provision, which pays the template build and
     * a clone:
     *
     *     quiet box   template 2.1s + clone 0.7s  = 2.8s
     *     under load  template 8.8s + clone 4.1s  = 12.9s
     *     worst case  12.9 + 120 = 132.9s, 55% of this ceiling
     *
     * SIZE AGAINST THE LOADED NUMBER. The same tree on the same MariaDB
     * measured 4x apart on the same afternoon depending on what else was
     * running, which is the local version of the 4x-to-6x spread CI runners
     * show on identical content. A quiet measurement is the wrong basis for a
     * ceiling that only ever fires under contention.
     *
     * `pnpm measure:provisioning` prints exactly those numbers, and every run
     * prints its own totals at the end (globalSetup above).
     */
    hookTimeout: 240_000,
    // One server process per file, no parallel port fights.
    fileParallelism: false,
  },
});
