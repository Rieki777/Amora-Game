/**
 * CELEBRATIONS, DRAWN FROM THE WORLD OUTSIDE.
 *
 * Five moments, no confetti: seeds carried on wind, a blossom opening,
 * fireflies rising, dawn breaking over a horizon, ripples spreading on water.
 * The layout arithmetic is in celebrationPlan.ts and the keyframes are in
 * index.css beside the platform's other motion; this file is the drawing.
 *
 * EVERY ONE HAS A STILL FORM. The global reduce-motion rule in index.css
 * collapses animations to a millisecond, which for a celebration made of
 * "rise and fade" means an empty box. So each kind reads the preference and
 * renders a settled composition instead: seeds landed, the blossom already
 * open, fireflies holding their light. Dignified, and still a celebration.
 *
 * IT IS NEVER THE ONLY SIGNAL. The drawing is decorative and hidden from
 * assistive technology. Pass `message` and the same news is announced in a
 * live region, so the moment lands whether or not anyone can see it.
 *
 * INTENSITY. `whisper` by default. `moment` is rationed: stage advance, quest
 * consent, a ballot carrying, a need delivered. The rule and the reasoning
 * are in docs/modules/natural-interface.md.
 */
import { useEffect, useId, useRef } from "react";
import {
  celebrationPlan,
  STILL_STATE,
  type CelebrationIntensity,
  type CelebrationKind,
  type CelebrationPlan,
} from "./celebrationPlan";
import { useReducedMotion } from "./useReducedMotion";

export interface CelebrationProps {
  kind: CelebrationKind;
  intensity?: CelebrationIntensity;
  /** Box size in CSS pixels. */
  size?: number;
  /** Changes the scatter without changing the choreography. */
  seed?: number;
  /** Announced in a live region. Without it the moment is silent to a reader. */
  message?: string;
  /** Called once the motion has finished. Fires immediately when motion is off. */
  onDone?: () => void;
  className?: string;
}

type Vars = React.CSSProperties & Record<"--nat-delay" | "--nat-dur", string>;

const vars = (delay: number, dur: number): Vars =>
  ({ "--nat-delay": `${delay}s`, "--nat-dur": `${dur}s` }) as Vars;

export default function Celebration({
  kind,
  intensity = "whisper",
  size = 120,
  seed = 0,
  message,
  onDone,
  className,
}: CelebrationProps) {
  const reduced = useReducedMotion();
  const plan = celebrationPlan(kind, intensity, seed);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (reduced) {
      done.current?.();
      return;
    }
    const t = window.setTimeout(() => done.current?.(), plan.duration * 1000);
    return () => window.clearTimeout(t);
  }, [reduced, plan.duration, kind, intensity, seed]);

  return (
    <span className={`nat-celebrate${className ? ` ${className}` : ""}`}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", overflow: "visible" }}
      >
        <Scene plan={plan} still={reduced} />
      </svg>
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
      {reduced && <span className="sr-only">{STILL_STATE[kind]}</span>}
    </span>
  );
}

function Scene({ plan, still }: { plan: CelebrationPlan; still: boolean }) {
  switch (plan.kind) {
    case "seeds": return <Seeds plan={plan} still={still} />;
    case "blossom": return <Blossom plan={plan} still={still} />;
    case "fireflies": return <Fireflies plan={plan} still={still} />;
    case "dawn": return <Dawn plan={plan} still={still} />;
    default: return <Ripples plan={plan} still={still} />;
  }
}

type SceneProps = { plan: CelebrationPlan; still: boolean };

/**
 * SEEDS ON WIND. Winged seeds tumbling right and settling. Still form: the
 * same seeds resting on the ground line, which is what the wind leaves.
 */
export function Seeds({ plan, still }: SceneProps) {
  const per = plan.duration / 1.6;
  return (
    <g>
      {plan.elements.map((e) => (
        <g
          key={e.i}
          className={still ? undefined : "nat-seed"}
          style={still ? undefined : vars(e.delay, per)}
          /* Landed seeds sit in three shallow rows with their own tilts kept.
             One row at a single height packed eleven of them into a solid
             caterpillar, which is the opposite of "settled where the wind put
             them". */
          transform={`translate(${e.x} ${still ? 70 + (e.i % 3) * 6 : e.y}) rotate(${e.tilt}) scale(${e.scale})`}
        >
          <path
            d="M0 0 C 4 -3 8 -1 8 3 C 8 7 4 9 0 6 Z"
            fill="var(--nat-seed, #b9c98a)"
            stroke="var(--nat-seed-edge, #7f9155)"
            strokeWidth="0.7"
          />
          <line x1="0" y1="0" x2="-5" y2="-4" stroke="var(--nat-seed-edge, #7f9155)" strokeWidth="0.7" />
        </g>
      ))}
      {still && (
        <line x1="6" y1="92" x2="94" y2="92" stroke="var(--nat-earth, #9c8564)" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </g>
  );
}

/**
 * A BLOSSOM OPENING. Petals swing out from a closed bud. Still form: the
 * flower already open, which is where the motion was going anyway.
 */
export function Blossom({ plan, still }: SceneProps) {
  const petals = plan.elements.length;
  const per = plan.duration / 1.4;
  return (
    <g transform="translate(50 54)">
      {plan.elements.map((e, n) => {
        const angle = (360 / petals) * n;
        return (
          <g key={e.i} transform={`rotate(${angle})`}>
            <ellipse
              className={still ? undefined : "nat-petal"}
              style={still ? undefined : vars(e.delay, per)}
              cx="0" cy="-20" rx="9" ry="19"
              fill="var(--nat-petal, #f3cdd8)"
              stroke="var(--nat-petal-edge, #d79bb0)"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
      <circle cx="0" cy="0" r="8" fill="var(--nat-pollen, #ecb163)" />
      <circle cx="0" cy="0" r="3.4" fill="var(--nat-pollen-deep, #c98b3a)" />
    </g>
  );
}

/**
 * FIREFLIES RISING. Points of light climbing and pulsing. Still form: the
 * same lights held at height in the dark, which is what a firefly does when
 * it stops.
 */
export function Fireflies({ plan, still }: SceneProps) {
  const per = plan.duration / 1.5;
  return (
    <g>
      {plan.elements.map((e) => (
        <circle
          key={e.i}
          className={still ? undefined : "nat-firefly"}
          style={still ? undefined : vars(e.delay, per)}
          cx={e.x}
          cy={still ? e.y * 0.7 + 12 : e.y}
          r={1.6 + e.scale * 1.6}
          fill="var(--nat-firefly, #f6e29a)"
          opacity={still ? 0.55 + e.scale * 0.35 : undefined}
        />
      ))}
    </g>
  );
}

/**
 * DAWN BREAKING. A sun clearing the horizon and the light widening behind it.
 * Still form: full daylight, the sun already up.
 */
export function Dawn({ plan, still }: SceneProps) {
  const per = plan.duration / 1.2;
  // Two dawns on one page must not share a gradient id, and React's own id
  // carries punctuation a CSS selector cannot read.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={`nat-dawn-sky-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--nat-dawn-low, #f6c98a)" />
          <stop offset="1" stopColor="var(--nat-dawn-high, rgba(246,201,138,0))" />
        </linearGradient>
      </defs>
      <rect
        className={still ? undefined : "nat-dawn-sky"}
        style={still ? undefined : vars(0, per)}
        x="4" y="18" width="92" height="54" rx="10" fill={`url(#nat-dawn-sky-${uid})`}
        opacity={still ? 1 : undefined}
      />
      {plan.elements.map((e, n) => (
        <line
          key={e.i}
          className={still ? undefined : "nat-dawn-ray"}
          style={still ? undefined : vars(e.delay, per)}
          x1="50" y1="72"
          x2={12 + n * (76 / Math.max(1, plan.elements.length - 1))}
          y2={26 + (n % 2) * 8}
          stroke="var(--nat-dawn-ray, #f0d49a)"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={still ? 0.8 : undefined}
        />
      ))}
      <circle
        className={still ? undefined : "nat-dawn-sun"}
        style={still ? undefined : vars(0.1, per)}
        cx="50" cy={still ? 60 : 72} r="15"
        fill="var(--nat-sun, #ecb163)"
      />
      <line x1="2" y1="72" x2="98" y2="72" stroke="var(--nat-horizon-line, #7f9155)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/**
 * RIPPLES SPREADING. Rings widening from where something landed. Still form:
 * the rings held at their full width, which is the mark that remains.
 */
export function Ripples({ plan, still }: SceneProps) {
  const per = plan.duration / 1.3;
  return (
    <g>
      {plan.elements.map((e, n) => (
        <circle
          key={e.i}
          className={still ? undefined : "nat-ripple"}
          style={still ? undefined : vars(e.delay, per)}
          cx="50" cy="50"
          r={still ? 12 + n * 10 : 10}
          fill="none"
          stroke="var(--nat-water, #83a7ad)"
          strokeWidth={still ? 1.4 : 1.8}
          opacity={still ? 0.8 - n * 0.15 : undefined}
        />
      ))}
      <circle cx="50" cy="50" r="4" fill="var(--nat-water-deep, #3a7f86)" />
    </g>
  );
}
