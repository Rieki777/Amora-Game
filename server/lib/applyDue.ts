/**
 * THE LANDING PATH: when a carried decision actually happens, who may stop it,
 * and the one routine that decides what is due.
 *
 * ── THE RULING ─────────────────────────────────────────────────────────────
 *
 * 2026-09-03: a decision that SENDS TOKENS executes the moment its ballot
 * closes passed, when its timing is at_acceptance. A decision that CHANGES THE
 * GAME never executes at close: it is stamped with a landing instant and lands
 * there by itself unless a seated steward stops it inside the window. A seated
 * steward's no vote on an open ballot fails it outright at close, with the
 * steward named and their reason recorded as the veto reason.
 *
 * ── WHY THIS IS ONE ROUTINE AND NOT TWO ────────────────────────────────────
 *
 * There used to be two. `applyDueGovernance` was planned to run inside the
 * hourly settlement job, and a separate inline block inside the admin cycle
 * close selected `status IN ('passed_verified','passed_onsite')` with no
 * landing predicate and no veto join and applied whatever it found. Two
 * routines that both decide what is due disagree eventually, and here the
 * disagreement is a change landing inside the window a steward was promised.
 * The inline block is deleted and the cycle close calls this.
 *
 * ── WHY ITS OWN JOB ────────────────────────────────────────────────────────
 *
 * Hanging it on the settlement job would make landing inherit `economyReady`,
 * whose first act is to return early when a village has no enabled mint rules
 * or an unregistered recognition token. A young village that turned its seeded
 * rules off would then land nothing, forever, and be told nothing. Governance
 * landing has no economic precondition, so it has no economic early return: it
 * is registered as its own five-minute job.
 *
 * ── "NOTHING DUE" IS NOT "DID NOT RUN" ─────────────────────────────────────
 *
 * Every report this module returns says which of the two happened, in a field
 * a caller cannot ignore. A count that cannot tell the difference is a count
 * nobody can act on, and both states look identical from the outside: quiet.
 *
 * ── THE ELECTION ───────────────────────────────────────────────────────────
 *
 * Exactly one executor runs a due row. It is chosen by a guarded claim UPDATE
 * whose `affectedRows` picks the winner, the same shape `closeBallot` uses.
 * "Read the status, then write it" loses that race silently, and the two
 * callers here (a five-minute job and a human pressing cycle close) genuinely
 * do arrive at one row in the same second at a moon turn.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  DEFAULT_TIMING,
  executesAtPassWithNoWindow,
  kindOfSet,
  kindOfSubject,
  landingFor,
  lateVetoRefusal,
  timingOf,
  vetoHoursFrom,
  vetoIsInTime,
  type GovernanceKind,
  type Landing,
  type ProposalTiming,
} from "../../shared/governanceKinds";
import { ballotById, votesFor, type BallotRow } from "./ballots";
import { floorForCriticality, thresholdSettingsFrom, type ThresholdSettings } from "../../shared/ballotSubjects";
import type { Criticality } from "../../shared/governanceEngine";
import { numberVar, stringVar } from "./variables";
import { keyIsVetoMap, recordVeto as recordStewardAct, stewardNoBlocks, stewardsSeated, type VetoWindowVerdict } from "./stewardship";

/** What a subject's closer hands back. Mirrors the dispatcher's own shape. */
export interface CloseRouting {
  applied: string[];
  held: string | null;
  proposerTold: string | null;
  /** Set when the close itself changed the outcome, as a steward's no does. */
  outcome?: "passed" | "failed" | "no_quorum";
}

/**
 * A subject type's two halves.
 *
 * `settle` records the outcome on the subject: the status flips, the notices,
 * the return to the proposer. It runs for EVERY outcome and it changes nothing
 * about the world outside the decision.
 *
 * `execute` is the world-changing part, and it runs only when a passed decision
 * is actually due. A subject with no `execute` conducts a real decision and
 * changes nothing, which is what makes an advisory vote possible on the real
 * engine.
 *
 * `onWithdraw` puts the subject back where it stood before the ballot opened.
 * It lives beside the closer because the withdraw route used to carry its own
 * hardcoded list of subject types, which was a second routing table nobody
 * remembered to extend.
 */
export interface SubjectCloser {
  settle: (b: BallotRow, outcome: "passed" | "failed" | "no_quorum", outcomeNote: string, actorId: string) => Promise<CloseRouting>;
  execute?: (b: BallotRow, actorId: string) => Promise<CloseRouting>;
  onWithdraw?: (b: BallotRow) => Promise<void>;
}

/** The narrow half: enough to read a landing and to stop one. */
export interface VetoDeps {
  pool: Pool;
  now?: () => Date;
}

export interface LandingDeps extends VetoDeps {
  /** The village's veto window, already floored at 72 hours. */
  vetoHours: () => number;
  /** Is the founder's brake off? */
  autoApplyEnabled: () => boolean;
  /** Does a veto need a majority of the seated stewards? */
  stewardCouncil: () => boolean;
  /** The next new moon strictly after an instant, from the cycle clock. */
  nextNewMoonAfter: (after: Date) => Date;
  /** The lunation number a landing instant falls in, for a queued minting rule. */
  cycleNumberAt: (at: Date) => number;
  /** The closer table, so this module never holds a second copy of it. */
  closerFor: (subjectType: string) => SubjectCloser | undefined;
  /** Tell one member something, through the notification spine. */
  notify: (input: { userId: string; type: string; title: string; body?: string | null; link?: string | null; dedupeKey: string }) => Promise<void>;
  /** True while a cycle has ended and nobody has closed it yet. */
  endedUnclosedCycle: () => Promise<boolean>;
  /** Does this change set hold a cycle-timed dial or a minting rule? */
  waitsForCycleClose: (changeSet: unknown[]) => boolean;
}

const nowOf = (deps: VetoDeps): Date => (deps.now ? deps.now() : new Date());

const sqlInstant = (d: Date): string => d.toISOString().slice(0, 19).replace("T", " ");

/** Is this subject's ballot backed by a mechanics proposal row? */
const hasProposal = (subjectType: string): boolean => subjectType === "mechanics" || subjectType === "mint_rule";

// ── Stamping ────────────────────────────────────────────────────────────────

export interface StampInput {
  ballot: BallotRow;
  /** The change set, when the subject has one, so a bundle takes one clock. */
  itemKinds?: readonly string[];
  /**
   * True when an element of the set edits the map that says what a steward
   * may stop. Such a set executes at pass with no window, for the same reason
   * `role_unseat` on a steward-capable role does: a seat that could stop the
   * edit narrowing its own reach would hold the village.
   */
  editsVetoMap?: boolean;
}

/**
 * WHEN THIS DECISION LANDS, computed from the ballot's FROZEN `closes_at`.
 *
 * Never from the moment a human pressed close. A landing derived from the press
 * lets the proposer choose which three days a steward gets, and lets a passed
 * ballot be parked until the one seat holder posts about a trip.
 */
export function landingOf(deps: LandingDeps, input: StampInput): Landing {
  const b = input.ballot;
  const kind: GovernanceKind = kindOfSetOrSubject(b.subjectType, input.itemKinds);
  return landingFor({
    closesAt: new Date(b.closesAt),
    kind,
    timing: timingOfBallot(b),
    vetoHours: vetoHoursFrom(deps.vetoHours()),
    nextNewMoonAfter: deps.nextNewMoonAfter,
    noWindow: executesAtPassWithNoWindow(b.subjectType) || !!input.editsVetoMap,
  });
}

/** A bundle takes its set's kind; a subject with no set takes the subject's. */
function kindOfSetOrSubject(subjectType: string, itemKinds?: readonly string[]): GovernanceKind {
  if (!itemKinds || itemKinds.length === 0) return kindOfSubject(subjectType);
  // 19F: "who bundle waits". Any Game-change element makes the whole set one.
  return kindOfSet(itemKinds);
}

/** The timing frozen on the ballot at open, total over anything stored. */
export function timingOfBallot(b: BallotRow & { timing?: unknown }): ProposalTiming {
  return timingOf((b as { timing?: unknown }).timing ?? DEFAULT_TIMING);
}

/**
 * Write the landing instant onto the ballot, and onto the proposal when the
 * subject has one, so both the vote and the thing a member actually reads carry
 * the same date.
 */
export async function stampLanding(deps: LandingDeps, b: BallotRow, landing: Landing): Promise<void> {
  const at = landing.landsAt ? sqlInstant(landing.landsAt) : null;
  await deps.pool.query(
    "UPDATE ballots SET lands_at = ?, veto_closes_at = ?, landing_status = ? WHERE id = ?",
    [at, at, landing.executesAtClose ? "not_applicable" : "pending", b.id],
  );
  if (hasProposal(b.subjectType)) {
    await deps.pool.query(
      "UPDATE mechanics_proposals SET lands_at = ?, veto_closes_at = ? WHERE id = ?",
      [at, at, b.subjectRef],
    );
  }
}

/** A row that never lands: an advisory vote, a failed vote, a withdrawn one. */
export async function markNotApplicable(pool: Pool, ballotId: string): Promise<void> {
  await pool.query("UPDATE ballots SET landing_status = 'not_applicable' WHERE id = ?", [ballotId]);
}

// ── The steward's two doors ─────────────────────────────────────────────────

export interface StewardVeto {
  stewardIds: string[];
  reason: string;
  /** How many seats were filled when the veto was counted. */
  seated: number;
}

/**
 * A SEATED STEWARD'S NO VOTE FAILS A TOKEN SEND AT THE CLOSE.
 *
 * The founder: "if a steward votes down on a token payment proposal than it
 * fails automatically". This function reads the rows; the RULE is
 * `stewardNoBlocks` in server/lib/stewardship.ts, which owns the four
 * narrowings the second audit required (token sends only, never a ballot the
 * steward is the subject of, a reason under the veto's own rule, and the
 * council majority). Keeping the rule there and the SQL here is what stops the
 * steward's two doors, the vote and the veto, from being two different rules.
 *
 * A LAPSED HOLDING IS NOT A SEAT. `stewardsSeated` returns lapsed rows so a
 * surface can say who held the seat until when; a block counts only the ones
 * still holding it.
 */
export async function stewardNoVote(
  deps: LandingDeps,
  b: BallotRow,
  itemKinds?: readonly string[],
): Promise<StewardVeto | null> {
  const seated = (await stewardsSeated(deps.pool, nowOf(deps))).filter((h) => !h.lapsed);
  if (seated.length === 0) return null;
  const seatIds = new Set(seated.map((h) => h.userId));
  const cast = await votesFor(deps.pool, b.id);
  const noes = cast.filter((v) => v.choice === "no" && seatIds.has(v.userId));
  if (noes.length === 0) return null;
  // The reason lives on the vote row and `votesFor` does not carry it, so the
  // stewards' rows are read once each. Only their rows: the rule counts only a
  // seated steward's no, so nobody else's words are read here at all.
  const votes: Array<{ userId: string; choice: string; reason: string | null }> = [];
  for (const v of noes) {
    const [rows] = await deps.pool.query<RowDataPacket[]>(
      "SELECT reason FROM ballot_votes WHERE ballot_id = ? AND user_id = ?",
      [b.id, v.userId],
    );
    votes.push({ userId: v.userId, choice: "no", reason: rows[0]?.reason == null ? null : String(rows[0].reason) });
  }
  const verdict = stewardNoBlocks({
    ballot: { subjectType: b.subjectType, subjectRef: b.subjectRef, itemKinds },
    votes,
    seated: seated.map((h) => ({ userId: h.userId })),
    council: deps.stewardCouncil(),
  });
  if (!verdict.blocks) return null;
  return { stewardIds: verdict.stewardIds, reason: verdict.reason, seated: verdict.seated };
}

export type VetoResult =
  | { ok: true; landsAt: string | null; stewardId: string }
  | { ok: false; error: string };

/**
 * THE VETO INSIDE THE WINDOW.
 *
 * Marks the row, records the name, the reason and the instant, and returns the
 * proposal to its proposer with its backers intact, which is exactly the
 * `no_quorum` path: a decision that did not take effect is not a decision the
 * author has to write again.
 *
 * A veto AFTER `lands_at` is refused naming the instant. The window is
 * closed-open on that instant on purpose: the same moment is when the apply job
 * may claim the row, and a rule that allowed both would decide by tick phase.
 */
export async function recordVeto(
  deps: VetoDeps,
  input: { ballotId: string; stewardId: string; reason: string; councilOverride?: boolean },
): Promise<VetoResult> {
  const reason = String(input.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: "A veto carries a reason. Say what you saw, so the village can answer it." };
  }
  if (reason.length > 4000) {
    return { ok: false, error: "That is longer than the record holds. 4000 characters maximum." };
  }
  const b = await ballotById(deps.pool, input.ballotId);
  if (!b) return { ok: false, error: "No such ballot" };
  const row = await landingRow(deps.pool, input.ballotId);
  if (!row) return { ok: false, error: "No such ballot" };
  if (row.vetoedAt) return { ok: false, error: "This one was already stopped." };
  if (b.status !== "passed") {
    return { ok: false, error: `A ${b.status.replace("_", " ")} decision has nothing to stop.` };
  }
  if (row.landingStatus === "applied") {
    return { ok: false, error: "This one has already landed. Bringing it back is a new proposal." };
  }
  if (!row.landsAt) {
    return { ok: false, error: "This one took effect the moment it carried, so there is no window on it." };
  }
  const at = nowOf(deps);
  if (!vetoIsInTime(row.landsAt, at)) {
    return { ok: false, error: lateVetoRefusal(row.landsAt) };
  }
  /*
   * AN OVERRIDE CANNOT BE STOPPED AGAIN.
   *
   * The village already heard the objection, brought the proposal back, and
   * passed it at the highest bar it has set for itself. A second veto would
   * make that bar mean nothing and leave the seat holding the village.
   */
  const override = await isOverride(deps.pool, b.subjectType, b.subjectRef);
  if (override) {
    return {
      ok: false,
      error:
        "The village brought this one back after it was stopped and passed it again at the highest bar it has set. " +
        "It lands whatever any steward says, and the reason it was stopped the first time stays on the record beside it.",
    };
  }

  const [res] = await deps.pool.query<any>(
    "UPDATE ballots SET vetoed_at = ?, vetoed_by = ?, veto_reason = ?, landing_status = 'vetoed' " +
      "WHERE id = ? AND vetoed_at IS NULL AND landing_status = 'pending'",
    [sqlInstant(at), input.stewardId, reason, b.id],
  );
  if (Number(res.affectedRows) === 0) {
    return { ok: false, error: "Somebody got to this one first, or it landed while you were reading it." };
  }
  if (hasProposal(b.subjectType)) {
    await deps.pool.query(
      "UPDATE mechanics_proposals SET status = 'vetoed', vetoed_at = ?, vetoed_by = ?, veto_reason = ? " +
        "WHERE id = ? AND status IN ('passed_onsite','passed_verified','onsite_vote')",
      [sqlInstant(at), input.stewardId, reason, b.subjectRef],
    );
    // Back to the proposer with the backers standing, the way a missed quorum
    // returns it. Guarded so a proposal somebody else moved is left alone.
    await deps.pool.query(
      "UPDATE mechanics_proposals SET status = 'open' WHERE id = ? AND status = 'vetoed'",
      [b.subjectRef],
    );
  }
  return { ok: true, landsAt: row.landsAt.toISOString(), stewardId: input.stewardId };
}

export interface LandingRow {
  ballotId: string;
  subjectType: string;
  subjectRef: string;
  landsAt: Date | null;
  vetoedAt: Date | null;
  vetoedBy: string | null;
  vetoReason: string | null;
  landingStatus: string;
  status: string;
  timing: ProposalTiming;
}

export async function landingRow(pool: Pool, ballotId: string): Promise<LandingRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, subject_type, subject_ref, lands_at, vetoed_at, vetoed_by, veto_reason, landing_status, status, timing " +
      "FROM ballots WHERE id = ?",
    [ballotId],
  );
  const r = rows[0];
  if (!r) return null;
  const asDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
  return {
    ballotId: String(r.id),
    subjectType: String(r.subject_type),
    subjectRef: String(r.subject_ref),
    landsAt: asDate(r.lands_at),
    vetoedAt: asDate(r.vetoed_at),
    vetoedBy: r.vetoed_by === null || r.vetoed_by === undefined ? null : String(r.vetoed_by),
    vetoReason: r.veto_reason === null || r.veto_reason === undefined ? null : String(r.veto_reason),
    landingStatus: String(r.landing_status),
    status: String(r.status),
    timing: timingOf(r.timing),
  };
}

// ── The election, and the executor-pending row ──────────────────────────────

/**
 * Claim one due row. `affectedRows` picks the single executor.
 *
 * The predicate is the whole rule: the vote passed, the row is still waiting,
 * its instant has come, and nobody stopped it. Anything that fails any clause
 * belongs to somebody else or to nobody.
 */
export async function claimDue(pool: Pool, ballotId: string, at: Date): Promise<boolean> {
  const [res] = await pool.query<any>(
    "UPDATE ballots SET landing_status = 'applying' " +
      "WHERE id = ? AND status = 'passed' AND landing_status = 'pending' AND lands_at <= ? AND vetoed_at IS NULL",
    [ballotId, sqlInstant(at)],
  );
  return Number(res.affectedRows) === 1;
}

/** The durable trace that survives a throw between the claim and the return. */
export async function openPending(pool: Pool, ballotId: string): Promise<void> {
  await pool.query(
    "INSERT INTO governance_executor_pending (ballot_id, claimed_at) VALUES (?, NOW()) " +
      "ON DUPLICATE KEY UPDATE claimed_at = NOW(), cleared_at = NULL, attempts = attempts + 1",
    [ballotId],
  );
}

export async function clearPending(pool: Pool, ballotId: string, error?: string): Promise<void> {
  if (error) {
    await pool.query("UPDATE governance_executor_pending SET last_error = ? WHERE ballot_id = ?", [
      error.slice(0, 1000),
      ballotId,
    ]);
    return;
  }
  await pool.query("UPDATE governance_executor_pending SET cleared_at = NOW(), last_error = NULL WHERE ballot_id = ?", [
    ballotId,
  ]);
}

/** Decisions that started landing and never finished. A human can act on these. */
export async function unfinishedLandings(pool: Pool, olderThanMs = 10 * 60 * 1000): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT ballot_id FROM governance_executor_pending WHERE cleared_at IS NULL AND claimed_at < ? ORDER BY claimed_at",
    [sqlInstant(new Date(Date.now() - olderThanMs))],
  );
  return rows.map((r) => String(r.ballot_id));
}

// ── The job ─────────────────────────────────────────────────────────────────

export type ApplyDueReport =
  | {
      ran: true;
      /** Rows whose instant had come. Zero means nothing due, which is an answer. */
      due: number;
      landed: number;
      failed: number;
      /** Rows whose instant elapsed while the brake was off. */
      stalled: number;
      /** Rows refused because a cycle has ended and nobody has closed it. */
      deferred: number;
      notes: string[];
    }
  | { ran: false; why: string };

/**
 * THE FIVE-MINUTE JOB, AND THE HUMAN CYCLE CLOSE. One routine, both callers.
 *
 * A row whose `lands_at` elapsed while `governance.auto_apply_enabled` was off
 * is marked STALLED rather than applied in a sweep the moment the brake comes
 * back on. Landing a backlog whose windows all closed weeks ago is the exact
 * shape of the harm the window exists to prevent, so the window is REOPENED for
 * `veto_hours` from the moment applying resumes and every steward is told.
 */
export async function applyDueGovernance(deps: LandingDeps, at: Date = new Date()): Promise<ApplyDueReport> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT id FROM ballots WHERE status = 'passed' AND landing_status IN ('pending','stalled') " +
      "AND lands_at IS NOT NULL AND lands_at <= ? AND vetoed_at IS NULL ORDER BY lands_at, id",
    [sqlInstant(at)],
  );
  const dueIds = rows.map((r) => String(r.id));

  if (!deps.autoApplyEnabled()) {
    // The brake is ON. Nothing lands, and every row that came due while it was
    // on is marked so the reopened window can be honest about it later.
    let stalled = 0;
    for (const id of dueIds) {
      const [res] = await deps.pool.query<any>(
        "UPDATE ballots SET landing_status = 'stalled' WHERE id = ? AND landing_status = 'pending'",
        [id],
      );
      if (Number(res.affectedRows) === 1) stalled += 1;
    }
    return {
      ran: true,
      due: dueIds.length,
      landed: 0,
      failed: 0,
      stalled,
      deferred: 0,
      notes: [
        dueIds.length === 0
          ? "Nothing was due. Applying is switched off, so nothing would have landed either."
          : `${dueIds.length} decision(s) came due while applying is switched off. They are held and their windows reopen when it comes back on.`,
      ],
    };
  }

  if (dueIds.length === 0) {
    return { ran: true, due: 0, landed: 0, failed: 0, stalled: 0, deferred: 0, notes: ["Nothing was due."] };
  }

  const endedUnclosed = await deps.endedUnclosedCycle();
  const notes: string[] = [];
  let landed = 0;
  let failed = 0;
  let stalled = 0;
  let deferred = 0;

  for (const id of dueIds) {
    const before = await landingRow(deps.pool, id);
    const b = await ballotById(deps.pool, id);
    if (!b || !before) continue;

    /*
     * A ROW THAT STALLED GETS ITS WINDOW BACK BEFORE IT LANDS.
     *
     * The steward never had the notice the ruling promised, because the brake
     * was on when their window ran. Reopening it costs the village 72 hours and
     * costs the steward nothing they were not already owed.
     */
    if (before.landingStatus === "stalled") {
      const reopened = new Date(at.getTime() + vetoHoursFrom(deps.vetoHours()) * 60 * 60 * 1000);
      await deps.pool.query(
        "UPDATE ballots SET lands_at = ?, veto_closes_at = ?, landing_status = 'pending' WHERE id = ? AND landing_status = 'stalled'",
        [sqlInstant(reopened), sqlInstant(reopened), id],
      );
      if (hasProposal(b.subjectType)) {
        await deps.pool.query("UPDATE mechanics_proposals SET lands_at = ?, veto_closes_at = ? WHERE id = ?", [
          sqlInstant(reopened),
          sqlInstant(reopened),
          b.subjectRef,
        ]);
      }
      await tellStewards(deps, b, reopened, "reopened");
      stalled += 1;
      notes.push(`${b.title}: applying was off when this came due, so its window is open again until ${reopened.toISOString()}.`);
      continue;
    }

    /*
     * A CYCLE-TIMED DIAL OR A MINTING RULE CANNOT LAND OVER AN UNSETTLED MOON.
     *
     * The lunation that ended was played under the old numbers and has not been
     * paid yet. Changing what it pays before it is settled pays a moon at a rate
     * nobody played at.
     */
    if (endedUnclosed && (await touchesCycleTimed(deps, b))) {
      deferred += 1;
      notes.push(`${b.title}: waiting for the moon that ended to be closed before it lands.`);
      continue;
    }

    if (!(await claimDue(deps.pool, id, at))) continue;
    await openPending(deps.pool, id);
    const closer = deps.closerFor(b.subjectType);
    if (!closer?.execute) {
      // Nothing to run. That is the advisory shape and it is not a failure.
      await deps.pool.query("UPDATE ballots SET landing_status = 'applied' WHERE id = ?", [id]);
      await clearPending(deps.pool, id);
      landed += 1;
      continue;
    }
    try {
      const routing = await closer.execute(b, before.vetoedBy ?? "governance");
      await deps.pool.query("UPDATE ballots SET landing_status = 'applied' WHERE id = ?", [id]);
      await clearPending(deps.pool, id);
      landed += 1;
      if (routing.held) notes.push(`${b.title}: ${routing.held}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Back to pending, so the next tick tries again and a human can see the
      // pending row and its last error in the meantime.
      await deps.pool.query("UPDATE ballots SET landing_status = 'pending' WHERE id = ? AND landing_status = 'applying'", [id]);
      await clearPending(deps.pool, id, message);
      failed += 1;
      notes.push(`${b.title}: landing failed and will be tried again. ${message}`);
    }
  }

  return { ran: true, due: dueIds.length, landed, failed, stalled, deferred, notes };
}

/** Does this decision move a cycle-timed dial or a minting rule? */
async function touchesCycleTimed(deps: LandingDeps, b: BallotRow): Promise<boolean> {
  if (b.subjectType === "mint_rule") return true;
  if (b.subjectType !== "mechanics") return false;
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT change_set FROM mechanics_proposals WHERE id = ?",
    [b.subjectRef],
  );
  const raw = rows[0]?.change_set;
  if (!raw) return false;
  const set = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(set) ? deps.waitsForCycleClose(set) : false;
}

// ── Telling the stewards ────────────────────────────────────────────────────

export type StewardMoment = "carry" | "halfway" | "two_hours" | "reopened";

const MOMENT_TITLE: Readonly<Record<StewardMoment, (title: string) => string>> = {
  carry: (t) => `The village carried this, and you can stop it: ${t}`,
  halfway: (t) => `Half your window has gone on: ${t}`,
  two_hours: (t) => `Two hours left to stop this: ${t}`,
  reopened: (t) => `Applying is back on and your window is open again: ${t}`,
};

/**
 * STEWARD-VETO LANE: each moment takes its own notification type.
 *
 * All four used to go out as `governance`, which resolves to the governance
 * email preference, which defaults to daily. So the two-hours-left warning
 * arrived hours after the change had landed. The three window moments are
 * pinned to "immediate" in `emailCadenceFor` through these types. A reopened
 * window is the carry notice arriving a second time, and takes the same type.
 *
 * THE STRINGS ARE LITERALS HERE and the same three are named in
 * `VETO_WATCH_NOTICE_TYPES` in server/lib/stewardship.ts, which is the module
 * that owns them. `applyDue.test.ts` pins the two equal, so the duplication
 * cannot drift. It is written out because the notification catalogue's own
 * guard reads the server's source for the types it sends, and a type reached
 * through another module's constant is invisible to it: the alternative was a
 * blurb with no producer, which is exactly the check that guard exists for.
 */
export const MOMENT_TYPE: Readonly<Record<StewardMoment, string>> = {
  carry: "veto_window_opened",
  halfway: "veto_window_halfway",
  two_hours: "veto_window_closing",
  reopened: "veto_window_opened",
};

/**
 * In-app through the notification spine, to every seated steward, naming the
 * proposal and the instant. The email hook is the spine's own cadence, so a
 * lane wiring email for governance wires it there rather than here.
 */
export async function tellStewards(deps: LandingDeps, b: BallotRow, landsAt: Date, moment: StewardMoment): Promise<number> {
  const seated = (await stewardsSeated(deps.pool, nowOf(deps))).filter((h) => !h.lapsed);
  for (const holding of seated) {
    await deps.notify({
      userId: holding.userId,
      type: MOMENT_TYPE[moment],
      title: MOMENT_TITLE[moment](b.title),
      body: `It takes effect at ${landsAt.toISOString()} unless you stop it before then, with a reason the village can read.`,
      link: `/governance/ballots/${b.id}`,
      dedupeKey: `bal:${b.id}:veto-window:${moment}`,
    });
  }
  return seated.length;
}

export interface WatchReport {
  ran: true;
  /** Windows still open. */
  open: number;
  halfway: number;
  twoHours: number;
}

/**
 * THE VETO WATCH. Halfway, and two hours out.
 *
 * The carry notice is sent by the close path, because that is the moment it is
 * about. These two are the ones only a clock can send, and the dedupe key makes
 * them exactly-once per ballot per moment however often the job ticks.
 */
export async function runVetoWatch(deps: LandingDeps, at: Date = new Date()): Promise<WatchReport> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT id, closes_at, lands_at FROM ballots " +
      "WHERE status = 'passed' AND landing_status = 'pending' AND lands_at IS NOT NULL AND lands_at > ? AND vetoed_at IS NULL",
    [sqlInstant(at)],
  );
  let halfway = 0;
  let twoHours = 0;
  for (const r of rows) {
    const b = await ballotById(deps.pool, String(r.id));
    if (!b) continue;
    const landsAt = r.lands_at instanceof Date ? r.lands_at : new Date(String(r.lands_at));
    const opened = new Date(b.closesAt).getTime();
    const left = landsAt.getTime() - at.getTime();
    const whole = landsAt.getTime() - opened;
    if (left <= 2 * 60 * 60 * 1000) {
      await tellStewards(deps, b, landsAt, "two_hours");
      twoHours += 1;
      continue;
    }
    if (whole > 0 && left <= whole / 2) {
      await tellStewards(deps, b, landsAt, "halfway");
      halfway += 1;
    }
  }
  return { ran: true, open: rows.length, halfway, twoHours };
}

// ── The close route's own half ──────────────────────────────────────────────

/**
 * WHAT A CLOSE DOES, AFTER THE OUTCOME IS KNOWN.
 *
 * One function, called from the close route and from the auto-settle path, so
 * a ballot closed by a human and a ballot closed by the clock take exactly the
 * same road. Splitting the two was how the old engine came to have one rule
 * about the steward on one path and another on the other.
 */
export async function routeOutcome(
  deps: LandingDeps,
  b: BallotRow,
  outcome: "passed" | "failed" | "no_quorum",
  outcomeNote: string,
  actorId: string,
  itemKinds?: readonly string[],
): Promise<CloseRouting> {
  const closer = deps.closerFor(b.subjectType);

  // A seated steward's no is the block, and it lands while the ballot is open,
  // which is the only door a token send ever has.
  let stewardVeto: StewardVeto | null = null;
  if (outcome === "passed") stewardVeto = await stewardNoVote(deps, b, itemKinds);
  const effective: "passed" | "failed" | "no_quorum" = stewardVeto ? "failed" : outcome;

  const note = stewardVeto
    ? `A steward voted against this one, so it does not carry. ${stewardVeto.reason}`
    : outcomeNote;

  const routing: CloseRouting = closer
    ? await closer.settle(b, effective, note, actorId)
    : { applied: [], held: null, proposerTold: null };
  routing.outcome = effective;

  if (stewardVeto) {
    const at = nowOf(deps);
    await deps.pool.query(
      "UPDATE ballots SET status = 'failed', outcome_note = ?, vetoed_at = ?, vetoed_by = ?, veto_reason = ?, landing_status = 'vetoed' " +
        "WHERE id = ? AND status = 'passed'",
      [note.slice(0, 4000), sqlInstant(at), stewardVeto.stewardIds[0], stewardVeto.reason.slice(0, 4000), b.id],
    );
    if (hasProposal(b.subjectType)) {
      await deps.pool.query(
        "UPDATE mechanics_proposals SET vetoed_at = ?, vetoed_by = ?, veto_reason = ? WHERE id = ?",
        [sqlInstant(at), stewardVeto.stewardIds[0], stewardVeto.reason.slice(0, 4000), b.subjectRef],
      );
    }
    /*
     * STEWARD-VETO LANE: the block is written as a VETO ACT as well as a set
     * of columns, one row per steward who blocked it.
     *
     * The columns are what the landing gate and the override read. The acts
     * are what a member reads: `vetoesFor` is the list every surface renders,
     * `stewardVetoStands` is what the dashboard's blocked-payouts row counts,
     * and `redactVetoReason` is the door the words can be taken back through.
     * Stamping only the columns left a payout that died with a named steward
     * and a public reason and no act anywhere a person could see it.
     */
    for (const stewardId of stewardVeto.stewardIds) {
      await recordStewardAct(deps.pool, { ballotId: b.id, decidedBy: stewardId, reason: stewardVeto.reason });
    }
    routing.held = "A steward voted against this one while it was open, so it did not carry.";
    return routing;
  }

  if (effective !== "passed") {
    await markNotApplicable(deps.pool, b.id);
    return routing;
  }

  /*
   * A SUBJECT WITH NO EXECUTOR IS NEVER STAMPED WITH A LANDING INSTANT.
   *
   * An advisory vote conducts a real decision on the real engine and changes
   * nothing, which is the whole promise it makes. Stamping it would put a
   * countdown and a veto door on a page where nothing is going to happen, and
   * "it lands on the 30th" would be false about a vote that lands never.
   */
  if (!closer?.execute) {
    await markNotApplicable(deps.pool, b.id);
    return routing;
  }

  const landing = landingOf(deps, { ballot: b, itemKinds, editsVetoMap: await editsVetoMap(deps, b) });
  await stampLanding(deps, b, landing);

  if (landing.executesAtClose) {
    await openPending(deps.pool, b.id);
    try {
      const done = await closer.execute(b, actorId);
      await deps.pool.query("UPDATE ballots SET landing_status = 'applied' WHERE id = ?", [b.id]);
      await clearPending(deps.pool, b.id);
      return { ...done, proposerTold: done.proposerTold ?? routing.proposerTold, outcome: effective };
    } catch (e) {
      await clearPending(deps.pool, b.id, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  // It waits. Say when, in the sentence the decision page already renders.
  routing.held = landing.landsAt
    ? `${landing.because} It lands at ${landing.landsAt.toISOString()}.`
    : landing.because;
  if (landing.landsAt) await tellStewards(deps, b, landing.landsAt, "carry");
  return routing;
}

/**
 * A ballot whose window has ended is closed by the clock, with the engine's own
 * outcome and a note that says who closed it.
 *
 * This is what makes `lands_at` derivable from `closes_at` honestly: nobody
 * chooses when a vote closes, so nobody chooses which three days a steward
 * gets. The human close route stays, for a facilitator who wants to close a
 * ballot whose window has already ended and say something about it.
 */
export const AUTO_CLOSE_NOTE =
  "The voting window ended and the village's own engine read the result. Nobody chose the moment.";

export interface AutoSettleReport {
  ran: true;
  /** Ballots whose window had ended. Zero means none, which is an answer. */
  expired: number;
  closed: number;
  failed: number;
  notes: string[];
}

/**
 * CLOSE EVERY BALLOT WHOSE WINDOW HAS ENDED, through the settlement path.
 *
 * The close used to be a human act with no deadline, and the proposer joined
 * the closers after expiry. So the proposer chose whether a steward got three
 * days and which three calendar days those were, and could park a passed ballot
 * until the one seat holder posted about a trip. Closing on the clock removes
 * the choice entirely, and `lands_at` derives from the frozen `closes_at`, so
 * the instant a steward is promised is the instant the ballot itself named when
 * it opened.
 *
 * `closeBallot` is the same guarded transition a human close takes, so a ballot
 * a facilitator closed a second earlier is already closed here and returns
 * `alreadyClosed` rather than closing twice.
 */
export async function autoSettleExpired(
  deps: LandingDeps,
  closeBallot: (
    pool: Pool,
    input: { ballotId: string; closedBy: string; outcomeNote: string; closerMayCloseEarly: boolean },
  ) => Promise<{ ok: boolean; outcome?: "passed" | "failed" | "no_quorum"; ballot?: BallotRow; error?: string }>,
  at: Date = new Date(),
): Promise<AutoSettleReport> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT id FROM ballots WHERE status = 'open' AND closes_at <= ? ORDER BY closes_at, id",
    [sqlInstant(at)],
  );
  const notes: string[] = [];
  let closed = 0;
  let failed = 0;
  for (const r of rows) {
    const id = String(r.id);
    const b = await ballotById(deps.pool, id);
    if (!b) continue;
    let itemKinds: string[] | undefined;
    if (hasProposal(b.subjectType)) itemKinds = await itemKindsOf(deps, b);
    try {
      const result = await closeBallot(deps.pool, {
        ballotId: id,
        closedBy: "governance",
        outcomeNote: AUTO_CLOSE_NOTE,
        closerMayCloseEarly: false,
      });
      if (!result.ok || !result.ballot || !result.outcome) {
        notes.push(`${b.title}: ${result.error ?? "could not be closed"}`);
        continue;
      }
      await routeOutcome(deps, result.ballot, result.outcome, AUTO_CLOSE_NOTE, "governance", itemKinds);
      closed += 1;
    } catch (e) {
      failed += 1;
      notes.push(`${b.title}: closing threw. ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (rows.length === 0) notes.push("No ballot's window had ended.");
  return { ran: true, expired: rows.length, closed, failed, notes };
}

/** The change-set item kinds behind a mechanics ballot, for the bundle rule. */
export async function itemKindsOf(deps: LandingDeps, b: BallotRow): Promise<string[] | undefined> {
  if (!hasProposal(b.subjectType)) return undefined;
  const [rows] = await deps.pool.query<RowDataPacket[]>("SELECT change_set FROM mechanics_proposals WHERE id = ?", [
    b.subjectRef,
  ]);
  const raw = rows[0]?.change_set;
  if (!raw) return undefined;
  const set = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(set)) return undefined;
  return set.map((c: { kind?: string }) => String(c?.kind ?? "dial"));
}

/**
 * DOES THIS SET EDIT THE MAP THAT SAYS WHAT A STEWARD MAY STOP?
 *
 * `server/lib/stewardship.ts` owns the key lists and `keyIsVetoMap` is its
 * answer to this narrower question. It asks the MAP question rather than the
 * wider `keyIsVetoLocked` one on purpose: `keyIsVetoLocked` says which keys no
 * steward may veto, which is five keys, and every one of them still waits out
 * its window like any other Game change (20.11). Only the map itself carries
 * the older no-window reading, and the dispatcher lane owns whether that
 * survives at all.
 */
export async function editsVetoMap(deps: LandingDeps, b: BallotRow): Promise<boolean> {
  const set = await changeSetOf(deps.pool, b);
  return set.some((c: { key?: unknown }) => keyIsVetoMap(String(c?.key ?? "")));
}

/**
 * THE ELEMENTS A BALLOT CARRIES, or an empty list when it carries none.
 *
 * One reader, so the veto route and the landing path ask the same question of
 * the same column. A subject with no proposal row behind it answers with an
 * empty list, which is honest: it carries no elements, as opposed to elements
 * nobody could read.
 */
export async function changeSetOf(
  pool: Pool,
  b: { subjectType: string; subjectRef: string },
): Promise<Array<{ key?: unknown; kind?: unknown }>> {
  if (!hasProposal(b.subjectType)) return [];
  const [rows] = await pool.query<RowDataPacket[]>("SELECT change_set FROM mechanics_proposals WHERE id = ?", [
    b.subjectRef,
  ]);
  const raw = rows[0]?.change_set;
  if (!raw) return [];
  const set = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(set) ? set : [];
}

/**
 * THE WINDOW, ASKED BY THE VETO ROUTE.
 *
 * The seat, the reason and the record live in `server/lib/stewardship.ts`;
 * the instant a decision lands lives here. `setVetoWindowCheck` is registered
 * with this function at boot, so the two modules hold one answer between them
 * rather than two copies of the arithmetic that would disagree eventually.
 */
export async function vetoWindowOn(pool: Pool, ballotId: string, now: Date = new Date()): Promise<VetoWindowVerdict> {
  const row = await landingRow(pool, ballotId);
  if (!row) return { open: true, known: false };
  if (row.landingStatus === "applied") {
    return { open: false, known: true, error: "This one has already landed. Bringing it back is a new proposal." };
  }
  if (!row.landsAt) {
    return { open: false, known: true, error: "This one took effect the moment it carried, so there is no window on it." };
  }
  if (!vetoIsInTime(row.landsAt, now)) return { open: false, known: true, error: lateVetoRefusal(row.landsAt) };
  return { open: true, known: true };
}

/**
 * THE VETO OVERRIDE.
 *
 * The founder: "We can have a veto override if it goes up to the highest tier
 * they have set as a village (this is also a setting that can change at the
 * highest tier set)."
 *
 * A proposal brought back pointing at the one a steward stopped is priced at
 * `governance.highest_tier`, and when it carries at that bar it lands whatever
 * any steward says. The original's veto reason stays visible beside it: an
 * override is the village answering the objection out loud, and hiding what was
 * objected to would make the answer unreadable.
 */
export async function isOverride(pool: Pool, subjectType: string, subjectRef: string): Promise<{ of: string } | null> {
  if (!hasProposal(subjectType)) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT p.supersedes_proposal_id AS sup, o.vetoed_at AS was_vetoed FROM mechanics_proposals p " +
      "LEFT JOIN mechanics_proposals o ON o.id = p.supersedes_proposal_id WHERE p.id = ?",
    [subjectRef],
  );
  const r = rows[0];
  if (!r?.sup || !r.was_vetoed) return null;
  return { of: String(r.sup) };
}

/**
 * The dials a resubmission is conducted at: the village's highest set tier when
 * it supersedes a vetoed proposal, and the price the set already carried
 * otherwise. Returns the higher of the two on each dial, never a lower one.
 */
export async function overrideDials(
  pool: Pool,
  proposal: { id: string; supersedesProposalId?: string | null },
  priced: { unityPct: number; quorumPct: number },
  highestTier: Criticality = tierOf(stringVar("governance.highest_tier")),
  settings: ThresholdSettings = thresholdSettingsFrom((key) => Number(numberVar(key))),
): Promise<{ unityPct: number; quorumPct: number }> {
  const override = await isOverride(pool, "mechanics", proposal.id);
  if (!override) return priced;
  const floor = floorForCriticality(highestTier, settings);
  return {
    unityPct: Math.max(priced.unityPct, floor.unityPct),
    quorumPct: Math.max(priced.quorumPct, floor.quorumPct),
  };
}

/** Read the village's highest set tier, total over anything stored. */
function tierOf(raw: unknown): Criticality {
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "routine" || text === "structural" || text === "constitutional" ? text : "constitutional";
}
