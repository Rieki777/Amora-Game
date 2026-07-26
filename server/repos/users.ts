/**
 * The members repository: the only place that reads or writes member records.
 *
 * S6: the backing store is MySQL (`users` table), reached through the shared
 * pool (server/db/pool.ts, timezone 'Z'). The JSON file era ended here — the
 * repository interface is the same one the routes already talked to, minus
 * the two file-era leaks:
 *
 *  - `readDoc()` is now `all()` — a SELECT, not a file read.
 *  - `saveDoc()` is gone. It existed because JSON handlers loaded every
 *    member, edited one, and wrote the lot back — the exact
 *    read-modify-write race `update()` exists to prevent. With rows there is
 *    no "whole document" to save, so every former saveDoc site now calls
 *    `add()` or `update()` and the race is structurally unwritable.
 *
 * `update()` runs SELECT ... FOR UPDATE inside a transaction: the mutator
 * sees a row no concurrent request can touch until commit. That is the
 * locking the JSON version's doc-comment promised "when this moves to
 * MySQL". This is that move.
 *
 * Records keep their historical camelCase shape (tokenVersion, joinedAt as
 * ISO string, trainingComplete as boolean) so route code and API responses
 * are unchanged; the mapping to snake_case columns lives here and only here.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db/pool";

/** Loose on purpose: the record's shape is still owned by server/index.ts. */
export type MemberRecord = Record<string, any> & { id: string; email: string };

export interface UsersRepo {
  all(): Promise<MemberRecord[]>;
  byId(id: string): Promise<MemberRecord | null>;
  byEmail(email: string): Promise<MemberRecord | null>;
  existsByEmail(email: string): Promise<boolean>;
  count(): Promise<number>;
  add(member: MemberRecord): Promise<MemberRecord>;
  /**
   * Read, mutate, write, as one transaction with the row locked. Returns the
   * updated record, or null if the member is gone. The mutator receives the
   * record and may change it in place; returning a value is unnecessary.
   */
  update(id: string, mutate: (member: MemberRecord) => void): Promise<MemberRecord | null>;
  remove(id: string): Promise<MemberRecord | null>;
}

/** Columns the repository owns, in one place so INSERT and UPDATE cannot drift. */
const COLUMNS = [
  "id",
  "name",
  "email",
  "password_hash",
  "paths",
  "recognition_balance",
  "contributions",
  "quests",
  "journeys",
  "prefs",
  "contactable",
  "bio",
  "avatar",
  "stage_granted",
  "training_complete",
  "role",
  "handle",
  "token_version",
  "wallet_address",
  "wallet_verified_at",
  "joined_at",
] as const;

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** mysql2 may hand JSON columns back parsed or as strings depending on how they were written. */
function fromJsonCol(v: unknown, fallback: any) {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return v;
}

function rowToMember(row: RowDataPacket): MemberRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash ?? "",
    paths: fromJsonCol(row.paths, []),
    recognitionBalance: Number(row.recognition_balance ?? 0),
    contributions: fromJsonCol(row.contributions, []),
    quests: fromJsonCol(row.quests, []),
    journeys: fromJsonCol(row.journeys, {}),
    prefs: fromJsonCol(row.prefs, {}),
    contactable: row.contactable == null ? true : !!row.contactable,
    bio: row.bio ?? "",
    avatar: row.avatar ?? null,
    stageGranted: row.stage_granted ?? null,
    trainingComplete: !!row.training_complete,
    role: row.role ?? "member",
    handle: row.handle ?? null,
    tokenVersion: Number(row.token_version ?? 0),
    walletAddress: row.wallet_address ?? null,
    walletVerifiedAt: toIso(row.wallet_verified_at),
    joinedAt: toIso(row.joined_at),
  };
}

function toDb(v: unknown): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function memberToParams(m: MemberRecord): any[] {
  return [
    m.id,
    m.name ?? "",
    m.email,
    m.passwordHash ?? "",
    JSON.stringify(m.paths ?? []),
    Number(m.recognitionBalance ?? 0),
    JSON.stringify(m.contributions ?? []),
    JSON.stringify(m.quests ?? []),
    JSON.stringify(m.journeys ?? {}),
    JSON.stringify(m.prefs ?? {}),
    m.contactable === false ? 0 : 1,
    m.bio ?? null,
    m.avatar ?? null,
    m.stageGranted ?? null,
    m.trainingComplete ? 1 : 0,
    m.role ?? "member",
    m.handle ?? null,
    Number(m.tokenVersion ?? 0),
    m.walletAddress ?? null,
    toDb(m.walletVerifiedAt),
    toDb(m.joinedAt) ?? new Date(),
  ];
}

export function usersRepo(pool: Pool = getPool()): UsersRepo {
  const select = `SELECT ${COLUMNS.join(", ")} FROM users`;

  async function rows(sql: string, params: any[] = []): Promise<RowDataPacket[]> {
    const [r] = await pool.query<RowDataPacket[]>(sql, params);
    return r;
  }

  return {
    async all() {
      return (await rows(`${select} ORDER BY joined_at, id`)).map(rowToMember);
    },

    async byId(id) {
      const r = await rows(`${select} WHERE id = ?`, [id]);
      return r[0] ? rowToMember(r[0]) : null;
    },

    async byEmail(email) {
      // Collation is case-insensitive, matching the JSON repo's sameEmail().
      const r = await rows(`${select} WHERE email = ?`, [String(email ?? "")]);
      return r[0] ? rowToMember(r[0]) : null;
    },

    async existsByEmail(email) {
      const r = await rows("SELECT 1 FROM users WHERE email = ? LIMIT 1", [String(email ?? "")]);
      return r.length > 0;
    },

    async count() {
      const r = await rows("SELECT COUNT(*) AS n FROM users");
      return Number(r[0]?.n ?? 0);
    },

    async add(member) {
      await pool.query(
        `INSERT INTO users (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(",")})`,
        memberToParams(member),
      );
      return member;
    },

    async update(id, mutate) {
      const conn: PoolConnection = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query<RowDataPacket[]>(`${select} WHERE id = ? FOR UPDATE`, [id]);
        if (!r[0]) {
          await conn.rollback();
          return null;
        }
        const member = rowToMember(r[0]);
        mutate(member);
        const params = memberToParams(member);
        await conn.query(
          `UPDATE users SET ${COLUMNS.slice(1)
            .map((c) => `${c} = ?`)
            .join(", ")} WHERE id = ?`,
          [...params.slice(1), id],
        );
        await conn.commit();
        return member;
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
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
      return existing;
    },
  };
}
