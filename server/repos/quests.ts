/**
 * Quests + quest claims repositories (S10): MySQL, camelCase interface, same
 * shapes the routes and client always saw.
 *
 * The reward-range columns (gratitude_min/gratitude_max) are DERIVED from the
 * advertised label ("50-100") at write time, here and only here — the same
 * parsing the importer uses. That is the trap-3.5 lesson institutionalized:
 * the label is what the board advertised (verbatim, a contract), the bounds
 * are what consent enforcement reads, and one writer keeps them in agreement.
 *
 * `consentedCount(userId)` exists because stage computation reads it on hot
 * paths; `consentedCounts()` (grouped) exists so listing N members costs one
 * query, not N.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { parseRewardRange } from "../../shared/questRewards";

const toIso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

const toDb = (v: unknown): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

// ── Quests ──────────────────────────────────────────────────────────────────

export interface QuestRecord {
  id: string;
  title: string;
  description?: string | null;
  impact?: string | null;
  /** The advertised label, verbatim — "50-100", "75". A contract, never coerced. */
  gratitude: string;
  duration?: string | null;
  difficulty?: string | null;
  circle?: string | null;
  status: string;
  icon?: string | null;
  /** Display-only prose ("Requires: green thumb"). Never enforced. */
  roleRequired?: string | null;
  /** STRUCTURED stage floor — the claim gate enforces this. */
  minStage?: string | null;
  /** STRUCTURED role gate — the claim gate enforces this. */
  requiresRole?: string | null;
  tags: string[];
  order: number;
}

export interface QuestsRepo {
  all(): Promise<QuestRecord[]>;
  byId(id: string): Promise<QuestRecord | null>;
  add(q: QuestRecord): Promise<QuestRecord>;
  update(id: string, mutate: (q: QuestRecord) => void): Promise<QuestRecord | null>;
  remove(id: string): Promise<QuestRecord | null>;
}

const QUEST_SELECT =
  "SELECT id, title, description, impact, gratitude, duration, difficulty, circle, status, icon, role_required, min_stage, requires_role, tags, sort_order FROM quests";

function rowToQuest(r: RowDataPacket): QuestRecord {
  let tags: string[] = [];
  try {
    tags = Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags ?? "[]");
  } catch { /* tolerate junk, an empty list renders fine */ }
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    description: r.description ?? null,
    impact: r.impact ?? null,
    gratitude: String(r.gratitude ?? ""),
    duration: r.duration ?? null,
    difficulty: r.difficulty ?? null,
    circle: r.circle ?? null,
    status: String(r.status ?? "open"),
    icon: r.icon ?? null,
    roleRequired: r.role_required ?? null,
    minStage: r.min_stage ?? null,
    requiresRole: r.requires_role ?? null,
    tags,
    order: Number(r.sort_order ?? 0),
  };
}

function questParams(q: QuestRecord): any[] {
  const range = parseRewardRange(q.gratitude);
  return [
    q.id,
    q.title ?? "",
    q.description ?? null,
    q.impact ?? null,
    String(q.gratitude ?? ""),
    range.min,
    range.max,
    q.duration ?? null,
    q.difficulty ?? null,
    q.circle ?? null,
    q.status ?? "open",
    q.icon ?? null,
    q.roleRequired ?? null,
    q.minStage ?? null,
    q.requiresRole ?? null,
    JSON.stringify(q.tags ?? []),
    Number(q.order ?? 0),
  ];
}

const QUEST_COLS =
  "(id, title, description, impact, gratitude, gratitude_min, gratitude_max, duration, difficulty, circle, status, icon, role_required, min_stage, requires_role, tags, sort_order)";

export function questsRepo(pool: Pool): QuestsRepo {
  return {
    async all() {
      const [rows] = await pool.query<RowDataPacket[]>(`${QUEST_SELECT} ORDER BY sort_order, id`);
      return rows.map(rowToQuest);
    },

    async byId(id) {
      const [rows] = await pool.query<RowDataPacket[]>(`${QUEST_SELECT} WHERE id = ?`, [id]);
      return rows[0] ? rowToQuest(rows[0]) : null;
    },

    async add(q) {
      await pool.query(
        `INSERT INTO quests ${QUEST_COLS} VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        questParams(q),
      );
      return q;
    },

    async update(id, mutate) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query<RowDataPacket[]>(`${QUEST_SELECT} WHERE id = ? FOR UPDATE`, [id]);
        if (!rows[0]) {
          await conn.rollback();
          return null;
        }
        const quest = rowToQuest(rows[0]);
        mutate(quest);
        const p = questParams({ ...quest, id });
        await conn.query(
          "UPDATE quests SET title=?, description=?, impact=?, gratitude=?, gratitude_min=?, gratitude_max=?, " +
            "duration=?, difficulty=?, circle=?, status=?, icon=?, role_required=?, min_stage=?, requires_role=?, tags=?, sort_order=? WHERE id=?",
          [...p.slice(1), id],
        );
        await conn.commit();
        return { ...quest, id };
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async remove(id) {
      const existing = await this.byId(id);
      if (!existing) return null;
      await pool.query("DELETE FROM quests WHERE id = ?", [id]);
      return existing;
    },
  };
}

// ── Claims ──────────────────────────────────────────────────────────────────

export interface ClaimRecord {
  id: string;
  questId: string;
  questTitle: string;
  userId: string;
  userName: string;
  status: "claimed" | "submitted" | "consented" | "declined";
  artifactUrl?: string | null;
  note?: string | null;
  amount?: number | null;
  claimedAt: string | null;
  submittedAt?: string | null;
  /** Historical JSON name for when the claim was consented or declined. */
  resolvedAt?: string | null;
}

export interface ClaimsRepo {
  all(): Promise<ClaimRecord[]>;
  byId(id: string): Promise<ClaimRecord | null>;
  forUser(userId: string): Promise<ClaimRecord[]>;
  add(c: ClaimRecord): Promise<ClaimRecord>;
  update(id: string, mutate: (c: ClaimRecord) => void): Promise<ClaimRecord | null>;
  /** Stage rules read this on hot paths — a COUNT, never a full scan. */
  consentedCount(userId: string): Promise<number>;
  /** One grouped query for listing N members (admin players view). */
  consentedCounts(): Promise<Map<string, number>>;
}

const CLAIM_SELECT =
  "SELECT id, quest_id, quest_title, user_id, user_name, status, artifact_url, note, amount, claimed_at, submitted_at, consented_at FROM quest_claims";

function rowToClaim(r: RowDataPacket): ClaimRecord {
  return {
    id: String(r.id),
    questId: String(r.quest_id ?? ""),
    questTitle: String(r.quest_title ?? ""),
    userId: String(r.user_id ?? ""),
    userName: String(r.user_name ?? ""),
    status: (r.status ?? "claimed") as ClaimRecord["status"],
    artifactUrl: r.artifact_url ?? null,
    note: r.note ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    claimedAt: toIso(r.claimed_at),
    submittedAt: toIso(r.submitted_at),
    resolvedAt: toIso(r.consented_at),
  };
}

export function claimsRepo(pool: Pool): ClaimsRepo {
  return {
    async all() {
      const [rows] = await pool.query<RowDataPacket[]>(`${CLAIM_SELECT} ORDER BY claimed_at, id`);
      return rows.map(rowToClaim);
    },

    async byId(id) {
      const [rows] = await pool.query<RowDataPacket[]>(`${CLAIM_SELECT} WHERE id = ?`, [id]);
      return rows[0] ? rowToClaim(rows[0]) : null;
    },

    async forUser(userId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `${CLAIM_SELECT} WHERE user_id = ? ORDER BY claimed_at, id`,
        [userId],
      );
      return rows.map(rowToClaim);
    },

    async add(c) {
      await pool.query(
        "INSERT INTO quest_claims (id, quest_id, quest_title, user_id, user_name, status, artifact_url, note, amount, claimed_at, submitted_at, consented_at) " +
          "VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP),?,?)",
        [
          c.id,
          c.questId,
          c.questTitle ?? "",
          c.userId,
          c.userName ?? "",
          c.status ?? "claimed",
          c.artifactUrl ?? null,
          c.note ?? null,
          c.amount ?? null,
          toDb(c.claimedAt),
          toDb(c.submittedAt),
          toDb(c.resolvedAt),
        ],
      );
      return c;
    },

    async update(id, mutate) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query<RowDataPacket[]>(`${CLAIM_SELECT} WHERE id = ? FOR UPDATE`, [id]);
        if (!rows[0]) {
          await conn.rollback();
          return null;
        }
        const claim = rowToClaim(rows[0]);
        mutate(claim);
        await conn.query(
          "UPDATE quest_claims SET status=?, artifact_url=?, note=?, amount=?, submitted_at=?, consented_at=? WHERE id=?",
          [
            claim.status,
            claim.artifactUrl ?? null,
            claim.note ?? null,
            claim.amount ?? null,
            toDb(claim.submittedAt),
            toDb(claim.resolvedAt),
            id,
          ],
        );
        await conn.commit();
        return claim;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async consentedCount(userId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM quest_claims WHERE user_id = ? AND status = 'consented'",
        [userId],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async consentedCounts() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT user_id, COUNT(*) AS n FROM quest_claims WHERE status = 'consented' GROUP BY user_id",
      );
      return new Map(rows.map((r) => [String(r.user_id), Number(r.n)]));
    },
  };
}
