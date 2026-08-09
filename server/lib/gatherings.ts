/**
 * The Events module's data access: the village's calendar (0059).
 *
 * NAMED `gatherings` DELIBERATELY. `server/lib/events.ts` is the platform's
 * event SPINE (recordEvent, the one way into health_events). The module id is
 * `events` and the tables are `events` and `event_rsvps`, and this file is
 * where those live, but an import called `events` already means something
 * else in this codebase and would be wrong exactly when somebody is tired.
 *
 * Every read returns the same `Gathering` shape from shared/gatherings.ts, so
 * the client, the map and the JSON-LD emitter all agree on what a gathering
 * is. `daysUntil` is computed there and never in SQL: the map needs it too,
 * and one implementation cannot drift from itself.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  ATTENDANCE_MODES,
  EVENT_STATUSES,
  PUBLIC_STATUSES,
  RSVP_STATUSES,
  daysUntil,
  isFull,
  spotsLeft,
  type AttendanceMode,
  type EventStatus,
  type Gathering,
  type RsvpStatus,
} from "../../shared/gatherings";

const newId = () => `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export interface GatheringInput {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  locationText?: string | null;
  structureKeys?: string[];
  visitTypeId?: string | null;
  capacity?: number | null;
  status?: EventStatus;
  attendanceMode?: AttendanceMode;
  onlineUrl?: string | null;
}

/**
 * MySQL hands back `structure_keys` already parsed on a json column, and a
 * string on some driver/version combinations. Accept both; a malformed value
 * reads as "no structures" instead of throwing a list page into a 500.
 */
function parseKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
    } catch { return []; }
  }
  return [];
}

/** datetime columns come back as Date; ISO is what every reader wants. */
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? "");

function rowToGathering(r: RowDataPacket, now: Date): Gathering {
  const capacity = r.capacity === null || r.capacity === undefined ? null : Number(r.capacity);
  const goingCount = Number(r.going_count ?? 0);
  return {
    id: String(r.id),
    title: String(r.title),
    description: r.description ?? null,
    startsAt: iso(r.starts_at),
    endsAt: r.ends_at ? iso(r.ends_at) : null,
    locationText: r.location_text ?? null,
    structureKeys: parseKeys(r.structure_keys),
    visitTypeId: r.visit_type_id ?? null,
    capacity,
    status: String(r.status) as EventStatus,
    attendanceMode: String(r.attendance_mode) as AttendanceMode,
    onlineUrl: r.online_url ?? null,
    goingCount,
    spotsLeft: spotsLeft(capacity, goingCount),
    daysUntil: daysUntil(iso(r.starts_at), now),
    isExample: Boolean(r.is_example),
    ...(r.my_rsvp !== undefined ? { myRsvp: (r.my_rsvp ?? null) as RsvpStatus | null } : {}),
  };
}

/**
 * The one SELECT. Attendance is counted by a correlated subquery rather than
 * a GROUP BY join, so a gathering nobody has answered yet still returns a row
 * with 0 instead of disappearing.
 */
const SELECT_BASE = `
  SELECT e.*,
    (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going_count
    {{MINE}}
  FROM events e`;

const mineColumn = (userId: string | null) =>
  userId
    ? ", (SELECT r2.status FROM event_rsvps r2 WHERE r2.event_id = e.id AND r2.user_id = ?) AS my_rsvp"
    : "";

export interface ListOptions {
  /** Signed-in viewer, for their own RSVP. */
  userId?: string | null;
  /** Include `draft`. Admin surfaces only. */
  includeDrafts?: boolean;
  /** How far ahead to look. */
  upcomingDays: number;
  /** How long a finished gathering stays listed. */
  pastVisibleDays: number;
  /** Only gatherings touching this map structure. */
  structureKey?: string | null;
  limit?: number;
}

/**
 * The calendar, newest-first within the visible window.
 *
 * The window is two-sided on purpose. An events page that drops a gathering
 * the moment it starts tells someone standing outside the greenhouse that
 * nothing is happening, so `pastVisibleDays` keeps it listed after the fact.
 */
export async function listGatherings(pool: Pool, opts: ListOptions): Promise<Gathering[]> {
  const now = new Date();
  const params: any[] = [];
  if (opts.userId) params.push(opts.userId);

  const statuses = opts.includeDrafts ? EVENT_STATUSES : PUBLIC_STATUSES;
  const where: string[] = [`e.status IN (${statuses.map(() => "?").join(",")})`];
  params.push(...statuses);

  where.push("e.starts_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)");
  params.push(opts.upcomingDays);
  where.push("COALESCE(e.ends_at, e.starts_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)");
  params.push(opts.pastVisibleDays);

  if (opts.structureKey) {
    // JSON_CONTAINS over the array, so a gathering in the greenhouse AND the
    // commons is found by either key. JSON_QUOTE escapes the needle, which is
    // what keeps a structure key from being SQL at all.
    where.push("JSON_CONTAINS(e.structure_keys, JSON_QUOTE(?))");
    params.push(opts.structureKey);
  }

  /*
   * The one value that reaches the SQL text instead of a placeholder, because
   * MySQL will not take LIMIT as a bound parameter in a prepared statement.
   * It is therefore forced to an integer here and nowhere else: Number("abc")
   * is NaN, and NaN survives both Math.max and Math.min to arrive as the
   * literal `LIMIT NaN`. Not injectable, and a 500 on a list page all the same.
   */
  const asked = Math.floor(Number(opts.limit));
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 200;
  const sql =
    SELECT_BASE.replace("{{MINE}}", mineColumn(opts.userId ?? null)) +
    ` WHERE ${where.join(" AND ")} ORDER BY e.starts_at ASC LIMIT ${limit}`;

  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((r) => rowToGathering(r, now));
}

export async function getGathering(
  pool: Pool,
  id: string,
  userId?: string | null,
): Promise<Gathering | null> {
  const params: any[] = [];
  if (userId) params.push(userId);
  params.push(id);
  const sql = SELECT_BASE.replace("{{MINE}}", mineColumn(userId ?? null)) + " WHERE e.id = ? LIMIT 1";
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.length ? rowToGathering(rows[0], new Date()) : null;
}

/** Reject anything the enum columns would silently coerce. */
function cleanStatus(v: unknown, fallback: EventStatus): EventStatus {
  return EVENT_STATUSES.includes(v as EventStatus) ? (v as EventStatus) : fallback;
}
function cleanMode(v: unknown): AttendanceMode {
  return ATTENDANCE_MODES.includes(v as AttendanceMode) ? (v as AttendanceMode) : "offline";
}

/**
 * Capacity as stored: null for uncapped, and a floor of 0 so a negative
 * cannot be written. 0 is a real value meaning nobody, distinct from null.
 */
function cleanCapacity(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

export async function createGathering(
  pool: Pool,
  input: GatheringInput,
  createdBy: string | null,
): Promise<Gathering> {
  const id = newId();
  await pool.query(
    `INSERT INTO events
      (id, title, description, starts_at, ends_at, location_text, structure_keys,
       visit_type_id, capacity, status, attendance_mode, online_url, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      input.title,
      input.description ?? null,
      new Date(input.startsAt),
      input.endsAt ? new Date(input.endsAt) : null,
      input.locationText ?? null,
      JSON.stringify(input.structureKeys ?? []),
      input.visitTypeId ?? null,
      cleanCapacity(input.capacity),
      // Ships as a draft unless the caller says otherwise. Publishing is a
      // deliberate act, the same posture as a module's lifecycle.
      cleanStatus(input.status, "draft"),
      cleanMode(input.attendanceMode),
      input.onlineUrl ?? null,
      createdBy,
    ],
  );
  return (await getGathering(pool, id))!;
}

/**
 * Patch a gathering. Only keys actually present are written, so a caller
 * sending `{status}` cannot blank a description it never loaded.
 */
export async function updateGathering(
  pool: Pool,
  id: string,
  patch: Partial<GatheringInput>,
): Promise<Gathering | null> {
  const sets: string[] = [];
  const params: any[] = [];
  const put = (col: string, value: any) => { sets.push(`${col} = ?`); params.push(value); };

  if (patch.title !== undefined) put("title", patch.title);
  if (patch.description !== undefined) put("description", patch.description ?? null);
  if (patch.startsAt !== undefined) put("starts_at", new Date(patch.startsAt));
  if (patch.endsAt !== undefined) put("ends_at", patch.endsAt ? new Date(patch.endsAt) : null);
  if (patch.locationText !== undefined) put("location_text", patch.locationText ?? null);
  if (patch.structureKeys !== undefined) put("structure_keys", JSON.stringify(patch.structureKeys ?? []));
  if (patch.visitTypeId !== undefined) put("visit_type_id", patch.visitTypeId ?? null);
  if (patch.capacity !== undefined) put("capacity", cleanCapacity(patch.capacity));
  if (patch.status !== undefined) put("status", cleanStatus(patch.status, "draft"));
  if (patch.attendanceMode !== undefined) put("attendance_mode", cleanMode(patch.attendanceMode));
  if (patch.onlineUrl !== undefined) put("online_url", patch.onlineUrl ?? null);

  if (!sets.length) return getGathering(pool, id);
  params.push(id);
  await pool.query(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`, params);
  return getGathering(pool, id);
}

export async function deleteGathering(pool: Pool, id: string): Promise<boolean> {
  // RSVPs go with it. They are answers to a question that no longer exists,
  // and there is no ledger value here to preserve.
  await pool.query("DELETE FROM event_rsvps WHERE event_id = ?", [id]);
  const [res] = await pool.query<any>("DELETE FROM events WHERE id = ?", [id]);
  return Number(res?.affectedRows ?? 0) > 0;
}

export type RsvpOutcome =
  | { ok: true; status: RsvpStatus; goingCount: number; duplicate: boolean }
  | { ok: false; reason: "not_found" | "not_open" | "full" };

/**
 * Answer a gathering.
 *
 * The capacity check runs INSIDE the transaction, after `SELECT ... FOR
 * UPDATE` on the gathering row. Reading a count, deciding, and then inserting
 * is check-then-act: two people answering the last seat at the same moment
 * both read 9 of 10 and both get in. The row lock serialises answers per
 * gathering, which is the smallest lock that makes the cap true. This exact
 * bug has been found twice in this codebase already, in swap caps and in the
 * per-cycle mint cap.
 *
 * Changing an answer UPDATEs the single row the unique key permits, so
 * going -> declined frees the seat and never appends a second row.
 */
export async function rsvp(
  pool: Pool,
  eventId: string,
  userId: string,
  status: RsvpStatus,
  idempotencyKey?: string,
): Promise<RsvpOutcome> {
  const wanted: RsvpStatus = RSVP_STATUSES.includes(status) ? status : "going";
  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[event]] = await conn.query<any[]>(
      "SELECT id, capacity, status FROM events WHERE id = ? FOR UPDATE",
      [eventId],
    );
    if (!event) { await conn.rollback(); return { ok: false, reason: "not_found" }; }
    // A cancelled gathering stays visible so people learn it is off; it stops
    // taking answers. A draft is not public, so it cannot be answered either.
    if (event.status !== "scheduled" && event.status !== "postponed") {
      await conn.rollback();
      return { ok: false, reason: "not_open" };
    }

    const [[prior]] = await conn.query<any[]>(
      "SELECT id, status FROM event_rsvps WHERE event_id = ? AND user_id = ?",
      [eventId, userId],
    );
    const [[counts]] = await conn.query<any[]>(
      "SELECT COUNT(*) AS going FROM event_rsvps WHERE event_id = ? AND status = 'going'",
      [eventId],
    );
    const going = Number(counts.going ?? 0);
    const capacity = event.capacity === null ? null : Number(event.capacity);

    // Only a NEW `going` consumes a seat. Someone already counted who
    // re-confirms is not a second body in the room.
    const takingSeat = wanted === "going" && prior?.status !== "going";
    if (takingSeat && isFull(capacity, going)) {
      await conn.rollback();
      return { ok: false, reason: "full" };
    }

    const key = idempotencyKey || `rsvp:${eventId}:${userId}`;
    if (prior) {
      await conn.query(
        "UPDATE event_rsvps SET status = ?, idempotency_key = ? WHERE id = ?",
        [wanted, key, prior.id],
      );
    } else {
      await conn.query(
        "INSERT INTO event_rsvps (id, event_id, user_id, status, idempotency_key) VALUES (?,?,?,?,?)",
        [`rs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, eventId, userId, wanted, key],
      );
    }

    const nextGoing = going + (takingSeat ? 1 : 0) - (prior?.status === "going" && wanted !== "going" ? 1 : 0);
    await conn.commit();
    return { ok: true, status: wanted, goingCount: nextGoing, duplicate: prior?.status === wanted };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface RsvpRow {
  userId: string;
  name: string | null;
  status: RsvpStatus;
  at: string;
}

/**
 * Who answered, for the organiser.
 *
 * A LEFT JOIN, so an answer from a member who has since deleted their account
 * still counts toward the room rather than vanishing from a headcount the
 * organiser is catering against. Their name comes back null, which is what
 * the tombstone means.
 *
 * Emails are deliberately absent. An organiser needs to know who is coming;
 * a downloadable address list is a different feature with its own consent
 * question.
 */
export async function listRsvps(pool: Pool, eventId: string): Promise<RsvpRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.user_id, r.status, r.created_at, u.name
       FROM event_rsvps r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.event_id = ?
      ORDER BY FIELD(r.status,'going','maybe','declined'), u.name IS NULL, u.name`,
    [eventId],
  );
  return rows.map((r) => ({
    userId: String(r.user_id),
    name: r.name ?? null,
    status: String(r.status) as RsvpStatus,
    at: iso(r.created_at),
  }));
}

export async function withdrawRsvp(pool: Pool, eventId: string, userId: string): Promise<boolean> {
  const [res] = await pool.query<any>(
    "DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?",
    [eventId, userId],
  );
  return Number(res?.affectedRows ?? 0) > 0;
}

/**
 * What the map needs, and nothing else.
 *
 * The Living Map brightens a building by how soon the next gathering there
 * is, so it wants one row per structure key with the soonest start. Returning
 * the whole calendar and letting the map reduce it would ship every
 * description and every capacity to a page that draws lanterns.
 */
export async function upcomingByStructure(
  pool: Pool,
  withinDays: number,
): Promise<Record<string, { eventId: string; title: string; startsAt: string; daysUntil: number }>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, title, starts_at, structure_keys
       FROM events
      WHERE status = 'scheduled'
        AND starts_at >= UTC_TIMESTAMP()
        AND starts_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)
      ORDER BY starts_at ASC`,
    [withinDays],
  );
  const now = new Date();
  const out: Record<string, { eventId: string; title: string; startsAt: string; daysUntil: number }> = {};
  for (const r of rows) {
    for (const key of parseKeys(r.structure_keys)) {
      // Ascending start order means the first write per key is the soonest.
      if (out[key]) continue;
      out[key] = {
        eventId: String(r.id),
        title: String(r.title),
        startsAt: iso(r.starts_at),
        daysUntil: daysUntil(iso(r.starts_at), now),
      };
    }
  }
  return out;
}

/**
 * Open state for the module gate: gatherings still to come.
 *
 * Turning the module off unmounts the page people were told to check, so a
 * village with a harvest festival on the calendar is asked to deal with it
 * first. This is guidance, not value at risk: nothing here holds tokens.
 */
export async function eventsOpenState(pool: Pool): Promise<{ count: number; description: string }> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM events WHERE status = 'scheduled' AND starts_at >= UTC_TIMESTAMP()",
  );
  const count = Number(row?.n ?? 0);
  return {
    count,
    description:
      count === 1
        ? "1 gathering is still on the calendar. Cancel it or let it pass before turning events off."
        : `${count} gatherings are still on the calendar. Cancel them or let them pass before turning events off.`,
  };
}
