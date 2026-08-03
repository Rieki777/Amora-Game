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

export type SeatState = "open" | "filled" | "partial" | "forming";

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
}

const ROLE_COLS =
  "id, circle_id, name, aim, domain, accountabilities, why_it_matters, seats, criticality, active, recruiting, expires_each_season, status_override, status_override_expires_at, icon, color, sort_order, is_example";

const ASSIGN_COLS =
  "id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, note, season_id, term_ends_at, started_at, ended_at, ended_reason";

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
  };
}

export async function listOrgRoles(pool: Pool): Promise<OrgRole[]> {
  const [rows]: any = await pool.query(`SELECT ${ROLE_COLS} FROM org_roles ORDER BY sort_order, name`);
  return (rows as any[]).map(rowToRole);
}

/** Live seatings only. Ended ones are history and are asked for by name. */
export async function listOrgAssignments(pool: Pool): Promise<OrgAssignment[]> {
  const [rows]: any = await pool.query(
    `SELECT ${ASSIGN_COLS} FROM org_role_assignments WHERE ended_at IS NULL ORDER BY started_at, id`,
  );
  return (rows as any[]).map(rowToAssignment);
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
export function seatState(role: OrgRole, liveHolders: number, now = new Date()): SeatState {
  const ov = role.statusOverride;
  if (ov) {
    const until = role.statusOverrideExpiresAt;
    if (!until || until.getTime() > now.getTime()) return ov;
  }
  if (liveHolders <= 0) return "open";
  if (liveHolders < role.seats) return "partial";
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

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
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
 * Convert a documented holder into a real member holding, keeping the same
 * row so the seat's history does not restart when somebody finally signs up.
 */
export async function claimSeating(pool: Pool, assignmentId: string, userId: string): Promise<boolean> {
  const [r]: any = await pool.query(
    `UPDATE org_role_assignments
        SET holder_kind = 'member', user_id = ?, holder_key = ?
      WHERE id = ? AND ended_at IS NULL AND holder_kind = 'documented'`,
    [userId, userId, assignmentId],
  );
  return !!r?.affectedRows;
}

/**
 * Documented seatings whose name looks like this member's, offered to them
 * once on sign-in as "is this you?". Deliberately a suggestion: nothing is
 * claimed without the person saying so.
 */
export async function unclaimedSeatingsFor(pool: Pool, fullName: string): Promise<OrgAssignment[]> {
  const name = String(fullName ?? "").trim().toLowerCase();
  if (!name) return [];
  const first = name.split(/\s+/)[0];
  const [rows]: any = await pool.query(
    `SELECT ${ASSIGN_COLS} FROM org_role_assignments
      WHERE ended_at IS NULL AND holder_kind = 'documented'`,
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
 */
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

  let circlesWritten = 0;
  for (const c of corr.circles ?? []) {
    const card = circleCardById.get(c.id);
    const purpose = c.purpose ?? card?.description ?? null;
    await pool.query(
      `INSERT INTO circles (id, name, purpose, parent_circle_id, grown_from_org_role_id, icon, color, status, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), purpose = VALUES(purpose),
         parent_circle_id = VALUES(parent_circle_id),
         grown_from_org_role_id = VALUES(grown_from_org_role_id),
         status = VALUES(status), sort_order = VALUES(sort_order)`,
      [
        c.id,
        c.name,
        purpose,
        c.parentCircleId ?? null,
        c.grownFromOrgRoleId ?? null,
        c.icon ?? card?.icon ?? null,
        c.color ?? card?.color ?? null,
        c.status ?? "active",
        Number(c.sortOrder ?? 0),
      ],
    );
    circlesWritten += 1;
  }

  // The aspirational councils already exist as rows. None of them is a
  // working circle, so they move to forming and render as calls.
  let councilsToForming = 0;
  for (const id of corr.councilsToForming ?? []) {
    const [r]: any = await pool.query("UPDATE circles SET status = 'forming' WHERE id = ? AND status <> 'forming'", [id]);
    if (r?.affectedRows) councilsToForming += 1;
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

  let seatsWritten = 0;
  for (const card of cards) {
    if (!card?.id) continue;
    const fix = seatCorrections.get(card.id) ?? {};
    const circleId =
      fix.circleId ?? circleIdByName.get(String(card.group ?? "").toLowerCase()) ?? null;

    let overrideUntil: Date | null = null;
    if (fix.statusOverride && fix.statusOverrideDays) {
      overrideUntil = new Date(Date.now() + Number(fix.statusOverrideDays) * 24 * 60 * 60 * 1000);
    }

    // Upsert, so a resumed run finishes rather than colliding on a seat the
    // failed attempt already wrote.
    await pool.query(
      `INSERT INTO org_roles
         (id, circle_id, name, aim, domain, accountabilities, why_it_matters, seats, criticality,
          status_override, status_override_expires_at, icon, color, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         circle_id = VALUES(circle_id), name = VALUES(name), aim = VALUES(aim),
         domain = VALUES(domain), accountabilities = VALUES(accountabilities),
         why_it_matters = VALUES(why_it_matters), sort_order = VALUES(sort_order)`,
      [
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
      ],
    );
    seatsWritten += 1;
  }

  // ── Holders ──────────────────────────────────────────────────────────────
  // Documented, every one: a real person in a real seat who may not have an
  // account. The seat-claim card converts them on their next login.
  let holdersWritten = 0;
  for (const h of corr.holders ?? []) {
    if (!h?.seat || !h?.name) continue;
    const [seatExists]: any = await pool.query("SELECT 1 FROM org_roles WHERE id = ?", [h.seat]);
    if (!(seatExists as any[]).length) continue;
    await pool.query(
      `INSERT IGNORE INTO org_role_assignments
         (id, org_role_id, holder_kind, display_name, holder_key, focus, note)
       VALUES (?,?, 'documented', ?,?,?,?)`,
      [newId("orgasg"), h.seat, h.name, documentedKey(h.name), h.focus || null, h.note || null],
    );
    holdersWritten += 1;
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
