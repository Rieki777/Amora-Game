/**
 * Where a thing lives on the Living Map, and WHO SAID SO.
 *
 * The second half is the point. A circle, a seat, a quest or a thread can be
 * addressed to a painted structure by a person who knows, or by a resolver
 * making a reasonable guess. Those are not the same claim, and a system that
 * stores only the address will eventually let a guess quietly overwrite
 * somebody's decision. So the provenance rides beside the address, and the
 * rule below is enforced in code rather than remembered.
 *
 * ── THE VOCABULARY ───────────────────────────────────────────────────────
 *  creator        a person placed it here deliberately
 *  creator-board  a person said deliberately that it lives at the Board,
 *                 with no structure of its own
 *  resolver-guess something inferred it, and may be replaced by a better guess
 *
 * NULL is none of these. It means nobody has said anything yet, which is
 * different from `creator-board`: one is silence, the other is a decision.
 * That distinction is the whole reason `creator-board` exists as a value.
 *
 * ── WHAT THE ARTIFACT ACTUALLY EMITS ─────────────────────────────────────
 * The scene export writes `creator` or `pool`
 * (`address_source: x.at ? (x.addr||'creator') : (x.addr||'pool')`). `pool` is
 * its DERIVED default for "no structure was set", so it is silence and maps to
 * NULL here, not to `creator-board`. If the map later starts emitting a
 * deliberate board placement it should send `creator-board` and this mapping
 * carries it straight through. Flagged for the map workstream: the vocabulary
 * in this file and the one in the export are not yet the same list.
 */

export const ADDRESS_SOURCES = ["creator", "resolver-guess", "creator-board"] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

/** Column width in the migration; kept here so the two cannot drift. */
export const ADDRESS_SOURCE_MAX = 24;

export function isAddressSource(v: unknown): v is AddressSource {
  return typeof v === "string" && (ADDRESS_SOURCES as readonly string[]).includes(v);
}

/**
 * A human said this, so nothing automated may overwrite it.
 *
 * Both creator spellings count. `creator-board` is a person choosing NOT to
 * put something on a building, and a resolver that "helpfully" addressed it
 * anyway would be overriding exactly the decision the value records.
 */
export function isCreatorAuthored(source: unknown): boolean {
  return source === "creator" || source === "creator-board";
}

/**
 * Translate whatever the scene carries into what we store.
 *
 * Unknown values become null rather than being stored raw: a value nobody
 * recognises would sit in the column looking authoritative and satisfy none of
 * the checks that read it.
 */
export function normaliseAddressSource(raw: unknown): AddressSource | null {
  if (isAddressSource(raw)) return raw;
  // The artifact's derived "nothing was set". Silence, not a decision.
  if (raw === "pool") return null;
  return null;
}

/**
 * THE DOCTRINE, in one function.
 *
 * May an incoming address replace what is stored? Only when the stored value
 * is silence or a guess. A `creator` or `creator-board` row is immovable by
 * anything automated; a human changes it through the surface that owns it.
 *
 * Deliberately takes only the SOURCES. Callers were getting this wrong by
 * reasoning about whether the key differed, which is the wrong question: an
 * identical key from a guess still must not downgrade a creator's provenance.
 */
export function mayOverwriteAddress(
  storedSource: unknown,
  incomingSource: unknown,
): boolean {
  // A creator's word stands, whatever is arriving.
  if (isCreatorAuthored(storedSource)) return false;
  // Silence or a stale guess yields, but only to something we recognise.
  return incomingSource === null || isAddressSource(incomingSource);
}

/** The `app_config` document key the map's founder-named words live under. */
export const MAP_VOCABULARY_DOC = "map_vocabulary";

/**
 * The founder's own words for the things they draw. The map renames every
 * drawn feature from these, so they are village data and not platform copy.
 */
export interface MapVocabulary {
  road: string[];
  water: string[];
  zone: string[];
}

export const DEFAULT_MAP_VOCABULARY: MapVocabulary = { road: [], water: [], zone: [] };

/** Trim, drop blanks, dedupe, cap. A vocabulary is a short list of words. */
export function sanitiseMapVocabulary(input: unknown): MapVocabulary {
  const v = (input ?? {}) as Record<string, unknown>;
  const list = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const word = item.trim().slice(0, 48);
      if (word) seen.add(word);
    }
    // Array.from, not a spread: the build target is below ES2015 iteration,
    // so spreading a Set is the same class of break as a BigInt literal.
    return Array.from(seen).slice(0, 60);
  };
  return { road: list(v.road), water: list(v.water), zone: list(v.zone) };
}
