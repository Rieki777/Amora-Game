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
 */
import { useId } from "react";
import { litPath, readLunation, readProgress, type MoonReading } from "./moonGeometry";
import { useReducedMotion } from "./useReducedMotion";

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
  const name = label ? `${label}: ${read.label}` : read.label;

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
