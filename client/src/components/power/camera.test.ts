/**
 * The camera's promises (0083, spec 1), as arithmetic.
 *
 * The load-bearing one is the seat rule: a tap on a seat NEVER moves the
 * camera. It is harm metric 2 in the lane brief, and it is asserted here as
 * object identity, which no render-path refactor can quietly weaken.
 */
import { describe, expect, it } from "vitest";
import {
  cameraAfter,
  cameraFor,
  FOCUS_MARGIN,
  focusParam,
  transition,
  viewBoxFor,
  viewFor,
  ZOOM_MS,
  type CameraTarget,
} from "./camera";

const village: CameraTarget = { id: null, cx: 271, cy: 271, r: 248 };
const land: CameraTarget = { id: "land", cx: 107, cy: 263, r: 49 };
const welcome: CameraTarget = { id: "welcome", cx: 271, cy: 271, r: 98 };

describe("cameraAfter", () => {
  it("flies to a tapped circle: [cx, cy, 2r + margin]", () => {
    const next = cameraAfter(cameraFor(village), { kind: "focus", target: land });
    expect(next.focus.id).toBe("land");
    expect(next.view).toEqual([107, 263, 2 * 49 + FOCUS_MARGIN]);
  });

  it("a crumb and a search pick are the same flight", () => {
    const fromDeep = cameraAfter(cameraFor(land), { kind: "focus", target: welcome });
    expect(fromDeep.view).toEqual(viewFor(welcome));
  });

  it("out one level goes to the parent the caller names", () => {
    const next = cameraAfter(cameraFor(land), { kind: "out", target: village });
    expect(next.focus.id).toBeNull();
    expect(next.view).toEqual(viewFor(village));
  });

  it("a seat event returns an EQUAL view, and in fact the same state object", () => {
    const state = cameraAfter(cameraFor(village), { kind: "focus", target: land });
    const after = cameraAfter(state, { kind: "seat", seatId: "water" });
    expect(after).toBe(state);
    expect(after.view).toEqual(state.view);
    expect(after.focus.id).toBe("land");
  });

  it("Esc from the village stays on the village", () => {
    const state = cameraFor(village);
    const after = cameraAfter(state, { kind: "out", target: village });
    expect(after.view).toEqual(state.view);
    expect(after.focus.id).toBeNull();
  });
});

describe("the flight", () => {
  it("starts where it starts and lands where it lands", () => {
    const t = transition(viewFor(village), viewFor(land));
    expect(t.at(0)).toEqual(viewFor(village));
    expect(t.at(1)).toEqual(viewFor(land));
    // And clamps outside the clock instead of overshooting.
    expect(t.at(-0.5)).toEqual(viewFor(village));
    expect(t.at(1.5)).toEqual(viewFor(land));
  });

  it("passes through the van Wijk arc: it zooms OUT on the way between siblings", () => {
    // The signature of interpolateZoom: mid-flight between two small views
    // the width is larger than either end, which is the whole reason to use
    // it over a linear lerp.
    const a = viewFor(land);
    const b: [number, number, number] = [435, 279, 2 * 53 + FOCUS_MARGIN];
    const mid = transition(a, b).at(0.5);
    expect(mid[2]).toBeGreaterThan(a[2]);
    expect(mid[2]).toBeGreaterThan(b[2]);
  });

  it("takes 400 ms, and 0 under reduced motion", () => {
    const t = transition(viewFor(village), viewFor(land));
    expect(t.duration(false)).toBe(ZOOM_MS);
    expect(t.duration(true)).toBe(0);
    expect(ZOOM_MS).toBe(400);
  });
});

describe("the derived strings", () => {
  it("writes the square viewBox", () => {
    expect(viewBoxFor([100, 100, 50])).toBe("75 75 50 50");
  });

  it("letterboxes by aspect for a portrait canvas", () => {
    expect(viewBoxFor([100, 100, 50], 2)).toBe("75 50 50 100");
  });

  it("carries the focus id to the URL, and nothing for the village", () => {
    expect(focusParam(cameraFor(land))).toBe("land");
    expect(focusParam(cameraFor(village))).toBeNull();
  });
});
