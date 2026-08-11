/**
 * Quest crews (0067): a small named group walking one quest together.
 *
 * The shape is deliberately modest. A crew holds a roster and an invite code,
 * and that is all it holds: no pooled completion, no shared reward, no crew
 * standing that could be farmed. Every member still claims, submits, and is
 * consented to on their own work, so the consent gate that protects value
 * never learns about crews at all.
 *
 * Messaging is optional here. It is a non-core module that ships off, while
 * quests is core and cannot be disabled, so every function below works with
 * conversation_id left NULL. When messaging is on, the caller creates the
 * conversation (kind 'crew') and attaches it.
 */
import crypto from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface CrewRecord {
  id: string;
  questId: string;
  name: string;
  creatorId: string;
  conversationId: string | null;
  inviteCode: string;
  status: "forming" | "active" | "completed" | "disbanded";
  maxSize: number;
  createdAt: string | null;
}

export interface CrewMember {
  userId: string;
  role: "founder" | "member";
  joinedAt: string | null;
}

export interface CrewWithMembers extends CrewRecord {
  members: CrewMember[];
}

/** The one place a crew name is cleaned. Rendered to other members. */
export function cleanCrewName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Unguessable and revocable: a crew invite is a capability to join. */
export function newInviteCode(): string {
  return crypto.randomBytes(12).toString("base64url");
}

const toIso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

const rowToCrew = (r: RowDataPacket): CrewRecord => ({
  id: String(r.id),
  questId: String(r.quest_id),
  name: String(r.name ?? ""),
  creatorId: String(r.creator_id ?? ""),
  conversationId: r.conversation_id == null ? null : String(r.conversation_id),
  inviteCode: String(r.invite_code ?? ""),
  status: (r.status ?? "forming") as CrewRecord["status"],
  maxSize: Number(r.max_size ?? 5),
  createdAt: toIso(r.created_at),
});

const CREW_SELECT =
  "SELECT id, quest_id, name, creator_id, conversation_id, invite_code, status, max_size, created_at FROM quest_crews";

export function crewsRepo(pool: Pool) {
  async function membersFor(crewIds: string[]): Promise<Map<string, CrewMember[]>> {
    const out = new Map<string, CrewMember[]>();
    if (crewIds.length === 0) return out;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT crew_id, user_id, role, joined_at FROM quest_crew_members WHERE crew_id IN (${crewIds
        .map(() => "?")
        .join(",")}) ORDER BY joined_at, user_id`,
      crewIds,
    );
    for (const r of rows) {
      const list = out.get(String(r.crew_id)) ?? [];
      list.push({
        userId: String(r.user_id),
        role: (r.role ?? "member") as CrewMember["role"],
        joinedAt: toIso(r.joined_at),
      });
      out.set(String(r.crew_id), list);
    }
    return out;
  }

  return {
    async forQuest(questId: string): Promise<CrewWithMembers[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `${CREW_SELECT} WHERE quest_id = ? AND status <> 'disbanded' ORDER BY created_at, id`,
        [questId],
      );
      const crews = rows.map(rowToCrew);
      const members = await membersFor(crews.map((c) => c.id));
      return crews.map((c) => ({ ...c, members: members.get(c.id) ?? [] }));
    },

    async byId(id: string): Promise<CrewWithMembers | null> {
      const [rows] = await pool.query<RowDataPacket[]>(`${CREW_SELECT} WHERE id = ?`, [id]);
      if (!rows[0]) return null;
      const crew = rowToCrew(rows[0]);
      const members = await membersFor([crew.id]);
      return { ...crew, members: members.get(crew.id) ?? [] };
    },

    async byInvite(code: string): Promise<CrewWithMembers | null> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `${CREW_SELECT} WHERE invite_code = ?`,
        [String(code ?? "")],
      );
      if (!rows[0]) return null;
      const crew = rowToCrew(rows[0]);
      const members = await membersFor([crew.id]);
      return { ...crew, members: members.get(crew.id) ?? [] };
    },

    /** The founder is a member from the first moment, never an empty crew. */
    async create(c: {
      id: string;
      questId: string;
      name: string;
      creatorId: string;
      maxSize: number;
      conversationId?: string | null;
    }): Promise<CrewWithMembers> {
      const inviteCode = newInviteCode();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "INSERT INTO quest_crews (id, quest_id, name, creator_id, conversation_id, invite_code, status, max_size) VALUES (?,?,?,?,?,?,'forming',?)",
          [c.id, c.questId, c.name, c.creatorId, c.conversationId ?? null, inviteCode, c.maxSize],
        );
        await conn.query(
          "INSERT INTO quest_crew_members (crew_id, user_id, role) VALUES (?,?,'founder')",
          [c.id, c.creatorId],
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      return (await this.byId(c.id)) as CrewWithMembers;
    },

    /**
     * Join, with the size check INSIDE the transaction and the row locked.
     * Checking the count first and inserting after is a race two people tapping
     * the same invite link at once will win together.
     */
    async join(crewId: string, userId: string): Promise<"joined" | "already" | "full" | "gone"> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [crewRows] = await conn.query<RowDataPacket[]>(
          `${CREW_SELECT} WHERE id = ? FOR UPDATE`,
          [crewId],
        );
        if (!crewRows[0] || crewRows[0].status === "disbanded") {
          await conn.rollback();
          return "gone";
        }
        const [mine] = await conn.query<RowDataPacket[]>(
          "SELECT 1 FROM quest_crew_members WHERE crew_id = ? AND user_id = ?",
          [crewId, userId],
        );
        if (mine[0]) {
          await conn.rollback();
          return "already";
        }
        const [countRows] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM quest_crew_members WHERE crew_id = ?",
          [crewId],
        );
        if (Number(countRows[0]?.n ?? 0) >= Number(crewRows[0].max_size ?? 5)) {
          await conn.rollback();
          return "full";
        }
        await conn.query(
          "INSERT INTO quest_crew_members (crew_id, user_id, role) VALUES (?,?,'member')",
          [crewId, userId],
        );
        await conn.query("UPDATE quest_crews SET status = 'active' WHERE id = ?", [crewId]);
        await conn.commit();
        return "joined";
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    /**
     * Leave. A crew whose last member walks out disbands rather than lingering
     * as an empty name somebody could still hold an invite to.
     */
    async leave(crewId: string, userId: string): Promise<"left" | "disbanded" | "not-a-member"> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [res]: any = await conn.query(
          "DELETE FROM quest_crew_members WHERE crew_id = ? AND user_id = ?",
          [crewId, userId],
        );
        if (!res?.affectedRows) {
          await conn.rollback();
          return "not-a-member";
        }
        const [countRows] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM quest_crew_members WHERE crew_id = ?",
          [crewId],
        );
        let outcome: "left" | "disbanded" = "left";
        if (Number(countRows[0]?.n ?? 0) === 0) {
          await conn.query("UPDATE quest_crews SET status = 'disbanded' WHERE id = ?", [crewId]);
          outcome = "disbanded";
        }
        await conn.commit();
        return outcome;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async attachConversation(crewId: string, conversationId: string): Promise<void> {
      await pool.query("UPDATE quest_crews SET conversation_id = ? WHERE id = ?", [
        conversationId,
        crewId,
      ]);
    },

    /** Rotate an invite code, so a leaked link stops working. */
    async rotateInvite(crewId: string): Promise<string> {
      const code = newInviteCode();
      await pool.query("UPDATE quest_crews SET invite_code = ? WHERE id = ?", [code, crewId]);
      return code;
    },
  };
}

export type CrewsRepo = ReturnType<typeof crewsRepo>;
