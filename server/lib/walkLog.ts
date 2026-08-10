/**
 * The Welcome Walk's log: storage and the one report it exists for (0061).
 *
 * The aggregation itself is pure and lives in shared/walkLog.ts, so the
 * question "where does the walk lose people" is answered the same way here,
 * in a test, and anywhere else that ever asks it.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { walkFunnel, type WalkFunnel, type WalkLogRow } from "../../shared/walkLog";

export interface WalkLogInput {
  sessionKey: string;
  step: string;
  atIndex?: number;
  tsSeq?: number;
  lang?: string | null;
}

const clampInt = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
};

/** Same key for the same row, so a replayed import is a no-op. */
const idemKey = (source: string, r: WalkLogInput): string =>
  `${source}:${r.sessionKey}:${r.tsSeq ?? 0}:${r.step}`.slice(0, 160);

/**
 * Record rows.
 *
 * One statement for the batch, and `ON DUPLICATE KEY UPDATE` on the
 * idempotency key so re-importing a scene file cannot inflate the numbers the
 * report is built from. That matters more here than in most tables: the whole
 * value of this data is that the counts are true.
 */
export async function recordWalkRows(
  pool: Pool,
  rows: readonly WalkLogInput[],
  source: "live" | "import",
): Promise<number> {
  const clean = rows
    .filter((r) => r && typeof r.sessionKey === "string" && r.sessionKey && typeof r.step === "string" && r.step)
    .slice(0, 2000);
  if (!clean.length) return 0;

  const values: any[] = [];
  const holes: string[] = [];
  for (const r of clean) {
    holes.push("(?,?,?,?,?,?,?,?)");
    values.push(
      `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      String(r.sessionKey).slice(0, 64),
      String(r.step).slice(0, 64),
      clampInt(r.atIndex, 999),
      clampInt(r.tsSeq, 99999),
      r.lang ? String(r.lang).slice(0, 8) : null,
      source,
      idemKey(source, r),
    );
  }
  const [res] = await pool.query<any>(
    `INSERT INTO walk_log (id, session_key, step, at_index, ts_seq, lang, source, idempotency_key)
       VALUES ${holes.join(",")}
     ON DUPLICATE KEY UPDATE at_index = VALUES(at_index)`,
    values,
  );
  return Number(res?.affectedRows ?? 0);
}

/**
 * The report: where the walk loses people.
 *
 * `source` filters live rows from imported ones, because a demo scene's log
 * and a real village's arrivals are different populations and averaging them
 * would answer neither question.
 */
export async function walkReport(
  pool: Pool,
  opts: { source?: "live" | "import" | "all"; days?: number } = {},
): Promise<WalkFunnel & { source: string; days: number }> {
  const days = Math.min(Math.max(Number(opts.days ?? 90), 1), 730);
  const source = opts.source ?? "all";
  const where = ["created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)"];
  const params: any[] = [days];
  if (source !== "all") { where.push("source = ?"); params.push(source); }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT session_key, step, at_index, ts_seq FROM walk_log
      WHERE ${where.join(" AND ")}
      ORDER BY session_key, ts_seq
      LIMIT 20000`,
    params,
  );
  const shaped: WalkLogRow[] = rows.map((r) => ({
    sessionKey: String(r.session_key),
    step: String(r.step),
    atIndex: Number(r.at_index),
    tsSeq: Number(r.ts_seq),
  }));
  return { ...walkFunnel(shaped), source, days };
}
