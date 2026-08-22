/**
 * The ledger that keeps a rare moment rare.
 *
 * The failure this guards against is the boring one: a celebration that
 * replays on every mount. It stops being a celebration within a session, and
 * once it is wallpaper the rare event has nothing left to say with.
 */
import { describe, expect, it } from "vitest";
import { MOMENT_MEMORY, parseMoments, rememberMoment } from "./celebrated";

describe("rememberMoment", () => {
  it("calls a moment it has never seen fresh, once", () => {
    const first = rememberMoment([], "quest:claim-7");
    expect(first.fresh).toBe(true);
    expect(first.moments).toEqual(["quest:claim-7"]);

    const second = rememberMoment(first.moments, "quest:claim-7");
    expect(second.fresh).toBe(false);
    expect(second.moments).toEqual(["quest:claim-7"]);
  });

  it("keeps separate moments separate", () => {
    let moments: string[] = [];
    for (const id of ["quest:a", "stage:member", "gratitude:g1"]) {
      const step = rememberMoment(moments, id);
      expect(step.fresh).toBe(true);
      moments = step.moments;
    }
    expect(moments).toHaveLength(3);
    expect(rememberMoment(moments, "stage:member").fresh).toBe(false);
  });

  it("refuses an empty id rather than storing one", () => {
    const step = rememberMoment(["quest:a"], "");
    expect(step.fresh).toBe(false);
    expect(step.moments).toEqual(["quest:a"]);
  });

  it("does not mutate the list it was given", () => {
    const stored = ["quest:a"];
    rememberMoment(stored, "quest:b");
    expect(stored).toEqual(["quest:a"]);
  });

  it("forgets the oldest once the cap is reached, and keeps the newest", () => {
    let moments: string[] = [];
    for (let i = 0; i < MOMENT_MEMORY + 10; i++) {
      moments = rememberMoment(moments, `m${i}`).moments;
    }
    expect(moments).toHaveLength(MOMENT_MEMORY);
    expect(moments).not.toContain("m0");
    expect(moments).toContain(`m${MOMENT_MEMORY + 9}`);
  });

  it("still suppresses a repeat that is inside the window", () => {
    let moments: string[] = [];
    for (let i = 0; i < MOMENT_MEMORY; i++) moments = rememberMoment(moments, `m${i}`).moments;
    expect(rememberMoment(moments, `m${MOMENT_MEMORY - 1}`).fresh).toBe(false);
  });
});

describe("parseMoments", () => {
  it("reads back what was written", () => {
    expect(parseMoments(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("treats an absent, corrupt or wrong-shaped value as no history", () => {
    expect(parseMoments(null)).toEqual([]);
    expect(parseMoments("")).toEqual([]);
    expect(parseMoments("{not json")).toEqual([]);
    expect(parseMoments(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseMoments(JSON.stringify("a"))).toEqual([]);
  });

  it("drops non-string entries rather than carrying them into an includes check", () => {
    expect(parseMoments(JSON.stringify(["a", 3, null, "b"]))).toEqual(["a", "b"]);
  });
});
