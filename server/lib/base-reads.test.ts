/**
 * The read-through window, as arithmetic.
 *
 * This file needs no database and no clock, so it never skips: a worktree with
 * no `.env` still runs it. That is deliberate. The defect it guards was a
 * comparison between two DIFFERENT clocks — a `fetched_at` written by the
 * database server's `NOW()` against the Node process's `Date.now()` — and the
 * only reason it survived review is that the comparison had nowhere to be
 * exercised. It was three tokens in the middle of a function that needed a
 * chain, a pool and a verified wallet binding before it could be reached at
 * all, so every test that touched it was really testing something else.
 *
 * Making the comparison a pure function of BOTH instants is the fix that makes
 * the guard possible. The offsets below are the two real deployments: a
 * database four hours behind UTC and one two hours ahead. Neither is
 * simulated by rewriting the comparison; each is fed straight into the same
 * function the server calls.
 */
import { describe, expect, it } from "vitest";
import { FRESH_WINDOW_MS, formatUnits, readInstant, withinFreshWindow } from "./base-reads";

const HOUR = 3_600_000;
/** A fixed instant, so nothing here depends on when it runs. */
const NOW = Date.parse("2026-08-22T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("withinFreshWindow", () => {
  it("serves a figure inside the window and refuses one past it", () => {
    expect(withinFreshWindow(iso(NOW), NOW, FRESH_WINDOW_MS)).toBe(true);
    expect(withinFreshWindow(iso(NOW - 59_000), NOW, FRESH_WINDOW_MS)).toBe(true);
    expect(withinFreshWindow(iso(NOW - 61_000), NOW, FRESH_WINDOW_MS)).toBe(false);
  });

  it("is closed at the top edge, so the window is a window and not a rounding", () => {
    expect(withinFreshWindow(iso(NOW - FRESH_WINDOW_MS + 1), NOW, FRESH_WINDOW_MS)).toBe(true);
    expect(withinFreshWindow(iso(NOW - FRESH_WINDOW_MS), NOW, FRESH_WINDOW_MS)).toBe(false);
  });

  /*
   * THE BEHIND-UTC DEPLOYMENT. `NOW()` on a database session four hours behind
   * UTC reads back four hours early, so a figure written one second ago looks
   * four hours old. The window never engages and every profile load dials an
   * endpoint the village pays per call for.
   *
   * The assertion is about the SHAPE of the failure, not about a fix: an age
   * this large is correctly outside a one-minute window. What the fix removes
   * is the possibility of the value arriving shifted in the first place, which
   * is why the paired database test below drives a real shifted session.
   */
  it("a value shifted four hours BEHIND reads as far outside the window", () => {
    const shifted = iso(NOW - 4 * HOUR);
    expect(withinFreshWindow(shifted, NOW, FRESH_WINDOW_MS)).toBe(false);
    expect(NOW - Date.parse(shifted)).toBe(4 * HOUR);
  });

  /*
   * THE AHEAD-UTC DEPLOYMENT, and the one that costs a member rather than the
   * village. Two hours ahead makes the age NEGATIVE. The comparison this
   * replaced was `Date.now() - Date.parse(at) < 60_000`, and -7,200,000 is
   * less than 60,000, so a balance that stopped being true two hours ago was
   * served as fresh, with `stale: false`, for as long as the offset lasted.
   */
  it("a value shifted two hours AHEAD is refused, never served as fresh", () => {
    const shifted = iso(NOW + 2 * HOUR);
    expect(NOW - Date.parse(shifted)).toBeLessThan(FRESH_WINDOW_MS); // the old test, which passed
    expect(withinFreshWindow(shifted, NOW, FRESH_WINDOW_MS)).toBe(false); // the new one, which is the point
  });

  it("refuses a future date by any margin, down to the millisecond", () => {
    expect(withinFreshWindow(iso(NOW + 1), NOW, FRESH_WINDOW_MS)).toBe(false);
    expect(withinFreshWindow(iso(NOW), NOW, FRESH_WINDOW_MS)).toBe(true);
  });

  it("treats an unparseable timestamp as not fresh, so a bad row costs a call and not a wrong number", () => {
    expect(withinFreshWindow("", NOW, FRESH_WINDOW_MS)).toBe(false);
    expect(withinFreshWindow("not a date", NOW, FRESH_WINDOW_MS)).toBe(false);
    expect(withinFreshWindow("0000-00-00 00:00:00", NOW, FRESH_WINDOW_MS)).toBe(false);
  });

  it("is one window for both caches", () => {
    expect(FRESH_WINDOW_MS).toBe(60_000);
  });
});

describe("readInstant", () => {
  /*
   * The truncation is what keeps `withinFreshWindow`'s refusal of future dates
   * from firing on the writer's own row: the stored value is always at or
   * before the moment the caller asked for it, because the column holds whole
   * seconds and this rounds DOWN into them.
   */
  it("never lands after the instant it was given", () => {
    for (const ms of [NOW, NOW + 1, NOW + 999, NOW + 500]) {
      expect(readInstant(ms).getTime()).toBeLessThanOrEqual(ms);
    }
  });

  it("lands on a whole second, which is what the timestamp column holds", () => {
    expect(readInstant(NOW + 999).getTime() % 1000).toBe(0);
    expect(readInstant(NOW + 999).getTime()).toBe(NOW);
  });

  it("dates a figure it has just written as fresh", () => {
    const at = readInstant(NOW);
    expect(withinFreshWindow(at.toISOString(), NOW, FRESH_WINDOW_MS)).toBe(true);
    // …and still fresh 999 ms of truncation later, which is the worst case.
    expect(withinFreshWindow(readInstant(NOW + 999).toISOString(), NOW + 999, FRESH_WINDOW_MS)).toBe(true);
  });
});

describe("formatUnits", () => {
  // Not new coverage of the window, but this file is where the pure functions
  // of this module can be reached without a chain, and the half token is the
  // figure the whole decimals() rule exists to protect.
  it("keeps a half token a half token", () => {
    expect(formatUnits("500000000000000000", 18)).toBe("0.5");
    expect(formatUnits("1000000500000000000000000", 18)).toBe("1000000.5");
    expect(formatUnits("1500000", 6)).toBe("1.5");
    expect(formatUnits("0", 18)).toBe("0");
  });
});
