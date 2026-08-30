/**
 * QUEST SCENES — the palette a quest paints when it has no poster of its own.
 *
 * This lives in shared/ because two places draw the same scene and they must
 * not drift: the board card (client/src/lib/questBoard.ts, as CSS variables so
 * a village re-theming in Admin repaints every card at once) and the share
 * card the server renders for crawlers (server/index.ts, as plain hex, because
 * an OG image is a PNG and knows nothing about CSS variables).
 *
 * Each stop carries both its token name and a hex fallback. The token is the
 * truth for anything rendering in a browser; the hex is the truth for anything
 * rendering to bytes, and is also what keeps a card coloured before theme.css
 * arrives.
 */

export interface SceneStop {
  /** The brand tone token, without the var() wrapper. */
  token: string;
  /** The fallback, and the only value a server-side raster can use. */
  hex: string;
}

export type SceneStops = [SceneStop, SceneStop];

export const QUEST_SCENES: SceneStops[] = [
  [
    { token: "--color-teal-deep", hex: "#157f7d" },
    { token: "--color-teal-light", hex: "#3a9896" },
  ],
  [
    { token: "--color-forest", hex: "#2b4a3e" },
    { token: "--color-sage", hex: "#3d6e4a" },
  ],
  [
    { token: "--color-gold", hex: "#a06b1c" },
    { token: "--color-amber", hex: "#ecb163" },
  ],
  [
    { token: "--color-coral", hex: "#9b4030" },
    { token: "--color-gold", hex: "#a06b1c" },
  ],
  [
    { token: "--color-deep-shade", hex: "#1a3a39" },
    { token: "--color-teal-deep", hex: "#157f7d" },
  ],
  [
    { token: "--color-sage", hex: "#3d6e4a" },
    { token: "--color-aqua", hex: "#83a7ad" },
  ],
];

/** djb2, kept tiny and stable: a scene must never change between renders. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Which scene a circle wears. Case and padding are ignored so "Governance"
 * and " governance " are one circle, and a quest with no circle at all gets
 * the first scene rather than an error.
 */
export function sceneIndexFor(circle: string | null | undefined): number {
  const key = String(circle ?? "").trim().toLowerCase();
  return key === "" ? 0 : hashString(key) % QUEST_SCENES.length;
}

export function sceneStopsFor(circle: string | null | undefined): SceneStops {
  return QUEST_SCENES[sceneIndexFor(circle)];
}
