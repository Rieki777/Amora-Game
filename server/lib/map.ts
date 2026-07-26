/**
 * The village map's coordination brain (S22-S23): the deterministic concierge
 * scorer and the contact-relay ledger. Deterministic FIRST — most questions
 * resolve with zero LLM tokens; the assistant is only consulted for ambiguous
 * asks, its answer validated against the candidate set (evidence or drop:
 * model text never picks a recipient by itself).
 */
import crypto from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface Candidate {
  kind: "circle" | "role" | "quest";
  id: string;
  name: string;
  purpose?: string | null;
  /** Extra searchable text: aliases for circles, tags for quests. */
  extra?: string[];
}

export interface ScoredMatch extends Candidate {
  score: number;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ");

/**
 * Score every candidate against the query: +3 per tag/alias hit, +2 per name
 * hit, +1 per purpose hit. Aliases count as circle-name hits (+2).
 */
export function scoreCandidates(query: string, candidates: Candidate[]): ScoredMatch[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  return candidates
    .map((c) => {
      const name = norm(c.name);
      const purpose = norm(c.purpose ?? "");
      const extras = (c.extra ?? []).map(norm);
      let score = 0;
      for (const w of words) {
        if (extras.some((e) => e.includes(w))) score += c.kind === "quest" ? 3 : 2;
        if (name.includes(w)) score += 2;
        if (purpose.includes(w)) score += 1;
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * The deterministic decision rule: a clear winner (score ≥ 3, leading the
 * runner-up by ≥ 2) resolves without the assistant.
 */
export function deterministicWinner(scored: ScoredMatch[]): ScoredMatch | null {
  if (!scored.length) return null;
  const [top, second] = scored;
  if (top.score >= 3 && (!second || top.score - second.score >= 2)) return top;
  return null;
}

// ── Contact relay ledger ─────────────────────────────────────────────────────

export function contactIdempotencyKey(fromId: string, toId: string, message: string): string {
  const digest = crypto.createHash("sha1").update(message).digest("hex").slice(0, 24);
  return `contact:${fromId}:${toId}:${digest}`;
}

export async function insertContactRequest(
  pool: Pool,
  input: {
    fromUserId: string;
    toUserId: string;
    roleId?: string | null;
    circleId?: string | null;
    questId?: string | null;
    queryId?: string | null;
    message: string;
    source: "map" | "concierge";
  },
): Promise<{ id: string; duplicate: boolean }> {
  const id = `ctr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await pool.query(
      "INSERT INTO contact_requests (id, from_user_id, to_user_id, role_id, circle_id, quest_id, query_id, message, source, idempotency_key) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        input.fromUserId,
        input.toUserId,
        input.roleId ?? null,
        input.circleId ?? null,
        input.questId ?? null,
        input.queryId ?? null,
        input.message,
        input.source,
        contactIdempotencyKey(input.fromUserId, input.toUserId, input.message),
      ],
    );
    return { id, duplicate: false };
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") return { id: "", duplicate: true };
    throw e;
  }
}

export async function contactCountsToday(pool: Pool, fromUserId: string, toUserId: string) {
  const [[sent]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM contact_requests WHERE from_user_id = ? AND created_at >= (NOW() - INTERVAL 1 DAY)",
    [fromUserId],
  );
  const [[received]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM contact_requests WHERE to_user_id = ? AND created_at >= (NOW() - INTERVAL 1 DAY)",
    [toUserId],
  );
  return { sent: Number(sent?.n ?? 0), received: Number(received?.n ?? 0) };
}

export async function setContactEmailStatus(pool: Pool, id: string, status: "sent" | "failed") {
  await pool.query("UPDATE contact_requests SET email_status = ? WHERE id = ?", [status, id]);
}

// ── Concierge query log ──────────────────────────────────────────────────────

export async function logConciergeQuery(
  pool: Pool,
  input: {
    userId: string | null;
    query: string;
    matchedKind: "role" | "quest" | "circle" | "none";
    matchedId?: string | null;
    method: "deterministic" | "llm";
  },
): Promise<string> {
  const id = `ccq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await pool.query(
    "INSERT INTO concierge_queries (id, user_id, query, matched_kind, matched_id, method) VALUES (?,?,?,?,?,?)",
    [id, input.userId, input.query.slice(0, 500), input.matchedKind, input.matchedId ?? null, input.method],
  );
  return id;
}

export async function markQueryContacted(pool: Pool, queryId: string) {
  await pool.query("UPDATE concierge_queries SET contacted = 1 WHERE id = ?", [queryId]);
}

export async function conciergeLog(pool: Pool, unmatchedOnly: boolean, limit = 100): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, user_id, query, matched_kind, matched_id, method, contacted, created_at FROM concierge_queries ${
      unmatchedOnly ? "WHERE matched_kind = 'none'" : ""
    } ORDER BY created_at DESC LIMIT ?`,
    [Math.min(500, limit)],
  );
  return rows;
}

export async function contactLog(pool: Pool, limit = 100): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, from_user_id, to_user_id, role_id, circle_id, quest_id, query_id, source, email_status, created_at " +
      "FROM contact_requests ORDER BY created_at DESC LIMIT ?",
    [Math.min(500, limit)],
  );
  return rows;
}

/** S18 rider: relay bodies are correspondence — age them out, keep the event. */
export async function sweepContactBodies(pool: Pool, days: number): Promise<number> {
  if (days <= 0) return 0;
  const [r]: any = await pool.query(
    "UPDATE contact_requests SET message = '[expired]' WHERE message <> '[expired]' AND created_at < (NOW() - INTERVAL ? DAY)",
    [days],
  );
  return r.affectedRows ?? 0;
}
