/**
 * WHEN A MOMENT IS ALLOWED TO FIRE, and how a number lands.
 *
 * The kit draws celebrations. These two decide whether one is owed at all,
 * which is the harder half and the half that goes wrong.
 *
 * THE RULE THEY ENFORCE. Motion that answers the person is alive; motion that
 * interrupts them is noise. A quest consented last Tuesday must not throw
 * petals every time its card mounts, and a page that celebrates its own load
 * is celebrating nothing the member did. So an arrival fires only on a change
 * between two states it actually WATCHED change: the first value it sees
 * seeds the baseline in silence, however exciting that value is.
 *
 * WHY A KNOWN/UNKNOWN SPLIT. Every one of these surfaces fetches. The first
 * render has `undefined`, the second has the real state, and a naive
 * "did it change" fires on that pair every single time. Null or undefined
 * here means "not known yet" and never counts as a change in either
 * direction, so seeding happens on the first REAL value.
 *
 * THE DECISIONS ARE PURE FUNCTIONS, the hooks are three lines of React around
 * them. vitest runs this repo in a node environment with no DOM, so logic
 * that lives inside a hook body cannot be tested at all; logic that lives
 * beside it can. `moments.test.ts` drives the pure half.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

// ── The decisions ───────────────────────────────────────────────────────────

export interface ArrivalStep {
  /** The baseline to carry into the next reading. */
  seen: string | null;
  /** Whether this reading is news the member should be shown. */
  fire: boolean;
}

/**
 * One step of arrival detection.
 *
 * @param seen The last known state, or null when nothing is known yet.
 * @param key The incoming state, or null/undefined while it is still loading.
 */
export function arrivalStep(seen: string | null, key: string | null | undefined): ArrivalStep {
  // Unknown is not a state. It neither seeds nor fires.
  if (key === null || key === undefined) return { seen, fire: false };
  // The first real reading is history, not news.
  if (seen === null) return { seen: key, fire: false };
  if (seen === key) return { seen, fire: false };
  return { seen: key, fire: true };
}

/**
 * The displayed value of a counting number at progress `t`, 0 to 1.
 *
 * Ease out cubic: fast to begin, settling rather than stopping. It is exact
 * at both ends, so the number a member reads when the motion finishes is the
 * number the server granted and never one short.
 */
export function countUpAt(target: number, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(target * eased);
}

// ── The hooks ───────────────────────────────────────────────────────────────

/**
 * HOW LONG A MOMENT STAYS ON SCREEN.
 *
 * The obvious wiring is to unmount the drawing in `Celebration`'s `onDone`,
 * and it is wrong for exactly the members the still states were built for.
 * `onDone` fires IMMEDIATELY under reduce-motion, by design: there is no
 * animation to wait for. A component that unmounts on it therefore shows a
 * motion-sensitive member the settled composition for one frame, which is
 * indistinguishable from showing them nothing.
 *
 * So the window is a clock instead, the same length either way. Someone
 * watching the seeds fly sees them land and rest; someone who asked for
 * stillness sees the seeds already at rest, for just as long. The default
 * clears the longest `moment` the plan allows (2.8s) with time to read it.
 *
 * `open` IS A KEY, NOT ONLY A FLAG. Anything falsy closes the window; any
 * truthy value opens it, and CHANGING that value re-arms the clock. A
 * boolean is the common case and a counter is what a surface passes when the
 * same moment can happen twice in one sitting, a second settlement being the
 * live example.
 */
export function useMomentWindow(open: boolean | number | string | null | undefined, ms = 4200): boolean {
  const [showing, setShowing] = useState(Boolean(open));

  useEffect(() => {
    if (!open) {
      setShowing(false);
      return;
    }
    setShowing(true);
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => setShowing(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);

  return showing;
}

/**
 * Did this just happen, here, while the member was watching?
 *
 * Returns the state that ARRIVED, or null while nothing has. Returning the
 * key instead of a boolean is what lets it feed `useMomentWindow` directly:
 * the window opens because there is a key, and a second arrival re-arms it
 * because the key changed. A boolean would need the caller to reassemble
 * exactly that out of two values, which is a joint for a bug to live in.
 */
export function useArrival(key: string | null | undefined): string | null {
  const seen = useRef<string | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);

  useEffect(() => {
    const step = arrivalStep(seen.current, key);
    seen.current = step.seen;
    if (step.fire) setArrived(step.seen);
  }, [key]);

  return arrived;
}

/**
 * A number arriving rather than appearing.
 *
 * Runs only while `run` is true, so the same component prints a settled value
 * on every ordinary render and counts only on the render that earned it.
 *
 * REDUCE MOTION LANDS THE VALUE, IT DOES NOT HIDE IT. The still state of a
 * counting number is the number, immediately. Anything else withholds
 * information from the person who asked for less movement.
 */
export function useCountUp(target: number, run: boolean, durationMs = 900): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);

  useEffect(() => {
    const settle = !run || reduced || !Number.isFinite(target) || target <= 0;
    if (settle || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      setShown(countUpAt(target, t));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, run, reduced, durationMs]);

  return shown;
}
