/**
 * "Reduce motion", as a value React can branch on.
 *
 * index.css already answers the media query in CSS, and that answer is
 * `animation-duration: 1ms !important` across the board. For a spinner that
 * is exactly right. For a celebration it is not: a firefly whose whole
 * animation is "rise and fade" arrives at its end state in one millisecond,
 * which is an empty box. A member who asked for less motion should still see
 * that something was celebrated.
 *
 * So the celebrations read the preference here and render a DIFFERENT
 * composition, still and complete, rather than the same composition with the
 * motion removed. The CSS rule stays as the floor under everything else.
 *
 * matchMedia is missing in server rendering and in the node test environment,
 * and older Safari has `addListener` instead of `addEventListener`. Both are
 * handled, and both failure paths answer "motion is fine", which is the state
 * the rest of the CSS already assumes.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The preference right now, safe to call outside React and outside a browser. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** The preference, kept current if a member changes it while the page is open. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(QUERY);
    } catch {
      return;
    }
    const onChange = () => setReduced(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    const legacy = mql as MediaQueryList & { addListener?: (cb: () => void) => void; removeListener?: (cb: () => void) => void };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, []);

  return reduced;
}
