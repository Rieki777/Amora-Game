/**
 * The two clocks, proven with no database at all.
 *
 * Every rule here is one sentence of the founder's, read literally:
 *
 *  - a token send chosen at_acceptance executes at close;
 *  - a Game change never executes at close, and chosen at_acceptance lands at
 *    closes_at + 72 hours;
 *  - anything chosen next_moon lands at the LATER of the next new moon and
 *    closes_at + 72 hours, which is the late-carry jump;
 *  - a bundle mixing the two is wholly a Game change;
 *  - the seat carve-out executes at pass with no window at all;
 *  - a veto at the landing instant is too late.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMING,
  executesAtPassWithNoWindow,
  kindOfItem,
  kindOfSet,
  kindOfSubject,
  landingFor,
  lateVetoRefusal,
  timingOf,
  vetoHoursFrom,
  vetoIsInTime,
  VETO_HOURS_FLOOR,
} from "./governanceKinds";

const CLOSE = new Date("2026-09-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
/** A moon far away, so the window is never the later of the two. */
const farMoon = () => new Date(CLOSE.getTime() + 20 * 24 * HOUR);
/** A moon inside the window, so the 72 hours wins. */
const nearMoon = () => new Date(CLOSE.getTime() + 6 * HOUR);

describe("what kind of decision this is", () => {
  it("classifies an unknown subject as a Game change, which is the fail-safe direction", () => {
    expect(kindOfSubject("something_a_later_lane_added")).toBe("game_change");
    expect(kindOfSubject("mechanics")).toBe("game_change");
    expect(kindOfSubject("token_send")).toBe("token_send");
  });

  it("calls a weight allocation a Game change, because it writes a number and never a token", () => {
    expect(kindOfItem("weight_allocation")).toBe("game_change");
    expect(kindOfItem("mint_rule")).toBe("game_change");
    expect(kindOfItem("token_send")).toBe("token_send");
  });

  it("makes a bundle mixing the two wholly a Game change", () => {
    expect(kindOfSet(["token_send"])).toBe("token_send");
    expect(kindOfSet(["token_send", "dial"])).toBe("game_change");
    expect(kindOfSet([])).toBe("game_change");
  });
});

describe("the timing choice", () => {
  it("defaults to the new moon and reads anything else back total", () => {
    expect(DEFAULT_TIMING).toBe("next_moon");
    expect(timingOf(undefined)).toBe("next_moon");
    expect(timingOf("AT_ACCEPTANCE")).toBe("at_acceptance");
    expect(timingOf("whatever")).toBe("next_moon");
  });

  it("floors the window at 72 hours and lets a village give longer", () => {
    expect(vetoHoursFrom(1)).toBe(VETO_HOURS_FLOOR);
    expect(vetoHoursFrom(undefined)).toBe(72);
    expect(vetoHoursFrom(168)).toBe(168);
  });
});

describe("when a carried decision lands", () => {
  it("executes a token send chosen at_acceptance at the close, with no window", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "token_send", timing: "at_acceptance", vetoHours: 72, nextNewMoonAfter: farMoon });
    expect(l.executesAtClose).toBe(true);
    expect(l.landsAt).toBeNull();
    expect(l.vetoClosesAt).toBeNull();
  });

  it("never executes a Game change at the close, even chosen at_acceptance", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "game_change", timing: "at_acceptance", vetoHours: 72, nextNewMoonAfter: farMoon });
    expect(l.executesAtClose).toBe(false);
    expect(l.landsAt?.toISOString()).toBe(new Date(CLOSE.getTime() + 72 * HOUR).toISOString());
    expect(l.vetoClosesAt?.toISOString()).toBe(l.landsAt?.toISOString());
  });

  it("lands on the new moon when the vote closes with more than 72 hours of the lunation left", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "game_change", timing: "next_moon", vetoHours: 72, nextNewMoonAfter: farMoon });
    expect(l.landsAt?.toISOString()).toBe(farMoon().toISOString());
  });

  it("lands at closes_at plus 72 hours when the vote closes on the last day", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "game_change", timing: "next_moon", vetoHours: 72, nextNewMoonAfter: nearMoon });
    expect(l.landsAt?.toISOString()).toBe(new Date(CLOSE.getTime() + 72 * HOUR).toISOString());
    expect(l.because).toContain("72");
  });

  it("gives a token send chosen next_moon a window like anything else", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "token_send", timing: "next_moon", vetoHours: 72, nextNewMoonAfter: farMoon });
    expect(l.executesAtClose).toBe(false);
    expect(l.landsAt?.toISOString()).toBe(farMoon().toISOString());
  });

  it("honours a village that gives its stewards longer than the floor", () => {
    const l = landingFor({ closesAt: CLOSE, kind: "game_change", timing: "at_acceptance", vetoHours: 168, nextNewMoonAfter: farMoon });
    expect(l.landsAt?.toISOString()).toBe(new Date(CLOSE.getTime() + 168 * HOUR).toISOString());
  });

  it("executes a seating at pass with no window, so a seat cannot hold its own removal", () => {
    expect(executesAtPassWithNoWindow("role_unseat")).toBe(true);
    expect(executesAtPassWithNoWindow("role_seat")).toBe(true);
    expect(executesAtPassWithNoWindow("mechanics")).toBe(false);
    const l = landingFor({ closesAt: CLOSE, kind: "game_change", timing: "next_moon", vetoHours: 72, nextNewMoonAfter: farMoon, noWindow: true });
    expect(l.executesAtClose).toBe(true);
    expect(l.landsAt).toBeNull();
  });
});

describe("the window's edge", () => {
  const landsAt = new Date(CLOSE.getTime() + 72 * HOUR);

  it("allows a veto a second before the instant", () => {
    expect(vetoIsInTime(landsAt, new Date(landsAt.getTime() - 1000))).toBe(true);
  });

  it("refuses one AT the instant, so a tie is never decided by tick phase", () => {
    expect(vetoIsInTime(landsAt, landsAt)).toBe(false);
    expect(vetoIsInTime(landsAt, new Date(landsAt.getTime() + 1000))).toBe(false);
  });

  it("refuses a veto on something with no window at all", () => {
    expect(vetoIsInTime(null, CLOSE)).toBe(false);
  });

  it("names the instant it missed", () => {
    expect(lateVetoRefusal(landsAt)).toContain(landsAt.toISOString());
  });
});
