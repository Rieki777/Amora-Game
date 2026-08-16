/**
 * The wheel's arithmetic: the CycleClock ring that never filled, and the
 * two-ring year wheel's arcs (0085).
 */
import { describe, expect, it } from "vitest";
import { SYNODIC_MONTH_DAYS, moonPhase } from "./lunar";
import { gregorianMonthArcs, instantYearAngle, lunarMonthArcs, solarSpokes, wheelState } from "./wheel";

describe("wheelState and the CycleClock fix", () => {
  it("fills the lunation ring from the moon's age in days, not from a 0..1 phase", () => {
    // Half a lunation in: passing the phase itself gave 0.5 / 29.53, about
    // 1.7%, so the ring never visibly filled. The age in days fills it half.
    const phase = 0.5;
    expect(wheelState(new Date("2026-08-16T00:00:00Z"), phase, "north").lunationFraction).toBeLessThan(0.02);
    expect(wheelState(new Date("2026-08-16T00:00:00Z"), phase * SYNODIC_MONTH_DAYS, "north").lunationFraction).toBeCloseTo(0.5, 2);
    // And a real date: 2026-08-16 is four days into the lunation.
    const now = new Date("2026-08-16T12:00:00Z");
    const f = wheelState(now, moonPhase(now) * SYNODIC_MONTH_DAYS, "north").lunationFraction;
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.2);
  });
});

describe("the two-ring year wheel", () => {
  it("places instants on the year circle in village time, leap-aware", () => {
    expect(instantYearAngle(new Date("2026-01-01T06:00:00Z"), 2026, "America/Costa_Rica")).toBe(0);
    // Noon on 2 July 2026 (a 365-day year): day index 182 and a half.
    expect(instantYearAngle(new Date("2026-07-02T18:00:00Z"), 2026, "America/Costa_Rica")).toBeCloseTo(182.5 / 365, 6);
    // 1 March in a leap year is day 60; 2028 is one.
    expect(instantYearAngle(new Date("2028-03-01T06:00:00Z"), 2028, "America/Costa_Rica")).toBeCloseTo(60 / 366, 6);
    // Outside the year: clamped.
    expect(instantYearAngle(new Date("2025-06-01T00:00:00Z"), 2026, "UTC")).toBe(0);
    expect(instantYearAngle(new Date("2027-06-01T00:00:00Z"), 2026, "UTC")).toBe(1);
  });

  it("draws twelve month arcs that tile the circle", () => {
    const arcs = gregorianMonthArcs(2026);
    expect(arcs).toHaveLength(12);
    expect(arcs[0].startAngle).toBe(0);
    expect(arcs[11].endAngle).toBe(1);
    for (let i = 1; i < 12; i++) expect(arcs[i].startAngle).toBe(arcs[i - 1].endAngle);
    expect(arcs[1].endAngle - arcs[1].startAngle).toBeCloseTo(28 / 365, 6);
    expect(gregorianMonthArcs(2028)[1].endAngle - gregorianMonthArcs(2028)[1].startAngle).toBeCloseTo(29 / 366, 6);
  });

  it("draws the true lunations of the year as arcs of real length, labelled by the village's lunar year", () => {
    const arcs = lunarMonthArcs(2026, "december_solstice", "America/Costa_Rica");
    // 2026 touches thirteen lunations: the tail of the 2025 lunar year's
    // last moon (started 20 Dec 2025) plus the twelve of the year opened by
    // the 2025 solstice, the last of which runs into January 2027.
    expect(arcs).toHaveLength(13);
    expect(arcs[0].clippedStart).toBe(true);
    expect(arcs[0].anchorYear).toBe(2024);
    expect(arcs[arcs.length - 1].clippedEnd).toBe(true);
    // The moon opened by 2026-01-18's new moon is Moon 1 of the year the 2025 solstice opened.
    const first = arcs.find((a) => a.startsAt.toISOString().slice(0, 10) === "2026-01-18")!;
    expect(first.index).toBe(1);
    expect(first.anchorYear).toBe(2025);
    expect(first.monthCount).toBe(12);
    // Arcs tile: each begins where the last ended, and a lunation is about 29.5 days of the circle.
    for (let i = 1; i < arcs.length; i++) expect(arcs[i].startAngle).toBeCloseTo(arcs[i - 1].endAngle, 6);
    expect(first.endAngle - first.startAngle).toBeCloseTo(29.5 / 365, 2);
  });

  it("puts the four solar spokes on the true instants, named for the hemisphere", () => {
    const north = solarSpokes(2026, "north", "America/Costa_Rica");
    expect(north.map((s) => s.label)).toEqual(["Equal Day & Night", "Longest Day", "Equal Day & Night", "Shortest Day"]);
    expect(north[1].at.toISOString().slice(0, 10)).toBe("2026-06-21");
    expect(north[1].angle).toBeCloseTo(171.35 / 365, 2);
    const south = solarSpokes(2026, "south", "Australia/Sydney");
    expect(south.map((s) => s.label)).toEqual(["Equal Day & Night", "Shortest Day", "Equal Day & Night", "Longest Day"]);
    // Outside the table, the fixed civil dates stand in.
    expect(solarSpokes(1990, "north", "UTC")[3].at.toISOString().slice(0, 10)).toBe("1990-12-21");
  });
});
