/**
 * STEWARDSHIP: who approves a passed proposal, for how long, and what a
 * village looks like when nobody does.
 *
 * ── THE RULE, IN THE FOUNDER'S WORDS ───────────────────────────────────────
 *
 * 2026-08-31: "having it default that the steward (by default the founder(s)
 * are granted a steward role after Game launch) needs to approve a proposal to
 * change the game before it actually goes through ... Stewards are the
 * 'training wheels' for the Game until it matures enough that they can give
 * more and more power to the Game to auto-execute decisions."
 *
 * 2026-08-31: "Yes a steward veto absolutely should carry a reason."
 *
 * 2026-08-31: "No terms should definitely end when they end not with a polite
 * warning! If they're not voted back in then they expire when they expire!"
 *
 * 2026-09-02: "Sure and it's perfectly fine to have no stewards and for the
 * game to have self/executing agreements - Stewards are like the 'training
 * wheels' to the game to help them start - not a desirable endstate."
 *
 * ── AN EMPTY SEAT IS NOT AN ERROR ──────────────────────────────────────────
 *
 * That last quote is a design constraint and not a footnote. A village with no
 * steward and self-executing agreements is the HEALTHY end state, the one the
 * training wheels come off into. So `vacancyState` has two different empty
 * seats and never conflates them: an empty seat while some subject still asks
 * for one is a queue somebody has to attend to, and an empty seat while no
 * subject asks for one is a village that has grown up. Only the first gets the
 * waiting sentence. Nothing in this module renders an empty seat as a warning.
 *
 * ── THE CONTRACT FOR THE CLOSE DISPATCHER (the dispatcher lane calls these) ─
 *
 * This module owns the STEWARD half and nothing about closing. The dispatcher
 * lane owns `SUBJECT_CLOSERS` and the close route, and calls in here:
 *
 *   needsSteward(subjectType)      Does a pass on this subject wait for a
 *                                  steward? ASK IT ONLY FOR A SUBJECT THAT
 *                                  BINDS. This module has no opinion about
 *                                  which subject types execute; the
 *                                  dispatcher's own table is the one answer to
 *                                  that and a second copy here would drift.
 *   autoExecutes(subjectType)      Does the village let this subject apply
 *                                  itself with no steward in the loop? The
 *                                  gradient the founder asked for: off for
 *                                  everything by default, flipped per subject
 *                                  as a village matures.
 *   approvalFor(pool, ballotId)    The standing decision on a ballot, or null.
 *                                  Null IS the queue: a passed ballot with no
 *                                  row here is waiting.
 *   recordApproval / recordRefusal Write the decision. One row per ballot, so
 *                                  a second call finds the first decision and
 *                                  reports it rather than overwriting it.
 *   seatCatalystsAsStewards(...)   Called by the launch closer once the
 *                                  Birthing carries. Idempotent on (role,
 *                                  user). SEE THE CACHE WARNING ON IT.
 *
 * The approve and refuse routes in server/routes/governanceApprovals.ts write
 * the decision and hand the ballot back; re-entering the executor after an
 * approval is the dispatcher lane's half and is deliberately not done here.
 *
 * ── WHY THE PERMISSION PLANE ───────────────────────────────────────────────
 *
 * Two planes shared only a word. `roles` and `role_holders` carry capabilities
 * and, until 0134, no term at all. `org_roles` and `org_role_assignments`
 * carry terms and no capabilities. A steward is a power, so the seat lives on
 * the plane that carries powers, and 0134 gives that plane the term column it
 * needed for the founder's ruling to be true of it.
 *
 * A HOLDING LAPSES ON ITS TERM DATE AND ON NOTHING ELSE. The season turn is
 * recorded (`role_holders.season_id`) and read on the vacancy surface, and it
 * deliberately does not strip powers on its own: every permission role in
 * every existing village would silently disarm at the next season turn, which
 * is a change no village voted for. The steward seat gets a real date instead,
 * written at the next season turn when it is seated, so it genuinely expires.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Capability } from "../../shared/capabilities";
import { stringVar } from "./variables";

/**
 * The role slug is FROZEN and the display name is not.
 *
 * A slug is history's identity: `role_holders.role_id` rows, audit lines and
 * the ballots that seated people all point at this string, so renaming it
 * would orphan every one of them. The name a member reads is a column, and a
 * village that wants to call this seat something else changes the column.
 */
export const STEWARD_ROLE_ID = "steward";

/** What a fresh village calls the seat before it renames it. */
export const STEWARD_ROLE_NAME = "Steward";

/** The one power the seat carries. See shared/capabilities.ts for the key. */
export const STEWARD_APPROVE: Capability = "steward.approve";

/** Which subjects wait for a steward. Comma separated, `all` or `none`. */
export const STEWARD_SUBJECTS_KEY = "governance.steward_subjects";

/** Which subjects apply themselves with no steward in the loop. */
export const AUTO_EXECUTE_SUBJECTS_KEY = "governance.auto_execute_subjects";

/**
 * The one subject that never waits for anybody, named once.
 *
 * An advisory vote is opened with no executor by design, so there is nothing
 * for a steward to approve and a queue entry for one would be a promise about
 * an act that cannot happen. This is the only subject type this module knows
 * by name, and it knows it so the default value `all` can mean what the
 * founder's ruling means without a village having to type nine words.
 */
export const ADVISORY = "advisory";

/** Every token that means "the whole list", so a village can type either. */
const ALL_TOKENS = new Set(["all", "*", "every"]);
const NONE_TOKENS = new Set(["none", "", "off"]);

function parseList(raw: string): { all: boolean; none: boolean; named: Set<string> } {
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return { all: false, none: true, named: new Set() };
  if (parts.some((p) => ALL_TOKENS.has(p))) return { all: true, none: false, named: new Set() };
  if (parts.every((p) => NONE_TOKENS.has(p))) return { all: false, none: true, named: new Set() };
  return { all: false, none: false, named: new Set(parts.filter((p) => !NONE_TOKENS.has(p))) };
}

/**
 * Does a pass on this subject wait for a steward?
 *
 * `raw` is injectable so the rule can be tested without a loaded variable
 * cache. Callers pass nothing and get the village's setting.
 */
export function needsSteward(subjectType: string, raw: string = stringVar(STEWARD_SUBJECTS_KEY)): boolean {
  if (subjectType === ADVISORY) return false;
  const list = parseList(raw);
  if (list.none) return false;
  if (list.all) return true;
  return list.named.has(String(subjectType).toLowerCase());
}

/**
 * Does the village let this subject apply itself, with no steward in the loop?
 *
 * The gradient, not a switch. `governance.auto_apply_enabled` is untouched and
 * still means exactly what it always meant: the mechanics brake. This key is
 * the general form for every other subject and ships naming none of them, so
 * a village that has not decided anything is in the training-wheels posture
 * the founder described.
 */
export function autoExecutes(subjectType: string, raw: string = stringVar(AUTO_EXECUTE_SUBJECTS_KEY)): boolean {
  const list = parseList(raw);
  if (list.none) return false;
  if (list.all) return true;
  return list.named.has(String(subjectType).toLowerCase());
}

/** The per-subject map, for the stewardship read. Order is the caller's. */
export function subjectMap(
  subjectTypes: readonly string[],
): Array<{ subjectType: string; needsSteward: boolean; autoExecutes: boolean }> {
  return subjectTypes.map((s) => ({
    subjectType: s,
    needsSteward: needsSteward(s),
    autoExecutes: autoExecutes(s),
  }));
}

/**
 * Does this village ask a steward for anything at all?
 *
 * Asked of the SETTING rather than of a list of subject types, and that is the
 * distinction the vacancy read rests on. A village that has never held a vote
 * has no subject types to enumerate, and answering "nothing asks for a
 * steward" there would tell a brand-new village it had already grown out of
 * the training wheels. The setting is what the village decided; the ballots it
 * happens to have held are not.
 */
export function stewardIsAskedAtAll(raw: string = stringVar(STEWARD_SUBJECTS_KEY)): boolean {
  const list = parseList(raw);
  return list.all || list.named.size > 0;
}

/**
 * The subject types this village has actually held a vote on, plus any the
 * two settings name by hand.
 *
 * Derived from the ballots table rather than from a list typed here, because
 * which subject types EXECUTE is the close dispatcher's own table and a second
 * copy of it in this file would be the two-copies-of-one-rule trap. What this
 * answers is narrower and true: these are the kinds of decision this village
 * holds, so this is the map worth showing it.
 */
export async function subjectTypesSeen(pool: Pool): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DISTINCT subject_type FROM ballots");
  const seen = new Set(rows.map((r) => String(r.subject_type)));
  for (const raw of [stringVar(STEWARD_SUBJECTS_KEY), stringVar(AUTO_EXECUTE_SUBJECTS_KEY)]) {
    for (const named of Array.from(parseList(raw).named)) seen.add(named);
  }
  return Array.from(seen).sort();
}

// ── The decision record ─────────────────────────────────────────────────────

export type ApprovalDecision = "approved" | "refused";

export interface ApprovalRow {
  ballotId: string;
  decidedBy: string;
  decision: ApprovalDecision;
  /** Never null. An approval may carry an empty string; a refusal may not. */
  reason: string;
  decidedAt: string;
}

export type ApprovalResult =
  | { ok: true; row: ApprovalRow; fresh: boolean }
  | { ok: false; error: string; standing: ApprovalRow | null };

const APPROVAL_COLS = "ballot_id, decided_by, decision, reason, decided_at";

function rowToApproval(r: RowDataPacket): ApprovalRow {
  const at = r.decided_at;
  return {
    ballotId: String(r.ballot_id),
    decidedBy: String(r.decided_by),
    decision: r.decision as ApprovalDecision,
    reason: String(r.reason ?? ""),
    decidedAt: at instanceof Date ? at.toISOString() : String(at),
  };
}

/**
 * The reason a refusal has to carry.
 *
 * The founder asked for the reason because a proposal the village passed dying
 * without anybody being told why is the same family of defect as every other
 * one this codebase has removed. A whitespace-only string is the way that
 * requirement gets met without being met, so it is refused here rather than
 * stored and rendered as a blank line under somebody's name.
 */
export function refusalReasonProblem(reason: unknown): string | null {
  const text = String(reason ?? "").trim();
  if (!text) return "A refusal carries a reason. Say what you saw, so the village can answer it.";
  if (text.length > 4000) return "That is longer than the record holds. 4000 characters maximum.";
  return null;
}

/** An approval's optional note, held to the same length. */
export function approvalReasonProblem(reason: unknown): string | null {
  const text = String(reason ?? "").trim();
  if (text.length > 4000) return "That is longer than the record holds. 4000 characters maximum.";
  return null;
}

/** The standing decision on a ballot, or null. Null is the queue. */
export async function approvalFor(pool: Pool, ballotId: string): Promise<ApprovalRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${APPROVAL_COLS} FROM ballot_approvals WHERE ballot_id = ?`,
    [ballotId],
  );
  return rows[0] ? rowToApproval(rows[0]) : null;
}

/**
 * Write a decision, once. The primary key is the ballot, so a second decision
 * on the same ballot finds the first and reports it instead of replacing it.
 * That is what makes both routes safe to retry.
 */
async function record(
  pool: Pool,
  decision: ApprovalDecision,
  input: { ballotId: string; decidedBy: string; reason: string },
): Promise<ApprovalResult> {
  const reason = String(input.reason ?? "").trim();
  const problem = decision === "refused" ? refusalReasonProblem(reason) : approvalReasonProblem(reason);
  if (problem) return { ok: false, error: problem, standing: await approvalFor(pool, input.ballotId) };

  /*
   * READ, THEN WRITE, AND REPORT WHICH HAPPENED.
   *
   * `affectedRows` was the obvious way to answer "was this new" and it is not
   * portable: `ON DUPLICATE KEY UPDATE ballot_id = ballot_id` is a no-op
   * update, and the two engines this platform runs on disagree about whether
   * that counts as zero rows or one. A steward being told they had just
   * approved something when the standing decision was somebody else's refusal
   * is not a rounding error, so the answer comes from the row instead.
   *
   * The read is not a lock and does not need to be: the primary key is the
   * ballot, so two simultaneous decisions still leave exactly one row, and the
   * loser reads the winner's decision back.
   */
  const before = await approvalFor(pool, input.ballotId);
  if (!before) {
    await pool.query(
      "INSERT INTO ballot_approvals (ballot_id, decided_by, decision, reason) VALUES (?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE ballot_id = ballot_id",
      [input.ballotId, input.decidedBy, decision, reason],
    );
  }
  const row = await approvalFor(pool, input.ballotId);
  if (!row) {
    return { ok: false, error: "The decision could not be read back after it was written.", standing: null };
  }
  return { ok: true, row, fresh: !before };
}

export function recordApproval(
  pool: Pool,
  input: { ballotId: string; decidedBy: string; reason?: string },
): Promise<ApprovalResult> {
  return record(pool, "approved", { ...input, reason: input.reason ?? "" });
}

export function recordRefusal(
  pool: Pool,
  input: { ballotId: string; decidedBy: string; reason: string },
): Promise<ApprovalResult> {
  return record(pool, "refused", input);
}

// ── The seat ────────────────────────────────────────────────────────────────

export interface StewardHolding {
  /** The role_holders row id. */
  id: string;
  roleId: string;
  roleName: string;
  userId: string;
  /** ISO, or null for a holding with no term. */
  termEndsAt: string | null;
  seasonId: string | null;
  grantedAt: string;
  lapsed: boolean;
}

/**
 * Has this holding run out?
 *
 * Pure, derived on every read, writes nothing. A null term never lapses, which
 * is why 0134 could add the column to every existing village without taking a
 * single power away.
 */
export function holdingHasLapsed(
  h: { termEndsAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!h.termEndsAt) return false;
  const ends = h.termEndsAt instanceof Date ? h.termEndsAt : new Date(String(h.termEndsAt));
  if (Number.isNaN(ends.getTime())) return false;
  return ends.getTime() <= now.getTime();
}

/**
 * Every role that carries the approval power, read from the roles table.
 *
 * Read in JS rather than through a JSON predicate in SQL, because the two
 * engines this runs on spell JSON containment differently and the roles table
 * is a handful of rows. The seat is not always the role named `steward`: a
 * village may grant the power to a role it named itself, and the vacancy has
 * to see that role or it would report an empty seat beside a working approver.
 */
async function rolesCarryingApproval(pool: Pool): Promise<Map<string, string>> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, name, capabilities FROM roles");
  const out = new Map<string, string>();
  for (const r of rows) {
    let caps: unknown = r.capabilities;
    if (typeof caps === "string") {
      try {
        caps = JSON.parse(caps);
      } catch {
        caps = [];
      }
    }
    if (Array.isArray(caps) && caps.includes(STEWARD_APPROVE)) out.set(String(r.id), String(r.name ?? r.id));
  }
  return out;
}

/**
 * Who holds the seat right now, lapsed holdings included and marked.
 *
 * Lapsed rows are RETURNED rather than filtered, because the vacancy surface
 * has to be able to say "Wren held this until the 3rd" instead of showing an
 * empty list that reads as though nobody ever did.
 */
export async function stewardsSeated(pool: Pool, now: Date = new Date()): Promise<StewardHolding[]> {
  const roles = await rolesCarryingApproval(pool);
  if (roles.size === 0) return [];
  const ids = Array.from(roles.keys());
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, role_id, user_id, granted_at, term_ends_at, season_id FROM role_holders " +
      `WHERE role_id IN (${ids.map(() => "?").join(",")}) ORDER BY granted_at, id`,
    ids,
  );
  const iso = (v: unknown): string | null =>
    v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
  return rows.map((r) => ({
    id: String(r.id),
    roleId: String(r.role_id),
    roleName: roles.get(String(r.role_id)) ?? String(r.role_id),
    userId: String(r.user_id),
    termEndsAt: iso(r.term_ends_at),
    seasonId: r.season_id === null || r.season_id === undefined ? null : String(r.season_id),
    grantedAt: iso(r.granted_at) ?? "",
    lapsed: holdingHasLapsed({ termEndsAt: r.term_ends_at as Date | null }, now),
  }));
}

export interface VacancyState {
  /** True when at least one unlapsed holding carries the approval power. */
  seated: boolean;
  /** Every holding on the seat, lapsed ones marked, in the order they began. */
  holdings: StewardHolding[];
  /** Holdings whose term ran out, so the surface can name who it was. */
  lapsed: StewardHolding[];
  /** True when at least one subject still waits for a steward. */
  stillAsked: boolean;
  /**
   * A village with no steward and self-executing agreements is HEALTHY. True
   * means this empty seat is a choice the village made, not a gap.
   */
  healthy: boolean;
  /** One plain sentence, fit to render on its own. Never a warning. */
  sentence: string;
}

/**
 * Who holds the seat, and what to say when nobody does.
 *
 * Reads the setting for whether anybody is still asked, never a list of
 * subject types, so a fresh village with no ballots yet is not told it has
 * already outgrown the seat.
 */
export async function vacancyState(pool: Pool, now: Date = new Date()): Promise<VacancyState> {
  const holdings = await stewardsSeated(pool, now);
  const live = holdings.filter((h) => !h.lapsed);
  const lapsed = holdings.filter((h) => h.lapsed);
  const stillAsked = stewardIsAskedAtAll();
  const seated = live.length > 0;

  let sentence: string;
  if (seated) {
    sentence =
      live.length === 1
        ? "One steward holds the seat."
        : `${live.length} stewards hold the seat, and any one of them can approve.`;
  } else if (stillAsked) {
    sentence = "No steward holds the seat; proposals wait.";
  } else {
    sentence = "No steward holds the seat, and nothing here asks for one. This village's agreements carry themselves.";
  }

  return { seated, holdings, lapsed, stillAsked, healthy: !seated && !stillAsked, sentence };
}

/**
 * Passed ballots with no decision on them yet, for the subjects that ask.
 *
 * This is the queue, derived rather than stored: a ballot is waiting exactly
 * when it passed, its subject asks for a steward, the village has not told
 * that subject to execute itself, and nobody has decided it. Nothing writes a
 * "waiting" flag, so the queue cannot drift from the settings that define it.
 */
export async function ballotsWaitingForASteward(
  pool: Pool,
): Promise<Array<{ id: string; title: string; subjectType: string; openedBy: string }>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT b.id, b.title, b.subject_type, b.opened_by FROM ballots b " +
      "LEFT JOIN ballot_approvals a ON a.ballot_id = b.id " +
      "WHERE b.status = 'passed' AND a.ballot_id IS NULL ORDER BY b.closes_at, b.id",
  );
  return rows
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      subjectType: String(r.subject_type),
      openedBy: String(r.opened_by),
    }))
    .filter((b) => needsSteward(b.subjectType) && !autoExecutes(b.subjectType));
}

// ── Seating the catalysts at the Birthing ───────────────────────────────────

export interface SeasonTurn {
  /** The season running when the seating is made, or null. */
  currentSeasonId: string | null;
  /** ISO date the seat's term ends, or null when the calendar has no turn. */
  nextTurnAt: string | null;
}

export interface SeatingReport {
  /** True when the run completed. False means the caller could not tell. */
  ok: boolean;
  /** The role was created by this call rather than found. */
  roleCreated: boolean;
  /** The approval power was added to the role by this call. */
  capabilityGranted: boolean;
  /** User ids seated by this call. Empty means nothing to do, not a failure. */
  seated: string[];
  /** User ids that already held the seat, so this call left them alone. */
  alreadySeated: string[];
  /** The term written on every new seating, or null when there is no turn. */
  termEndsAt: string | null;
  /** Present only when ok is false. */
  error?: string;
}

/**
 * Seat every catalyst as a steward, once, with a term.
 *
 * Called by the launch closer after the Birthing carries. The founder's rule:
 * the catalysts INHERIT the seat rather than standing for it, and then have to
 * be voted back in each season, which is what makes relinquishment automatic
 * rather than an act of virtue. Nobody has to decide they are ready to give up
 * power; they have to be re-granted it.
 *
 * The stored role value on the account stays `founder`, because a slug is
 * history's identity. The word a player reads is Catalyst.
 *
 * EVERY WRITE IS IDEMPOTENT. The role is found or created, the capability is a
 * set union, and the seating is `INSERT ... ON DUPLICATE KEY UPDATE` against
 * the `(role_id, user_id)` unique key from 0002. Calling this twice seats
 * nobody twice, which matters because a close can be retried and because the
 * launch closer runs outside a transaction.
 *
 * THE CALLER MUST RELOAD THE ROLE CACHES. `roles` and `role_holders` are
 * served from an in-process cache built at boot (`rolesRepo`,
 * `roleHoldersRepo` in server/index.ts), and this writes SQL underneath it. A
 * caller that does not call `rolesRepo.load()` and `roleHoldersRepo.load()`
 * after a report with `roleCreated` or a non-empty `seated` will serve the old
 * answer until the process restarts, and the capability gate reads that cache.
 */
export async function seatCatalystsAsStewards(
  pool: Pool,
  launchBallotId: string,
  turn: SeasonTurn = { currentSeasonId: null, nextTurnAt: null },
): Promise<SeatingReport> {
  const base: SeatingReport = {
    ok: true,
    roleCreated: false,
    capabilityGranted: false,
    seated: [],
    alreadySeated: [],
    termEndsAt: turn.nextTurnAt,
  };
  /*
   * BOUND AS A Date, NEVER AS THE ISO STRING.
   *
   * MySQL refuses `2026-12-01T00:00:00.000Z` for a `timestamp` column outright
   * ("Incorrect datetime value"), so passing the caller's string straight
   * through made every seating throw, inside a launch closer that runs with no
   * transaction around it. An unreadable date becomes null rather than an
   * exception, because a seat with no term is the old behaviour and a launch
   * that half-happened is not.
   */
  const termDate = (() => {
    if (!turn.nextTurnAt) return null;
    const d = new Date(turn.nextTurnAt);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  if (turn.nextTurnAt && !termDate) base.termEndsAt = null;

  // 1. Find or create the role. A village that already renamed it keeps its
  //    name: only the slug is looked up, and the name column is never
  //    overwritten by this call.
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id, name, capabilities FROM roles WHERE id = ?",
    [STEWARD_ROLE_ID],
  );
  if (!existing[0]) {
    await pool.query(
      "INSERT INTO roles (id, name, description, capabilities, sort_order) VALUES (?,?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE id = id",
      [
        STEWARD_ROLE_ID,
        STEWARD_ROLE_NAME,
        "Approves a proposal the village has already passed, or refuses it with a reason. Training wheels: a village that no longer needs the seat lets it stand empty.",
        JSON.stringify([STEWARD_APPROVE]),
        0,
      ],
    );
    base.roleCreated = true;
    base.capabilityGranted = true;
  } else {
    let caps: unknown = existing[0].capabilities;
    if (typeof caps === "string") {
      try {
        caps = JSON.parse(caps);
      } catch {
        caps = [];
      }
    }
    const list = Array.isArray(caps) ? caps.map(String) : [];
    if (!list.includes(STEWARD_APPROVE)) {
      await pool.query("UPDATE roles SET capabilities = ? WHERE id = ?", [
        JSON.stringify([...list, STEWARD_APPROVE]),
        STEWARD_ROLE_ID,
      ]);
      base.capabilityGranted = true;
    }
  }

  // 2. Every catalyst. The stored role value is `founder`; the word a player
  //    reads is Catalyst, and this query is not a surface a player reads.
  const [catalysts] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE role = 'founder' ORDER BY id",
  );
  const [held] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM role_holders WHERE role_id = ?",
    [STEWARD_ROLE_ID],
  );
  const already = new Set(held.map((r) => String(r.user_id)));

  for (const c of catalysts) {
    const userId = String(c.id);
    if (already.has(userId)) {
      base.alreadySeated.push(userId);
      continue;
    }
    // The ballot is the grantor, the same way a role_seat ballot is. A holding
    // whose granted_by is a ballot id reads back as "the village put them
    // here" rather than as an administrator's hand.
    await pool.query(
      "INSERT INTO role_holders (id, role_id, user_id, granted_by, term_ends_at, season_id) VALUES (?,?,?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE role_id = role_id",
      [
        `rh-steward-${userId}`.slice(0, 64),
        STEWARD_ROLE_ID,
        userId,
        launchBallotId,
        termDate,
        turn.currentSeasonId,
      ],
    );
    base.seated.push(userId);
  }

  return base;
}

// ── The daily watch ─────────────────────────────────────────────────────────

export interface ExpiringHolding {
  id: string;
  roleId: string;
  roleName: string;
  userId: string;
  termEndsAt: string;
  /** Negative once the term has passed. */
  daysLeft: number;
  ended: boolean;
}

/**
 * Permission-plane holdings whose term has run out or is about to.
 *
 * The sibling of `expiringSeatings` in server/lib/orgChart.ts, which asks the
 * same question of the org chart. Two planes, two queries, on purpose: they
 * hold different rows and only one of them carries powers.
 */
export async function expiringHoldings(
  pool: Pool,
  withinDays = 14,
  now: Date = new Date(),
): Promise<ExpiringHolding[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT h.id, h.role_id, h.user_id, h.term_ends_at, r.name AS role_name FROM role_holders h " +
      "LEFT JOIN roles r ON r.id = h.role_id " +
      "WHERE h.term_ends_at IS NOT NULL AND h.term_ends_at <= ? ORDER BY h.term_ends_at, h.id",
    [new Date(now.getTime() + withinDays * 86400000)],
  );
  return rows.map((r) => {
    const ends = r.term_ends_at instanceof Date ? r.term_ends_at : new Date(String(r.term_ends_at));
    return {
      id: String(r.id),
      roleId: String(r.role_id),
      roleName: String(r.role_name ?? r.role_id),
      userId: String(r.user_id),
      termEndsAt: ends.toISOString(),
      daysLeft: Math.ceil((ends.getTime() - now.getTime()) / 86400000),
      ended: ends.getTime() <= now.getTime(),
    };
  });
}

/** What the job needs, handed in, so this stays a function of its inputs. */
export interface TermWatchDeps {
  pool: Pool;
  notify(input: {
    userId: string;
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
    dedupeKey: string;
  }): Promise<{ fresh: boolean }>;
  notifyRoll(
    ballot: { id: string },
    input: { type: string; title: string; body?: string | null; keySuffix: string },
  ): Promise<number>;
  /** Org-chart seatings ending soon, already computed by the caller. */
  seatings: Array<{ id: string; holderKind: string; userId: string | null; roleName: string; daysLeft: number | null; lapsed?: boolean }>;
  now?: Date;
}

export interface TermWatchReport {
  /** Holders told, across both planes. */
  holdersTold: number;
  /** Members on a roll told that a decision is waiting for a steward. */
  rollsTold: number;
  /** Passed decisions with nobody able to decide them. */
  waiting: number;
  /** False only when a sweep could not run. Distinguishes none from unknown. */
  ok: boolean;
}

/**
 * The daily term watch, both planes, plus the loud vacancy.
 *
 * THE VACANCY IS LOUD WHERE IT COSTS SOMETHING. A seat standing empty is not
 * news on its own, and the founder ruled that an empty seat is a healthy state
 * a village may choose. What IS news is a decision the village already carried
 * sitting still because nobody can approve it, so that is the only condition
 * that rings anybody, and it rings the ROLL of that decision: the people who
 * were asked are the people who are owed the answer.
 *
 * One notification per member per ballot, through `notifyRoll`'s stable key,
 * so a job that runs every day for a month rings once.
 */
export async function runTermWatch(deps: TermWatchDeps): Promise<TermWatchReport> {
  const now = deps.now ?? new Date();
  const report: TermWatchReport = { holdersTold: 0, rollsTold: 0, waiting: 0, ok: true };

  // Plane one: org-chart seatings. This plane carries no capabilities, so its
  // copy stays about the mandate and says so rather than making a claim about
  // powers that would be false one plane over.
  for (const a of deps.seatings) {
    if (a.holderKind !== "member" || !a.userId) continue;
    const ended = !!a.lapsed;
    const r = await deps.notify({
      userId: a.userId,
      type: "term_expiring",
      title: ended
        ? `Your term on ${a.roleName} has ended`
        : `Your term on ${a.roleName} ends in ${a.daysLeft} day(s)`,
      body: ended
        ? "The agreement to keep holding this seat unasked has run out. This seat carries no permissions of its own, so nothing has been switched off, and it is the moment to say whether you want to carry on."
        : "This is the nudge to say whether you want to carry on, while there is still time to arrange it.",
      link: "/roles",
      dedupeKey: `${ended ? "term-ended" : "term-soon"}:${a.id}`,
    });
    if (r.fresh) report.holdersTold += 1;
  }

  // Plane two: permission holdings. Here a term really does end the powers,
  // so the copy says it plainly. The founder: "If they're not voted back in
  // then they expire when they expire!"
  for (const h of await expiringHoldings(deps.pool, 14, now)) {
    const r = await deps.notify({
      userId: h.userId,
      type: "term_expiring",
      title: h.ended
        ? `Your term as ${h.roleName} has ended`
        : `Your term as ${h.roleName} ends in ${h.daysLeft} day(s)`,
      body: h.ended
        ? "The seat has ended, and the powers that came with it have ended with it. Nothing was taken from you by anybody; the term simply reached its date. The village seats you again if it wants you to carry on."
        : "When the date arrives the seat ends, and the powers that came with it end too. Nothing renews on its own.",
      link: "/roles",
      dedupeKey: `${h.ended ? "perm-term-ended" : "perm-term-soon"}:${h.id}`,
    });
    if (r.fresh) report.holdersTold += 1;
  }

  // The loud vacancy: only where a carried decision is actually waiting.
  const waiting = await ballotsWaitingForASteward(deps.pool);
  report.waiting = waiting.length;
  if (waiting.length > 0) {
    const state = await vacancyState(deps.pool, now);
    if (!state.seated) {
      for (const b of waiting) {
        // `b` is passed whole rather than as `{ id: b.id }`, and that is not
        // only tidier: shared/notificationKinds.test.ts finds every type the
        // server produces by brace-matching the FIRST object literal after a
        // notifyRoll call, so an inline first argument hides the second one
        // from it and a new kind ships with no blurb behind a green suite.
        report.rollsTold += await deps.notifyRoll(
          b,
          {
            type: "ballot_awaiting_steward",
            title: `${b.title} is waiting for a steward`,
            body: `${state.sentence} The decision stands as the village made it and takes effect when somebody holds the seat again.`,
            keySuffix: "awaiting-steward",
          },
        );
      }
    }
  }

  return report;
}
