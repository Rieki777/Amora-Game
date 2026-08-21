/**
 * When a mandate runs out.
 *
 * This decides when a village is told a seat needs reassigning, so the rules
 * are worth pinning rather than inferring from a season turn six weeks from
 * now. Two of them matter most:
 *
 *  - NOTHING IS REVOKED. A lapsed holding is still a holding. Villages miss
 *    re-selections during a harvest or a build push, and a seat going dark on
 *    a Tuesday for reasons nobody chose is worse than one saying out loud
 *    that it is overdue.
 *  - It is DERIVED on every read. A season turn writes nothing, so the state
 *    cannot drift from the calendar the way a stored status column does.
 */
import { describe, expect, it } from "vitest";
import { isLapsed, seatState, type LapseContext, type OrgRole } from "./orgChart";

const NOW = new Date("2026-08-03T12:00:00Z");
const ctx = (over: Partial<LapseContext> = {}): LapseContext => ({
  currentSeasonId: "rooting-2026",
  cadence: "season_turn",
  now: NOW,
  ...over,
});

const seating = (over: Partial<{ termEndsAt: Date | null; seasonId: string | null; endedAt: Date | null }> = {}) => ({
  termEndsAt: null,
  seasonId: "rooting-2026",
  endedAt: null,
  ...over,
});

const role = (over: Partial<OrgRole> = {}): OrgRole => ({
  id: "seat", circleId: null, name: "Seat", aim: null, domain: null,
  accountabilities: [], whyItMatters: null, seats: 1, criticality: "normal",
  active: true, recruiting: false, expiresEachSeason: null,
  statusOverride: null, statusOverrideExpiresAt: null,
  icon: null, color: null, order: 0, isExample: false,
  authority: null, firstYearOutcomes: null, first90DayOutcomes: null,
  locationExpectations: null, compensationReality: null, evidenceRequired: null,
  representsCircle: false, howChosen: null, howChosenGloss: null,
  ...over,
});

describe("when a mandate runs out", () => {
  it("lapses a term whose date has passed", () => {
    const v = isLapsed(seating({ termEndsAt: new Date("2026-07-01T00:00:00Z") }), role(), ctx());
    expect(v).toEqual({ lapsed: true, reason: "term" });
  });

  it("leaves a term that has not arrived alone", () => {
    const v = isLapsed(seating({ termEndsAt: new Date("2026-12-01T00:00:00Z") }), role(), ctx());
    expect(v.lapsed).toBe(false);
  });

  it("lapses a seating made in a season that has turned", () => {
    const v = isLapsed(seating({ seasonId: "foundations-2026" }), role(), ctx());
    expect(v).toEqual({ lapsed: true, reason: "season" });
  });

  it("honours a term even when the cadence says never", () => {
    // Somebody wrote a date down. A village-wide setting does not get to
    // quietly overrule a commitment made about one seat.
    const v = isLapsed(
      seating({ termEndsAt: new Date("2026-07-01T00:00:00Z") }),
      role(),
      ctx({ cadence: "never" }),
    );
    expect(v).toEqual({ lapsed: true, reason: "term" });
  });

  it("lets a seat opt out of the season turn on its own card", () => {
    // A treasurer or an entity steward carries across seasons; the whole
    // village turning over is not a reason to vacate the money seat.
    const v = isLapsed(seating({ seasonId: "foundations-2026" }), role({ expiresEachSeason: false }), ctx());
    expect(v.lapsed).toBe(false);
  });

  it("never lapses an already-ended seating", () => {
    const v = isLapsed(
      seating({ endedAt: new Date("2026-01-01T00:00:00Z"), seasonId: "foundations-2026" }),
      role(),
      ctx(),
    );
    expect(v.lapsed).toBe(false);
  });

  it("does not lapse anything when there is no season running", () => {
    // An open-ended founding season, or a village with no calendar yet.
    const v = isLapsed(seating({ seasonId: "foundations-2026" }), role(), ctx({ currentSeasonId: null }));
    expect(v.lapsed).toBe(false);
  });
});

describe("what a seat reads as", () => {
  it("reads expired when every holder has lapsed, and NOT filled", () => {
    // The bug this exists to stop: a seat whose holders all lapsed months ago
    // reading as comfortably filled, so nobody ever reviews it.
    expect(seatState(role({ seats: 1 }), [{ lapsed: true }])).toBe("expired");
    expect(seatState(role({ seats: 2 }), [{ lapsed: true }, { lapsed: true }])).toBe("expired");
  });

  it("reads partial when some holders are current and the seat wants more", () => {
    expect(seatState(role({ seats: 2 }), [{ lapsed: false }, { lapsed: true }])).toBe("partial");
  });

  it("reads filled when the current holders fill it", () => {
    expect(seatState(role({ seats: 2 }), [{ lapsed: false }, { lapsed: false }])).toBe("filled");
  });

  it("reads open when nobody holds it at all", () => {
    expect(seatState(role(), [])).toBe("open");
  });

  it("still accepts a plain count, treating every holder as current", () => {
    // The older call shape. It must keep meaning what it always meant.
    expect(seatState(role({ seats: 2 }), 2)).toBe("filled");
    expect(seatState(role({ seats: 2 }), 1)).toBe("partial");
    expect(seatState(role({ seats: 2 }), 0)).toBe("open");
  });

  it("lets an unexpired override win over everything, including a lapse", () => {
    const r = role({
      statusOverride: "filled",
      statusOverrideExpiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    expect(seatState(r, [{ lapsed: true }], NOW)).toBe("filled");
  });

  it("stops honouring an override once it has expired", () => {
    const r = role({
      statusOverride: "filled",
      statusOverrideExpiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(seatState(r, [], NOW)).toBe("open");
  });
});
