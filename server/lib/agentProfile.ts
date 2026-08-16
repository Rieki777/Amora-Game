/**
 * The foundations both agent shapes share (round 4, lane L6): the member's
 * about-me note with its privacy tier, the consent bit for matching, the
 * drafts waiting for the member's own yes, and every sentence the assistant
 * has said ABOUT a person, with the show/correct/withdraw control.
 *
 * Three tables, one owner each. A statement's subject is the only person who
 * may correct or withdraw it; a draft's user is the only one who may confirm
 * it. Nothing here writes to a domain table: confirming a draft is the route's
 * job, and it calls the same `rsvp()` the calendar page calls.
 */
import { randomBytes } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { MEMBER_DRAFT_KINDS, validateDraftPayload, type MemberDraftKind } from "../../shared/draftKinds";

export const ABOUT_TIERS = ["private", "assistant", "members"] as const;
export type AboutTier = (typeof ABOUT_TIERS)[number];
export const ABOUT_MAX_CHARS = 2000;

/** The consent sentence, verbatim. The panel renders it and the flag means this sentence was ticked. */
export const MATCHING_CONSENT_SENTENCE =
  "The assistant may use this note and my profile to suggest introductions.";

export interface AgentProfileRow {
  userId: string;
  aboutMe: string;
  aboutTier: AboutTier;
  matchingConsent: boolean;
  corrections: { statementId: string; text: string; at: string }[];
  updatedAt: string | null;
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const parseJson = <T,>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
};

export async function getAgentProfile(pool: Pool, userId: string): Promise<AgentProfileRow> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM agent_profiles WHERE user_id = ? LIMIT 1", [userId]);
  const r = rows[0];
  if (!r) return { userId, aboutMe: "", aboutTier: "private", matchingConsent: false, corrections: [], updatedAt: null };
  return {
    userId,
    aboutMe: r.about_me ? String(r.about_me) : "",
    aboutTier: (ABOUT_TIERS as readonly string[]).includes(String(r.about_tier)) ? (String(r.about_tier) as AboutTier) : "private",
    matchingConsent: Boolean(r.matching_consent),
    corrections: parseJson<AgentProfileRow["corrections"]>(r.corrections, []),
    updatedAt: iso(r.updated_at),
  };
}

export interface ProfileInput {
  aboutMe?: unknown;
  aboutTier?: unknown;
  matchingConsent?: unknown;
}

export async function saveAgentProfile(pool: Pool, userId: string, input: ProfileInput): Promise<{ ok: true; profile: AgentProfileRow } | { ok: false; error: string }> {
  const current = await getAgentProfile(pool, userId);
  const aboutMe = input.aboutMe === undefined ? current.aboutMe : String(input.aboutMe ?? "").trim();
  if (aboutMe.length > ABOUT_MAX_CHARS) return { ok: false, error: `Keep the note under ${ABOUT_MAX_CHARS} characters` };
  const tier = input.aboutTier === undefined ? current.aboutTier : String(input.aboutTier);
  if (!(ABOUT_TIERS as readonly string[]).includes(tier)) return { ok: false, error: "The tier must be private, assistant, or members" };
  const consent = input.matchingConsent === undefined ? current.matchingConsent : input.matchingConsent === true;
  await pool.query(
    "INSERT INTO agent_profiles (user_id, about_me, about_tier, matching_consent, corrections) VALUES (?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE about_me = VALUES(about_me), about_tier = VALUES(about_tier), matching_consent = VALUES(matching_consent)",
    [userId, aboutMe || null, tier, consent ? 1 : 0, JSON.stringify(current.corrections)],
  );
  return { ok: true, profile: await getAgentProfile(pool, userId) };
}

/**
 * The note as the ASSISTANT may see it for this asker: only when the member
 * put it at the assistant tier or wider. Private stays private even from the
 * member's own in-app assistant, because that is what the word means.
 */
export async function aboutMeForAssistant(pool: Pool, userId: string): Promise<string | null> {
  const p = await getAgentProfile(pool, userId);
  if (!p.aboutMe || p.aboutTier === "private") return null;
  return p.aboutMe;
}

// ── Member drafts ────────────────────────────────────────────────────────────

export interface MemberDraftRow {
  id: string;
  userId: string;
  kind: MemberDraftKind;
  payload: Record<string, unknown>;
  source: "assistant" | "token";
  status: "proposed" | "confirmed" | "rejected" | "expired";
  createdAt: string;
  decidedAt: string | null;
  createdRef: string | null;
}

function toMemberDraft(r: RowDataPacket): MemberDraftRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    kind: String(r.kind) as MemberDraftKind,
    payload: parseJson<Record<string, unknown>>(r.payload, {}),
    source: r.source === "token" ? "token" : "assistant",
    status: String(r.status) as MemberDraftRow["status"],
    createdAt: iso(r.created_at) ?? "",
    decidedAt: iso(r.decided_at),
    createdRef: r.created_ref ? String(r.created_ref) : null,
  };
}

/** A draft is only ever proposed after its payload passed the shared validator, again. */
export async function proposeMemberDraft(
  pool: Pool,
  userId: string,
  kind: string,
  payload: unknown,
  source: "assistant" | "token",
): Promise<{ ok: true; draft: MemberDraftRow } | { ok: false; error: string }> {
  if (!(MEMBER_DRAFT_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `unknown member draft kind: ${String(kind)}` };
  const shape = validateDraftPayload(kind, payload);
  if (shape) return { ok: false, error: shape };
  const id = `mdr-${randomBytes(8).toString("hex")}`;
  await pool.query(
    "INSERT INTO member_drafts (id, user_id, kind, payload, source) VALUES (?,?,?,?,?)",
    [id, userId, kind, JSON.stringify(payload), source],
  );
  const draft = await memberDraftById(pool, id);
  return draft ? { ok: true, draft } : { ok: false, error: "the draft did not save" };
}

export async function memberDraftById(pool: Pool, id: string): Promise<MemberDraftRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM member_drafts WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? toMemberDraft(rows[0]) : null;
}

export async function listMemberDrafts(pool: Pool, userId: string, status: MemberDraftRow["status"] | "all" = "proposed"): Promise<MemberDraftRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    status === "all"
      ? "SELECT * FROM member_drafts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      : "SELECT * FROM member_drafts WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50",
    status === "all" ? [userId] : [userId, status],
  );
  return rows.map(toMemberDraft);
}

/** Flip a proposed draft to a decided state, once. False when it was already decided or is not yours. */
export async function decideMemberDraft(
  pool: Pool,
  userId: string,
  id: string,
  status: "confirmed" | "rejected" | "expired",
  createdRef: string | null = null,
): Promise<boolean> {
  const [r]: any = await pool.query(
    "UPDATE member_drafts SET status = ?, decided_at = UTC_TIMESTAMP(), created_ref = ? WHERE id = ? AND user_id = ? AND status = 'proposed'",
    [status, createdRef, id, userId],
  );
  return Number(r?.affectedRows ?? 0) > 0;
}

// ── Statements about a person ────────────────────────────────────────────────

export interface StatementRow {
  id: string;
  subjectUserId: string;
  mode: string;
  text: string;
  sources: string[];
  status: "active" | "corrected" | "withdrawn";
  correction: string | null;
  createdAt: string;
  decidedAt: string | null;
}

function toStatement(r: RowDataPacket): StatementRow {
  return {
    id: String(r.id),
    subjectUserId: String(r.subject_user_id),
    mode: String(r.mode),
    text: String(r.text),
    sources: parseJson<string[]>(r.sources, []),
    status: String(r.status) as StatementRow["status"],
    correction: r.correction ? String(r.correction) : null,
    createdAt: iso(r.created_at) ?? "",
    decidedAt: iso(r.decided_at),
  };
}

/** Record what the assistant said about someone. Empty text records nothing. */
export async function recordStatement(pool: Pool, input: { subjectUserId: string; mode: string; text: unknown; sources?: string[] }): Promise<StatementRow | null> {
  const text = String(input.text ?? "").trim().slice(0, 1000);
  if (!text) return null;
  const id = `ast-${randomBytes(8).toString("hex")}`;
  await pool.query(
    "INSERT INTO assistant_statements (id, subject_user_id, mode, text, sources) VALUES (?,?,?,?,?)",
    [id, input.subjectUserId, String(input.mode).slice(0, 24), text, JSON.stringify(input.sources ?? [])],
  );
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM assistant_statements WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? toStatement(rows[0]) : null;
}

export async function listStatements(pool: Pool, subjectUserId: string): Promise<StatementRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM assistant_statements WHERE subject_user_id = ? ORDER BY created_at DESC LIMIT 50",
    [subjectUserId],
  );
  return rows.map(toStatement);
}

/**
 * Correct or withdraw. Only the subject may, and only once: a corrected
 * statement keeps the original text beside the member's words so the record
 * shows what was said and what was true. A correction is also folded into the
 * profile's corrections list so a later prompt can carry it.
 */
export async function decideStatement(
  pool: Pool,
  subjectUserId: string,
  id: string,
  action: "corrected" | "withdrawn",
  correction: unknown = null,
): Promise<{ ok: true; statement: StatementRow } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const words = String(correction ?? "").trim().slice(0, 1000);
  if (action === "corrected" && !words) return { ok: false, status: 400, error: "Say what is true instead" };
  const [r]: any = await pool.query(
    "UPDATE assistant_statements SET status = ?, correction = ?, decided_at = UTC_TIMESTAMP() WHERE id = ? AND subject_user_id = ? AND status = 'active'",
    [action, action === "corrected" ? words : null, id, subjectUserId],
  );
  if (!Number(r?.affectedRows ?? 0)) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM assistant_statements WHERE id = ? AND subject_user_id = ? LIMIT 1", [id, subjectUserId]);
    if (!rows[0]) return { ok: false, status: 404, error: "Not found" };
    return { ok: false, status: 409, error: `That statement was already ${String(rows[0].status)}` };
  }
  if (action === "corrected") {
    const profile = await getAgentProfile(pool, subjectUserId);
    const corrections = [...profile.corrections, { statementId: id, text: words, at: new Date().toISOString() }].slice(-50);
    await pool.query(
      "INSERT INTO agent_profiles (user_id, about_me, about_tier, matching_consent, corrections) VALUES (?,?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE corrections = VALUES(corrections)",
      [subjectUserId, profile.aboutMe || null, profile.aboutTier, profile.matchingConsent ? 1 : 0, JSON.stringify(corrections)],
    );
  }
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM assistant_statements WHERE id = ? LIMIT 1", [id]);
  return { ok: true, statement: toStatement(rows[0]) };
}
