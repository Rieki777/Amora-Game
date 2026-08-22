/**
 * The two decisions behind every celebration this product plays.
 *
 * `arrivalStep` is the guard on the founder's rule that nothing animates that
 * a person did not cause. Its whole job is to tell news from history, and the
 * expensive failure is the quiet one: a card that throws petals on mount
 * because a fetch resolved is celebrating a page load, not an event.
 */
import { describe, expect, it } from "vitest";
import { arrivalStep, countUpAt } from "./moments";

describe("arrivalStep", () => {
  it("stays silent on the first real reading, however exciting it is", () => {
    // A quest consented last Tuesday, seen for the first time on mount.
    expect(arrivalStep(null, "consented")).toEqual({ seen: "consented", fire: false });
  });

  it("seeds the baseline from that first reading", () => {
    expect(arrivalStep(null, "consented").seen).toBe("consented");
  });

  it("fires on a change between two states it watched change", () => {
    expect(arrivalStep("submitted", "consented")).toEqual({ seen: "consented", fire: true });
  });

  it("does not fire when the state is unchanged", () => {
    expect(arrivalStep("consented", "consented").fire).toBe(false);
  });

  it("treats unknown as no state at all: it neither seeds nor fires", () => {
    // The render before a fetch resolves. Seeding here would make the FIRST
    // real value look like a change and celebrate every page load.
    expect(arrivalStep(null, undefined)).toEqual({ seen: null, fire: false });
    expect(arrivalStep(null, null)).toEqual({ seen: null, fire: false });
  });

  it("keeps its baseline across a reading that went unknown again", () => {
    // A refetch that briefly clears the data must not re-arm the celebration.
    const seeded = arrivalStep(null, "consented").seen;
    const blank = arrivalStep(seeded, undefined);
    expect(blank).toEqual({ seen: "consented", fire: false });
    expect(arrivalStep(blank.seen, "consented").fire).toBe(false);
  });

  it("fires once per change, not once per render", () => {
    let seen: string | null = null;
    const fires: boolean[] = [];
    for (const key of [undefined, "submitted", "submitted", "consented", "consented", "consented"]) {
      const step = arrivalStep(seen, key);
      seen = step.seen;
      fires.push(step.fire);
    }
    expect(fires).toEqual([false, false, false, true, false, false]);
  });
});

describe("countUpAt", () => {
  it("is exact at both ends, so the number read is the number granted", () => {
    expect(countUpAt(120, 0)).toBe(0);
    expect(countUpAt(120, 1)).toBe(120);
  });

  it("clamps past the ends rather than overshooting the grant", () => {
    expect(countUpAt(120, -0.5)).toBe(0);
    expect(countUpAt(120, 4)).toBe(120);
  });

  it("rises and never falls", () => {
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = countUpAt(250, t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("settles rather than stops: most of the distance is covered early", () => {
    // Ease out cubic puts the halfway value well past half.
    expect(countUpAt(100, 0.5)).toBeGreaterThan(50);
  });

  it("handles a zero grant without dividing anything by it", () => {
    expect(countUpAt(0, 0.5)).toBe(0);
  });
});
