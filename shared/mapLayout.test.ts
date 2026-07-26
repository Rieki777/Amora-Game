/**
 * Determinism tests for the map layout (S20): same data in, identical pixels
 * out, forever. A member's spatial memory of the village is part of the UI
 * contract, so the layout must be a pure function — these tests are what
 * keeps someone from "improving" it with jitter or render-order dependence.
 */
import { describe, expect, it } from "vitest";
import { layoutMap, CANVAS, QUEST_DISPLAY_CAP, type LayoutCircle } from "./mapLayout";

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
