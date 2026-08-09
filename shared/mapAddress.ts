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
 * ── WIRE VOCABULARY vs STORED VOCABULARY ─────────────────────────────────
 * The scene may carry FOUR values; we store THREE. `pool` is the exporter's
 * derived default for "no structure was set", so it is silence and becomes
 * NULL here. The artifact states this itself now, in
 * `map_scene.address_source_vocabulary`, which carries both the value list and
 * the creator-wins law in the payload so an importer never has to infer the
 * contract from a sample. `WIRE_ADDRESS_SOURCES` below is our copy of that
 * list, and the importer cross-checks the two on every run: a scene that
 * carries a value neither side knows is reported loudly instead of being
 * quietly dropped to NULL.
 */

/** What we STORE. `pool` is deliberately absent: it is silence, not a value. */
export const ADDRESS_SOURCES = ["creator", "resolver-guess", "creator-board"] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

/**
 * What a scene may CARRY, mirroring `map_scene.address_source_vocabulary`.
 *
 * Kept as our own copy on purpose. Trusting the scene's list blindly would let
 * a future export teach this importer a value it has no handling for; holding
 * a copy means the two can be COMPARED, and a divergence becomes a printed
 * warning instead of a silent NULL.
 */
export const WIRE_ADDRESS_SOURCES = ["creator", "resolver-guess", "creator-board", "pool"] as const;

/**
 * Values older exports used before the map normalised them at its boundary.
 *
 * The artifact now rewrites `lexicon guess` to `resolver-guess` on the way
 * out, so fresh scenes never carry it. Scene files exported before that fix
 * still do, and dropping one to NULL would throw away a real guess and let the
 * next resolver overwrite something it should merely have refined.
 */
const LEGACY_ALIASES: Record<string, AddressSource> = {
  "lexicon guess": "resolver-guess",
};

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
  // The artifact's derived "nothing was set". Silence, not a decision, and
  // the scene's own stated law says importers map it to NULL.
  if (raw === "pool") return null;
  if (typeof raw === "string" && LEGACY_ALIASES[raw]) return LEGACY_ALIASES[raw];
  return null;
}

/**
 * Compare the scene's declared vocabulary against the one we implement.
 *
 * Returns the values the scene claims that this importer has no handling for.
 * An empty array means the two agree. A scene with no declared vocabulary
 * (anything exported before the contract was published) returns empty too:
 * absence is not disagreement, and the importer falls back to the mapping it
 * already has.
 */
export function unknownWireSources(declared: unknown): string[] {
  const values = (declared as any)?.values;
  if (!Array.isArray(values)) return [];
  const known = new Set<string>([
    ...(WIRE_ADDRESS_SOURCES as readonly string[]),
    ...Object.keys(LEGACY_ALIASES),
  ]);
  return values.filter((v: unknown): v is string => typeof v === "string" && !known.has(v));
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
