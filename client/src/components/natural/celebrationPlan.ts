/**
 * WHAT A CELEBRATION IS MADE OF, before any of it is drawn.
 *
 * Five natural moments replace confetti: seeds carried on wind, a blossom
 * opening, fireflies rising, dawn breaking, ripples spreading. Each is built
 * from a handful of elements with a position, a delay and a size, and all of
 * that is arithmetic, so it lives here where it can be tested without a DOM.
 *
 * DETERMINISTIC ON PURPOSE. The scatter comes from a small integer hash of
 * the element index and a seed, never from Math.random. Two consequences,
 * both wanted: the same celebration looks the same on a re-render instead of
 * reshuffling mid-flight, and a test can assert the layout.
 *
 * INTENSITY IS A BUDGET, NOT A VOLUME KNOB. `whisper` is the everyday
 * acknowledgement, a few elements and under a second. `moment` is the rare
 * one, reserved for stage advance, quest consent, a ballot carrying, a need
 * delivered. Celebration on every action becomes wallpaper, and then the rare
 * event has nothing left to say with. docs/modules/natural-interface.md holds
 * the list of which events earn which.
 */

export const CELEBRATION_KINDS = ["seeds", "blossom", "fireflies", "dawn", "ripples"] as const;
export type CelebrationKind = (typeof CELEBRATION_KINDS)[number];

export const CELEBRATION_INTENSITIES = ["whisper", "moment"] as const;
export type CelebrationIntensity = (typeof CELEBRATION_INTENSITIES)[number];

export interface CelebrationElement {
  /** Stable key and hash input. */
  i: number;
  /** Horizontal position in the 100-unit box. */
  x: number;
  /** Vertical position in the 100-unit box. */
  y: number;
  /** Seconds before this element starts. */
  delay: number;
  /** Relative size, roughly 0.6 to 1.4. */
  scale: number;
  /** Degrees of tilt, for anything with a direction. */
  tilt: number;
}

export interface CelebrationPlan {
  kind: CelebrationKind;
  intensity: CelebrationIntensity;
  /** Total seconds the whole thing runs, including the last element's delay. */
  duration: number;
  elements: CelebrationElement[];
}

/** Element counts per kind. Whisper first, moment second. */
const COUNTS: Record<CelebrationKind, [number, number]> = {
  seeds: [4, 11],
  blossom: [5, 8],
  fireflies: [5, 13],
  dawn: [3, 5],
  ripples: [2, 4],
};

/** Base seconds per kind. Whisper first, moment second. */
const DURATIONS: Record<CelebrationKind, [number, number]> = {
  seeds: [1.1, 2.6],
  blossom: [0.9, 1.9],
  fireflies: [1.2, 2.8],
  dawn: [1.0, 2.2],
  ripples: [0.9, 1.8],
};

/**
 * A small deterministic hash, 0 to 1. Integer arithmetic only, so it gives
 * the same numbers on every engine.
 */
export function jitter(i: number, seed: number, salt: number): number {
  let h = (i * 374761393 + seed * 668265263 + salt * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function celebrationCount(kind: CelebrationKind, intensity: CelebrationIntensity): number {
  return COUNTS[kind][intensity === "moment" ? 1 : 0];
}

export function celebrationDuration(kind: CelebrationKind, intensity: CelebrationIntensity): number {
  return DURATIONS[kind][intensity === "moment" ? 1 : 0];
}

/**
 * The elements of one celebration. `seed` lets a caller replay the same
 * moment with a different scatter, and defaults to a single shape so the
 * component is stable across re-renders.
 */
export function celebrationPlan(
  kind: CelebrationKind,
  intensity: CelebrationIntensity = "whisper",
  seed = 0,
): CelebrationPlan {
  const count = celebrationCount(kind, intensity);
  const base = celebrationDuration(kind, intensity);
  const spread = intensity === "moment" ? 0.55 : 0.3;
  const elements: CelebrationElement[] = [];

  for (let i = 0; i < count; i++) {
    const a = jitter(i, seed, 1);
    const b = jitter(i, seed, 2);
    const c = jitter(i, seed, 3);
    // Elements are spaced across the box first and jittered second, so a low
    // count never clusters into one corner.
    const lane = count === 1 ? 0.5 : i / (count - 1);
    elements.push({
      i,
      x: Math.round((8 + lane * 84 + (a - 0.5) * 14) * 100) / 100,
      y: Math.round((18 + b * 64) * 100) / 100,
      delay: Math.round(lane * spread * 100) / 100,
      scale: Math.round((0.65 + c * 0.7) * 100) / 100,
      tilt: Math.round((a - 0.5) * 60),
    });
  }

  const lastDelay = elements.length ? elements[elements.length - 1].delay : 0;
  return {
    kind,
    intensity,
    duration: Math.round((base + lastDelay) * 100) / 100,
    elements,
  };
}

/**
 * THE STILL STATE, for anyone who asked for less motion.
 *
 * Not an empty box, and not the moving version with its motion stripped: an
 * animation whose whole content is "rise and fade" ends at nothing, so
 * cancelling the motion cancels the celebration. Each kind therefore has a
 * settled composition that says the same thing standing still, and it stays
 * on screen instead of playing out.
 */
export const STILL_STATE: Record<CelebrationKind, string> = {
  seeds: "Seeds resting where the wind set them down.",
  blossom: "One blossom, fully open.",
  fireflies: "Fireflies holding their light in the dark.",
  dawn: "Full daylight over the horizon.",
  ripples: "Still rings on the water.",
};
