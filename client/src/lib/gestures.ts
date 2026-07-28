/**
 * Touch-gesture rules, as pure functions.
 *
 * A touch screen has no hover, so an icon-only nav has to answer "what is
 * this?" some other way: press and hold for one label, swipe to slide them
 * all out. Both are threshold decisions, and thresholds are where gestures go
 * wrong — too tight and a steady finger never triggers, too loose and every
 * scroll toggles the menu. Keeping them here means they can be checked
 * against numbers instead of by waving a thumb at a phone.
 */

/** A finger this far off its start is travelling, not resting. */
export const HOLD_SLOP_PX = 10;
/** Below this, a horizontal drag is a wobble, not a swipe. */
export const SWIPE_MIN_PX = 40;

/**
 * Did the finger move enough to mean the hold was never a hold?
 *
 * Generous in both axes on purpose: a hold that dies too easily is worse
 * than one that lingers, because the label is harmless and a missed label
 * leaves the icon unexplained.
 */
export function holdCancelled(dx: number, dy: number, slop = HOLD_SLOP_PX): boolean {
  return Math.abs(dx) > slop || Math.abs(dy) > slop;
}

/**
 * What a finished drag meant, if anything.
 *
 * Requires horizontal travel to EXCEED vertical: the rail scrolls on its own
 * axis, and a diagonal flick while scrolling thirty items must not be read as
 * a request to open the menu. Ties go to scrolling.
 */
export function swipeIntent(
  dx: number,
  dy: number,
  threshold = SWIPE_MIN_PX,
): "open" | "close" | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  return dx > 0 ? "open" : "close";
}
