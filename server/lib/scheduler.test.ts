/**
 * The scheduler's off switch, and what "off" has to mean.
 *
 * The e2e suites spawn the REAL built server with NODE_ENV=production, so the
 * scheduler arms in them too and fifteen seconds later runs every job that has
 * no `scheduled_jobs` row, which on a fresh scratch schema is all of them.
 * Measured on this build against a real boot: 28 jobs ran 16.7 seconds in,
 * `tools-link-check` among them, and `tools-link-check` writes the same table
 * `PUT /api/admin/tools/:id` writes. That is the S15 flake's second half (the
 * first half, the lost update itself, is closed in server/repos/store-db.ts).
 *
 * So `server/loop.e2e.test.ts` sets SCHEDULER_ENABLED=0, and these tests are
 * what stop that from becoming a variable nobody reads: off must mean no
 * query, ever, not merely a longer first delay, and the default must stay ON
 * so no deployment is changed by this existing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakePool = { query: ReturnType<typeof vi.fn> };

const fakePool = (): FakePool => ({
  // The claim UPDATE is read as `const [r] = await pool.query(...)`, so the
  // shape matters: affectedRows 0 means "not due", which is the quiet answer.
  query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
});

/** A fresh copy of the module, since `jobs` and `timer` are module state. */
async function freshScheduler() {
  vi.resetModules();
  return import("./scheduler");
}

describe("SCHEDULER_ENABLED", () => {
  const original = process.env.SCHEDULER_ENABLED;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (original === undefined) delete process.env.SCHEDULER_ENABLED;
    else process.env.SCHEDULER_ENABLED = original;
  });

  it("ticks by default, because production must be unchanged by this switch existing", async () => {
    delete process.env.SCHEDULER_ENABLED;
    const { registerJob, startScheduler } = await freshScheduler();
    const ran = vi.fn().mockResolvedValue("done");
    registerJob("test-job", 60_000, ran);

    const pool = fakePool();
    startScheduler(pool as any);
    expect(pool.query, "nothing happens before the first tick is due").not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(pool.query, "the first tick lands 15s after boot").toHaveBeenCalled();
    expect(String(pool.query.mock.calls[0][0])).toContain("scheduled_jobs");
  });

  it("makes no query at all when it is off, at the first tick or any later one", async () => {
    process.env.SCHEDULER_ENABLED = "0";
    const { registerJob, startScheduler } = await freshScheduler();
    const ran = vi.fn().mockResolvedValue("done");
    registerJob("test-job", 60_000, ran);

    const pool = fakePool();
    startScheduler(pool as any);
    // Past the first tick, past the 5 minute interval, past an hour of them.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(pool.query, "off means no background query ever, not a later one").not.toHaveBeenCalled();
    expect(ran).not.toHaveBeenCalled();
  });

  it("still reports every registered job while it is off, so the state is visible", async () => {
    process.env.SCHEDULER_ENABLED = "off";
    const { registerJob, startScheduler, registeredJobs } = await freshScheduler();
    registerJob("visible-job", 60_000, async () => undefined);

    const said: string[] = [];
    const realLog = console.log;
    console.log = (...args: unknown[]) => void said.push(args.map(String).join(" "));
    try {
      startScheduler(fakePool() as any);
    } finally {
      console.log = realLog;
    }
    // A village with this set by accident loses every sweep, every settlement
    // and every relay. The boot log is the only place anybody would find out.
    expect(said.join("\n")).toContain("NOT STARTED");
    expect(said.join("\n")).toContain("visible-job");
    expect(registeredJobs().map((j) => j.name)).toContain("visible-job");
  });

  it("reads the words a person would actually type, and treats anything else as on", async () => {
    for (const off of ["0", "off", "false", "no", "OFF", " off "]) {
      process.env.SCHEDULER_ENABLED = off;
      const { registerJob, startScheduler } = await freshScheduler();
      registerJob("j", 60_000, async () => undefined);
      const pool = fakePool();
      startScheduler(pool as any);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(pool.query, `${JSON.stringify(off)} must mean off`).not.toHaveBeenCalled();
    }
    for (const on of ["1", "true", "on", "yes", ""]) {
      process.env.SCHEDULER_ENABLED = on;
      const { registerJob, startScheduler } = await freshScheduler();
      registerJob("j", 60_000, async () => undefined);
      const pool = fakePool();
      startScheduler(pool as any);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(pool.query, `${JSON.stringify(on)} must mean on`).toHaveBeenCalled();
    }
  });
});
