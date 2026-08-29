/**
 * THE CHECK THAT COULD HAVE CAUGHT IT.
 *
 * Three of the five outer labels on `/village-health` were painted outside
 * the picture and read "ed", "He" and "0 t" on screen while the DOM held
 * "Water protected", "Hectares in restoration" and "0 liters to date". Every
 * text assertion in the repository passed on that, because every one of them
 * asked the DOM, and the DOM was right.
 *
 * So this asks the only question that was actually being got wrong: does the
 * rectangle each label occupies land inside the viewBox. It runs on the REAL
 * metric names out of `shared/healthMetrics.ts`, so adding a longer metric to
 * that list, or nudging the ring geometry outward, turns this red instead of
 * shipping another clipped word.
 *
 * It is pure arithmetic on purpose. A check that needs a browser to run is a
 * check that stops being run.
 */
import { describe, expect, it } from "vitest";
import { REGEN_METRICS } from "@shared/healthMetrics";
import {
  DOUGHNUT,
  DOUGHNUT_VIEWBOX,
  LABEL_BUDGET,
  boxInside,
  outerLabelBox,
  outerLabelPlacement,
  textWidth,
  viewBoxBounds,
} from "./doughnutLayout";

/** The second line the page writes under each name. */
const valueLine = (total: string, unit: string) => `${total} ${unit} to date`;

describe("the doughnut's outer labels", () => {
  const view = viewBoxBounds(DOUGHNUT_VIEWBOX);

  it("has metrics to place at all", () => {
    // The floor is the control. Without it, a filter that returns nothing
    // would make every assertion below pass over an empty set.
    expect(REGEN_METRICS.length).toBeGreaterThanOrEqual(5);
    expect(REGEN_METRICS.map((m) => m.label)).toContain("Hectares in restoration");
  });

  it("keeps every label inside the viewBox at a village's first reading", () => {
    const outside: string[] = [];
    REGEN_METRICS.forEach((m, i) => {
      const box = outerLabelBox(REGEN_METRICS.length, i, m.label, valueLine("0", m.unit));
      if (!boxInside(box, view)) outside.push(`${m.label} -> ${JSON.stringify(box)}`);
    });
    expect(outside).toEqual([]);
  });

  it("keeps every label inside the viewBox once the numbers have grown", () => {
    // A running total is cumulative and the widest line on the card is
    // usually the number, not the name.
    const outside: string[] = [];
    REGEN_METRICS.forEach((m, i) => {
      const box = outerLabelBox(REGEN_METRICS.length, i, m.label, valueLine("1,000,000", m.unit));
      if (!boxInside(box, view)) outside.push(`${m.label} -> ${JSON.stringify(box)}`);
    });
    expect(outside).toEqual([]);
  });

  it("holds the budget the viewBox was sized against", () => {
    // If a longer metric name or unit lands, this fails before the geometry
    // does, and names which number to re-derive the viewBox from.
    for (const m of REGEN_METRICS) {
      expect(m.label.length).toBeLessThanOrEqual(LABEL_BUDGET.labelChars);
      expect(valueLine("1,000,000", m.unit).length).toBeLessThanOrEqual(LABEL_BUDGET.valueChars);
    }
  });

  it("fails on the viewBox that shipped the defect", () => {
    // The falsification, in the same file as the fix. If this ever passes,
    // the check above has stopped measuring anything.
    const old = viewBoxBounds("0 0 720 720");
    const clipped = REGEN_METRICS.filter((m, i) =>
      !boxInside(outerLabelBox(REGEN_METRICS.length, i, m.label, valueLine("0", m.unit)), old),
    ).map((m) => m.label);
    // The three QA saw cut, by name: the two side labels and the bottom one.
    expect(clipped).toContain("Hectares in restoration");
    expect(clipped).toContain("Water protected");
    expect(clipped).toContain("Food produced");
  });

  it("sends each label away from the picture rather than across it", () => {
    const n = REGEN_METRICS.length;
    for (let i = 0; i < n; i++) {
      const p = outerLabelPlacement(n, i);
      const side = Math.cos(p.angle);
      if (p.anchor === "start") expect(side).toBeGreaterThan(0);
      if (p.anchor === "end") expect(side).toBeLessThan(0);
    }
  });

  it("over-estimates text width rather than under-estimating it", () => {
    // The direction of the error matters: a generous estimate clips nothing.
    expect(textWidth("mmmmm", DOUGHNUT.FONT_LABEL)).toBeGreaterThan(5 * DOUGHNUT.FONT_LABEL * 0.5);
  });
});
