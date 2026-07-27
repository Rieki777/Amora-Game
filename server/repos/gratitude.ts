/**
 * The gratitude domain's repositories (S8): log, cycles, distributions — all
 * MySQL, all camelCase at the interface so the route code and API responses
 * kept their historical shape. The JSON files these replace stay on the
 * volume as history; nothing reads them anymore.
 *
 * The log's add() surfaces ER_DUP_ENTRY as {duplicate:true} rather than
 * throwing: the unique heart index (one heart per sender per piece of
 * content, D5) makes "already acknowledged" an expected outcome, not an
 * error. Plain sends carry NULL context and are exempt from that index.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CycleRecord, DistributionRecord } from "../lib/gratitude-cycles";

const toIso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : v == null ? "" : new Date(String(v)).toISOString();

const toDb = (v: unknown): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export interface GratitudeEntry {
  id: string;
  kind: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  message: string;
  contextType?: string | null;
  contextRef?: string | null;
  cycleId: string;
  cycleNumber?: number | null;
  at: string;
}

export interface GratitudeLogRepo {
  all(): Promise<GratitudeEntry[]>;
  add(e: GratitudeEntry): Promise<{ ok: boolean; duplicate: boolean }>;
}

export function gratitudeLogRepo(pool: Pool): GratitudeLogRepo {
  return {
    async all() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, kind, from_id, from_name, to_id, to_name, amount, message, context_type, context_ref, cycle_id, cycle_number, at " +
          "FROM gratitude_log ORDER BY at, id",
      );
      return rows.map((r) => ({
        id: String(r.id),
        kind: String(r.kind ?? "gratitude"),
        fromId: String(r.from_id),
        fromName: String(r.from_name ?? ""),
        toId: String(r.to_id),
        toName: String(r.to_name ?? ""),
        amount: Number(r.amount ?? 0),
        message: String(r.message ?? ""),
        contextType: r.context_type ?? null,
        contextRef: r.context_ref ?? null,
        cycleId: String(r.cycle_id ?? ""),
        cycleNumber: r.cycle_number == null ? null : Number(r.cycle_number),
        at: toIso(r.at),
      }));
    },

    async add(e) {
      try {
        await pool.query(
          "INSERT INTO gratitude_log (id, kind, from_id, from_name, to_id, to_name, amount, message, context_type, context_ref, cycle_id, cycle_number, at) " +
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP))",
          [
            e.id,
            e.kind ?? "gratitude",
            e.fromId,
            e.fromName ?? "",
            e.toId,
            e.toName ?? "",
            Number(e.amount ?? 0),
            e.message ?? "",
            e.contextType ?? null,
            e.contextRef ?? null,
            e.cycleId,
            e.cycleNumber ?? null,
            toDb(e.at),
          ],
        );
        return { ok: true, duplicate: false };
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") return { ok: false, duplicate: true };
        throw err;
      }
    },
  };
}

export interface CyclesRepo {
  all(): Promise<CycleRecord[]>;
  /** Insert or replace by cycleNumber (the unique key a re-run collides on). */
  upsert(rec: CycleRecord): Promise<void>;
}

export function gratitudeCyclesRepo(pool: Pool): CyclesRepo {
  return {
    async all() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, cycle_number, starts_at, ends_at, status, closed_at FROM gratitude_cycles ORDER BY cycle_number",
      );
      return rows.map((r) => ({
        id: String(r.id),
        cycleNumber: Number(r.cycle_number),
        startsAt: toIso(r.starts_at),
        endsAt: toIso(r.ends_at),
        status: String(r.status) as CycleRecord["status"],
        closedAt: r.closed_at ? toIso(r.closed_at) : undefined,
      }));
    },

    async upsert(rec) {
      await pool.query(
        "INSERT INTO gratitude_cycles (id, cycle_number, starts_at, ends_at, status, closed_at) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE status=VALUES(status), closed_at=VALUES(closed_at)",
        [rec.id, rec.cycleNumber, toDb(rec.startsAt), toDb(rec.endsAt), rec.status, toDb(rec.closedAt ?? null)],
      );
    },
  };
}

export interface DistributionsRepo {
  all(): Promise<DistributionRecord[]>;
  /** Idempotent on (cycleId, userId): a re-run of close updates, never doubles. */
  add(rec: DistributionRecord): Promise<void>;
}

export function gratitudeDistributionsRepo(pool: Pool): DistributionsRepo {
  return {
    async all() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, cycle_id, user_id, received, received_hearts, received_acks, distinct_senders, credited, pool_token, created_at " +
          "FROM gratitude_distributions ORDER BY created_at, id",
      );
      return rows.map((r) => ({
        id: String(r.id),
        cycleId: String(r.cycle_id),
        userId: String(r.user_id),
        received: Number(r.received ?? 0),
        receivedHearts: Number(r.received_hearts ?? 0),
        receivedAcks: Number(r.received_acks ?? 0),
        distinctSenders: Number(r.distinct_senders ?? 0),
        credited: Number(r.credited ?? 0),
        poolToken: r.pool_token ?? null,
        createdAt: toIso(r.created_at),
      })) as DistributionRecord[];
    },

    async add(rec) {
      await pool.query(
        "INSERT INTO gratitude_distributions (id, cycle_id, user_id, received, received_hearts, received_acks, distinct_senders, credited, pool_token, created_at) " +
          "VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE received=VALUES(received), received_hearts=VALUES(received_hearts), " +
          "received_acks=VALUES(received_acks), distinct_senders=VALUES(distinct_senders), " +
          "credited=VALUES(credited), pool_token=VALUES(pool_token)",
        [
          rec.id,
          rec.cycleId,
          rec.userId,
          Number(rec.received ?? 0),
          Number((rec as any).receivedHearts ?? 0),
          Number((rec as any).receivedAcks ?? 0),
          Number(rec.distinctSenders ?? 0),
          Number((rec as any).credited ?? 0),
          (rec as any).poolToken ?? null,
          toDb((rec as any).createdAt),
        ],
      );
    },
  };
}
