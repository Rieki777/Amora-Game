/**
 * THE MOON, AS GEOMETRY. Pure maths, no React, no DOM, so the shape a member
 * sees can be tested as numbers.
 *
 * ONE LUNAR VOCABULARY. shared/lunar.ts is the platform's lunar clock and it
 * already names phases (`moonPhaseName`) and draws glyphs (`moonPhaseGlyph`).
 * Nothing here re-derives that naming: `readProgress` and `readLunation` hand
 * a phase fraction to shared/lunar and repeat its answer. What this file adds
 * is the one thing shared/lunar has no opinion about, the outline of the lit
 * region at an arbitrary fraction.
 *
 * THE DERIVATION. Take a disc of radius r. Its lit region is bounded by two
 * curves that both run from the top of the disc to the bottom:
 *
 *   1. THE LIMB, the disc's own edge on the lit side. A semicircle of radius r.
 *   2. THE TERMINATOR, the day/night line. A circle seen edge-on projects to
 *      an ellipse, so the terminator is a half-ellipse of vertical radius r
 *      and horizontal radius a.
 *
 * a is what carries the phase. Write f for the illuminated fraction (0 new,
 * 1 full) and take a = r * |1 - 2f|:
 *
 *   f = 0     a = r   the terminator lies exactly on the limb, nothing is lit
 *   f = 0.25  a = r/2 the terminator bulges INTO the lit half, a fat crescent
 *   f = 0.5   a = 0   the terminator is the straight vertical line, half lit
 *   f = 0.75  a = r/2 the terminator bulges AWAY, a gibbous
 *   f = 1     a = r   the terminator lies on the far limb, the whole disc is lit
 *
 * Below the half the ellipse is SUBTRACTED from the half-disc and above it the
 * ellipse is ADDED, which in one SVG path is a single arc sweep flag flipping
 * at f = 0.5. The area falls out exactly right:
 *
 *   f < 0.5   area = pi*r*r/2 - pi*a*r/2 = pi*r*r*f
 *   f > 0.5   area = pi*r*r/2 + pi*a*r/2 = pi*r*r*f
 *
 * so the drawn shape is lit in exactly the proportion the number claims. That
 * identity is the reason to prefer this parametrisation over any eyeballed
 * one, and `terminatorRadius` is the whole of it.
 *
 * It also reconciles with the sky: 1 - 2f = cos(2*pi*phase) is the standard
 * relation between a lunation phase and its illuminated fraction, so
 * a = r * |cos(2*pi*phase)|, the textbook terminator. Progress and the real
 * moon are drawn by the same equation.
 */
import { moonPhaseName } from "@shared/lunar";

/** Which limb the light sits on. A waxing moon is lit on the right. */
export type LitSide = "right" | "left";

/**
 * The nine states the founder's ruling requires: every 12.5% of illumination
 * gets its own graphic. Exported so the component, the tests and the docs all
 * count from the same list.
 */
export const MOON_STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Round to 3 decimals so path strings stay short and byte-stable. */
const fx = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Illuminated fraction of a lunation phase: 0 new, 0.5 full, 1 new again. */
export function illuminatedFraction(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  return (1 - Math.cos(2 * Math.PI * p)) / 2;
}

/**
 * The lunation phase a WAXING illuminated fraction sits at, 0 to 0.5.
 * The inverse of illuminatedFraction over the growing half of the month, and
 * the bridge that lets a progress value borrow shared/lunar's phase names.
 */
export function waxingPhase(fraction: number): number {
  return Math.acos(1 - 2 * clamp01(fraction)) / (2 * Math.PI);
}

/** The moon waxes for the first half of a lunation and wanes for the second. */
export function litSideOf(phase: number): LitSide {
  const p = ((phase % 1) + 1) % 1;
  return p < 0.5 ? "right" : "left";
}

/** Horizontal radius of the terminator ellipse. See the derivation above. */
export function terminatorRadius(r: number, fraction: number): number {
  return r * Math.abs(1 - 2 * clamp01(fraction));
}

export interface MoonPathParts {
  /** Horizontal radius of the terminator ellipse. */
  terminator: number;
  /** SVG sweep flag for the limb arc. */
  limbSweep: 0 | 1;
  /** SVG sweep flag for the terminator arc. Flips at the half. */
  terminatorSweep: 0 | 1;
  /** True while the terminator bulges into the lit half. */
  crescent: boolean;
}

/**
 * The geometry behind `litPath`, as numbers a test can read.
 *
 * SVG sweep flags are stated in screen coordinates, where y grows downward
 * and sweep 1 is clockwise. Running top to bottom, sweep 1 passes through the
 * right of the disc and sweep 0 through the left; running bottom to top it is
 * the other way round, which is why the two flags on a right-lit crescent
 * read 1 then 0 and still both bow rightward.
 */
export function moonPathParts(r: number, fraction: number, side: LitSide = "right"): MoonPathParts {
  const f = clamp01(fraction);
  const crescent = f < 0.5;
  const right = side === "right";
  return {
    terminator: terminatorRadius(r, f),
    limbSweep: right ? 1 : 0,
    terminatorSweep: crescent === right ? 0 : 1,
    crescent,
  };
}

export interface LitPathOptions {
  cx: number;
  cy: number;
  r: number;
  /** Illuminated fraction, 0 to 1. */
  fraction: number;
  side?: LitSide;
}

/**
 * The outline of the lit region as one SVG path: limb out, terminator back.
 * Empty string at a true new moon, where the region has no area and a filled
 * degenerate path would still paint a hairline on some renderers.
 */
export function litPath({ cx, cy, r, fraction, side = "right" }: LitPathOptions): string {
  const f = clamp01(fraction);
  if (f <= 0) return "";
  const { terminator, limbSweep, terminatorSweep } = moonPathParts(r, f, side);
  const top = `${fx(cx)} ${fx(cy - r)}`;
  const bottom = `${fx(cx)} ${fx(cy + r)}`;
  return (
    `M ${top}` +
    ` A ${fx(r)} ${fx(r)} 0 0 ${limbSweep} ${bottom}` +
    ` A ${fx(terminator)} ${fx(r)} 0 0 ${terminatorSweep} ${top}` +
    " Z"
  );
}

export interface MoonReading {
  /** Illuminated fraction, 0 to 1. */
  fraction: number;
  /** Whole percent, for the number that always travels with the moon. */
  percent: number;
  /** Where this sits in a lunation, 0 to 1, for shared/lunar's naming. */
  phase: number;
  side: LitSide;
  /** shared/lunar's own name for that phase. */
  phaseName: string;
  /** What a screen reader reads out. */
  label: string;
}

const reading = (fraction: number, phase: number, side: LitSide): MoonReading => {
  const percent = Math.round(fraction * 100);
  const phaseName = moonPhaseName(phase);
  return {
    fraction,
    percent,
    phase,
    side,
    phaseName,
    label: `${percent} percent, ${phaseName.toLowerCase()}`,
  };
};

/**
 * PROGRESS WAXES ONLY. A progress value of 0.62 is a waxing gibbous, never a
 * waning one, because a moon losing light reads as work being undone.
 */
export function readProgress(value: number): MoonReading {
  const f = clamp01(value);
  return reading(f, waxingPhase(f), "right");
}

/**
 * A genuine lunation: waxing AND waning, for cyclical displays such as the
 * gratitude cycle clock. Takes the phase shared/lunar's `moonPhase` returns.
 */
export function readLunation(phase: number): MoonReading {
  const p = ((phase % 1) + 1) % 1;
  return reading(illuminatedFraction(p), p, litSideOf(p));
}
