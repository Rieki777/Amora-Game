/**
 * Ballots: the on-site decision engine's conduct (round 5, lane G1).
 *
 * The rules this file exists to hold, each enforced mechanically:
 *
 *  - THE SNAPSHOT LAW. Method, dials, electorate and weights freeze inside
 *    the open transaction. Every later evaluation reads the ballot's own
 *    columns and the frozen electorate, never live settings or balances —
 *    "A vote is counted against the day it opened" (Ring 0).
 *  - ONE OPEN BALLOT PER SUBJECT. `open_key` is UNIQUE NOT NULL and holds
 *    `${subject_type}:${subject_ref}` while open; the close rewrites it to
 *    carry the ballot id, freeing the key for a fresh ballot. Double-open is
 *    a race-free no-op on the index, never an application-level check.
 *  - VOTES ARE CHANGEABLE UNTIL CLOSE. A vote is a PK upsert, refused once
 *    the ballot left `open` or the clock passed `closes_at` (harvest 2:
 *    "You can change your vote until the voting period closes").
 *  - CLOSING IS A HUMAN ACT. Nothing auto-executes at expiry. The close is
 *    one guarded UPDATE (`WHERE status='open'`); zero rows affected means
 *    someone else closed it first — return the current state, execute
 *    nothing. An `outcome_note` is required on every close (the Loomio
 *    stated outcome). WHO may close, and when, is the route's judgment:
 *    after `closes_at` the proposer joins the closers; while the ballot is
 *    still running only a `proposal.decide` holder or an admin may close
 *    early, and a consent ballot never passes before its window ends.
 *
 * Callers hand this file a pool and plain inputs. Variables, capabilities
 * and subject-table flips live with the routes (server/index.ts), which is
 * what lets the unit tests prove the snapshot law by handing in dials and
 * then "changing the village settings" without a registry in sight.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  evaluateBallot,
  quorumPctOf,
  unityPctOf,
  VOTE_CHOICES,
  type BallotMethod,
  type BallotOutcome,
  type BallotTallies,
  type VoteChoice,
} from "../../shared/governanceEngine";
import type { WeightMode } from "./governanceWeights";

export interface BallotRow {
  id: string;
  subjectType: string;
  subjectRef: string;
  openKey: string;
  title: string;
  docMarkdown: string;
  method: BallotMethod;
  weightMode: WeightMode;
  weightToken: string | null;
  unityPct: number;
  quorumPct: number;
  totalWeight: number;
  electorateCount: number;
  openedBy: string;
  opensAt: string;
  closesAt: string;
  status: "open" | "passed" | "failed" | "no_quorum" | "withdrawn";
  outcomeNote: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export function rowToBallot(r: RowDataPacket): BallotRow {
  return {
    id: String(r.id),
    subjectType: String(r.subject_type),
    subjectRef: String(r.subject_ref),
    openKey: String(r.open_key),
    title: String(r.title),
    docMarkdown: String(r.doc_markdown),
    method: r.method as BallotMethod,
    weightMode: r.weight_mode as WeightMode,
    weightToken: r.weight_token ?? null,
    unityPct: Number(r.unity_pct),
    quorumPct: Number(r.quorum_pct),
    totalWeight: Number(r.total_weight),
    electorateCount: Number(r.electorate_count),
    openedBy: String(r.opened_by),
    opensAt: iso(r.opens_at),
    closesAt: iso(r.closes_at),
    status: r.status,
    outcomeNote: r.outcome_note ?? null,
    closedBy: r.closed_by ?? null,
    closedAt: r.closed_at === null || r.closed_at === undefined ? null : iso(r.closed_at),
    createdAt: iso(r.created_at),
  };
}

export async function ballotById(pool: Pool, id: string): Promise<BallotRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM ballots WHERE id = ?", [id]);
  return rows[0] ? rowToBallot(rows[0]) : null;
}

/** The open ballot on a subject, if one is running. */
export async function openBallotFor(pool: Pool, subjectType: string, subjectRef: string): Promise<BallotRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ballots WHERE open_key = ? AND status = 'open'",
    [`${subjectType}:${subjectRef}`],
  );
  return rows[0] ? rowToBallot(rows[0]) : null;
}

export async function ballotsFor(pool: Pool, subjectType: string, subjectRef: string): Promise<BallotRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ballots WHERE subject_type = ? AND subject_ref = ? ORDER BY created_at DESC, id DESC",
    [subjectType, subjectRef],
  );
  return rows.map(rowToBallot);
}

export interface OpenBallotInput {
  subjectType: string;
  subjectRef: string;
  title: string;
  docMarkdown: string;
  method: BallotMethod;
  weightMode: WeightMode;
  weightToken?: string | null;
  unityPct: number;
  quorumPct: number;
  /** Days until closes_at (vote days, or the consent window). */
  durationDays: number;
  openedBy: string;
  /** The frozen who-and-how-much. Weights already resolved by the caller. */
  electorate: Array<{ userId: string; weight: number }>;
  /**
   * Runs INSIDE the open transaction, after the ballot and electorate rows
   * are written: the subject's own status flip, so "a ballot exists" and
   * "the subject says it is being voted on" commit together or never.
   */
  onOpen?: (conn: PoolConnection, ballotId: string) => Promise<void>;
}

export type OpenBallotResult =
  | { ok: true; ballot: BallotRow }
  | { ok: false; error: string; alreadyOpen?: BallotRow };

/**
 * Open a ballot: one transaction writing the snapshot whole. Fail-closed on
 * an empty electorate or zero total weight, with the sentence saying why —
 * a vote nobody could cast, or one where no cast could count, must refuse to
 * exist rather than sit unwinnable.
 */
export async function openBallot(pool: Pool, input: OpenBallotInput): Promise<OpenBallotResult> {
  const electorate = input.electorate.filter((e) => e.userId);
  if (electorate.length === 0) {
    return { ok: false, error: "Nobody is eligible to vote on this, so the ballot refuses to open. Check who holds ballot.vote and, in custom mode, who holds weight" };
  }
  const totalWeight = electorate.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (!(totalWeight > 0)) {
    return { ok: false, error: "The electorate's total voting weight is zero, so no vote could ever count. Allocate weight before opening a ballot" };
  }
  const days = Math.max(1, Math.min(90, Math.trunc(input.durationDays) || 1));
  const id = `bal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const openKey = `${input.subjectType}:${input.subjectRef}`;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query( // module-review-ok: the ballot tables' one enumerable home (the intents.ts pattern; no cache sits above them)
      "INSERT INTO ballots (id, subject_type, subject_ref, open_key, title, doc_markdown, method, " +
        "weight_mode, weight_token, unity_pct, quorum_pct, total_weight, electorate_count, opened_by, " +
        "opens_at, closes_at, status) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'open')",
      [
        id,
        input.subjectType,
        input.subjectRef,
        openKey,
        input.title.slice(0, 200),
        input.docMarkdown,
        input.method,
        input.weightMode,
        input.weightToken ?? null,
        input.unityPct,
        input.quorumPct,
        totalWeight,
        electorate.length,
        input.openedBy,
        days,
      ],
    );
    for (const e of electorate) {
      await conn.query("INSERT INTO ballot_electorate (ballot_id, user_id, weight) VALUES (?,?,?)", [ // module-review-ok: the ballot tables' one enumerable home (the intents.ts pattern; no cache sits above them)
        id,
        e.userId,
        Math.max(0, e.weight),
      ]);
    }
    if (input.onOpen) await input.onOpen(conn, id);
    await conn.commit();
  } catch (e: any) {
    await conn.rollback();
    conn.release();
    if (e?.code === "ER_DUP_ENTRY") {
      const existing = await openBallotFor(pool, input.subjectType, input.subjectRef);
      return {
        ok: false,
        error: "A ballot is already open on this. One decision, one ballot",
        alreadyOpen: existing ?? undefined,
      };
    }
    throw e;
  }
  conn.release();
  const ballot = await ballotById(pool, id);
  if (!ballot) throw new Error(`ballot ${id} vanished inside its own open`);
  return { ok: true, ballot };
}

/** Weighted sums per choice, read from the frozen electorate. */
export async function talliesFor(pool: Pool, ballotId: string): Promise<BallotTallies> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT v.choice, COALESCE(SUM(e.weight), 0) AS w FROM ballot_votes v " +
      "JOIN ballot_electorate e ON e.ballot_id = v.ballot_id AND e.user_id = v.user_id " +
      "WHERE v.ballot_id = ? GROUP BY v.choice",
    [ballotId],
  );
  const t: BallotTallies = { yesW: 0, noW: 0, abstainW: 0 };
  for (const r of rows) {
    if (r.choice === "yes") t.yesW = Number(r.w);
    else if (r.choice === "no") t.noW = Number(r.w);
    else if (r.choice === "abstain") t.abstainW = Number(r.w);
  }
  return t;
}

/**
 * Objections that stand between this ballot and passing: the unruled (`open`)
 * and the upheld (`integrated`). A concern is recorded and does not block; a
 * withdrawal is a retraction. An INTEGRATED objection blocks by design
 * (GOV_DESIGN 2.4): it means the proposal must change, so the ballot closes
 * as failed and the subject returns to staging for a fresh ballot.
 */
export async function standingObjectionCount(pool: Pool, ballotId: string): Promise<number> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM ballot_objections WHERE ballot_id = ? AND status IN ('open','integrated')",
    [ballotId],
  );
  return Number(row.n);
}

export type VoteResult = { ok: true; choice: VoteChoice } | { ok: false; error: string };

/**
 * Cast or change a vote: a PK upsert, allowed while the ballot is `open` and
 * the clock has not passed `closes_at`. Only frozen electorate members vote,
 * and their weight is read at tally time from the frozen row — never here.
 * In consent mode a `no` requires a reason and auto-files an objection (one
 * open objection per voter from this path; re-voting `no` updates it).
 */
export async function castVote(
  pool: Pool,
  ballotId: string,
  userId: string,
  choiceRaw: string,
  reason?: string,
): Promise<VoteResult> {
  const choice = String(choiceRaw) as VoteChoice;
  if (!VOTE_CHOICES.includes(choice)) {
    return { ok: false, error: "A vote is yes, no, or abstain" };
  }
  const ballot = await ballotById(pool, ballotId);
  if (!ballot) return { ok: false, error: "No such ballot" };
  if (ballot.status !== "open") {
    return { ok: false, error: `This ballot is ${ballot.status.replace("_", " ")}. Voting ended when it closed` };
  }
  if (Date.parse(ballot.closesAt) <= Date.now()) {
    return { ok: false, error: "The voting period has ended. Votes are locked until a human closes the ballot" };
  }
  const [inRoll] = await pool.query<RowDataPacket[]>(
    "SELECT weight FROM ballot_electorate WHERE ballot_id = ? AND user_id = ?",
    [ballotId, userId],
  );
  if (!inRoll[0]) {
    return { ok: false, error: "You are outside this ballot's electorate. Who may vote froze when it opened" };
  }
  const cleanReason = String(reason ?? "").trim().slice(0, 2000);
  if (ballot.method === "consent" && choice === "no" && !cleanReason) {
    return { ok: false, error: "A no in consent mode is an objection, and an objection carries its reasoning. Say why" };
  }
  await pool.query( // module-review-ok: the ballot tables' one enumerable home (the intents.ts pattern; no cache sits above them)
    "INSERT INTO ballot_votes (ballot_id, user_id, choice, reason) VALUES (?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE choice = VALUES(choice), reason = VALUES(reason)",
    [ballotId, userId, choice, cleanReason || null],
  );
  if (ballot.method === "consent" && choice === "no") {
    const [mine] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM ballot_objections WHERE ballot_id = ? AND user_id = ? AND status = 'open' LIMIT 1",
      [ballotId, userId],
    );
    if (mine[0]) {
      await pool.query("UPDATE ballot_objections SET text = ? WHERE id = ?", [cleanReason, String(mine[0].id)]); // module-review-ok: the ballot tables' one enumerable home (the intents.ts pattern; no cache sits above them)
    } else {
      await fileObjection(pool, ballotId, userId, cleanReason);
    }
  }
  return { ok: true, choice };
}

export async function fileObjection(
  pool: Pool,
  ballotId: string,
  userId: string,
  text: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const clean = String(text ?? "").trim().slice(0, 2000);
  if (!clean) return { ok: false, error: "An objection is its reasoning. Say what consequence or risk you see" };
  const ballot = await ballotById(pool, ballotId);
  if (!ballot) return { ok: false, error: "No such ballot" };
  if (ballot.method !== "consent") {
    return { ok: false, error: "Objections belong to consent ballots. On a voting ballot, vote no and say why" };
  }
  if (ballot.status !== "open") return { ok: false, error: "This ballot has closed" };
  const [inRoll] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM ballot_electorate WHERE ballot_id = ? AND user_id = ?",
    [ballotId, userId],
  );
  if (!inRoll[0]) return { ok: false, error: "Objections come from the ballot's own electorate" };
  const id = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query( // module-review-ok: the ballot tables' one enumerable home (the intents.ts pattern; no cache sits above them)
    "INSERT INTO ballot_objections (id, ballot_id, user_id, text, status) VALUES (?,?,?,?,'open')",
    [id, ballotId, userId, clean],
  );
  return { ok: true, id };
}

export const OBJECTION_RULINGS = ["integrated", "concern", "withdrawn"] as const;
export type ObjectionRuling = (typeof OBJECTION_RULINGS)[number];

/**
 * Rule an objection (S3.0 step 6, "test arguments as objections"). Every
 * ruling writes who, when and why: the judgment is on the record, which is
 * what keeps a facilitator honest. Only `open` objections take a ruling.
 */
export async function ruleObjection(
  pool: Pool,
  input: { objectionId: string; ruling: string; ruledBy: string; note: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ruling = String(input.ruling) as ObjectionRuling;
  if (!OBJECTION_RULINGS.includes(ruling)) {
    return { ok: false, error: "A ruling is integrated, concern, or withdrawn" };
  }
  const note = String(input.note ?? "").trim().slice(0, 2000);
  if (!note) return { ok: false, error: "Every ruling carries its reasoning. Say why" };
  const [result] = await pool.query<any>(
    "UPDATE ballot_objections SET status = ?, ruled_by = ?, ruled_at = NOW(), ruling_note = ? " +
      "WHERE id = ? AND status = 'open'",
    [ruling, input.ruledBy, note, input.objectionId],
  );
  if (Number(result.affectedRows) === 0) {
    return { ok: false, error: "That objection is already ruled, or does not exist" };
  }
  return { ok: true };
}

export async function objectionsFor(pool: Pool, ballotId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ballot_objections WHERE ballot_id = ? ORDER BY created_at, id",
    [ballotId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    text: String(r.text),
    status: String(r.status) as "open" | ObjectionRuling,
    ruledBy: r.ruled_by ?? null,
    ruledAt: r.ruled_at ? iso(r.ruled_at) : null,
    rulingNote: r.ruling_note ?? null,
    createdAt: iso(r.created_at),
  }));
}

export interface CloseBallotInput {
  ballotId: string;
  closedBy: string;
  outcomeNote: string;
  /** True when the closer holds proposal.decide or is an admin. */
  closerMayCloseEarly: boolean;
}

export type CloseBallotResult =
  | { ok: true; outcome: BallotOutcome; ballot: BallotRow; tallies: BallotTallies; unity: number; quorum: number }
  | { ok: false; error: string; alreadyClosed?: BallotRow };

/**
 * The guarded human close (GOV_DESIGN 2.5). Computes the outcome from the
 * frozen snapshot, then takes the one transition:
 *
 *   UPDATE ballots SET status=?, outcome_note=?, closed_by=?, closed_at=NOW(),
 *          open_key=CONCAT(open_key, ':', id)
 *    WHERE id=? AND status='open'
 *
 * Zero rows affected = someone else closed it first: return the current
 * state, execute nothing. The open_key rewrite frees the subject for a
 * fresh ballot; snapshots are immutable, so an amendment is a NEW ballot.
 */
export async function closeBallot(pool: Pool, input: CloseBallotInput): Promise<CloseBallotResult> {
  const note = String(input.outcomeNote ?? "").trim().slice(0, 4000);
  if (!note) {
    return { ok: false, error: "Closing a ballot records the outcome in a human sentence. The note is required" };
  }
  const ballot = await ballotById(pool, input.ballotId);
  if (!ballot) return { ok: false, error: "No such ballot" };
  if (ballot.status !== "open") {
    return { ok: false, error: `This ballot is already ${ballot.status.replace("_", " ")}`, alreadyClosed: ballot };
  }
  const expired = Date.parse(ballot.closesAt) <= Date.now();
  const tallies = await talliesFor(pool, ballot.id);
  const openObjections = ballot.method === "consent" ? await standingObjectionCount(pool, ballot.id) : 0;
  if (!expired && !input.closerMayCloseEarly) {
    return {
      ok: false,
      error: "The voting period is still running. Before it ends, only a proposal.decide holder or an admin may close a ballot",
    };
  }
  const outcome = evaluateBallot({
    method: ballot.method,
    unityPct: ballot.unityPct,
    quorumPct: ballot.quorumPct,
    totalWeight: ballot.totalWeight,
    tallies,
    openObjections,
  });
  if (!expired && ballot.method === "consent" && outcome === "passed") {
    // Silence only means consent once the whole window has had its say.
    return { ok: false, error: "A consent ballot passes only after its window ends. It can close early only against a standing objection" };
  }
  const [result] = await pool.query<any>(
    "UPDATE ballots SET status=?, outcome_note=?, closed_by=?, closed_at=NOW(), open_key=CONCAT(open_key, ':', id) " +
      "WHERE id=? AND status='open'",
    [outcome, note, input.closedBy, ballot.id],
  );
  if (Number(result.affectedRows) === 0) {
    const current = await ballotById(pool, ballot.id);
    return { ok: false, error: "Someone else closed this ballot first", alreadyClosed: current ?? undefined };
  }
  const closed = await ballotById(pool, ballot.id);
  return {
    ok: true,
    outcome,
    ballot: closed!,
    tallies,
    unity: unityPctOf(tallies),
    quorum: quorumPctOf(tallies, ballot.totalWeight),
  };
}

/** How many votes stand on a ballot. Cheap, and it decides who may withdraw. */
export async function voteCount(pool: Pool, ballotId: string): Promise<number> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM ballot_votes WHERE ballot_id = ?",
    [ballotId],
  );
  return Number(row.n);
}

export interface WithdrawBallotInput {
  ballotId: string;
  withdrawnBy: string;
  /** Required, same posture as an outcome note: a cancellation is a record. */
  reason: string;
  /**
   * True when the withdrawer holds proposal.decide or is an admin. Only they
   * may withdraw a ballot people have already voted on.
   */
  withdrawerMayDiscardVotes: boolean;
}

export type WithdrawBallotResult =
  | { ok: true; ballot: BallotRow; votesDiscarded: number }
  | { ok: false; error: string; alreadyClosed?: BallotRow };

/**
 * Call a ballot off (0089 declared `status='withdrawn'` and gave it UI
 * treatment; no route ever wrote it, so a vote opened in error had no way out
 * and the interface implied one).
 *
 * A withdrawal is a close that decides NOTHING. It takes the same guarded
 * single transition the close takes, records who and when and why in the same
 * three columns the decision page already reads, and rewrites `open_key` so
 * the subject is free for a fresh ballot immediately. It never evaluates,
 * never executes, and never writes an outcome: `status='withdrawn'` is its own
 * fact and reads as neither passed nor failed.
 *
 * WHO MAY, and the reason the rule is not just "whoever opened it": a
 * withdrawal throws away votes that members already cast, and cast votes are
 * the one thing in this engine that belongs to somebody other than the opener.
 * So an opener may call off a ballot NOBODY HAS ANSWERED YET, which is the
 * opened-in-error case this exists for, and once even one vote stands the act
 * needs a proposal.decide holder or an admin. `votesDiscarded` comes back so
 * the caller can say in words what the withdrawal cost.
 */
export async function withdrawBallot(pool: Pool, input: WithdrawBallotInput): Promise<WithdrawBallotResult> {
  const reason = String(input.reason ?? "").trim().slice(0, 4000);
  if (!reason) {
    return { ok: false, error: "Calling off a vote records why, in a human sentence. The reason is required" };
  }
  const ballot = await ballotById(pool, input.ballotId);
  if (!ballot) return { ok: false, error: "No such ballot" };
  if (ballot.status !== "open") {
    return {
      ok: false,
      error: `This ballot is already ${ballot.status.replace("_", " ")}, so there is nothing to call off`,
      alreadyClosed: ballot,
    };
  }
  const votes = await voteCount(pool, ballot.id);
  if (votes > 0 && !input.withdrawerMayDiscardVotes) {
    return {
      ok: false,
      error: `${votes} member(s) have already voted on this. Discarding votes that are already cast takes a proposal.decide holder or an admin. Close it and record the outcome instead`,
    };
  }
  const [result] = await pool.query<any>(
    "UPDATE ballots SET status='withdrawn', outcome_note=?, closed_by=?, closed_at=NOW(), " +
      "open_key=CONCAT(open_key, ':', id) WHERE id=? AND status='open'",
    [reason, input.withdrawnBy, ballot.id],
  );
  if (Number(result.affectedRows) === 0) {
    const current = await ballotById(pool, ballot.id);
    return { ok: false, error: "Someone else closed this ballot first", alreadyClosed: current ?? undefined };
  }
  const withdrawn = await ballotById(pool, ballot.id);
  return { ok: true, ballot: withdrawn!, votesDiscarded: votes };
}

/** A member's own vote, for honest ballot pages. */
export async function voteOf(pool: Pool, ballotId: string, userId: string): Promise<{ choice: VoteChoice; reason: string | null } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT choice, reason FROM ballot_votes WHERE ballot_id = ? AND user_id = ?",
    [ballotId, userId],
  );
  return rows[0] ? { choice: rows[0].choice as VoteChoice, reason: rows[0].reason ?? null } : null;
}

/** Every vote, with weight: the Hypha voter-list posture, votes on the record. */
export async function votesFor(pool: Pool, ballotId: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT v.user_id, v.choice, v.cast_at, v.updated_at, e.weight FROM ballot_votes v " +
      "JOIN ballot_electorate e ON e.ballot_id = v.ballot_id AND e.user_id = v.user_id " +
      "WHERE v.ballot_id = ? ORDER BY v.cast_at, v.user_id",
    [ballotId],
  );
  return rows.map((r) => ({
    userId: String(r.user_id),
    choice: String(r.choice) as VoteChoice,
    weight: Number(r.weight),
    castAt: iso(r.cast_at),
  }));
}

// ── Who to tell, and when (round 5, lane NOTIFY) ─────────────────────────────
//
// The engine froze an electorate at open and then told nobody. A vote opened,
// ran its window and closed, and the only member who ever heard about it in
// the bell was the proposer. These three readers are what the notification
// spine needs to reach the people a ballot is actually asking.
//
// All three read the FROZEN roll (`ballot_electorate`), never a live member
// list, for the same reason every other evaluation does: the people asked are
// the people who were asked, and somebody who joined yesterday was not.

/** Everyone on the frozen roll. */
export async function electorateOf(pool: Pool, ballotId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM ballot_electorate WHERE ballot_id = ?",
    [ballotId],
  );
  return rows.map((r) => String(r.user_id));
}

/**
 * On the roll, and still owes an answer. A LEFT JOIN and not a NOT IN: a
 * ballot with no votes at all makes `NOT IN (empty)` behave differently
 * across engines, and this shape reads the same everywhere.
 */
export async function awaitingVote(pool: Pool, ballotId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT e.user_id FROM ballot_electorate e " +
      "LEFT JOIN ballot_votes v ON v.ballot_id = e.ballot_id AND v.user_id = e.user_id " +
      "WHERE e.ballot_id = ? AND v.user_id IS NULL",
    [ballotId],
  );
  return rows.map((r) => String(r.user_id));
}

/**
 * Open ballots whose window shuts inside `hours`, and open ballots whose
 * window already shut. The second set is not a failure: closing is a human
 * act by design, so an expired-but-open ballot is a ballot waiting for a
 * person, and somebody has to be told which person.
 */
export async function ballotsNeedingAttention(
  pool: Pool,
  hours: number,
): Promise<{ closingSoon: BallotRow[]; pastWindow: BallotRow[] }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ballots WHERE status = 'open' AND closes_at <= (NOW() + INTERVAL ? HOUR) ORDER BY closes_at",
    [Math.max(1, Math.floor(hours))],
  );
  const now = Date.now();
  const all = rows.map(rowToBallot);
  return {
    closingSoon: all.filter((b) => Date.parse(b.closesAt) > now),
    pastWindow: all.filter((b) => Date.parse(b.closesAt) <= now),
  };
}
