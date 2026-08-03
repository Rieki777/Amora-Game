/**
 * THE CYCLE CLOCK's arithmetic (Rye, 2026-08-01): the wheel-of-the-year's
 * STRUCTURE — quarters, seasons, lunations, one circle — with none of any
 * tradition's language, so it is open to every worldview. Astronomy is the
 * only authority here: equal days and longest/shortest days are true
 * everywhere and owned by no one, and they INVERT by hemisphere, which a
 * computed wheel gets right and a copied one gets wrong.
 *
 * Quarter dates use fixed civil approximations (Mar 20 / Jun 21 / Sep 22 /
 * Dec 21) — within a day of the astronomical event through this century,
 * and this clock marks rhythm, not ephemerides.
 */

export type Hemisphere = "north" | "south";

export interface QuarterMark {
  /** Neutral names: no sabbats, no festivals — villages name their own. */
  label: "Equal Day & Night" | "Longest Day" | "Shortest Day";
  month: number; // 1-12
  day: number;
  /** Fraction of the year-circle, 0 at Jan 1, clockwise. */
  angle: number;
}

const QUARTERS: Array<{ month: number; day: number; north: QuarterMark["label"] }> = [
  { month: 3, day: 20, north: "Equal Day & Night" },
  { month: 6, day: 21, north: "Longest Day" },
  { month: 9, day: 22, north: "Equal Day & Night" },
  { month: 12, day: 21, north: "Shortest Day" },
];

export function quarterMarks(hemisphere: Hemisphere): QuarterMark[] {
  return QUARTERS.map((q) => ({
    label:
      hemisphere === "north" || q.north === "Equal Day & Night"
        ? q.north
        : q.north === "Longest Day"
          ? "Shortest Day"
          : "Longest Day",
    month: q.month,
    day: q.day,
    angle: yearAngle(q.month, q.day),
  }));
}

/** Fraction [0,1) around the year for a calendar date (non-leap basis). */
export function yearAngle(month: number, day: number): number {
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return ((CUM[month - 1] + (day - 1)) % 365) / 365;
}

/** Today's position on the wheel plus the current lunation's fraction. */
export function wheelState(now: Date, moonAgeDays: number, hemisphere: Hemisphere) {
  const angle = yearAngle(now.getMonth() + 1, now.getDate());
  return {
    yearAngle: angle,
    lunationFraction: Math.max(0, Math.min(1, moonAgeDays / 29.53)),
    quarters: quarterMarks(hemisphere),
  };
}
