/**
 * The scheduler host (S17): ONE mechanism, deliberately.
 *
 * regen-civics ran two overlapping systems — in-process setInterval timers
 * AND external HTTP crons — with no locks, cadence truth scattered across
 * comments and a dashboard, and a "nightly" cron that silently ran 4 of the
 * 10 steps its comment promised. This host is the opposite: a registry in
 * code, a ledger in the database, and a single claim rule.
 *
 * How a job runs: every tick (5 min), each registered job checks its
 * scheduled_jobs row; if enough time has passed, ONE process claims it with
 *   UPDATE scheduled_jobs SET last_run_at = NOW()
 *   WHERE job = ? AND (last_run_at IS NULL OR last_run_at <= ?)
 * — affectedRows says who won. Restart-safe (the ledger is the DB, not the
 * interval), multi-process-safe (the UPDATE is the lock), and drift-free
 * enough for daily work (a job runs when DUE, not N ms after boot).
 *
 * WHAT THIS HOST WILL NEVER DO — written down so nobody "helpfully" adds it:
 *  - It does NOT close gratitude cycles. Settlement releases value and is an
 *    explicitly human, admin-triggered act (POST /api/admin/cycles/close).
 *  - It does NOT roll seasons. Season rollover is compute-on-read by design;
 *    migrating it here would re-introduce the stale-banner bug it fixed.
 */
import type { Pool } from "mysql2/promise";

interface Job {
  name: string;
  everyMs: number;
  fn: () => Promise<string | void>;
}

const jobs: Job[] = [];
let timer: NodeJS.Timeout | null = null;

export const TICK_MS = 5 * 60 * 1000;

export function registerJob(name: string, everyMs: number, fn: () => Promise<string | void>) {
  jobs.push({ name, everyMs, fn });
}

async function tick(pool: Pool) {
  for (const job of jobs) {
    try {
      await pool.query("INSERT IGNORE INTO scheduled_jobs (job) VALUES (?)", [job.name]);
      const due = new Date(Date.now() - job.everyMs);
      const [r]: any = await pool.query(
        "UPDATE scheduled_jobs SET last_run_at = NOW() WHERE job = ? AND (last_run_at IS NULL OR last_run_at <= ?)",
        [job.name, due],
      );
      if (!r.affectedRows) continue; // not due, or another process claimed it
      const started = Date.now();
      try {
        const result = await job.fn();
        const summary = `ok in ${Date.now() - started}ms${result ? `: ${result}` : ""}`.slice(0, 255);
        await pool.query("UPDATE scheduled_jobs SET last_result = ? WHERE job = ?", [summary, job.name]);
        console.log(`[scheduler] ${job.name} ${summary}`);
      } catch (e: any) {
        const summary = `FAILED: ${String(e?.message ?? e)}`.slice(0, 255);
        await pool.query("UPDATE scheduled_jobs SET last_result = ? WHERE job = ?", [summary, job.name]);
        console.error(`[scheduler] ${job.name} ${summary}`);
      }
    } catch (e) {
      console.error(`[scheduler] tick error for ${job.name}`, e);
    }
  }
}

/** Start ticking. First tick runs shortly after boot so due jobs never wait 5 minutes. */
export function startScheduler(pool: Pool) {
  if (timer) return;
  setTimeout(() => void tick(pool), 15 * 1000);
  timer = setInterval(() => void tick(pool), TICK_MS);
  // Never hold the process open just to tick.
  timer.unref?.();
  console.log(`[scheduler] started: ${jobs.map((j) => j.name).join(", ") || "(no jobs)"}`);
}

/** For tests and admin visibility. */
export function registeredJobs(): Array<{ name: string; everyMs: number }> {
  return jobs.map(({ name, everyMs }) => ({ name, everyMs }));
}
