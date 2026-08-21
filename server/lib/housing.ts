/**
 * Housing availability, and the intents recorded against it (0077).
 *
 * ── ONE TABLE, TWO FOUNDER SURFACES ──────────────────────────────────────
 * Rye asked for the numbers to be settable in two places, builder mode on the
 * map and Admin on the main site, "so the reservation system has the same
 * source of truth". ADMIN CALLS `setAvailability` BELOW. BUILDER MODE DOES NOT:
 * the artifact keeps housing entirely in `SCENE.housing` and `publishScene`
 * stores the scene as opaque text, so today it persists as a genuine second
 * store. HOUSING_AVAILABILITY_CONTRACT.md assigns that bridge to the inspector
 * lane, which has not built it yet. The code here is right and this sentence
 * used to claim the bridge already existed. The upsert keys on (village_id, structure_key), so
 * the two surfaces cannot race each other into two rows for one hamlet: the
 * unique index settles it in the database rather than in a read-then-write
 * window.
 *
 * ONE WRITE PATH IS NOT THE SAME CLAIM AS ONE TRUTH, and this module shipped
 * asserting the first as though it proved the second. It does not. The path
 * used to upsert every column on every call, so what a founder surface read
 * and handed back was load-bearing, and reading the wrong field wrote a live
 * reservation count over the founder's typed number on a rename. One path
 * only means one truth once what travels through it is right, which is what
 * `storedTaken` and the one absence rule on `setAvailability` are for: a
 * write now carries only the fields it means to change, so a surface holding
 * a stale copy of the rest cannot write the stale copy back.
 *
 * ── UNSET IS NULL AND ONLY THE SERVER DECIDES WHAT "SET" MEANS ───────────
 * `homes_total` and `homes_taken` are independently nullable, and a row can
 * exist with both NULL because builder mode inserts on NAMING a hamlet. So a
 * row existing is not a hamlet being set.
 *
 * The predicate `row missing OR homes_total IS NULL OR homes_taken IS NULL`
 * is applied EXACTLY ONCE, in `publicEntries`. Every consuming surface then
 * tests one thing: whether the structure key it is rendering appears in
 * `entries`. Three independent implementations of "is this an example?" would
 * drift; one filter and a presence test cannot.
 *
 * ── open IS DERIVED, taken HAS AN AUTHORITY ──────────────────────────────
 * `open = max(0, total - taken)`, never stored, because a stored third number
 * can disagree with the other two and nothing can say which lied. The clamp
 * is fail-closed against a founder typo where taken > total: negative homes
 * must never render, and must never read as unlimited.
 *
 * `taken_source` names who is authoritative for a row's taken count:
 * 'founder' means the typed number wins, 'reservations' means the live count
 * of reserved rows wins. A derive-only design could not represent homes
 * spoken for before this platform existed, which is this village's real
 * state.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

/** This deployment is one village; the column exists for the retrofit (0069). */
const VILLAGE = "local";

/** Only this status consumes a home when a hamlet counts by reservations. */
const RESERVED_STATUS = "reserved";

export type TakenSource = "founder" | "reservations";

/** A hamlet as the public map sees it: counts only, never identity. */
export interface PublicHousingEntry {
  structureKey: string;
  label: string | null;
  total: number;
  taken: number;
  open: number;
  takenSource: TakenSource;
}

/**
 * A hamlet as a founder sees it: unset rows included, provenance attached.
 *
 * ── WHY THIS CARRIES TWO TAKEN NUMBERS ───────────────────────────────────
 * `taken` is the EFFECTIVE value and is for display only: for a row counted
 * by reservations it is the live count, which is what a visitor sees on the
 * map. `storedTaken` is the founder's typed number, straight off the column,
 * whatever the authority currently is.
 *
 * A founder surface must bind its "homes taken" box to `storedTaken`, never
 * to `taken`. A box showing the live count writes the live count the moment
 * anyone tabs through it, and the typed number is gone. Migration 0077 says
 * the typed number survives the flip to reservations and back; it only
 * survives if the surfaces stop overwriting it. Two names is how a caller can
 * tell which number it is holding, and `takenFieldValue` in
 * client/src/lib/housingForm.ts is where the Admin surface's answer is pinned
 * by a test, because no gate here can see which field a form is bound to.
 */
export interface HousingRow {
  structureKey: string;
  label: string | null;
  total: number | null;
  /** EFFECTIVE taken, for display: the live count once a row is flipped over. */
  taken: number | null;
  /** The founder's TYPED number, off the column. Send this back on a write. */
  storedTaken: number | null;
  /** null when either count is unset, because open is meaningless then. */
  open: number | null;
  /**
   * THE SAME PREDICATE `publicEntries` APPLIES, carried so a founder surface
   * cannot re-derive it and drift. It reads the two COLUMNS, never the
   * effective count.
   *
   * `open` is NOT that predicate and must not be used as one. On a hamlet
   * flipped to `reservations` with a `homes_taken` nobody ever typed,
   * `effectiveTaken` returns the live count, a live count is a number even
   * when it is zero, so `open` is a number and the row looks set. It
   * published as an EXAMPLE to every visitor at the same moment the founder
   * was shown a green badge. Photographed on both surfaces, 2026-08-16.
   */
  isSet: boolean;
  takenSource: TakenSource;
  updatedBy: string | null;
  updatedAt: string;
  /** The live reserved count, so a founder can see it before flipping over. */
  reservedCount: number;
}

export interface ReservationInput {
  structureKey: string | null;
  homeType: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  arrivedFrom?: string | null;
  userId?: string | null;
}

export interface ReservationRow {
  id: string;
  structureKey: string | null;
  homeType: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  arrivedFrom: string | null;
  status: string;
  userId: string | null;
  createdAt: string;
}

/**
 * The home types this platform ships knowing about.
 *
 * Rye named four: tiny home, casita, family home, villa. The column is a
 * varchar and not an enum so a village can add a fifth without a table
 * rebuild, but an unknown value is still refused on write: a free-text home
 * type is a typo that quietly becomes a category nobody reports on.
 */
export const HOME_TYPES = ["tiny-home", "casita", "family-home", "villa"] as const;
export type HomeType = (typeof HOME_TYPES)[number];
export const isHomeType = (v: unknown): v is HomeType =>
  typeof v === "string" && (HOME_TYPES as readonly string[]).includes(v);

/** open = max(0, total - taken). Fail-closed, never negative, never unlimited. */
export const openHomes = (total: number, taken: number): number => Math.max(0, total - taken);

const readSource = (v: unknown): TakenSource => (v === "reservations" ? "reservations" : "founder");

/**
 * The live reserved count per hamlet, for rows that count that way.
 *
 * One grouped query rather than one per row: the public map config calls this
 * on every fetch, and a query per hamlet is a fan-out that grows with the
 * village. Keyed on the (village_id, structure_key, status) index.
 */
async function reservedCounts(pool: Pool): Promise<Map<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT structure_key, COUNT(*) AS n FROM housing_reservations " +
      "WHERE village_id = ? AND status = ? AND structure_key IS NOT NULL " +
      "GROUP BY structure_key",
    [VILLAGE, RESERVED_STATUS],
  );
  return new Map(rows.map((r) => [String(r.structure_key), Number(r.n)]));
}

/**
 * What a hamlet's taken count actually is, given who is authoritative for it.
 *
 * The one place precedence is decided. While `taken_source` is 'founder' the
 * typed number wins even when reservations exist, because the founder is
 * recording homes that were spoken for before this system did.
 */
function effectiveTaken(
  source: TakenSource,
  stored: number | null,
  live: number,
): number | null {
  return source === "reservations" ? live : stored;
}

/**
 * The public block: fully set hamlets only, counts only, no identity.
 *
 * This rides `GET /api/map/config`, which is fetched UNCREDENTIALED, so
 * `updated_by` and `updated_at` are not selected here at all rather than
 * selected and dropped. A field that is never loaded cannot leak through a
 * later refactor that spreads the row.
 *
 * A partially set row (one count typed, the other not) is filtered out, which
 * is what makes "absent from entries" mean "do not trust these numbers" for
 * every consuming surface.
 */
export async function publicEntries(pool: Pool): Promise<PublicHousingEntry[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT structure_key, label, homes_total, homes_taken, taken_source " +
      "FROM housing_availability WHERE village_id = ? ORDER BY structure_key",
    [VILLAGE],
  );
  if (!rows.length) return [];
  const live = await reservedCounts(pool);
  const out: PublicHousingEntry[] = [];
  for (const r of rows) {
    const source = readSource(r.taken_source);
    const structureKey = String(r.structure_key);
    const total = r.homes_total == null ? null : Number(r.homes_total);
    const storedTaken = r.homes_taken == null ? null : Number(r.homes_taken);
    /*
     * THE ONE PLACE the example predicate is decided, and it reads the two
     * COLUMNS: `homes_total IS NULL OR homes_taken IS NULL`, exactly as the
     * contract states it. A surface that cannot find its key in `entries`
     * knows to call its numbers an example.
     *
     * IT USED TO READ THE EFFECTIVE COUNT, which is the same test everywhere
     * except on the rows where it matters. On a hamlet flipped to
     * `takenSource: 'reservations'`, `effectiveTaken` returns the live count,
     * and a live count is a number even when it is zero, so a row whose
     * `homes_taken` a founder had never typed published as CONFIGURED with a
     * confident `taken: 0`. Three ordinary one-field saves reach that state
     * (add the hamlet, set the total, flip the authority), and the three
     * surfaces that read `entries` then stopped labelling it an example and
     * showed a visitor a made-up number as the founder's own.
     *
     * The filter runs BEFORE `effectiveTaken` for that reason: deciding what
     * is set is a question about what a founder typed, and no derived value
     * may answer it.
     */
    if (total == null || storedTaken == null) continue;
    // Non-null by construction now: either `storedTaken`, or a live count.
    const taken = effectiveTaken(source, storedTaken, live.get(structureKey) ?? 0) as number;
    out.push({
      structureKey,
      label: r.label == null ? null : String(r.label),
      total,
      taken,
      open: openHomes(total, taken),
      takenSource: source,
    });
  }
  return out;
}

/**
 * Every row including unset ones, for the two founder surfaces.
 *
 * Carries `updated_by` and `updated_at`, which is exactly why it sits behind
 * the capability gate while `publicEntries` does not.
 */
export async function allRows(pool: Pool): Promise<HousingRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT structure_key, label, homes_total, homes_taken, taken_source, updated_by, updated_at " +
      "FROM housing_availability WHERE village_id = ? ORDER BY structure_key",
    [VILLAGE],
  );
  const live = await reservedCounts(pool);
  return rows.map((r) => {
    const source = readSource(r.taken_source);
    const structureKey = String(r.structure_key);
    const reserved = live.get(structureKey) ?? 0;
    const total = r.homes_total == null ? null : Number(r.homes_total);
    // Both numbers, deliberately. `storedTaken` is what a founder surface
    // sends back; `taken` is what it shows.
    const storedTaken = r.homes_taken == null ? null : Number(r.homes_taken);
    const taken = effectiveTaken(source, storedTaken, reserved);
    return {
      structureKey,
      label: r.label == null ? null : String(r.label),
      total,
      taken,
      storedTaken,
      open: total == null || taken == null ? null : openHomes(total, taken),
      isSet: total != null && storedTaken != null,
      takenSource: source,
      updatedBy: r.updated_by == null ? null : String(r.updated_by),
      updatedAt: String(r.updated_at),
      reservedCount: reserved,
    };
  });
}

/** The four writable fields, each optional: absent leaves, null clears. */
export interface AvailabilityPatch {
  total?: number | null;
  taken?: number | null;
  label?: string | null;
  takenSource?: TakenSource;
}

/** The largest number of homes a hamlet may claim. A typo, not a village. */
const MAX_HOMES = 10000;
/** varchar(190) on the column, so the trim happens before the database. */
const MAX_LABEL = 190;

/**
 * Read a founder surface's request body into a patch, or say why not.
 *
 * This lives here and not inline in the route because it is the ONE place
 * absence is interpreted, and a decision that only exists inside a 13,000
 * line route file is a decision no test will ever reach. Every rule the
 * contract states is checkable from `housing.test.ts` because of this
 * function's existence.
 *
 *   absent   the key is not in the body: leave that column alone
 *   null     clear it (a count goes unset, a label lets the map's name win)
 *   value    set it
 *
 * A count that is present and not a whole number in range is REFUSED rather
 * than coerced. `Number("nine")` is NaN and JSON writes NaN as null, and null
 * is the one value that destroys a founder's count, so a coercion here would
 * turn a typo into a silent unset.
 */
export function readAvailabilityPatch(
  body: unknown,
): { ok: true; patch: AvailabilityPatch } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: AvailabilityPatch = {};

  for (const field of ["total", "taken"] as const) {
    const v = b[field];
    if (v === undefined) continue;
    if (v === null) {
      patch[field] = null;
      continue;
    }
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_HOMES) {
      return {
        ok: false,
        error: `Homes open and homes taken must be whole numbers from 0 to ${MAX_HOMES}, or null to clear`,
      };
    }
    patch[field] = v;
  }

  const rawLabel = b.label;
  if (rawLabel !== undefined) {
    // An emptied name box clears the label, the same as an explicit null:
    // both mean "let the map's own name win again".
    patch.label = rawLabel === null ? null : String(rawLabel).trim().slice(0, MAX_LABEL) || null;
  }

  const rawSource = b.takenSource;
  if (rawSource !== undefined) {
    if (rawSource !== "founder" && rawSource !== "reservations") {
      // Refused instead of read as 'founder'. That silent coercion is what
      // turned every save on a hamlet counted by reservations, a rename
      // included, into a flip back to the typed number.
      return { ok: false, error: "Homes taken is counted by the founder or by reservations" };
    }
    patch.takenSource = rawSource;
  }

  return { ok: true, patch };
}

/**
 * Would this patch leave the row claiming more homes taken than it has?
 *
 * `taken > total` is a rule about the PAIR, so a patch carrying one of them
 * has to be checked against the row's other stored value. Checking only what
 * the body contains lets a founder send taken 9 on its own to a hamlet with
 * five homes.
 *
 * It reads `storedTaken` and never the effective count. The effective count
 * on a hamlet counted by reservations can already sit above the total (six
 * people reserved five homes), and checking against it would refuse every
 * edit to that row, the rename that is the only way to fix it included. That
 * lockout is a shape this route has already been fixed for once.
 *
 * ── THE BEFORE-STATE IS TYPED SO THE WRONG FIELD WILL NOT COMPILE ────────
 * `before` deliberately names ONLY the two columns this rule is about. A
 * `HousingRow` satisfies it and carries `taken` as well, but that name is not
 * in this parameter's type, so `before.taken` here is a compile error rather
 * than a lockout nobody notices until a founder cannot rename a hamlet. The
 * defect this shape refuses was live in this file when the round started, one
 * word long, under a docblock that described the correct behaviour.
 */
export function exceedsTotal(
  patch: AvailabilityPatch,
  before: { total: number | null; storedTaken: number | null } | null,
): boolean {
  const total = patch.total === undefined ? before?.total ?? null : patch.total;
  const taken = patch.taken === undefined ? before?.storedTaken ?? null : patch.taken;
  return total !== null && taken !== null && taken > total;
}

/**
 * Set (or clear) a hamlet's numbers. Both founder surfaces land here.
 *
 * ── ONE RULE FOR ALL FOUR FIELDS: ABSENT LEAVES IT, null CLEARS IT ───────
 * Every field is optional. `undefined` (the key is not in the object at all)
 * means the caller has no opinion and the column is NOT WRITTEN. `null` means
 * the caller is clearing it: the count goes back to unset, the label goes back
 * to letting the map's own name win. A number, a string or a TakenSource sets
 * it. That is the whole contract, and it is the same sentence for `total`,
 * `taken`, `label` and `takenSource`.
 *
 * It did not start that way and the difference cost real data. The three
 * writable columns each meant something different when a field was missing:
 * a count refused the whole request, `takenSource` was left alone, and a
 * missing `label` was mapped to null and SILENTLY DESTROYED THE FOUNDER'S
 * HAMLET NAME. A caller following the documented contract literally, sending
 * only the number it meant to change, wiped a name it had never been told
 * about. Three meanings for one absence is a contract nobody can hold in
 * their head, and the one that destroys data was the one that was never
 * written down.
 *
 * The uniform rule also ends the whole-row clobber. When every control had to
 * restate all four fields, a founder surface open on a stale copy of a row
 * wrote its stale copy back on any edit: rename a hamlet that builder mode had
 * meanwhile flipped to counting reservations, and the rename flipped it back.
 * A control that sends only the field it changed cannot revert a field it
 * never mentioned. What is left is last-write-wins PER FIELD, which is two
 * founders typing into the same box within a few seconds of each other, and
 * is what an admin form in this codebase has always meant.
 *
 * ── A FIELD-SHAPED WRITE STILL NEEDS A ROW-SHAPED CHECK ──────────────────
 * `taken > total` is a rule about the pair, so a caller sending one of them
 * has to validate against the row's OTHER stored value. The route does that
 * (it reads the row first and checks the merged pair) rather than this
 * function, because refusing here would mean this module owning the HTTP
 * status too.
 *
 * `taken` is always the founder's TYPED number (`storedTaken` on the way out),
 * never the effective one. A caller that sends the effective value writes a
 * live reservation count into the column that is supposed to survive being
 * flipped away from reservations and back.
 *
 * ── WHAT A COMPLETELY EMPTY PATCH DOES ───────────────────────────────────
 * No fields at all is a legitimate call: it CREATES an unset row for a
 * structure key and, on a key that already exists, changes no count, no label
 * and no authority. That is what makes "add a hamlet" safe to press twice.
 * It still stamps `updated_by`, because a write did happen.
 *
 * On INSERT there is nothing to leave alone, so an absent count starts NULL
 * (unset, which is exactly right for a new hamlet) and an absent authority
 * starts 'founder'.
 */
export async function setAvailability(
  pool: Pool,
  input: {
    structureKey: string;
    /** Absent leaves the column alone; null clears it back to unset. */
    total?: number | null;
    /** The founder's TYPED number. Absent leaves it; null clears it. */
    taken?: number | null;
    /** Absent leaves it; null lets the map's own name win again. */
    label?: string | null;
    /** Absent leaves the row's authority alone. There is no null: NOT NULL. */
    takenSource?: TakenSource;
    updatedBy: string | null;
  },
): Promise<void> {
  // One line per column, all four reading the same way. `updated_by` is not
  // in the list because it is written on every call by definition: it names
  // whoever made this write, and every call is a write.
  const sets: string[] = [];
  if (input.label !== undefined) sets.push("label = VALUES(label)");
  if (input.total !== undefined) sets.push("homes_total = VALUES(homes_total)");
  if (input.taken !== undefined) sets.push("homes_taken = VALUES(homes_taken)");
  if (input.takenSource !== undefined) sets.push("taken_source = VALUES(taken_source)");
  sets.push("updated_by = VALUES(updated_by)");
  await pool.query(
    "INSERT INTO housing_availability " +
      "(id, village_id, structure_key, label, homes_total, homes_taken, taken_source, updated_by) " +
      "VALUES (?,?,?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE " +
      sets.join(", "),
    [
      `hav-${randomUUID().slice(0, 12)}`,
      VILLAGE,
      input.structureKey,
      input.label ?? null,
      input.total ?? null,
      input.taken ?? null,
      input.takenSource ?? "founder",
      input.updatedBy,
    ],
  );
}

/** Record an intent. No money moves here; the deposit is a later step. */
export async function createReservation(
  pool: Pool,
  input: ReservationInput,
): Promise<{ id: string }> {
  const id = `hres-${randomUUID().slice(0, 12)}`;
  await pool.query(
    "INSERT INTO housing_reservations " +
      "(id, village_id, structure_key, home_type, name, email, phone, notes, arrived_from, user_id) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      VILLAGE,
      input.structureKey,
      input.homeType,
      input.name,
      input.email,
      input.phone ?? null,
      input.notes ?? null,
      input.arrivedFrom ?? null,
      input.userId ?? null,
    ],
  );
  return { id };
}

export async function listReservations(pool: Pool, limit = 200): Promise<ReservationRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, structure_key, home_type, name, email, phone, notes, arrived_from, status, user_id, created_at " +
      "FROM housing_reservations WHERE village_id = ? ORDER BY created_at DESC LIMIT ?",
    [VILLAGE, Math.min(500, Math.max(1, limit))],
  );
  return rows.map((r) => ({
    id: String(r.id),
    structureKey: r.structure_key == null ? null : String(r.structure_key),
    homeType: String(r.home_type),
    name: String(r.name),
    email: String(r.email),
    phone: r.phone == null ? null : String(r.phone),
    notes: r.notes == null ? null : String(r.notes),
    arrivedFrom: r.arrived_from == null ? null : String(r.arrived_from),
    status: String(r.status),
    userId: r.user_id == null ? null : String(r.user_id),
    createdAt: String(r.created_at),
  }));
}

/** Move an intent along. Only 'reserved' ever consumes a home. */
export const RESERVATION_STATUSES = ["new", "contacted", "reserved", "withdrawn"] as const;
export const isReservationStatus = (v: unknown): v is (typeof RESERVATION_STATUSES)[number] =>
  typeof v === "string" && (RESERVATION_STATUSES as readonly string[]).includes(v);

export async function setReservationStatus(
  pool: Pool,
  id: string,
  status: string,
): Promise<boolean> {
  const [r]: any = await pool.query(
    "UPDATE housing_reservations SET status = ? WHERE id = ? AND village_id = ?",
    [status, id, VILLAGE],
  );
  return (r?.affectedRows ?? 0) > 0;
}
