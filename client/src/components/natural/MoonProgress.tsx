/**
 * MOONPROGRESS: the platform's progress ring, drawn as the moon filling.
 *
 * The founder's ruling: a progress indicator should be a moon going through
 * its phases, new at nothing done and full at everything done, with a
 * distinct graphic at least every 12.5% of completion. The maths lives next
 * door in moonGeometry.ts, where it is tested at all nine steps.
 *
 * THREE RULES THIS COMPONENT ENFORCES.
 *
 * 1. PROGRESS WAXES ONLY. `mode="progress"` (the default) maps 0 to 1 onto
 *    new through full and never past it. A waning moon reads as progress
 *    being lost, which is a lie about a quest at 80%. `mode="lunation"`
 *    exists for displays that really are cyclical, the gratitude cycle among
 *    them, and that mode alone draws the light on the left limb.
 * 2. A READING ALWAYS TRAVELS WITH IT. The accessible name carries the percent
 *    and the phase name, so a screen reader hears "62 percent, waxing
 *    gibbous", and `showNumber` prints the same percent beside the disc.
 *    Turning `showNumber` off is allowed only where the caller's own copy
 *    already states the same progress, in a number or in words, because a
 *    shape alone is not a readout.
 * 3. IT NEVER SPEAKS BY COLOUR. The phase is carried by the OUTLINE of the
 *    lit region, which survives greyscale, low contrast and a dark theme.
 *
 * SIZES. `size` is the disc's box in CSS pixels and the whole drawing scales
 * with it: one 100-unit viewBox, stroke widths in viewBox units. It reads at
 * 16px inline and at 200px as a hero. Below 24px the ring and the number are
 * dropped automatically, because at that size they are noise.
 *
 * MOTION. The terminator eases between values, which is the moon moving. That
 * transition is dropped for anyone who asked for less motion, and the value
 * still lands.
 *
 * THE THRESHOLD LINE. Some moons are measured against a bar the value has to
 * reach, and a vote's agreement is the first of them: the founder's design
 * asks for "a red line needing the moon to get to that 80% illumination". Pass
 * `threshold` and the disc carries the terminator it would have at that
 * fraction, dashed, so the lit edge and the line it is chasing are the same
 * curve at two values and crossing it is exactly crossing the number.
 *
 * `thresholdTone` colours that line and `thresholdLabel` says it in words. The
 * words are not optional: the colour is never allowed to be the only signal,
 * and the label is what a screen reader and a greyscale reader get.
 */
import { useId } from "react";
import { litPath, readLunation, readProgress, terminatorPath, type MoonReading } from "./moonGeometry";
import { useReducedMotion } from "./useReducedMotion";

/** Where a threshold stands against the value. `none` means nobody has moved yet. */
export type MoonThresholdTone = "met" | "short" | "none";

/**
 * The `none` stroke is a mid grey and not the disc's own edge colour: at a new
 * moon the line lies on the dark side, and `--nat-moon-edge` is close enough
 * to `--nat-moon-dark` that the threshold disappeared exactly where a member
 * most needs to see how far the light has to travel.
 */
const THRESHOLD_STROKE: Record<MoonThresholdTone, string> = {
  met: "var(--color-sage, #3d6e4a)",
  short: "var(--color-coral, #9b4030)",
  none: "var(--nat-moon-mark, #8f8a84)",
};

export interface MoonProgressProps {
  /**
   * In `progress` mode, the fraction complete from 0 to 1.
   * In `lunation` mode, the lunation phase shared/lunar's `moonPhase` returns.
   */
  value: number;
  mode?: "progress" | "lunation";
  /** Box size in CSS pixels. 16 for an inline glyph, 200 for a hero. */
  size?: number;
  /** What the moon is measuring, read out before the number. */
  label?: string;
  /** Print the percent beside the disc. Ignored under 24px. */
  showNumber?: boolean;
  /** Draw the horizon ring around the disc. Ignored under 24px. */
  showRing?: boolean;
  /**
   * Where the value has to reach, 0 to 1. Drawn on the disc as the terminator
   * that fraction would have. Ignored under 24px, where it would be mush.
   */
  threshold?: number;
  /** How that line is toned. Pass `thresholdLabel` with it, always. */
  thresholdTone?: MoonThresholdTone;
  /** The threshold in words. Carried in the accessible name. */
  thresholdLabel?: string;
  /** One more sentence for the accessible name, after the phase. */
  description?: string;
  className?: string;
}

/** Where the drawing is 100 units wide whatever `size` says. */
const BOX = 100;
const CX = 50;
const CY = 50;
const R = 34;
const RING_R = 44;

export default function MoonProgress({
  value,
  mode = "progress",
  size = 48,
  label,
  showNumber = true,
  showRing = true,
  threshold,
  thresholdTone = "none",
  thresholdLabel,
  description,
  className,
}: MoonProgressProps) {
  // React's generated ids carry punctuation that is legal in an id and not in
  // a CSS selector, and a gradient reference is read by both. Strip it.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduced = useReducedMotion();
  const read: MoonReading = mode === "lunation" ? readLunation(value) : readProgress(value);

  const tiny = size < 24;
  const withNumber = showNumber && !tiny;
  const withRing = showRing && !tiny;

  const d = litPath({ cx: CX, cy: CY, r: R, fraction: read.fraction, side: read.side });
  // The ring is the horizon: in progress mode it tracks the same fraction the
  // moon does, and in lunation mode it tracks the way through the month, which
  // keeps climbing while the moon itself is already shrinking.
  const ringFraction = mode === "lunation" ? read.phase : read.fraction;
  const ringLength = 2 * Math.PI * RING_R;

  const withThreshold = threshold != null && !tiny;
  const thresholdD = withThreshold
    ? terminatorPath({ cx: CX, cy: CY, r: R, fraction: threshold, side: read.side })
    : "";
  const name = [label ? `${label}: ${read.label}` : read.label, thresholdLabel, description]
    .filter(Boolean)
    .join(". ");

  return (
    <span className={`nat-moon${className ? ` ${className}` : ""}`} role="img" aria-label={name}>
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", flex: "0 0 auto" }}
      >
        <defs>
          <radialGradient id={`nat-moon-lit-${uid}`} cx="0.42" cy="0.36" r="0.8">
            <stop offset="0" stopColor="var(--nat-moon-lit-high, #fdf6e3)" />
            <stop offset="1" stopColor="var(--nat-moon-lit, #f0e4c4)" />
          </radialGradient>
        </defs>

        {withRing && (
          <>
            <circle
              cx={CX} cy={CY} r={RING_R} fill="none"
              stroke="var(--nat-horizon, rgba(21,127,125,.18))" strokeWidth="3"
            />
            <circle
              className={reduced ? undefined : "nat-moon-ring"}
              cx={CX} cy={CY} r={RING_R} fill="none"
              stroke="var(--nat-horizon-lit, #157f7d)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={ringLength}
              strokeDashoffset={ringLength * (1 - ringFraction)}
              transform={`rotate(-90 ${CX} ${CY})`}
            />
          </>
        )}

        {/* The night side. Always drawn, so the disc is a whole moon at 0%
            and the shape of the dark half is legible against the page. */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="var(--nat-moon-dark, #223b3f)"
          stroke="var(--nat-moon-edge, #2f4f52)"
          strokeWidth="1"
        />

        {d && (
          <path
            className={reduced ? undefined : "nat-moon-lit"}
            d={d}
            fill={`url(#nat-moon-lit-${uid})`}
            stroke="var(--nat-moon-edge, #2f4f52)"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        )}

        {/* The line the light has to reach. Dashed, so it reads as a mark on
            the disc and never as the moon's own edge, and drawn last so it
            stays legible over the lit side once the moon has crossed it. */}
        {thresholdD && (
          <path
            d={thresholdD}
            fill="none"
            stroke={THRESHOLD_STROKE[thresholdTone]}
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}
      </svg>

      {withNumber && (
        <span className="nat-moon-readout" aria-hidden="true">
          <span className="nat-moon-percent">{read.percent}%</span>
          <span className="nat-moon-phase">{read.phaseName}</span>
        </span>
      )}
    </span>
  );
}
