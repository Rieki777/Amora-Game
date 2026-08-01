/**
 * CIRCLE SCENES — which foundation illustration a circle wears.
 *
 * Rye (2026-08-01): circles carry a scene "showing what the circle is
 * about", generated ONCE by the foundation and inherited by every village
 * until they bring their own identity pack; quests inherit their circle's
 * scene. Built against the org-chart refresh (d88a154) — data-driven
 * circles served from /api/content/circles.
 *
 * The scenes themselves are token-driven SVG (client/src/components/
 * CircleScene.tsx): they draw in the village's OWN palette via the --tone-*
 * variables, so the same foundation art belongs to every village that
 * themes itself — one set of drawings, endlessly re-coloured. That is "the
 * system, not 200 images" applied to art: coherence comes from tokens, not
 * from generating per-village rasters.
 *
 * This module is only the MAPPING: circle → motif. A circle entry may carry
 * an explicit `scene` field (one of the motif ids, or an /api/uploads/ URL
 * once villages upload their own); absent that, keywords in its id and name
 * choose. Unknown circles get "gathering" — the generic village motif —
 * because an empty header is a bug report and a wrong-but-warm scene is not.
 */

export const SCENE_MOTIFS = [
  "coordination", // the meeting rhythm: circles in council
  "outreach",     // paths outward: welcome, invitation
  "community",    // shared table, everyday life
  "building",     // structures rising: timber, roofline
  "finance",      // stewardship: scales and seedling
  "land",         // growing rows, hills, cultivation
  "learning",     // book and sprout
  "arts",         // instrument and thread
  "healing",      // spring water, leaves, rest
  "wisdom",       // old tree, deep roots, moon
  "gathering",    // the generic village: hearth under stars
] as const;
export type SceneMotif = (typeof SCENE_MOTIFS)[number];

/** Keyword → motif, first match wins; checked against id + name together. */
const RULES: Array<[RegExp, SceneMotif]> = [
  [/general|coordinat|leadership|council-of|steering/, "coordination"],
  [/outreach|growth|marketing|welcome|invit/, "outreach"],
  [/permaculture|land|farm|garden|food|agro|steward/, "land"],
  [/education|learn|school|children|academy/, "learning"],
  [/culture|arts|music|creative|craft/, "arts"],
  [/health|healing|wellness|care/, "healing"],
  [/building|construction|village-council|infrastructure|develop/, "building"],
  [/finance|business|econom|treasur/, "finance"],
  [/community|social|life|event/, "community"],
  [/wisdom|elder|intergenerational|nature|spirit/, "wisdom"],
];

export function isSceneMotif(v: unknown): v is SceneMotif {
  return typeof v === "string" && (SCENE_MOTIFS as readonly string[]).includes(v);
}

/**
 * Resolve a circle's scene. `explicit` (the entry's own `scene` field) wins
 * when it names a motif or an uploaded file; otherwise keywords decide.
 */
export function sceneForCircle(
  circle: { id?: string; name?: string; scene?: string },
): { kind: "motif"; motif: SceneMotif } | { kind: "upload"; url: string } {
  const explicit = circle.scene?.trim();
  if (explicit) {
    if (isSceneMotif(explicit)) return { kind: "motif", motif: explicit };
    if (/^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(explicit)) return { kind: "upload", url: explicit };
    // A stored value we do not recognise falls through to keywords rather
    // than rendering a broken image for everyone.
  }
  const hay = `${circle.id ?? ""} ${circle.name ?? ""}`.toLowerCase();
  for (const [re, motif] of RULES) if (re.test(hay)) return { kind: "motif", motif };
  return { kind: "motif", motif: "gathering" };
}
