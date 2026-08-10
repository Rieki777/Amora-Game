/**
 * The walk funnel.
 *
 * The whole point of this table is the negative rows, so most of these tests
 * are about the difference between "left" and "has not finished yet" and about
 * which step gets blamed for a departure.
 */
import { describe, expect, it } from "vitest";
import { WALK_ABANDONED, WALK_COMPLETE, walkFunnel, type WalkLogRow } from "./walkLog";

/** Build one run's rows: steps in order, then an optional terminal marker. */
const run = (session: string, steps: string[], end?: string): WalkLogRow[] => {
  const rows = steps.map((step, i) => ({ sessionKey: session, step, atIndex: i, tsSeq: i }));
  if (end) rows.push({ sessionKey: session, step: end, atIndex: steps.length - 1, tsSeq: steps.length });
  return rows;
};

describe("walkFunnel", () => {
  it("counts nothing without falling over", () => {
    const f = walkFunnel([]);
    expect(f).toMatchObject({ runs: 0, completed: 0, abandoned: 0, unfinished: 0, completionRate: 0 });
    expect(f.worstStep).toBeNull();
  });

  it("separates completed, abandoned and still-walking", () => {
    /*
     * The distinction this table exists to keep. A run with no terminal row is
     * unfinished, NOT abandoned: merging them would make every village's
     * report look worse than it is.
     */
    const f = walkFunnel([
      ...run("a", ["s1", "s2", "s3"], WALK_COMPLETE),
      ...run("b", ["s1", "s2"], WALK_ABANDONED),
      ...run("c", ["s1"]),
    ]);
    expect(f).toMatchObject({ runs: 3, completed: 1, abandoned: 1, unfinished: 1 });
    expect(f.completionRate).toBe(33);
  });

  it("blames the step a person was looking at when they left", () => {
    const f = walkFunnel([
      ...run("a", ["s1", "s2"], WALK_ABANDONED),
      ...run("b", ["s1", "s2"], WALK_ABANDONED),
      ...run("c", ["s1", "s2", "s3"], WALK_COMPLETE),
    ]);
    expect(f.worstStep?.step).toBe("s2");
    expect(f.worstStep?.lost).toBe(2);
    // s1 was reached by everyone and lost nobody.
    expect(f.steps.find((s) => s.step === "s1")).toMatchObject({ reached: 3, lost: 0 });
  });

  it("counts a step once per run, however often it is revisited", () => {
    // Panning back and forth over one step is one person who saw it.
    const f = walkFunnel([
      { sessionKey: "a", step: "s1", atIndex: 0, tsSeq: 0 },
      { sessionKey: "a", step: "s2", atIndex: 1, tsSeq: 1 },
      { sessionKey: "a", step: "s1", atIndex: 0, tsSeq: 2 },
      { sessionKey: "a", step: WALK_COMPLETE, atIndex: 1, tsSeq: 3 },
    ]);
    expect(f.steps.find((s) => s.step === "s1")?.reached).toBe(1);
  });

  it("orders steps by their position, not by when rows arrived", () => {
    // An import can interleave runs; walk order still has to read correctly.
    const f = walkFunnel([
      { sessionKey: "a", step: "third", atIndex: 2, tsSeq: 2 },
      { sessionKey: "b", step: "first", atIndex: 0, tsSeq: 0 },
      { sessionKey: "a", step: "first", atIndex: 0, tsSeq: 0 },
      { sessionKey: "b", step: "second", atIndex: 1, tsSeq: 1 },
    ]);
    expect(f.steps.map((s) => s.step)).toEqual(["first", "second", "third"]);
  });

  it("reads a run whose rows arrive out of order", () => {
    const f = walkFunnel([
      { sessionKey: "a", step: WALK_ABANDONED, atIndex: 1, tsSeq: 9 },
      { sessionKey: "a", step: "s2", atIndex: 1, tsSeq: 1 },
      { sessionKey: "a", step: "s1", atIndex: 0, tsSeq: 0 },
    ]);
    expect(f.abandoned).toBe(1);
    expect(f.worstStep?.step).toBe("s2");
  });

  it("reports no worst step when nobody has left one", () => {
    const f = walkFunnel(run("a", ["s1", "s2"], WALK_COMPLETE));
    expect(f.worstStep).toBeNull();
    expect(f.completionRate).toBe(100);
  });

  it("does not credit a terminal marker as a step", () => {
    const f = walkFunnel(run("a", ["s1"], WALK_COMPLETE));
    expect(f.steps.map((s) => s.step)).toEqual(["s1"]);
  });
});
