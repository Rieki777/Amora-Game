/**
 * The nine capitals, one vocabulary (round 4, lane L3; proposal item 19).
 *
 * Two surfaces read this file: the resources module (who may spend what,
 * paid from where) and the land map's flow layer, which measures the nine
 * media below. Shipping the list from ONE place is the whole point: a
 * capital renamed here renames everywhere, and the two maps can never
 * disagree about what "living capital" means.
 *
 * `hue` follows the DecideLens precedent: an Okabe-Ito-derived set that
 * stays distinguishable under the common colour blindnesses. Colour never
 * stands alone; `label` is the short word a chip shows and `formal` is the
 * long name a tooltip says.
 */

export interface CapitalDef {
  id: string;
  /** The short word a chip or legend shows. */
  label: string;
  /** The long name a tooltip says, lowercase on purpose: it lands mid-sentence. */
  formal: string;
  /** One hex colour, shared by every surface that draws this capital. */
  hue: string;
}

export const CAPITALS: CapitalDef[] = [
  { id: "financial", label: "Money", formal: "financial capital", hue: "#E69F00" },
  { id: "material", label: "Materials", formal: "material capital", hue: "#0072B2" },
  { id: "living", label: "Living things", formal: "living capital", hue: "#009E73" },
  { id: "intellectual", label: "Knowledge", formal: "intellectual capital", hue: "#56B4E9" },
  { id: "experiential", label: "Experience", formal: "experiential capital", hue: "#CC79A7" },
  { id: "social", label: "Relationships", formal: "social capital", hue: "#D55E00" },
  { id: "cultural", label: "Culture", formal: "cultural capital", hue: "#8B7DD8" },
  { id: "spiritual", label: "Spirit", formal: "spiritual capital", hue: "#F0E442" },
  { id: "health", label: "Health", formal: "health and wellbeing", hue: "#33BBC5" },
];

export const CAPITALS_BY_ID: Record<string, CapitalDef> = Object.fromEntries(
  CAPITALS.map((c) => [c.id, c]),
);

/**
 * The nine media the land map measures (the artifact's MEDIA_SEED keys,
 * byte for byte). The land map owns what a medium LOOKS like; this file
 * owns only which capital each one belongs to.
 */
export const MEDIA_KEYS = [
  "water",
  "energy",
  "money",
  "materials-raw",
  "materials-finished",
  "food-raw",
  "food-prepared",
  "compost",
  "care",
] as const;

export type MediaKey = (typeof MEDIA_KEYS)[number];

/**
 * Which capital each medium defaults to. Agreed with the land-map lane:
 * water and energy flow as material capital, food and compost as living
 * capital, money as financial capital, care as social capital.
 */
export const MEDIUM_TO_CAPITAL: Record<MediaKey, string> = {
  water: "material",
  energy: "material",
  money: "financial",
  "materials-raw": "material",
  "materials-finished": "material",
  "food-raw": "living",
  "food-prepared": "living",
  compost: "living",
  care: "social",
};
