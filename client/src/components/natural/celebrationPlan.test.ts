/**
 * The celebrations are drawn from arithmetic, so the arithmetic is where they
 * can be held to their rules: deterministic layout, an intensity that is a
 * real budget and not a label, and a still state for every kind.
 */
import { describe, expect, it } from "vitest";
import {
  CELEBRATION_KINDS,
  STILL_STATE,
  celebrationCount,
  celebrationDuration,
  celebrationPlan,
  jitter,
} from "./celebrationPlan";

describe("the five moments", () => {
  it("names five, and each one has a still state", () => {
    expect(CELEBRATION_KINDS).toHaveLength(5);
    for (const kind of CELEBRATION_KINDS) {
      expect(STILL_STATE[kind]).toBeTruthy();
      expect(STILL_STATE[kind].length).toBeGreaterThan(10);
    }
  });

  it("plans every kind at both intensities", () => {
    for (const kind of CELEBRATION_KINDS) {
      for (const intensity of ["whisper", "moment"] as const) {
        const plan = celebrationPlan(kind, intensity);
        expect(plan.elements.length).toBe(celebrationCount(kind, intensity));
        expect(plan.elements.length).toBeGreaterThan(0);
        expect(plan.duration).toBeGreaterThan(0);
      }
    }
  });
});

describe("intensity is a budget", () => {
  it("gives a moment more elements and more time than a whisper", () => {
    for (const kind of CELEBRATION_KINDS) {
      expect(celebrationCount(kind, "moment")).toBeGreaterThan(celebrationCount(kind, "whisper"));
      expect(celebrationDuration(kind, "moment")).toBeGreaterThan(celebrationDuration(kind, "whisper"));
    }
  });

  it("keeps a whisper under one and a half seconds", () => {
    for (const kind of CELEBRATION_KINDS) {
      expect(celebrationPlan(kind, "whisper").duration).toBeLessThanOrEqual(1.5);
    }
  });

  it("keeps even a moment under three seconds, so nothing blocks a page", () => {
    for (const kind of CELEBRATION_KINDS) {
      expect(celebrationPlan(kind, "moment").duration).toBeLessThan(3.5);
    }
  });
});

describe("layout is deterministic", () => {
  it("returns the same plan for the same arguments", () => {
    expect(celebrationPlan("fireflies", "moment", 7)).toEqual(celebrationPlan("fireflies", "moment", 7));
  });

  it("scatters differently for a different seed", () => {
    const a = celebrationPlan("seeds", "moment", 1);
    const b = celebrationPlan("seeds", "moment", 2);
    expect(a.elements.map((e) => e.x)).not.toEqual(b.elements.map((e) => e.x));
    // The choreography is untouched: same count, same delays.
    expect(a.elements.map((e) => e.delay)).toEqual(b.elements.map((e) => e.delay));
  });

  it("hashes inside the unit interval, whatever the inputs", () => {
    for (let i = 0; i < 50; i++) {
      const v = jitter(i, i * 13, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("keeps every element inside the drawing box", () => {
    for (const kind of CELEBRATION_KINDS) {
      for (const e of celebrationPlan(kind, "moment", 5).elements) {
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x).toBeLessThanOrEqual(100);
        expect(e.y).toBeGreaterThanOrEqual(0);
        expect(e.y).toBeLessThanOrEqual(100);
        expect(e.scale).toBeGreaterThan(0.6);
        expect(e.scale).toBeLessThan(1.4);
      }
    }
  });

  it("spreads elements across the box rather than clustering", () => {
    const xs = celebrationPlan("fireflies", "moment").elements.map((e) => e.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(50);
  });

  it("starts the first element immediately and staggers the rest", () => {
    const plan = celebrationPlan("seeds", "moment");
    expect(plan.elements[0].delay).toBe(0);
    const delays = plan.elements.map((e) => e.delay);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("counts the last delay into the duration, so onDone fires after the last element", () => {
    const plan = celebrationPlan("fireflies", "moment");
    const last = plan.elements[plan.elements.length - 1].delay;
    expect(plan.duration).toBeCloseTo(celebrationDuration("fireflies", "moment") + last, 6);
  });
});
