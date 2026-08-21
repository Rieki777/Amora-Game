/**
 * What a founder surface sends when it edits a hamlet's housing numbers.
 *
 * ── WHY THIS IS A MODULE AND NOT FOUR LINES INSIDE THE FORM ──────────────
 * The bug this file exists to make impossible: the Admin form read `taken`,
 * the EFFECTIVE count, and sent it back as the founder's typed number, so
 * renaming a hamlet counted by reservations wrote the live count over the
 * number a founder had typed and migration 0077 promises survives the flip.
 *
 * It was fixed by binding to `storedTaken`. Then a reviewer put `taken` back
 * at all three sites and every gate stayed green, because no test in this
 * repo imports anything under client/src/pages, and vitest.config.ts collects
 * client test files ending .test.ts and never .test.tsx. The surface was
 * unguarded by construction and the fix was one careless edit from gone.
 *
 * So the decisions moved here, where a `.test.ts` can reach them with no DOM
 * and no React: which field each box READS, what each control SENDS, and
 * whether a blur changed anything worth a request. The form is left holding
 * markup and state. `housingForm.test.ts` pins all of it, and also reads the
 * panel as text to check it did not grow a second copy of these rules inline.
 *
 * ── THE PATCH CONTRACT, WHICH THE SERVER SHARES ──────────────────────────
 * A field ABSENT from the patch means leave it alone. A field explicitly null
 * means clear it. Every builder below returns the ONE field its control owns,
 * which is what stops a stale form clobbering three fields it was not asked
 * to touch. See `setAvailability` in server/lib/housing.ts for the same
 * sentence from the other side.
 */

export type TakenSource = "founder" | "reservations";

/** A hamlet as `GET /api/housing/availability` hands it over. */
export interface FounderRow {
  structureKey: string;
  label: string | null;
  total: number | null;
  /** EFFECTIVE count, for display. Equals the live count once flipped over. */
  taken: number | null;
  /** The founder's TYPED number. This is the one a form edits and sends. */
  storedTaken: number | null;
  open: number | null;
  /**
   * The server's own example predicate, carried from `allRows`. READ THIS.
   * Never re-derive set-ness in a founder surface, and never ask `open`:
   * `open` comes off the EFFECTIVE taken, so a hamlet flipped to
   * `reservations` with a homes_taken nobody typed has a NUMBER in `open`
   * while every visitor is told it is an example.
   */
  isSet: boolean;
  takenSource: TakenSource;
  reservedCount: number;
}

/** Only the fields being changed. Absent leaves alone, null clears. */
export interface HousingPatch {
  total?: number | null;
  taken?: number | null;
  label?: string | null;
  takenSource?: TakenSource;
}

export type PatchResult =
  | { ok: true; patch: HousingPatch }
  | { ok: false; message: string };

/** The map mints these; the site stores them verbatim and computes nothing. */
export const STRUCTURE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Where the box shows nothing at all: unset, which is not the same as 0. */
const EMPTY = "";

export const labelFieldValue = (row: FounderRow): string => row.label ?? EMPTY;

export const totalFieldValue = (row: FounderRow): string =>
  row.total == null ? EMPTY : String(row.total);

/**
 * THE FIELD THE "homes taken" BOX IS BOUND TO, and the reason this module
 * exists. `storedTaken` is the founder's typed number; `taken` is the live
 * reservation count once a hamlet is flipped over. A box showing the live
 * count writes the live count the moment anyone tabs through it.
 */
export const takenFieldValue = (row: FounderRow): string =>
  row.storedTaken == null ? EMPTY : String(row.storedTaken);

/**
 * An empty box is null (unset) and a typed number is a number. Anything else
 * is a refusal: `Number("nine")` is NaN, `JSON.stringify` turns NaN into
 * null, and null is the one value that CLEARS a founder's count. A silent
 * clear on a typo is the whole class of bug this file guards.
 */
function readCount(raw: string): { ok: boolean; value?: number | null } {
  const t = raw.trim();
  if (t === EMPTY) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return { ok: false };
  return { ok: true, value: n };
}

const COUNT_REFUSED = "Homes are whole numbers from 0 to 10000. Empty the box to unset one.";

export function totalPatch(raw: string): PatchResult {
  const r = readCount(raw);
  return r.ok ? { ok: true, patch: { total: r.value ?? null } } : { ok: false, message: COUNT_REFUSED };
}

export function takenPatch(raw: string): PatchResult {
  const r = readCount(raw);
  return r.ok ? { ok: true, patch: { taken: r.value ?? null } } : { ok: false, message: COUNT_REFUSED };
}

/** An emptied name box clears the label, and the map's own name wins again. */
export function labelPatch(raw: string): PatchResult {
  const t = raw.trim();
  return { ok: true, patch: { label: t === EMPTY ? null : t.slice(0, 190) } };
}

export function sourcePatch(raw: string): PatchResult {
  if (raw !== "founder" && raw !== "reservations") {
    return { ok: false, message: "Homes taken is counted by the founder or by reservations." };
  }
  return { ok: true, patch: { takenSource: raw } };
}

/**
 * Did this patch actually change anything about the row?
 *
 * Blurring a box a founder only tabbed through would otherwise fire a save,
 * and a save that changes nothing still stamps `updated_by` and still races
 * whatever another surface is doing. A no-op stays a no-op.
 *
 * `taken` compares against `storedTaken`, for the same reason the box is
 * bound to it: comparing against the effective count would call a real edit
 * unchanged on any hamlet counted by reservations.
 */
export function isNoOp(row: FounderRow, patch: HousingPatch): boolean {
  if (patch.label !== undefined && (patch.label ?? null) !== (row.label ?? null)) return false;
  if (patch.total !== undefined && (patch.total ?? null) !== (row.total ?? null)) return false;
  if (patch.taken !== undefined && (patch.taken ?? null) !== (row.storedTaken ?? null)) return false;
  if (patch.takenSource !== undefined && patch.takenSource !== row.takenSource) return false;
  return true;
}

/**
 * WHEN THE LIST IS REPLACED BY A PLACEHOLDER, AND WHEN IT STAYS ON SCREEN.
 *
 * Every field edit saves and then reloads. While the load raised the same flag
 * the first load raises, the whole list was swapped for the word Loading in the
 * middle of an interaction: focus went with it, tabbing from a hamlet's name to
 * its total was impossible, and the per-row Saving indicator lived inside the
 * row that had just unmounted, so it could never be seen.
 *
 * This lives here, as a value, rather than as two booleans in the component,
 * because the first attempt to guard it checked that the panel's text did not
 * contain `setLoading(true)` — a string the rewritten panel can never contain.
 * That assertion passed on a faithful revert and proved only that a name had
 * changed. An absent substring is not evidence. The transition itself is the
 * thing to hold, so it is a function with a test on it.
 *
 * `loadStarted` CARRIES `started` FORWARD. That is the whole guarantee, and it
 * is structural: there is no expression a refresh can evaluate that puts the
 * placeholder back, so the defect cannot return through this door at all. The
 * only way back is to edit this function, and the test below fails when it is.
 */
export interface ListPhase {
  /** Has the first load ever settled? Once true it never goes back. */
  started: boolean;
  refreshing: boolean;
}

export const INITIAL_PHASE: ListPhase = { started: false, refreshing: false };

export const loadStarted = (p: ListPhase): ListPhase => ({ started: p.started, refreshing: true });

export const loadSettled = (_p: ListPhase): ListPhase => ({ started: true, refreshing: false });

/** The placeholder belongs to the FIRST load and to no other. */
export const showsPlaceholder = (p: ListPhase): boolean => !p.started;

/** A quiet note that a refresh is in flight, under a list that stayed put. */
export const showsRefreshing = (p: ListPhase): boolean => p.started && p.refreshing;

/**
 * WHAT A PUBLIC SURFACE MAY CLAIM ABOUT A HAMLET'S NUMBERS.
 *
 * The example predicate has THREE answers and a surface that knows only two
 * tells visitors something false. `entries` arrives over the network, so
 * before it lands the honest answer is "not known yet", and that is a
 * different sentence from "the founder has not set this hamlet".
 *
 * The reservation page collapsed the two: `entries` starts null, `find` on
 * null yields nothing, nothing means absent, and absent means example. So
 * every arrival from the map, on a hamlet a founder had fully set, was told
 * "Example numbers. The founder has not set this hamlet yet." for the length
 * of a round trip, and only then shown the real count. A page that states a
 * fact about the village and then retracts it is worse than a page that waits.
 *
 * That page's own docblock names this exact flash and fixes the cheaper half
 * of it: it reads the query string in `useState` rather than an effect,
 * because an effect "renders one frame with no hamlet, which flashes the
 * example label on a hamlet that is set". One frame was worth avoiding; a
 * whole fetch was left in.
 *
 * A FAILED read is NOT unknown. The page catches a failed fetch into an empty
 * list, so an unreachable server settles to `example` and stays there. That is
 * fail-closed and deliberate: a network blip must never promote example
 * numbers to real ones. Only the in-flight window is `unknown`.
 */
export type HamletNumbers =
  | { kind: "unknown" }
  | { kind: "example" }
  | { kind: "set"; open: number; total: number };

/** The counts a public surface reads. `null` means the answer has not landed. */
export interface PublicEntry {
  structureKey: string;
  open: number;
  total: number;
}

export function hamletNumbers(
  entries: readonly PublicEntry[] | null,
  hamlet: string,
): HamletNumbers {
  // Nothing to say about a page that was handed no hamlet at all.
  if (!hamlet) return { kind: "unknown" };
  // The list has not arrived. Absent from a list nobody has read is not the
  // same fact as absent from `entries`.
  if (entries === null) return { kind: "unknown" };
  const entry = entries.find((e) => e.structureKey === hamlet);
  // PRESENCE IS THE WHOLE PREDICATE. No count is inspected for nullness here
  // and no surface re-derives what "set" means; the server decided once.
  if (!entry) return { kind: "example" };
  return { kind: "set", open: entry.open, total: entry.total };
}

export type AddResult =
  | { ok: true; structureKey: string; patch: HousingPatch }
  | { ok: false; message: string };

/**
 * What the "Add hamlet" button is allowed to do.
 *
 * It used to send `{total: null, taken: null, label: null}` for any key that
 * passed a format check. On a key that already existed, that is an upsert
 * whose UPDATE branch wiped the founder's counts and their hamlet name, with
 * no confirmation and no undo, and the hamlet went back to reading as an
 * example on every surface. The button says "Add".
 *
 * Two things stop that now and either one would be enough. Here: a key
 * already in the list is refused and the founder is pointed at the row that
 * already exists. On the wire: the patch is EMPTY, so even a create that
 * races another founder's typing changes no count, no name and no authority.
 */
export function addHamlet(rows: readonly FounderRow[], raw: string): AddResult {
  const structureKey = raw.trim();
  if (!STRUCTURE_KEY.test(structureKey)) {
    return { ok: false, message: "A structure key is letters, numbers, dashes and underscores, up to 64 of them." };
  }
  if (rows.some((r) => r.structureKey === structureKey)) {
    return { ok: false, message: `${structureKey} is already in the list below. Edit it there.` };
  }
  return { ok: true, structureKey, patch: {} };
}
