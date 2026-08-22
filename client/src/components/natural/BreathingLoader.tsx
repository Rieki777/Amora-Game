/**
 * BREATHINGLOADER: what waiting looks like here.
 *
 * A spinner is a machine turning. This is a slow breath: a leaf-shaped form
 * swelling and easing at about four seconds a cycle, near the pace of a calm
 * human breath, so a page that is thinking looks alive instead of stuck.
 *
 * ON THE EXISTING `breathe` KEYFRAME. index.css already has one, written for
 * the character-select idle: scale 1 to 1.015 with a 4px lift, small enough
 * to read as a portrait breathing and far too small to read as a loader. It
 * keeps its job and its name. This component uses `nat-breathe`, which moves
 * scale and opacity together over a wider range, so the two are the same
 * gesture at two amplitudes and neither has to compromise.
 *
 * WAITING IS ANNOUNCED, NOT MIMED. The wrapper is `role="status"` with the
 * label in its accessible name, so a screen reader hears what is loading
 * rather than nothing at all, and the drawing is hidden from it.
 *
 * REDUCE MOTION. No pulsing at all. The form holds at its resting size and
 * the label carries the news, which is the whole message anyway.
 */
import { useReducedMotion } from "./useReducedMotion";

export interface BreathingLoaderProps {
  /** What is being waited for. Read out, and printed when `showLabel`. */
  label?: string;
  /** Box size in CSS pixels. */
  size?: number;
  /** Print the label under the form. */
  showLabel?: boolean;
  className?: string;
}

export default function BreathingLoader({
  label = "Loading",
  size = 48,
  showLabel = false,
  className,
}: BreathingLoaderProps) {
  const reduced = useReducedMotion();

  return (
    <span
      className={`nat-loader${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={showLabel ? undefined : label}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block" }}
      >
        <g className={reduced ? undefined : "nat-breathe"} style={{ transformOrigin: "50px 50px" }}>
          {/* A leaf: two arcs meeting at the tips, with the midrib drawn in. */}
          <path
            d="M50 14 C 74 30 74 70 50 86 C 26 70 26 30 50 14 Z"
            fill="var(--nat-leaf, #a8cfc9)"
            stroke="var(--nat-leaf-edge, #157f7d)"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="M50 18 L 50 82"
            stroke="var(--nat-leaf-edge, #157f7d)"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M50 38 L 62 32 M50 50 L 64 45 M50 62 L 61 58 M50 38 L 38 32 M50 50 L 36 45 M50 62 L 39 58"
            stroke="var(--nat-leaf-edge, #157f7d)"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.45"
            fill="none"
          />
        </g>
      </svg>
      {showLabel && <span className="nat-loader-label">{label}</span>}
    </span>
  );
}
