/**
 * Determinism tests for the map layout (S20): same data in, identical pixels
 * out, forever. A member's spatial memory of the village is part of the UI
 * contract, so the layout must be a pure function — these tests are what
 * keeps someone from "improving" it with jitter or render-order dependence.
 */
import { describe, expect, it } from "vitest";
import { layoutMap, layoutNestedMap, radiusForLabel, wrapLabel, CANVAS, QUEST_DISPLAY_CAP, type LayoutCircle, type NestedInput } from "./mapLayout";

const circle = (id: string, order: number, extra: Partial<LayoutCircle> = {}): LayoutCircle => ({
  id,
  order,
  memberCount: 3,
  roles: [
    { id: `${id}-lead`, vacant: false },
    { id: `${id}-scribe`, vacant: true },
  ],
  questCount: 2,
  ...extra,
});

describe("layoutMap", () => {
  it("is deterministic: identical input, identical output", () => {
    const data = [circle("a", 1), circle("b", 2), circle("c", 3)];
    expect(layoutMap(data)).toEqual(layoutMap(data));
  });

  it("ignores input array order — only sortOrder places a circle", () => {
    const forward = layoutMap([circle("a", 1), circle("b", 2)]);
    const reversed = layoutMap([circle("b", 2), circle("a", 1)]);
    expect(forward).toEqual(reversed);
  });

  it("puts the first circle at twelve o'clock", () => {
    const l = layoutMap([circle("a", 1), circle("b", 2), circle("c", 3), circle("d", 4)]);
    const a = l.circles.find((c) => c.id === "a")!;
    expect(a.x).toBeCloseTo(CANVAS / 2, 6);
    expect(a.y).toBeLessThan(CANVAS / 2); // above center
  });

  it("scales circle radius with membership, logarithmically", () => {
    const small = layoutMap([circle("a", 1, { memberCount: 1 })]).circles[0].r;
    const big = layoutMap([circle("a", 1, { memberCount: 100 })]).circles[0].r;
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(small * 4); // log, not linear
  });

  it("sorts vacant roles last on the seat orbit", () => {
    const l = layoutMap([
      circle("a", 1, {
        roles: [
          { id: "z-vacant", vacant: true },
          { id: "a-filled", vacant: false },
        ],
      }),
    ]);
    expect(l.circles[0].roles.map((r) => r.id)).toEqual(["a-filled", "z-vacant"]);
  });

  it("caps quest satellites and reports the overflow", () => {
    const l = layoutMap([circle("a", 1, { questCount: QUEST_DISPLAY_CAP + 7 })]);
    expect(l.circles[0].questDots.length).toBe(QUEST_DISPLAY_CAP);
    expect(l.circles[0].questOverflow).toBe(7);
  });
});

// ── The nested layout and its labels ────────────────────────────────────────
//
// layoutNestedMap is what the map actually draws and it had no tests, so the
// canvas could sit at a fixed 1000 while the village drew into 340 of it and
// nothing failed. These two properties are the ones a person notices.

describe("layoutNestedMap canvas", () => {
  const nested = (id: string, order: number, parentId: string | null = null): NestedInput => ({
    id, parentId, order, memberCount: 2,
    roles: [{ id: `${id}-r1`, vacant: false }, { id: `${id}-r2`, vacant: true }],
    questCount: 0,
  });

  it("hugs the village instead of padding out to a fixed canvas", () => {
    const l = layoutNestedMap([nested("a", 1), nested("b", 2), nested("c", 3)]);
    // The drawing must occupy most of the box. Anything under this and the
    // map renders small in a large empty area, which is what it used to do.
    const occupancy = (l.village.r * 2) / l.width;
    expect(occupancy).toBeGreaterThan(0.8);
  });

  it("grows the canvas with the village, never shrinking below it", () => {
    const few = layoutNestedMap([nested("a", 1)]);
    const many = layoutNestedMap(
      Array.from({ length: 12 }, (_, i) => nested(`c${i}`, i)),
    );
    expect(many.width).toBeGreaterThan(few.width);
    // Nothing is ever drawn outside the box.
    for (const l of [few, many]) {
      expect(l.village.x + l.village.r).toBeLessThanOrEqual(l.width);
      expect(l.village.x - l.village.r).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic: same input, same picture", () => {
    const input = [nested("a", 1), nested("b", 2, "a"), nested("c", 3)];
    expect(JSON.stringify(layoutNestedMap(input))).toBe(JSON.stringify(layoutNestedMap(input)));
  });
});

describe("wrapLabel", () => {
  it("wraps a long circle name to fit its circle", () => {
    // The layout gives this name a circle big enough to hold it.
    const r = radiusForLabel("Intergenerational Wisdom Council");
    const w = wrapLabel("Intergenerational Wisdom Council", r, 1);
    expect(w.lines.length).toBeGreaterThan(1);
    // Every line fits inside the CLEAR interior, not merely inside the circle.
    const widest = Math.max(...w.lines.map((l) => l.length * w.fontSize * 0.55));
    expect(widest).toBeLessThanOrEqual((r - 20 - 11) * 1.8 + 1);
  });

  it("keeps a short name on one line at full size", () => {
    const w = wrapLabel("Land", 90, 0);
    expect(w.lines).toEqual(["Land"]);
    expect(w.fontSize).toBe(17);
  });

  it("never exceeds three lines, clipping instead of covering the map", () => {
    const w = wrapLabel("A Very Long Council Name That Simply Will Not Fit Anywhere", 26, 2);
    expect(w.lines.length).toBeLessThanOrEqual(3);
  });

  it("shrinks the font for a tight circle rather than overflowing it", () => {
    const roomy = wrapLabel("Regenerative Agriculture", 120, 1);
    const tight = wrapLabel("Regenerative Agriculture", 34, 1);
    expect(tight.fontSize).toBeLessThan(roomy.fontSize);
  });

  it("survives an empty name", () => {
    expect(wrapLabel("", 50, 0).lines).toEqual([""]);
  });
});

describe("radiusForLabel", () => {
  it("gives a long-named circle room its name actually needs", () => {
    expect(radiusForLabel("Intergenerational Wisdom Council")).toBeGreaterThan(
      radiusForLabel("Land"),
    );
  });

  it("sizes every circle so its own name fits inside its seat ring", () => {
    for (const name of [
      "Intergenerational Wisdom Council",
      "Regenerative Agriculture & Permaculture Circle",
      "General Coordinating Circle",
      "Land",
    ]) {
      const r = radiusForLabel(name);
      const w = wrapLabel(name, r, 1);
      const widest = Math.max(...w.lines.map((l) => l.length * w.fontSize * 0.55));
      expect(widest).toBeLessThanOrEqual((r - 20 - 11) * 1.8 + 1);
      // And nothing had to be cut to get there.
      expect(w.lines.join(" ")).not.toContain("…");
    }
  });
});
