/**
 * The Living Map's skin: how a village's land is drawn.
 *
 * These field names and units are NOT ours. They are the map artifact's own
 * export format (`skinExport()` in docs/prototypes/grounds-v0.html), and the
 * artifact reads this object straight through its `applySkinExport()`. That
 * is the whole point: a founder can style the map inside it, hit export, and
 * the JSON drops into this shape without translation. Renaming a key to match
 * house style would break the map silently, with the wizard still cheerfully
 * saving. Leave them snake_case.
 *
 * Scales are FRACTIONS here (1 = 100%) because that is what the artifact
 * emits and expects. The wizard shows percent and converts at the edges.
 *
 * Every value has a "keep the map's default" spelling: blank for the strings,
 * null for the painterly dials. An untouched fork looks the way the map's
 * designers drew it, which is the behaviour the setup wizard promises when it
 * says a blank field keeps the suggested value.
 */

/**
 * How a skin save reaches an already-open map.
 *
 * The wizard and the map are separate routes, so there is no shared React
 * tree to hang state on. The panel announces a save twice: a custom event for
 * the same tab, and a localStorage write whose `storage` event reaches OTHER
 * tabs (which is the common case, since a founder styling the village tends to
 * have the map open beside the settings). The value written is a timestamp
 * nobody reads: it exists only to make the key change, because writing the
 * same value twice fires no event.
 */
export const MAP_SKIN_SAVED_EVENT = "map-skin-saved";
export const MAP_SKIN_SAVED_KEY = "map.skinSavedAt";

/** Theme names the artifact ships. Matched against its THEMES[].label. */
export const MAP_THEMES = ["Emerald Atlas", "Terra Sol", "Mar Azul"] as const;

/** How buildings are drawn. The artifact validates against this same list. */
export const ICON_MODES = ["auto", "painted", "iso"] as const;

export interface MapSkin {
  theme: string;
  words: string;
  accent: string;
  parchment: string;
  label_scale: number;
  global_scale: number;
  icon_mode: string;
  mist: boolean;
  glow: boolean;
  painterly: { brush: number | null; palette: number | null };
}

export const DEFAULT_MAP_SKIN: MapSkin = {
  theme: "",
  words: "",
  accent: "",
  parchment: "",
  label_scale: 1,
  global_scale: 1,
  icon_mode: "painted",
  mist: false,
  glow: true,
  painterly: { brush: null, palette: null },
};

/**
 * Slider bounds, shared so the panel and the sanitiser cannot disagree.
 *
 * Painterly is a FRACTION, like the two scales, because that is the artifact's
 * wire format and not a taste: its slider computes `brushVal = value / 100`,
 * its export writes that fraction, and `applySkinExport` reads it back with a
 * `* 100`. Storing 0-100 here (as the first draft did) meant an exported 0.4
 * came through `Math.round` as 0 and a stored 40 drove the slider to 4000.
 * The panel shows percent; the fraction is what travels.
 */
export const SKIN_BOUNDS = {
  label_scale: { min: 0.8, max: 1.3 },
  global_scale: { min: 0.5, max: 3 },
  painterly: { min: 0, max: 1 },
} as const;

/** Six hex digits or nothing. See sanitiseMapSkin for why this is strict. */
const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

/**
 * A painterly dial is a fraction in range or an explicit "not set".
 *
 * Rounded to three decimals rather than to an integer: a percent slider only
 * ever produces hundredths, and rounding to whole numbers would collapse the
 * entire range onto 0 and 1.
 */
function dial(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const bounded = clamp(n, SKIN_BOUNDS.painterly.min, SKIN_BOUNDS.painterly.max);
  return Math.round(bounded * 1000) / 1000;
}

/**
 * Coerce anything into a skin the map can be handed safely.
 *
 * `accent` and `parchment` reach the artifact's
 * `documentElement.style.setProperty('--t-accent', value)`, so they are the
 * two fields that leave JSON and become CSS. They are held to a literal hex
 * pattern rather than escaped: a colour picker has no legitimate reason to
 * emit anything else, and an allowlist cannot be talked around the way an
 * escaping rule can. Anything unrecognised falls back to blank, which the
 * artifact reads as "keep your own".
 *
 * Unknown theme and icon_mode values fall back the same way instead of
 * throwing, because this runs on a stored document: a fork that downgrades
 * the platform should get its map drawn, not a 500 on every save.
 */
export function sanitiseMapSkin(input: unknown): MapSkin {
  const s = (input ?? {}) as Record<string, any>;
  const themeOk = MAP_THEMES.includes(s.theme);
  const iconOk = ICON_MODES.includes(s.icon_mode);
  return {
    theme: themeOk ? String(s.theme) : "",
    words: typeof s.words === "string" ? s.words.slice(0, 160) : "",
    accent: HEX.test(String(s.accent ?? "")) ? String(s.accent) : "",
    parchment: HEX.test(String(s.parchment ?? "")) ? String(s.parchment) : "",
    label_scale: num(s.label_scale, 1, SKIN_BOUNDS.label_scale.min, SKIN_BOUNDS.label_scale.max),
    global_scale: num(s.global_scale, 1, SKIN_BOUNDS.global_scale.min, SKIN_BOUNDS.global_scale.max),
    icon_mode: iconOk ? String(s.icon_mode) : DEFAULT_MAP_SKIN.icon_mode,
    mist: s.mist === true,
    // Absent means on. The artifact reads glow the same way (`!== false`), so
    // a document written before this field existed keeps the pulse lit.
    glow: s.glow !== false,
    painterly: { brush: dial(s.painterly?.brush), palette: dial(s.painterly?.palette) },
  };
}
