/**
 * The season-pattern resolution rule, tested where it is decidable without a
 * database: given the membership rows, what is live?
 *
 * The rule this file exists to protect: a row with NO pattern memberships at
 * all is PERMANENT and always live. That is what makes patterns safe to ship
 * to villages that never asked for them, and it is the property most likely
 * to be broken by a well-meaning refactor that treats "not in this pattern"
 * and "in no pattern" as the same thing.
 */
import { describe, expect, it } from "vitest";
import { resolveLive, type PatternMember } from "../server/lib/seasonPatterns";

const m = (patternId: string, kind: PatternMember["kind"], entityId: string): PatternMember => ({
  patternId, kind, entityId,
});

describe("season pattern resolution", () => {
  it("governs nothing when no pattern names anything of that kind", () => {
    // A village that has never used patterns. Every circle stays exactly as
    // it is, and a roll has nothing to say about any of them.
    expect(resolveLive([], "circle", "festival")).toBeNull();
    expect(resolveLive([m("festival", "quest", "q1")], "circle", "festival")).toBeNull();
  });

  it("leaves a row nobody named alone, forever", () => {
    const members = [m("festival", "circle", "kitchen")];
    const res = resolveLive(members, "circle", "festival")!;
    // The kitchen is governed by patterns; the land circle is not, so it is
    // permanent and a roll must never touch it.
    expect(res.governed.has("kitchen")).toBe(true);
    expect(res.governed.has("land")).toBe(false);
  });

  it("distinguishes 'not in this pattern' from 'in no pattern'", () => {
    // Gate is in the festival pattern only. During the building season it is
    // governed and NOT live, which is a real instruction to put it to sleep.
    // Land is in neither, which is not an instruction at all.
    const members = [m("festival", "org_role", "gate"), m("building", "org_role", "foreman")];
    const building = resolveLive(members, "org_role", "building")!;
    expect(building.governed.has("gate")).toBe(true);
    expect(building.live.has("gate")).toBe(false);
    expect(building.governed.has("land-steward")).toBe(false);
  });

  it("lets one row belong to several patterns at once", () => {
    // Land Steward runs in both seasons. It is live in each, and it is ONE
    // row: no copy, so its history is continuous across every season.
    const members = [
      m("festival", "org_role", "land-steward"),
      m("building", "org_role", "land-steward"),
      m("festival", "org_role", "gate"),
    ];
    expect(resolveLive(members, "org_role", "festival")!.live.has("land-steward")).toBe(true);
    expect(resolveLive(members, "org_role", "building")!.live.has("land-steward")).toBe(true);
    expect(resolveLive(members, "org_role", "building")!.live.has("gate")).toBe(false);
  });

  it("puts every governed row to sleep when no pattern is running", () => {
    const members = [m("festival", "quest", "gate-shift"), m("building", "quest", "pour-the-pad")];
    const none = resolveLive(members, "quest", null)!;
    expect(none.governed.size).toBe(2);
    expect(none.live.size).toBe(0);
  });

  it("is unaffected by an unknown pattern id", () => {
    // A season pointing at a pattern that was deleted must not quietly make
    // everything live; it makes nothing live, which reads as "off season".
    const members = [m("festival", "badge", "held-the-gate")];
    const res = resolveLive(members, "badge", "does-not-exist")!;
    expect(res.live.size).toBe(0);
    expect(res.governed.has("held-the-gate")).toBe(true);
  });

  it("keeps kinds separate", () => {
    // A badge and a seat can share an id without one deciding the other.
    const members = [m("festival", "badge", "gate"), m("building", "org_role", "gate")];
    expect(resolveLive(members, "badge", "festival")!.live.has("gate")).toBe(true);
    expect(resolveLive(members, "org_role", "festival")!.live.has("gate")).toBe(false);
    expect(resolveLive(members, "org_role", "building")!.live.has("gate")).toBe(true);
  });
});
