/**
 * Voting weight, resolved and recorded (round 5, lane G1; GOV_DESIGN 2.2).
 *
 * Three modes, chosen by the founder-held `governance.weight_mode`:
 *
 *   equal   every electorate member weighs 1. One person, one vote.
 *   token   weight = the member's balance of `governance.weight_token` at
 *           ballot open, read from the ledger's recomputed token_balances
 *           (recompute, never increment — the cache is already the truth by
 *           the time this reads it). Platform-governed tokens only: a
 *           hypha-governed mirror is a display-only fact about Base, and
 *           weighting votes by it would make this platform the cap table's
 *           second source of truth.
 *   custom  weight = the member's governance_weights row. Absent row = 0,
 *           fail closed: nobody holds power an admin never assigned.
 *
 * Every custom-mode change appends to governance_weight_changes with a
 * REQUIRED note. The trail is member-visible by design: weights are power,
 * and hidden power ends here.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { tokenDef, memberAccount } from "./ledger";

export type WeightMode = "equal" | "token" | "custom";

export interface WeightModeSnapshot {
  mode: WeightMode;
  /** The token slug when mode = token, else null. */
  token: string | null;
}

/**
 * Refuse a weight-token choice the engine may not conduct. Returns the
 * refusal sentence, or null when the token can weigh votes.
 */
export function weightTokenProblem(slug: string): string | null {
  const def = tokenDef(slug);
  if (!def) return `No token called "${slug}" exists in this village's registry`;
  if (def.governance !== "platform") {
    return `${def.name} is governed on Hypha and only mirrored here. Voting weight reads platform-governed tokens only`;
  }
  return null;
}

/**
 * Resolve each member's weight under a mode. Members absent from the returned
 * map weigh 0 by contract; the caller decides whether a zero-weight member
 * still enters the electorate (they do: an electorate row with weight 0 keeps
 * the record of who was asked, while adding nothing to any tally).
 */
export async function weightsFor(
  pool: Pool,
  userIds: string[],
  snapshot: WeightModeSnapshot,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  if (snapshot.mode === "equal") {
    for (const id of userIds) out.set(id, 1);
    return out;
  }
  if (snapshot.mode === "token") {
    const slug = snapshot.token ?? "";
    const problem = weightTokenProblem(slug);
    if (problem) throw new Error(problem);
    const accounts = userIds.map((id) => memberAccount(id));
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT account_id, balance FROM token_balances WHERE token_type = ? AND account_id IN (${accounts.map(() => "?").join(",")})`,
      [slug, ...accounts],
    );
    const byAccount = new Map(rows.map((r) => [String(r.account_id), Number(r.balance)]));
    for (const id of userIds) {
      // A negative member balance cannot happen outside faucet accounts; the
      // clamp is belt to that braces so weight never goes below zero.
      out.set(id, Math.max(0, byAccount.get(memberAccount(id)) ?? 0));
    }
    return out;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT user_id, weight FROM governance_weights WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    userIds,
  );
  const byUser = new Map(rows.map((r) => [String(r.user_id), Number(r.weight)]));
  for (const id of userIds) out.set(id, Math.max(0, byUser.get(id) ?? 0));
  return out;
}

export interface WeightChangeInput {
  userId: string;
  weight: number;
  actorUserId: string;
  note: string;
}

/** What is wrong with a proposed allocation, or null. Shared by set and bulk. */
export function weightChangeProblem(input: { weight: unknown; note: unknown }): string | null {
  const w = Number(input.weight);
  if (!Number.isFinite(w) || w < 0) return "A weight must be zero or a positive number";
  if (w > 1_000_000_000) return "That weight is past any believable allocation. Check the number";
  const note = String(input.note ?? "").trim();
  if (!note) return "Every weight change carries a reason. Say why";
  if (note.length > 500) return "The reason runs past 500 characters";
  return null;
}

/**
 * Set one member's custom-mode weight and append the audit row, in one
 * transaction. The current-state upsert and the trail row commit together or
 * never: an allocation the trail cannot explain must not exist.
 */
export async function setWeight(pool: Pool, input: WeightChangeInput): Promise<void> {
  const problem = weightChangeProblem(input);
  if (problem) throw new Error(problem);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [prev] = await conn.query<RowDataPacket[]>(
      "SELECT weight FROM governance_weights WHERE user_id = ? FOR UPDATE",
      [input.userId],
    );
    const oldWeight = prev[0] ? Number(prev[0].weight) : null;
    await conn.query( // module-review-ok: the weight tables' one enumerable home; state and trail commit in one transaction here and nowhere else
      "INSERT INTO governance_weights (user_id, weight) VALUES (?,?) ON DUPLICATE KEY UPDATE weight = VALUES(weight)",
      [input.userId, input.weight],
    );
    await conn.query( // module-review-ok: the weight tables' one enumerable home; state and trail commit in one transaction here and nowhere else
      "INSERT INTO governance_weight_changes (user_id, old_weight, new_weight, actor_user_id, note) VALUES (?,?,?,?,?)",
      [input.userId, oldWeight, input.weight, input.actorUserId, input.note.trim()],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export interface WeightChangeRow {
  id: string;
  userId: string;
  oldWeight: number | null;
  newWeight: number;
  actorUserId: string;
  note: string;
  at: string;
}

/** The append-only trail, newest first. One member's, or everyone's. */
export async function weightHistory(pool: Pool, userId?: string, limit = 200): Promise<WeightChangeRow[]> {
  const capped = Math.max(1, Math.min(500, limit));
  const [rows] = userId
    ? await pool.query<RowDataPacket[]>(
        "SELECT * FROM governance_weight_changes WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?",
        [userId, capped],
      )
    : await pool.query<RowDataPacket[]>(
        "SELECT * FROM governance_weight_changes ORDER BY at DESC, id DESC LIMIT ?",
        [capped],
      );
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    oldWeight: r.old_weight === null ? null : Number(r.old_weight),
    newWeight: Number(r.new_weight),
    actorUserId: String(r.actor_user_id),
    note: String(r.note),
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
  }));
}

/** Current custom-mode allocations, for the admin table and the member trail. */
export async function allWeights(pool: Pool): Promise<Map<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT user_id, weight FROM governance_weights");
  return new Map(rows.map((r) => [String(r.user_id), Number(r.weight)]));
}
