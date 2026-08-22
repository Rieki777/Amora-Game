/**
 * ARRIVING AT THE THING, not at the page it is on.
 *
 * A notification that says "the village opened a vote on quest payouts" and
 * drops the reader at the top of a page holding forty proposals has told them
 * where to start looking. So the links carry `?focus=<element id>` and the
 * page brings that element to them.
 *
 * THREE THINGS HAPPEN, and the second is the one usually skipped:
 *
 *  1. The element is scrolled into view. `scroll-mt-*` on the target keeps it
 *     clear of the sticky header, which is WCAG SC 2.4.11 Focus Not Obscured
 *     and not a cosmetic preference (failure F110 is a sticky header hiding a
 *     focused element).
 *  2. FOCUS MOVES TO IT, via `tabindex="-1"`, so a screen reader arrives where
 *     a sighted reader arrives. A visual highlight on its own is invisible to
 *     assistive technology, which makes the deep link work for some people and
 *     not others.
 *  3. A brief highlight, which is a BACKGROUND AND OUTLINE change and nothing
 *     that moves. WCAG's definition of motion animation explicitly excludes
 *     "changes in color, blurring, or opacity that do not alter perceived
 *     size, shape, or position", so this needs no reduced-motion branch and
 *     has none.
 *
 * WHEN THE TARGET IS NOT THERE. A proposal that was withdrawn, a ballot the
 * reader may no longer see: the hook finds nothing, does nothing, and the
 * reader lands on a page that works. A stale deep link must never be an error
 * state, because the notification row outlives the object it points at.
 *
 * `deps` exists because the target usually arrives with a fetch. Pass whatever
 * changes when the list lands (its length is enough) and the hook looks again.
 */
import { useEffect } from "react";

/** How long the arrival mark stays up. */
export const FOCUS_MARK_MS = 2400;

export function focusTargetId(search: string): string | null {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("focus");
  if (!raw) return null;
  // Element ids only: letters, digits, dash, underscore, colon. Anything else
  // is somebody trying to make a selector out of a query string.
  return /^[A-Za-z0-9_:-]{1,120}$/.test(raw) ? raw : null;
}

export function useFocusTarget(deps: readonly unknown[] = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = focusTargetId(window.location.search);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ block: "center" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.classList.add("focus-arrival");
    const t = window.setTimeout(() => el.classList.remove("focus-arrival"), FOCUS_MARK_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
