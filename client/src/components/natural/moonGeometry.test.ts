/**
 * The founder's ruling has a testable core: "for the moon completion icon it
 * should have a graphical phase for at least each 12.5% illumination". A
 * component that draws the same shape at 25% and at 37.5% fails that, and it
 * fails it silently, because both look like a moon.
 *
 * So the nine steps are checked as GEOMETRY, three ways:
 *
 *   1. every pair of steps produces a different path string,
 *   2. the terminator radius and the sweep flag move the way the derivation
 *      says they do, which is what makes the strings differ for a reason,
 *   3. the lit width across the equator rises monotonically, which is the
 *      property a reader actually perceives as "more done".
 *
 * String inequality alone would pass on a rounding wobble. The three together
 * do not.
 */
import { describe, expect, it } from "vitest";
import { moonPhase, moonPhaseName } from "@shared/lunar";
import {
  MOON_STEPS,
  clamp01,
  illuminatedFraction,
  litPath,
  litSideOf,
  moonPathParts,
  readLunation,
  readProgress,
  terminatorPath,
  terminatorRadius,
  waxingPhase,
} from "./moonGeometry";

const R = 34;
const path = (f: number, side: "right" | "left" = "right") =>
  litPath({ cx: 50, cy: 50, r: R, fraction: f, side });

/** How wide the lit region is across the middle of the disc, in units. */
const litWidth = (f: number) => {
  const { terminator, crescent } = moonPathParts(R, f);
  return crescent ? R - terminator : R + terminator;
};

describe("the nine steps of the ruling", () => {
  it("names nine steps, one every 12.5%", () => {
    expect(MOON_STEPS).toHaveLength(9);
    MOON_STEPS.forEach((f, i) => expect(f).toBeCloseTo(i / 8, 10));
  });

  it("draws a different path at every step, not only at adjacent ones", () => {
    const seen = new Map<string, number>();
    for (const f of MOON_STEPS) {
      const d = path(f);
      expect(seen.has(d)).toBe(false);
      seen.set(d, f);
    }
    expect(seen.size).toBe(9);
  });

  it("differs between each adjacent pair", () => {
    for (let i = 1; i < MOON_STEPS.length; i++) {
      expect(path(MOON_STEPS[i])).not.toBe(path(MOON_STEPS[i - 1]));
    }
  });

  it("moves the terminator and flips the sweep where the derivation says", () => {
    // a = r * |1 - 2f|: falls to zero at the half and climbs back out.
    const radii = MOON_STEPS.map((f) => Math.round(terminatorRadius(R, f) * 1000) / 1000);
    expect(radii).toEqual([34, 25.5, 17, 8.5, 0, 8.5, 17, 25.5, 34]);

    // The sweep flag is what separates 37.5% from 62.5%, which share a radius.
    expect(moonPathParts(R, 0.375).terminatorSweep).toBe(0);
    expect(moonPathParts(R, 0.625).terminatorSweep).toBe(1);
    expect(moonPathParts(R, 0.375).crescent).toBe(true);
    expect(moonPathParts(R, 0.625).crescent).toBe(false);
    expect(path(0.375)).not.toBe(path(0.625));
  });

  it("widens the lit region monotonically, 0 to the full diameter", () => {
    const widths = MOON_STEPS.map(litWidth);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
    expect(widths[0]).toBeCloseTo(0, 10);
    expect(widths[8]).toBeCloseTo(2 * R, 10);
    // The identity the derivation rests on: the width is 2*r*f at every step.
    MOON_STEPS.forEach((f, i) => expect(widths[i]).toBeCloseTo(2 * R * f, 10));
  });

  it("puts both arcs in the path at every step above new", () => {
    for (const f of MOON_STEPS.slice(1)) {
      const d = path(f);
      expect(d.startsWith("M 50 16")).toBe(true);
      expect(d.match(/ A /g)).toHaveLength(2);
      expect(d.endsWith("Z")).toBe(true);
    }
  });
});

describe("edges", () => {
  it("draws nothing at a new moon", () => {
    expect(path(0)).toBe("");
    expect(path(-1)).toBe("");
  });

  it("closes the whole disc at full", () => {
    expect(path(1)).toBe("M 50 16 A 34 34 0 0 1 50 84 A 34 34 0 0 1 50 16 Z");
    // Both arcs carry the disc radius, so the outline IS the circle.
    expect(terminatorRadius(R, 1)).toBe(R);
  });

  it("clamps out of range values instead of drawing nonsense", () => {
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(path(4)).toBe(path(1));
    expect(readProgress(9).percent).toBe(100);
    expect(readProgress(-9).percent).toBe(0);
  });

  it("draws the straight terminator at exactly half", () => {
    expect(terminatorRadius(R, 0.5)).toBe(0);
    // rx of 0 is an SVG lineto, which is the half moon's flat edge.
    expect(path(0.5)).toContain("A 0 34 0 0 1 50 16");
  });

  it("mirrors the left limb without repeating a right limb path", () => {
    for (const f of MOON_STEPS.slice(1, -1)) {
      expect(path(f, "left")).not.toBe(path(f, "right"));
    }
    expect(moonPathParts(R, 0.25, "left").limbSweep).toBe(0);
    expect(moonPathParts(R, 0.25, "right").limbSweep).toBe(1);
  });
});

describe("the threshold line: the terminator a moon has yet to reach", () => {
  const line = (f: number, side: "right" | "left" = "right") =>
    terminatorPath({ cx: 50, cy: 50, r: R, fraction: f, side });
  /** The rx, ry and sweep flag out of a one-arc path. */
  const arc = (d: string) => {
    const m = d.match(/A (\S+) (\S+) 0 0 (\d)/);
    if (!m) throw new Error(`no arc in ${d}`);
    return { rx: Number(m[1]), ry: Number(m[2]), sweep: Number(m[3]) };
  };

  it("is one arc, top of the disc to the bottom, and never closes", () => {
    for (const f of MOON_STEPS) {
      const d = line(f);
      expect(d.startsWith("M 50 16")).toBe(true);
      expect(d.endsWith("50 84")).toBe(true);
      expect(d.match(/ A /g)).toHaveLength(1);
      expect(d).not.toContain("Z");
    }
  });

  it("carries the same terminator radius the lit region has at that fraction", () => {
    for (const f of MOON_STEPS) {
      expect(arc(line(f)).rx).toBeCloseTo(terminatorRadius(R, f), 3);
      expect(arc(line(f)).ry).toBe(R);
    }
  });

  it("bows the same way the lit edge does, walked the other way", () => {
    // litPath runs the terminator bottom to top; this runs it top to bottom,
    // so the flag is the complement and the CURVE is the same curve.
    for (const f of MOON_STEPS) {
      expect(arc(line(f)).sweep).toBe(1 - moonPathParts(R, f).terminatorSweep);
    }
  });

  it("draws a different line at every one of the nine steps", () => {
    const seen = new Set(MOON_STEPS.map((f) => line(f)));
    expect(seen.size).toBe(9);
  });

  it("is the straight half at 50%, and the two limbs at the ends", () => {
    expect(arc(line(0.5)).rx).toBe(0);
    expect(arc(line(0)).rx).toBe(R);
    expect(arc(line(1)).rx).toBe(R);
    // Nothing yet and everything are opposite limbs, never the same line.
    expect(line(0)).not.toBe(line(1));
  });

  it("clamps a threshold from outside the disc instead of drawing nonsense", () => {
    expect(line(4)).toBe(line(1));
    expect(line(-1)).toBe(line(0));
    expect(line(Number.NaN)).toBe(line(0));
  });

  it("mirrors onto the other limb when the light does", () => {
    for (const f of MOON_STEPS.slice(1, -1)) {
      expect(line(f, "left")).not.toBe(line(f, "right"));
    }
  });

  it("meets the lit edge exactly when the value reaches the threshold", () => {
    // The point of the whole drawing: at value == threshold the line the moon
    // is chasing IS the edge of its own light.
    for (const f of MOON_STEPS.slice(1)) {
      const lit = path(f);
      const { rx, ry } = arc(line(f));
      expect(lit).toContain(`A ${rx} ${ry} 0 0 ${moonPathParts(R, f).terminatorSweep}`);
    }
  });
});

describe("it speaks shared/lunar's language, and does not invent a second one", () => {
  it("names every step with moonPhaseName", () => {
    const names = MOON_STEPS.map((f) => readProgress(f).phaseName);
    expect(names).toEqual([
      "New moon",
      "Waxing crescent",
      "Waxing crescent",
      "Waxing crescent",
      "First quarter",
      "Waxing gibbous",
      "Waxing gibbous",
      "Waxing gibbous",
      "Full moon",
    ]);
    // Not a copied table: every one is whatever shared/lunar says today.
    for (const f of MOON_STEPS) {
      expect(readProgress(f).phaseName).toBe(moonPhaseName(waxingPhase(f)));
    }
  });

  it("reads out the number and the phase together", () => {
    expect(readProgress(0.62).label).toBe("62 percent, waxing gibbous");
    expect(readProgress(0).label).toBe("0 percent, new moon");
    expect(readProgress(1).label).toBe("100 percent, full moon");
  });

  it("never wanes in progress mode", () => {
    for (let f = 0; f <= 1.0001; f += 0.01) {
      expect(readProgress(f).side).toBe("right");
      expect(waxingPhase(f)).toBeLessThanOrEqual(0.5 + 1e-12);
    }
  });

  it("inverts illuminatedFraction over the waxing half", () => {
    for (const f of MOON_STEPS) {
      expect(illuminatedFraction(waxingPhase(f))).toBeCloseTo(f, 10);
    }
  });
});

describe("lunation mode, for displays that really are cyclical", () => {
  it("wanes after the full moon and lights the other limb", () => {
    expect(litSideOf(0.1)).toBe("right");
    expect(litSideOf(0.49)).toBe("right");
    expect(litSideOf(0.51)).toBe("left");
    expect(readLunation(0.75).side).toBe("left");
    expect(readLunation(0.75).phaseName).toBe("Last quarter");
  });

  it("rises to full at the middle of the month and falls back to new", () => {
    expect(readLunation(0).fraction).toBeCloseTo(0, 10);
    expect(readLunation(0.25).fraction).toBeCloseTo(0.5, 10);
    expect(readLunation(0.5).fraction).toBeCloseTo(1, 10);
    expect(readLunation(0.75).fraction).toBeCloseTo(0.5, 10);
    expect(readLunation(0.5).phaseName).toBe("Full moon");
  });

  it("normalises a phase from outside 0 to 1", () => {
    expect(readLunation(1.25).fraction).toBeCloseTo(readLunation(0.25).fraction, 10);
    expect(readLunation(-0.25).side).toBe("left");
  });

  it("takes the real clock's phase straight from shared/lunar", () => {
    // Any instant inside the checked-in table: the point is that the value
    // moonPhase returns is exactly what readLunation expects.
    const p = moonPhase(new Date("2026-08-22T12:00:00Z"));
    const read = readLunation(p);
    expect(read.phaseName).toBe(moonPhaseName(p));
    expect(read.fraction).toBeGreaterThanOrEqual(0);
    expect(read.fraction).toBeLessThanOrEqual(1);
    expect(litPath({ cx: 50, cy: 50, r: R, fraction: read.fraction, side: read.side })).not.toBe("");
  });
});
