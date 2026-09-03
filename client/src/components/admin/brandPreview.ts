/**
 * Three planes over one field, and the states kept apart.
 *
 * ── WHY A PREVIEW NEEDS THREE PLANES AND NOT ONE ─────────────────────────
 *
 * The founder's rule for setup is that the result is shown before it is
 * committed. Honouring that means answering three separate questions about
 * every field, and answering them with three separate facts:
 *
 *   draft    what is typed into the wizard and not saved yet
 *   saved    what the `brand` row of `app_config` holds, read fresh
 *   serving  what the running process is handing visitors right now
 *
 * `saved` and `serving` are the same value most of the time and they are not
 * the same fact. `dbDocument.get()` (server/repos/store-db.ts) answers from a
 * cache that only `load()` fills, and every document `load()` call site is in
 * the boot block. A write that did not go through `put()` leaves the row
 * correct and the process serving what it read at start-up, with no error
 * anywhere. A preview built on the served value would agree with the bug and
 * tell the founder their save did not land.
 *
 * `GET /api/admin/brand/preview` (server/routes/brandPreview.ts) hands over
 * all three planes unresolved, so the comparison happens here, once, in a
 * function that needs no database and no server to test.
 *
 * ── THE THREE STATES, WHICH ARE NEVER FOLDED TOGETHER ────────────────────
 *
 *   set          the founder's own plane holds a value
 *   blank        the founder's own plane holds nothing, so the platform
 *                default renders. `from` says whether that blank was saved
 *                deliberately or was never written at all.
 *   unreadable   the saved plane could not be read. No value is shown, no
 *                default is substituted, and every comparison that depends
 *                on the saved plane answers null.
 *
 * This repository has been bitten repeatedly by code reporting one answer for
 * "nothing there" and "could not tell": `dbDocument.load()` turns an
 * unparseable row into `cache = null`, which is the same state a missing row
 * produces, so a corrupt brand document reads as a village that has saved
 * nothing. Every field below that could carry that fold carries `null`
 * instead of `false`, so a caller has to decide what to do about it.
 *
 * ── BLANK INHERITS, AND ONE SPACE IS NOT BLANK ───────────────────────────
 *
 * `chosen()` mirrors `pick()` in server/index.ts exactly: the empty string,
 * null and undefined inherit the platform default, and anything else wins.
 * A single space is therefore a VALUE, and `mergedConfig()` will hand it to
 * an `<img src>`. `measureSetup` in ./setupProgress.ts uses `.trim()` and
 * counts that same space as unfilled, so the two disagree by design of the
 * question each is asking. This file follows `pick`, because its whole job is
 * to state what the site will render.
 */
import { SETUP_STEPS, type BrandLike, type SetupField } from "./setupProgress";

/** What the founder's own plane holds for one field. */
export type ReadState = "set" | "blank" | "unreadable";

/** Which plane the founder's value came from. */
export type Plane = "draft" | "saved" | "none";

export interface PreviewRow {
  group: SetupField["group"];
  key: string;
  label: string;

  /** set, blank, or unreadable. Never inferred from an empty value alone. */
  read: ReadState;
  /** Where `value` came from. Null when `read` is "unreadable". */
  from: Plane | null;
  /** The founder's own value. Empty string when blank, null when unreadable. */
  value: string | null;

  /** What the site will render once the draft is saved. Null when unreadable. */
  effective: string | null;
  /** True when `effective` belongs to the platform. Null when unreadable. */
  inherited: boolean | null;
  /** The platform value a blank field falls back to. */
  platformDefault: string;

  /** What a visitor is being served right now. Read from memory, so always known. */
  serving: string;
  /**
   * The saved row and the served value disagree, which is the stale-cache
   * tell. Null when the saved plane could not be read.
   */
  stale: boolean | null;
  /** The draft differs from what is saved. Null when the saved plane could not be read. */
  unsaved: boolean | null;
}

export interface PreviewInput {
  /** The wizard's in-memory brand object. Null when previewing only what is saved. */
  draft?: BrandLike | null;
  /** `stored`, as the preview route answered it. */
  stored: {
    readable: boolean;
    present: boolean;
    document: BrandLike | null;
  };
  /** `serving`, as the preview route answered it. Memory, so it always reads. */
  serving: BrandLike | null;
  /** `defaults`, as the preview route answered it. */
  defaults: {
    project?: Record<string, unknown> | null;
    images?: Record<string, unknown> | null;
  };
}

/**
 * Blank inherits. The one place this rule is written on the client, and a
 * mirror of `pick()` in server/index.ts. If that function's rule ever
 * changes, this one has to change with it or the preview starts lying about
 * the very thing it exists to show.
 */
function chosen(own: string, platformDefault: string): { effective: string; inherited: boolean } {
  return own === ""
    ? { effective: platformDefault, inherited: true }
    : { effective: own, inherited: false };
}

/**
 * One plane's value for one field, or null when the plane does not carry the
 * key at all. Null is absence, and it is what tells a saved empty string
 * apart from a key that was never written.
 */
function planeValue(doc: BrandLike | null | undefined, field: SetupField): string | null {
  if (!doc) return null;
  const group = (doc as Record<string, unknown>)[field.group];
  if (!group || typeof group !== "object") return null;
  const raw = (group as Record<string, unknown>)[field.key];
  if (raw === undefined || raw === null) return null;
  // A non-string would be handed straight to an img src by `pick`, so the
  // preview shows what would render instead of hiding the shape mismatch.
  return typeof raw === "string" ? raw : String(raw);
}

/** Every field the Setup Wizard measures, in wizard order. One list, shared with the progress badge. */
export const PREVIEW_FIELDS: readonly SetupField[] = SETUP_STEPS.flatMap((step) => step.fields);

/** One row per measured field, ready to render. */
export function previewRows(input: PreviewInput): PreviewRow[] {
  return PREVIEW_FIELDS.map((field) => {
    const defaultsGroup = input.defaults?.[field.group];
    const platformDefault = String(
      (defaultsGroup as Record<string, unknown> | null | undefined)?.[field.key] ?? "",
    );

    const draftValue = planeValue(input.draft, field);
    const savedValue = input.stored.readable ? planeValue(input.stored.document, field) : null;
    const servingOwn = planeValue(input.serving, field) ?? "";
    const serving = chosen(servingOwn, platformDefault).effective;

    let read: ReadState;
    let from: Plane | null;
    let value: string | null;
    if (draftValue !== null) {
      from = "draft";
      value = draftValue;
      read = draftValue === "" ? "blank" : "set";
    } else if (!input.stored.readable) {
      from = null;
      value = null;
      read = "unreadable";
    } else if (savedValue === null) {
      // Readable, and the key was never written. A blank the founder has not
      // touched, which renders the platform default the same way a cleared
      // field does. `from` is what tells the two apart on screen.
      from = "none";
      value = "";
      read = "blank";
    } else {
      from = "saved";
      value = savedValue;
      read = savedValue === "" ? "blank" : "set";
    }

    const resolved = value === null ? null : chosen(value, platformDefault);

    let unsaved: boolean | null;
    if (draftValue === null) unsaved = false;
    else if (!input.stored.readable) unsaved = null;
    else unsaved = draftValue !== (savedValue ?? "");

    const stale = input.stored.readable
      ? chosen(savedValue ?? "", platformDefault).effective !== serving
      : null;

    return {
      group: field.group,
      key: field.key,
      label: field.label,
      read,
      from,
      value,
      effective: resolved ? resolved.effective : null,
      inherited: resolved ? resolved.inherited : null,
      platformDefault,
      serving,
      stale,
      unsaved,
    };
  });
}

export interface PreviewSummary {
  /** How many fields the saved plane could not answer for. */
  unreadable: number;
  /** How many fields the row and the live site disagree on. */
  stale: number;
  /** How many fields carry an edit that has not been saved. */
  unsaved: number;
  /** True when the saved plane could not be read at all, so staleness is unknown. */
  savedUnreadable: boolean;
}

/** The counts a banner needs, derived from the rows so they cannot drift. */
export function summarise(rows: readonly PreviewRow[]): PreviewSummary {
  return {
    unreadable: rows.filter((r) => r.read === "unreadable").length,
    stale: rows.filter((r) => r.stale === true).length,
    unsaved: rows.filter((r) => r.unsaved === true).length,
    savedUnreadable: rows.some((r) => r.stale === null),
  };
}
