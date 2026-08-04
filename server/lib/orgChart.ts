/**
 * The sociocratic org chart as rows (0049).
 *
 * Two planes share the word "role" in this codebase and they are unrelated.
 * The `roles` table is a PERMISSION-GROUP carrier whose `capabilities` JSON is
 * the only per-village source feeding the one gate. This module owns the other
 * one: the seats a village organises its work into, each with an aim, a
 * domain, accountabilities, a seat count and dated holders. Nothing here
 * touches the gate, and nothing here reads or writes `roles`.
 *
 * Deliberately NOT a dbCollection. `replaceAll` is a DELETE-all plus a
 * re-INSERT of exactly the columns in a spec, so a column left out of a spec
 * is silently reset to its DEFAULT on the next write. These are history
 * tables; they are read and written with explicit SQL.
 *
 * Vacancy is DERIVED. There is no filled/open column, because a hand-set one
 * drifts: the content cards this replaced already carried two seats marked
 * filled with nobody named. `statusOverride` exists for the case where a
 * village genuinely knows better than the derivation, and it carries an
 * expiry so it lapses back rather than outliving the moment somebody meant it.
 */
import type { Pool } from "mysql2/promise";

export type SeatState = "open" | "filled" | "partial" | "forming" | "expired";

/**
 * What decides whether a holding has lapsed. Passed in rather than read here,
 * because this file must stay a pure function of its inputs.
 */
export interface LapseContext {
  /** The dated season running today, or null. */
  currentSeasonId: string | null;
  /** org.reassignment_cadence: season_turn | pattern_change | annual | never. */
  cadence: string;
  now?: Date;
}

export interface OrgRole {
  id: string;
  circleId: string | null;
  name: string;
  aim: string | null;
  domain: string | null;
  accountabilities: string[];
  whyItMatters: string | null;
  seats: number;
  criticality: "normal" | "high";
  active: boolean;
  recruiting: boolean;
  expiresEachSeason: boolean | null;
  statusOverride: SeatState | null;
  statusOverrideExpiresAt: Date | null;
  icon: string | null;
  color: string | null;
  order: number;
  isExample: boolean;
  /**
   * THE RECRUITMENT PACK. Six columns 0049 created and `WRITABLE` has always
   * accepted, and which nothing ever read back: `ROLE_COLS` omitted every one,
   * so an admin could type a seat's pay reality into the API and watch it
   * vanish from every view forever.
   *
   * They are read here so the round trip is honest, and they are ADMIN ONLY on
   * `/api/org`. They are not structure: `compensationReality` is money and the
   * outcomes and evidence fields are what a candidate is measured against.
   * `buildOrgExport` names its fields one by one and none of these is among
   * them, which is the property `villageExport.test.ts` asserts against the
   * whole serialised export rather than field by field.
   */
  authority: string | null;
  firstYearOutcomes: string | null;
  first90DayOutcomes: string | null;
  locationExpectations: string | null;
  compensationReality: string | null;
  evidenceRequired: string | null;
}

export interface OrgAssignment {
  id: string;
  orgRoleId: string;
  holderKind: "member" | "documented";
  userId: string | null;
  displayName: string | null;
  holderKey: string;
  focus: string | null;
  note: string | null;
  seasonId: string | null;
  termEndsAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  endedReason: string | null;
  /**
   * DERIVED, never stored: the term ran out, or the season this seating was
   * made in has turned. The holding is still live and the person is still
   * acting; what has expired is their mandate to keep doing so unasked.
   */
  lapsed?: boolean;
  lapsedReason?: "term" | "season" | null;
  /** A standing-example seating (0046), seeded for an empty village to read. */
  isExample: boolean;
}

const ROLE_COLS =
  "id, circle_id, name, aim, domain, accountabilities, why_it_matters, seats, criticality, active, recruiting, expires_each_season, status_override, status_override_expires_at, icon, color, sort_order, is_example, " +
  // The recruitment pack. Written since 0049, selected by nobody until now, so
  // every one of them was a column the API accepted and then swallowed.
  "authority, first_year_outcomes, first_90_day_outcomes, location_expectations, compensation_reality, evidence_required";

const ASSIGN_COLS =
  // `is_example` rides along so the flag travels through every SELECT. It was
  // missing here while `org_role_assignments` WAS registered with the
  // standing-examples machinery (examples.ts seeds rows with is_example = 1),
  // so every read handed back demo seatings that nothing downstream could tell
  // from real ones. The public export is the first reader that must not.
  "id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, note, season_id, term_ends_at, started_at, ended_at, ended_reason, is_example";

/** MySQL hands JSON back already parsed on some drivers and as text on others. */
function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToRole(r: any): OrgRole {
  return {
    id: r.id,
    circleId: r.circle_id ?? null,
    name: r.name,
    aim: r.aim ?? null,
    domain: r.domain ?? null,
    accountabilities: asList(r.accountabilities),
    whyItMatters: r.why_it_matters ?? null,
    seats: Number(r.seats ?? 1),
    criticality: r.criticality === "high" ? "high" : "normal",
    active: !!r.active,
    recruiting: !!r.recruiting,
    expiresEachSeason: r.expires_each_season === null || r.expires_each_season === undefined ? null : !!r.expires_each_season,
    statusOverride: (r.status_override ?? null) as SeatState | null,
    statusOverrideExpiresAt: r.status_override_expires_at ?? null,
    icon: r.icon ?? null,
    color: r.color ?? null,
    order: Number(r.sort_order ?? 0),
    isExample: !!r.is_example,
    authority: r.authority ?? null,
    firstYearOutcomes: r.first_year_outcomes ?? null,
    first90DayOutcomes: r.first_90_day_outcomes ?? null,
    locationExpectations: r.location_expectations ?? null,
    compensationReality: r.compensation_reality ?? null,
    evidenceRequired: r.evidence_required ?? null,
  };
}

function rowToAssignment(r: any): OrgAssignment {
  return {
    id: r.id,
    orgRoleId: r.org_role_id,
    holderKind: r.holder_kind === "documented" ? "documented" : "member",
    userId: r.user_id ?? null,
    displayName: r.display_name ?? null,
    holderKey: r.holder_key,
    focus: r.focus ?? null,
    note: r.note ?? null,
    seasonId: r.season_id ?? null,
    termEndsAt: r.term_ends_at ?? null,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    endedReason: r.ended_reason ?? null,
    isExample: !!r.is_example,
  };
}

export async function listOrgRoles(pool: Pool): Promise<OrgRole[]> {
  const [rows]: any = await pool.query(`SELECT ${ROLE_COLS} FROM org_roles ORDER BY sort_order, name`);
  return (rows as any[]).map(rowToRole);
}

/**
 * Live seatings only. Ended ones are history and are asked for by name.
 *
 * Pass a LapseContext and each row comes back annotated with whether its
 * mandate has run out. Without one they come back unannotated, which is the
 * old behaviour and treats every live seating as current.
 */
export async function listOrgAssignments(pool: Pool, ctx?: LapseContext): Promise<OrgAssignment[]> {
  const [rows]: any = await pool.query(
    `SELECT ${ASSIGN_COLS} FROM org_role_assignments WHERE ended_at IS NULL ORDER BY started_at, id`,
  );
  const list = (rows as any[]).map(rowToAssignment);
  if (!ctx) return list;
  const roles = await listOrgRoles(pool);
  const byId = new Map(roles.map((r) => [r.id, r]));
  return list.map((a) => {
    const role = byId.get(a.orgRoleId);
    const v = isLapsed(a, { expiresEachSeason: role?.expiresEachSeason ?? null }, ctx);
    return { ...a, lapsed: v.lapsed, lapsedReason: v.reason };
  });
}

/**
 * Seatings whose mandate has run out or is about to, most overdue first.
 *
 * Terms are the highest-value column in this whole model precisely because a
 * village forgets them: without a date, correcting a bad fit needs a
 * confrontation, and communities avoid confrontations until seats calcify.
 * With one, removal becomes non-renewal.
 */
export async function expiringSeatings(
  pool: Pool,
  ctx: LapseContext,
  withinDays = 30,
): Promise<Array<OrgAssignment & { roleName: string; daysLeft: number | null }>> {
  const [live, roles] = await Promise.all([listOrgAssignments(pool, ctx), listOrgRoles(pool)]);
  const nameOf = new Map(roles.map((r) => [r.id, r.name]));
  const now = (ctx.now ?? new Date()).getTime();
  const soon = withinDays * 86400000;
  return live
    .filter((a) => a.lapsed || (a.termEndsAt && a.termEndsAt.getTime() - now <= soon))
    .map((a) => ({
      ...a,
      roleName: nameOf.get(a.orgRoleId) ?? a.orgRoleId,
      daysLeft: a.termEndsAt ? Math.ceil((a.termEndsAt.getTime() - now) / 86400000) : null,
    }))
    .sort((x, y) => (x.daysLeft ?? -9999) - (y.daysLeft ?? -9999));
}

export async function orgRoleHistory(pool: Pool, orgRoleId: string): Promise<OrgAssignment[]> {
  const [rows]: any = await pool.query(
    `SELECT ${ASSIGN_COLS} FROM org_role_assignments WHERE org_role_id = ? ORDER BY started_at DESC, id`,
    [orgRoleId],
  );
  return (rows as any[]).map(rowToAssignment);
}

/**
 * The seat's state, derived. `seats` is the target, live holdings are the
 * count, and an unexpired override wins over both.
 */
/**
 * Has this seating run out of mandate?
 *
 * NOTHING IS REVOKED. A village misses a re-selection during a harvest or a
 * build push, and taking the keys away on a Tuesday for reasons nobody chose
 * is worse than the seat reading as overdue. So a lapsed holding is still a
 * holding: the person keeps acting, and the seat says out loud that it is
 * waiting to be reassigned.
 *
 * Derived on every read, so a season turn writes nothing and cannot drift.
 */
export function isLapsed(
  a: Pick<OrgAssignment, "termEndsAt" | "seasonId" | "endedAt">,
  role: Pick<OrgRole, "expiresEachSeason">,
  ctx: LapseContext,
): { lapsed: boolean; reason: "term" | "season" | null } {
  if (a.endedAt) return { lapsed: false, reason: null };
  const now = ctx.now ?? new Date();
  // A term always wins, whatever the cadence says: somebody named a date.
  if (a.termEndsAt && a.termEndsAt.getTime() <= now.getTime()) {
    return { lapsed: true, reason: "term" };
  }
  if (ctx.cadence === "never") return { lapsed: false, reason: null };
  // A seat may opt out on its own card; null inherits the village setting.
  if (role.expiresEachSeason === false) return { lapsed: false, reason: null };
  // Seated in a season that is no longer the one running.
  if (
    (ctx.cadence === "season_turn" || ctx.cadence === "pattern_change") &&
    a.seasonId &&
    ctx.currentSeasonId &&
    a.seasonId !== ctx.currentSeasonId
  ) {
    return { lapsed: true, reason: "season" };
  }
  return { lapsed: false, reason: null };
}

/**
 * The seat's state, derived.
 *
 * `holders` is the live seatings, each already annotated with whether it has
 * lapsed. A seat every one of whose holders has lapsed reads `expired`: still
 * held, and openly waiting for the village to reassign it. Counting a lapsed
 * holder as "filled" is how a seat quietly stops being reviewed for a year.
 */
export function seatState(
  role: OrgRole,
  holders: Array<{ lapsed?: boolean }> | number,
  now = new Date(),
): SeatState {
  const ov = role.statusOverride;
  if (ov) {
    const until = role.statusOverrideExpiresAt;
    if (!until || until.getTime() > now.getTime()) return ov;
  }
  const list: Array<{ lapsed?: boolean }> =
    typeof holders === "number" ? Array.from({ length: holders }, () => ({}) as { lapsed?: boolean }) : holders;
  const live = list.length;
  if (live <= 0) return "open";
  const current = list.filter((h) => !h.lapsed).length;
  if (current === 0) return "expired";
  if (current < role.seats) return "partial";
  return "filled";
}

/** `doc:` keeps a documented holder from ever colliding with a real user id. */
export function documentedKey(displayName: string): string {
  const slug = String(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `doc:${slug || "unnamed"}`;
}

export interface HolderLoad {
  holderKey: string;
  name: string;
  /** A claimed member, or a name written on a card nobody has claimed yet. */
  isMember: boolean;
  seatsHeld: number;
  /** Seats where this person is the ONLY current holder. */
  soleHeld: number;
  soleHeldCritical: number;
  /**
   * Of the sole-held seats, how many have somebody NAMED to carry them (0054).
   *
   * This is the difference between a risk and a plan. A seat one person holds
   * alone with a deputy written down survives them being ill; the same seat
   * with nobody named does not, and until relations existed the read could not
   * tell those two apart.
   */
  soleHeldWithCover: number;
  /** This person's share of every live seating in the village, 0..1. */
  share: number;
  /** The sole-held seats by name, which are the ones that go dark. */
  soleHeldNames: string[];
}

export interface StructuralLoad {
  holders: HolderLoad[];
  seatingsLive: number;
  distinctHolders: number;
  /** Active seats with nobody current on them at all. */
  unheldSeats: number;
  /** The largest single share, or null when the chart cannot support it. */
  concentration: number | null;
  /**
   * Pairs that look like one human counted twice: a name written on a card
   * that slugifies to the same key as a claimed member's name. Reported,
   * never merged. See the note in `structuralLoad`.
   */
  possibleDuplicates: Array<{ documentedKey: string; memberKey: string; name: string }>;
  note: string;
}

/**
 * Role hoarding: who the chart depends on, read from its shape.
 *
 * Peerdom surfaces this as an insight and it is the one structural read
 * nothing else here does. The map reads VACANCY (seats with nobody on them)
 * and the season retrospective reads ACTIVITY (who produced what). Neither
 * answers the question that actually ends projects: if this person stops,
 * what stops with them.
 *
 * Three numbers, and only the second is a finding:
 *
 *  - `seatsHeld` is context, not a signal. A four-person village with twenty
 *    seats gives everybody five, and that is a description of being early
 *    rather than evidence of anything.
 *  - `soleHeld` is the honest read. It needs no threshold to be picked and no
 *    judgement to be interpreted: these are the seats with no second holder,
 *    so these are the ones that go dark. `soleHeldCritical` separates the
 *    seats the village already marked high-criticality, because sole-holding
 *    the one critical seat is a different risk from sole-holding three
 *    ordinary ones.
 *  - `share` is what makes any of it comparable between a village of six and
 *    a village of sixty.
 *
 * Reported without judgement, deliberately. Somebody holding half the seats
 * in a founding season is doing the necessary thing, and the action is to
 * spread the load rather than to correct them.
 *
 * TWO HONEST LIMITS, both in the returned data rather than hidden here.
 *
 * A lapsed holding still counts. Nothing is revoked at a season turn, the
 * person is still doing the work, and dropping them from the load would
 * report a village as less dependent on someone precisely when their mandate
 * has run out.
 *
 * A person can be counted twice: named on one card as a documented holder and
 * seated on another as a claimed member, under two different holder keys.
 * That UNDERSTATES their load, which is the wrong direction to be wrong in.
 * The fix is the seat-claim flow, where a human confirms the match. Merging
 * them here on a name would assert an identity nobody confirmed, so this
 * flags the pair and leaves it alone.
 */
export function structuralLoad(
  roles: OrgRole[],
  assignments: OrgAssignment[],
  /**
   * Resolves a member's user id to their name. Passed in so this file stays a
   * pure function of its inputs, and REQUIRED for the duplicate check to work
   * at all: a member seating often carries no `display_name` (the user row has
   * the name), so without this a member reads as a raw user id, matches no
   * documented key, and the split-identity flag never fires.
   */
  nameOf?: (userId: string) => string | null,
  /**
   * Seat ids that somebody is named to carry (0054 cover relations). Passed in
   * rather than read here, because this file stays a pure function of its
   * inputs. Omitted means "no relations known", which reports every sole-held
   * seat as uncovered: the honest answer for a village that has named nobody.
   */
  covered: Set<string> = new Set(),
): StructuralLoad {
  const live = assignments.filter((a) => !a.endedAt);
  const byRole = new Map<string, OrgAssignment[]>();
  for (const a of live) byRole.set(a.orgRoleId, [...(byRole.get(a.orgRoleId) ?? []), a]);

  const seatById = new Map(roles.filter((r) => r.active && !r.isExample).map((r) => [r.id, r]));
  const acc = new Map<string, HolderLoad>();
  let seatingsLive = 0;

  for (const [roleId, holders] of Array.from(byRole.entries())) {
    const role = seatById.get(roleId);
    if (!role) continue; // an inactive or example seat is not a load on anyone
    const sole = holders.length === 1;
    for (const h of holders) {
      seatingsLive += 1;
      const cur =
        acc.get(h.holderKey) ??
        {
          holderKey: h.holderKey,
          name: (h.userId ? nameOf?.(h.userId) : null) || h.displayName || h.holderKey,
          isMember: h.holderKind === "member",
          seatsHeld: 0,
          soleHeld: 0,
          soleHeldCritical: 0,
          soleHeldWithCover: 0,
          share: 0,
          soleHeldNames: [],
        };
      cur.seatsHeld += 1;
      if (sole) {
        cur.soleHeld += 1;
        cur.soleHeldNames.push(role.name);
        if (role.criticality === "high") cur.soleHeldCritical += 1;
        if (covered.has(role.id)) cur.soleHeldWithCover += 1;
      }
      acc.set(h.holderKey, cur);
    }
  }

  const holders = Array.from(acc.values());
  for (const h of holders) h.share = seatingsLive > 0 ? h.seatsHeld / seatingsLive : 0;
  holders.sort((a, b) => b.soleHeld - a.soleHeld || b.seatsHeld - a.seatsHeld || a.name.localeCompare(b.name));

  const unheldSeats = Array.from(seatById.values()).filter((r) => !(byRole.get(r.id) ?? []).length).length;

  // The same human under two keys. Compared by slug on BOTH sides so a member
  // named "Ada Vance" matches the card that says "ada vance".
  const memberBySlug = new Map<string, string>();
  for (const h of holders) if (h.isMember) memberBySlug.set(documentedKey(h.name), h.holderKey);
  const possibleDuplicates: StructuralLoad["possibleDuplicates"] = [];
  for (const h of holders) {
    if (h.isMember) continue;
    const memberKey = memberBySlug.get(h.holderKey);
    if (memberKey) possibleDuplicates.push({ documentedKey: h.holderKey, memberKey, name: h.name });
  }

  // Below two holders every seat is sole-held by definition, so the number
  // describes the village's size and nothing else. Say that instead.
  const readable = holders.length >= 2;

  return {
    holders,
    seatingsLive,
    distinctHolders: holders.length,
    unheldSeats,
    concentration: readable && seatingsLive > 0 ? holders.reduce((m, h) => Math.max(m, h.share), 0) : null,
    possibleDuplicates,
    note: readable
      ? "Sole-held seats are the ones with no second holder, so they are what stops if that person stops. A seat with somebody named to carry it is a plan; the rest are the ones to name somebody for. Carrying a lot is a load and not a fault, and a seat one person carries alone is the first candidate to grow into a circle."
      : holders.length === 0
        ? "No seats have holders yet, so there is no load to read."
        : "One person holds every seat. That is what a founding looks like, not a finding. This reads once a second person is seated.",
  };
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/**
 * A structural change, in the words somebody would use about it.
 *
 * Peerdom's journal is the feature worth copying here: before you change a
 * seat you can read what has already been tried with it. That only works if
 * the line says WHAT changed rather than "PUT /api/admin/org/roles/x", which
 * is all the generic admin audit records.
 *
 * Returned rather than written, so this file stays free of the pool and the
 * caller decides the audience.
 */
export function describeOrgChange(before: OrgRole | null, after: Partial<OrgRole>): string[] {
  const lines: string[] = [];
  if (!before) return lines;
  const say = (label: string, from: unknown, to: unknown) => {
    const f = from === null || from === undefined || from === "" ? "nothing" : String(from);
    const tt = to === null || to === undefined || to === "" ? "nothing" : String(to);
    if (f !== tt) lines.push(`${label}: ${f} -> ${tt}`);
  };
  if (after.name !== undefined) say("renamed", before.name, after.name);
  if (after.circleId !== undefined) say("moved circle", before.circleId, after.circleId);
  if (after.seats !== undefined) say("seats", before.seats, after.seats);
  if (after.aim !== undefined && after.aim !== before.aim) lines.push("aim rewritten");
  if (after.domain !== undefined && after.domain !== before.domain) lines.push("domain rewritten");
  if (after.accountabilities !== undefined) {
    const a = before.accountabilities.length;
    const b = after.accountabilities.length;
    if (a !== b) lines.push(`accountabilities: ${a} -> ${b}`);
  }
  if (after.active !== undefined) say(after.active ? "reopened" : "rested", before.active, after.active);
  if (after.recruiting !== undefined) say("recruiting", before.recruiting, after.recruiting);
  if (after.criticality !== undefined) say("criticality", before.criticality, after.criticality);
  if (after.expiresEachSeason !== undefined) {
    say("expires each season", before.expiresEachSeason, after.expiresEachSeason);
  }
  return lines;
}

const WRITABLE: Record<string, string> = {
  name: "name",
  circleId: "circle_id",
  aim: "aim",
  domain: "domain",
  whyItMatters: "why_it_matters",
  seats: "seats",
  criticality: "criticality",
  active: "active",
  recruiting: "recruiting",
  expiresEachSeason: "expires_each_season",
  authority: "authority",
  firstYearOutcomes: "first_year_outcomes",
  first90DayOutcomes: "first_90_day_outcomes",
  locationExpectations: "location_expectations",
  compensationReality: "compensation_reality",
  evidenceRequired: "evidence_required",
  icon: "icon",
  color: "color",
  order: "sort_order",
};

export async function createOrgRole(pool: Pool, body: any): Promise<string> {
  const id =
    String(body?.id ?? body?.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || `seat-${Date.now().toString(36)}`;
  await pool.query(
    `INSERT INTO org_roles (id, name, circle_id, aim, domain, accountabilities, seats, sort_order)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      id,
      String(body?.name ?? "New seat"),
      body?.circleId || null,
      body?.aim ?? null,
      body?.domain ?? null,
      JSON.stringify(Array.isArray(body?.accountabilities) ? body.accountabilities : []),
      Math.max(1, Number(body?.seats ?? 1)),
      Number(body?.order ?? 0),
    ],
  );
  return id;
}

/**
 * Partial update. Only keys present in the body move, so a client that knows
 * about six fields cannot blank the other twelve by omitting them.
 */
/**
 * The states a village may DECLARE. Narrower than `SeatState` on purpose.
 *
 * `expired` is derived: it means every holder's mandate has run out, which is
 * a fact about dates and not something to assert. The 0049 column is
 * enum('open','filled','partial','forming') and `updateOrgRole` used to pass
 * whatever arrived straight into the UPDATE, so a client sending "expired"
 * (a value the TypeScript type says is a SeatState) failed at the database
 * with a truncation error instead of a sentence.
 */
export const DECLARABLE_STATES: SeatState[] = ["open", "filled", "partial", "forming"];

export function statusOverrideProblem(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (DECLARABLE_STATES.includes(v as SeatState)) return null;
  if (v === "expired") {
    return "A seat cannot be declared expired. That is worked out from the terms on its holders.";
  }
  return `A declared state must be one of: ${DECLARABLE_STATES.join(", ")}`;
}

export async function updateOrgRole(pool: Pool, id: string, body: any): Promise<boolean> {
  const sets: string[] = [];
  const args: any[] = [];
  for (const [js, col] of Object.entries(WRITABLE)) {
    if (body[js] === undefined) continue;
    sets.push(`\`${col}\` = ?`);
    if (js === "seats") args.push(Math.max(1, Number(body[js] ?? 1)));
    else if (js === "order") args.push(Number(body[js] ?? 0));
    else if (js === "active" || js === "recruiting") args.push(body[js] ? 1 : 0);
    else if (js === "expiresEachSeason") args.push(body[js] === null ? null : body[js] ? 1 : 0);
    else args.push(body[js] === "" ? null : body[js]);
  }
  if (body.accountabilities !== undefined) {
    sets.push("`accountabilities` = ?");
    args.push(JSON.stringify(Array.isArray(body.accountabilities) ? body.accountabilities : []));
  }
  // An override with no expiry is a status column with extra steps, so a
  // caller that sets one must say how long it stands for.
  if (body.statusOverride !== undefined) {
    sets.push("`status_override` = ?", "`status_override_expires_at` = ?");
    args.push(body.statusOverride || null);
    args.push(
      body.statusOverride && body.statusOverrideDays
        ? new Date(Date.now() + Number(body.statusOverrideDays) * 86400000)
        : null,
    );
  }
  if (!sets.length) return false;
  args.push(id);
  const [r]: any = await pool.query(`UPDATE org_roles SET ${sets.join(", ")} WHERE id = ?`, args);
  return !!r?.affectedRows;
}

/**
 * Seat somebody. A member holding carries their user id; a documented holder
 * carries only a name, which is how a real person occupies a real seat before
 * they have an account.
 */
export async function seatHolder(
  pool: Pool,
  orgRoleId: string,
  h: { userId?: string | null; displayName?: string | null; focus?: string | null; note?: string | null; seasonId?: string | null; termEndsAt?: Date | null; grantedBy?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const kind = h.userId ? "member" : "documented";
  if (kind === "documented" && !String(h.displayName ?? "").trim()) {
    return { ok: false, reason: "A documented holder needs a name" };
  }
  const holderKey = h.userId ? String(h.userId) : documentedKey(String(h.displayName));
  try {
    await pool.query(
      `INSERT INTO org_role_assignments
         (id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, note, season_id, term_ends_at, granted_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId("orgasg"),
        orgRoleId,
        kind,
        h.userId ?? null,
        h.displayName ?? null,
        holderKey,
        h.focus ?? null,
        h.note ?? null,
        h.seasonId ?? null,
        h.termEndsAt ?? null,
        h.grantedBy ?? null,
      ],
    );
    return { ok: true };
  } catch (e: any) {
    // The unique key is on (seat, active holder key), so this is the one
    // collision it exists to catch.
    if (e?.code === "ER_DUP_ENTRY") return { ok: false, reason: "They already hold this seat" };
    throw e;
  }
}

/**
 * End a seating. Never a DELETE: a seat's history is the point, and the
 * generated active-holder key frees the person to hold it again later.
 */
export async function endSeating(pool: Pool, assignmentId: string, reason?: string): Promise<boolean> {
  const [r]: any = await pool.query(
    "UPDATE org_role_assignments SET ended_at = NOW(), ended_reason = ? WHERE id = ? AND ended_at IS NULL",
    [reason ?? null, assignmentId],
  );
  return !!r?.affectedRows;
}

/**
 * Release every seat a departing member holds, and take their name off it.
 *
 * `anonymizeMember` ends PERMISSION holdings (`role_holders`) and touched
 * nothing here, because "role" means two unrelated things (§3.15). So a
 * member who exercised deletion kept a live seating under their real user id
 * and `/api/org` went on republishing it to anyone with `map.viewPeople`.
 *
 * Ended, never deleted, exactly as `endSeating` does it: a seat's history is
 * the point, and the generated active-holder key frees the seat for whoever
 * comes next. `display_name` goes from EVERY row, live and ended, because it
 * is the one column here that restates the person without joining to `users`:
 * `claimSeating` keeps the name a seating was documented under, so the
 * tombstone written on the users row never reaches it. The note goes with it,
 * for the same reason and because it is a sentence about the person rather
 * than about the work ("Away and inactive" is the one that leaked). `focus`
 * stays: it says which slice of the seat was held, which is a fact about the
 * seat.
 */
export async function releaseSeatingsForUser(
  pool: Pool,
  userId: string,
  reason: string,
): Promise<number> {
  const [ended]: any = await pool.query(
    "UPDATE org_role_assignments SET ended_at = NOW(), ended_reason = ? WHERE user_id = ? AND ended_at IS NULL",
    [reason, userId],
  );
  await pool.query(
    "UPDATE org_role_assignments SET display_name = NULL, note = NULL WHERE user_id = ?",
    [userId],
  );
  return Number(ended?.affectedRows ?? 0);
}

/**
 * Forget a documented holder across every seat they were recorded on.
 *
 * A documented holder is a real person with no account, which is the whole
 * point of `holder_kind = 'documented'` — and it means `anonymizeMember` can
 * never reach them, because nothing joins their name to a user row. This is
 * their only door. It is an admin act because somebody has to say which
 * recorded name the request is about; matching on a name is what the
 * seat-claim flow puts a human in the loop for.
 *
 * Everything they hold goes at once, found through `holder_key` rather than
 * the id passed in: forgetting somebody from one seat and leaving them named
 * on the next one is not forgetting them. `holder_key` itself is rewritten,
 * because `documentedKey` derives it from the name and a slug is a name with
 * hyphens. Ending comes first: the key is part of a generated column under a
 * unique index while the seating is live, and NULL once it ends.
 */
export async function forgetDocumentedHolder(
  pool: Pool,
  assignmentId: string,
  reason: string,
): Promise<{ found: boolean; seatings: number }> {
  const [rows]: any = await pool.query(
    "SELECT holder_key FROM org_role_assignments WHERE id = ? AND holder_kind = 'documented'",
    [assignmentId],
  );
  const key = (rows as any[])[0]?.holder_key;
  if (!key) return { found: false, seatings: 0 };
  const [ended]: any = await pool.query(
    "UPDATE org_role_assignments SET ended_at = NOW(), ended_reason = ? " +
      "WHERE holder_key = ? AND holder_kind = 'documented' AND ended_at IS NULL",
    [reason, key],
  );
  await pool.query(
    "UPDATE org_role_assignments SET display_name = NULL, note = NULL, holder_key = CONCAT('doc:forgotten-', id) " +
      "WHERE holder_key = ? AND holder_kind = 'documented'",
    [key],
  );
  return { found: true, seatings: Number(ended?.affectedRows ?? 0) };
}

/**
 * Convert a documented holder into a real member holding, keeping the same
 * row so the seat's history does not restart when somebody finally signs up.
 */
export async function claimSeating(pool: Pool, assignmentId: string, userId: string): Promise<boolean> {
  const [r]: any = await pool.query(
    `UPDATE org_role_assignments
        SET holder_kind = 'member', user_id = ?, holder_key = ?
      WHERE id = ? AND ended_at IS NULL AND holder_kind = 'documented' AND is_example = 0`,
    [userId, userId, assignmentId],
  );
  return !!r?.affectedRows;
}

/**
 * Documented seatings whose name looks like this member's, offered to them
 * once on sign-in as "is this you?". Deliberately a suggestion: nothing is
 * claimed without the person saying so.
 *
 * Examples are excluded, here and in `claimSeating`. `progression` is a CORE
 * module, so every fresh fork boots with seeded seats and seeded documented
 * holders already in these tables, before a human has enabled anything. A
 * member whose name happens to match one of those holders could claim a demo
 * seat and become a real holder of it, and the village's first org chart
 * would then be part illustration and part fact with nothing to tell them
 * apart.
 */
export async function unclaimedSeatingsFor(pool: Pool, fullName: string): Promise<OrgAssignment[]> {
  const name = String(fullName ?? "").trim().toLowerCase();
  if (!name) return [];
  const first = name.split(/\s+/)[0];
  const [rows]: any = await pool.query(
    `SELECT ${ASSIGN_COLS} FROM org_role_assignments
      WHERE ended_at IS NULL AND holder_kind = 'documented' AND is_example = 0`,
  );
  return (rows as any[])
    .map(rowToAssignment)
    .filter((a) => {
      const dn = String(a.displayName ?? "").trim().toLowerCase();
      if (!dn) return false;
      // Either the whole name matches, or the recorded name is exactly the
      // member's first name, which is how every holder in the seed reads.
      return dn === name || dn === first || name.startsWith(`${dn} `);
    });
}

export interface BackfillInput {
  /** The `roles` array from the live content document, or the seed. */
  cards: any[];
  /** The `circles` array from the live content document, or the seed. */
  circleCards: any[];
  /** server/seeds/org-chart-corrections-<date>.json, already parsed. */
  corrections: any;
}

export interface BackfillReport {
  circlesWritten: number;
  councilsToForming: number;
  seatsWritten: number;
  holdersWritten: number;
  skipped: boolean;
}

/**
 * Turn the card-shaped org chart into rows, once.
 *
 * The cards keep their prose: aim, domain, accountabilities and whyItMatters
 * are carried across untouched, so a village that edited them in Admin keeps
 * every word. The corrections file only moves seats between circles, renames
 * where the source of truth renamed, and names the holders the cards recorded
 * as free-text strings.
 *
 * Idempotent by presence: a deployment that already has org_roles is left
 * alone, so this can never overwrite work done after it first ran.
 *
 * BATCHED, and that is load-bearing rather than tidy. Each of the four passes
 * used to issue one statement per item: 14 circles, 8 councils, 24 seats, then
 * a lookup and an insert per holder. About 64 sequential round trips, and this
 * is the LAST thing a first boot does. Against a hosted MySQL where a round
 * trip is roughly 130ms that is tens of seconds of boot, and it made the
 * end-to-end tests fail intermittently with "server did not start", which reads
 * like a broken server and is not one. Four statements now, so the wait scales
 * with the network once instead of once per seat. Every write stays an upsert,
 * so a resumed run still finishes what a failed one started.
 */
function rowPlaceholders(rows: number, cols: number): string {
  return Array.from({ length: rows }, () => `(${Array.from({ length: cols }, () => "?").join(",")})`).join(",");
}

export async function backfillOrgChart(pool: Pool, input: BackfillInput): Promise<BackfillReport> {
  // Idempotent by presence, and RESUMABLE after a partial run.
  //
  // The guard used to be "any org_roles row exists", which sealed a
  // half-finished backfill shut: runOnce swallows the error and records
  // nothing, so the next boot retried, saw the rows that DID commit, and
  // skipped forever. A village would have been left with some of its seats
  // and no way to get the rest without hand-written SQL.
  //
  // Every write below is now an upsert, so a resumed run completes what the
  // failed one started instead of colliding with it. The skip only fires when
  // the backfill has genuinely finished.
  const [existing]: any = await pool.query("SELECT COUNT(*) n FROM org_roles");
  const already = Number(existing[0]?.n ?? 0);
  const expected = (input.cards ?? []).length + ((input.corrections?.seats ?? []).filter((s: any) => s.isNew).length);
  if (already > 0 && already >= expected) {
    return { circlesWritten: 0, councilsToForming: 0, seatsWritten: 0, holdersWritten: 0, skipped: true };
  }

  const corr = input.corrections ?? {};
  const seatCorrections = new Map<string, any>();
  for (const s of corr.seats ?? []) seatCorrections.set(s.id, s);

  // ── Circles ──────────────────────────────────────────────────────────────
  // Card prose is the better description where a card exists for the same id.
  const circleCardById = new Map<string, any>();
  for (const c of input.circleCards ?? []) if (c?.id) circleCardById.set(c.id, c);

  const circleRows = (corr.circles ?? []).map((c: any) => {
    const card = circleCardById.get(c.id);
    return [
      c.id,
      c.name,
      c.purpose ?? card?.description ?? null,
      c.parentCircleId ?? null,
      c.grownFromOrgRoleId ?? null,
      c.icon ?? card?.icon ?? null,
      c.color ?? card?.color ?? null,
      c.status ?? "active",
      Number(c.sortOrder ?? 0),
    ];
  });
  if (circleRows.length) {
    await pool.query(
      `INSERT INTO circles (id, name, purpose, parent_circle_id, grown_from_org_role_id, icon, color, status, sort_order)
       VALUES ${rowPlaceholders(circleRows.length, 9)}
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), purpose = VALUES(purpose),
         parent_circle_id = VALUES(parent_circle_id),
         grown_from_org_role_id = VALUES(grown_from_org_role_id),
         status = VALUES(status), sort_order = VALUES(sort_order)`,
      circleRows.flat(),
    );
  }
  const circlesWritten = circleRows.length;

  // The aspirational councils already exist as rows. None of them is a
  // working circle, so they move to forming and render as calls.
  let councilsToForming = 0;
  const councilIds = (corr.councilsToForming ?? []).filter(Boolean);
  if (councilIds.length) {
    const [r]: any = await pool.query(
      `UPDATE circles SET status = 'forming'
        WHERE status <> 'forming' AND id IN (${councilIds.map(() => "?").join(",")})`,
      councilIds,
    );
    councilsToForming = Number(r?.affectedRows ?? 0);
  }

  // ── Seats ────────────────────────────────────────────────────────────────
  // Every card becomes a seat. A card the corrections do not mention keeps
  // its own group string resolved to a circle by name, so a village's own
  // additions survive without being named in a platform seed.
  const circleIdByName = new Map<string, string>();
  for (const c of corr.circles ?? []) circleIdByName.set(String(c.name).toLowerCase(), c.id);
  for (const c of input.circleCards ?? []) if (c?.id && c?.name) circleIdByName.set(String(c.name).toLowerCase(), c.id);

  const cards = [...(input.cards ?? [])];
  // Seats the corrections introduce that no card ever described.
  for (const s of corr.seats ?? []) {
    if (s.isNew && !cards.some((c) => c?.id === s.id)) {
      cards.push({
        id: s.id,
        name: s.name,
        aim: s.aim,
        domain: s.domain,
        accountabilities: s.accountabilities ?? [],
        whyItMatters: s.whyItMatters,
      });
    }
  }

  const seatRows = cards
    .filter((card: any) => card?.id)
    .map((card: any) => {
      const fix = seatCorrections.get(card.id) ?? {};
      const circleId = fix.circleId ?? circleIdByName.get(String(card.group ?? "").toLowerCase()) ?? null;
      const overrideUntil =
        fix.statusOverride && fix.statusOverrideDays
          ? new Date(Date.now() + Number(fix.statusOverrideDays) * 24 * 60 * 60 * 1000)
          : null;
      return [
        card.id,
        circleId,
        fix.name ?? card.name ?? card.id,
        fix.aim ?? card.aim ?? null,
        fix.domain ?? card.domain ?? null,
        JSON.stringify(fix.accountabilities ?? card.accountabilities ?? []),
        fix.whyItMatters ?? card.whyItMatters ?? null,
        Number(fix.seats ?? 1),
        fix.criticality === "high" ? "high" : "normal",
        fix.clearStatusOverride ? null : (fix.statusOverride ?? null),
        overrideUntil,
        card.icon ?? null,
        card.color ?? null,
        Number(fix.sortOrder ?? 0),
      ];
    });
  if (seatRows.length) {
    // Upserts, so a resumed run finishes rather than colliding on a seat the
    // failed attempt already wrote.
    await pool.query(
      `INSERT INTO org_roles
         (id, circle_id, name, aim, domain, accountabilities, why_it_matters, seats, criticality,
          status_override, status_override_expires_at, icon, color, sort_order)
       VALUES ${rowPlaceholders(seatRows.length, 14)}
       ON DUPLICATE KEY UPDATE
         circle_id = VALUES(circle_id), name = VALUES(name), aim = VALUES(aim),
         domain = VALUES(domain), accountabilities = VALUES(accountabilities),
         why_it_matters = VALUES(why_it_matters), sort_order = VALUES(sort_order)`,
      seatRows.flat(),
    );
  }
  const seatsWritten = seatRows.length;

  // ── Holders ──────────────────────────────────────────────────────────────
  // Documented, every one: a real person in a real seat who may not have an
  // account. The seat-claim card converts them on their next login.
  let holdersWritten = 0;
  const named = (corr.holders ?? []).filter((h: any) => h?.seat && h?.name);
  if (named.length) {
    // One lookup for every seat named, instead of one per holder. A holder
    // whose seat does not exist is still skipped, exactly as before.
    const wanted = Array.from(new Set(named.map((h: any) => String(h.seat))));
    const [seatRowsFound]: any = await pool.query(
      `SELECT id FROM org_roles WHERE id IN (${wanted.map(() => "?").join(",")})`,
      wanted,
    );
    const seatExists = new Set((seatRowsFound as any[]).map((r) => String(r.id)));
    const holderRows = named
      .filter((h: any) => seatExists.has(String(h.seat)))
      .map((h: any) => [newId("orgasg"), h.seat, h.name, documentedKey(h.name), h.focus || null, h.note || null]);
    if (holderRows.length) {
      await pool.query(
        `INSERT IGNORE INTO org_role_assignments
           (id, org_role_id, holder_kind, display_name, holder_key, focus, note)
         VALUES ${holderRows.map(() => "(?,?, 'documented', ?,?,?,?)").join(",")}`,
        holderRows.flat(),
      );
    }
    holdersWritten = holderRows.length;
  }

  // Seats holding more than one documented holder advertise the seat count
  // they actually carry, so vacancy reads true from the first render.
  await pool.query(
    `UPDATE org_roles r
       SET r.seats = GREATEST(r.seats, (
         SELECT COUNT(*) FROM org_role_assignments a
          WHERE a.org_role_id = r.id AND a.ended_at IS NULL
       ))`,
  );

  return { circlesWritten, councilsToForming, seatsWritten, holdersWritten, skipped: false };
}
