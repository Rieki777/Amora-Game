/**
 * The vision block (0083, P1, N2): objectives with a metric and a target,
 * progress derived on read, and the rule the whole feature hangs on: meeting
 * every objective PROMPTS a human, it never applies the draft.
 */
import { describe, expect, it } from "vitest";
import {
  visionMetricKnown,
  visionProblem,
  visionProgress,
  type VisionBlock,
} from "./orgDrafts";

const vision = (over: Partial<VisionBlock> = {}): VisionBlock => ({
  objectives: [
    { text: "Every seat in the kitchen held", metric: "seats_filled_in:kitchen", target: 3, current: null, source: "measured", done: false },
    { text: "The council has met and said yes", metric: null, target: null, current: null, source: "declared", done: false },
  ],
  trigger: { all_objectives_done: true },
  ...over,
});

describe("what a vision may say", () => {
  it("accepts the two-objective shape the brief draws", () => {
    expect(visionProblem(vision())).toBeNull();
  });

  it("accepts clearing the block entirely", () => {
    expect(visionProblem(null)).toBeNull();
    expect(visionProblem(undefined)).toBeNull();
  });

  it("needs at least one objective, or it can never be met", () => {
    expect(visionProblem(vision({ objectives: [] }))).toContain("at least one");
  });

  it("refuses a metric the platform cannot count, by name", () => {
    const v = vision();
    v.objectives[0] = { ...v.objectives[0], metric: "vibes_per_moon" };
    expect(visionProblem(v)).toContain("vibes_per_moon");
  });

  it("knows the four measured families and nothing else", () => {
    expect(visionMetricKnown("seats_filled")).toBe(true);
    expect(visionMetricKnown("seats_filled_in:kitchen")).toBe(true);
    expect(visionMetricKnown("members_at_stage:member")).toBe(true);
    expect(visionMetricKnown("seasons_completed")).toBe(true);
    expect(visionMetricKnown("seats_filled_in:")).toBe(false);
    expect(visionMetricKnown("revenue")).toBe(false);
  });

  it("needs a target above zero on a measured objective", () => {
    const v = vision();
    v.objectives[0] = { ...v.objectives[0], target: 0 };
    expect(visionProblem(v)).toContain("target above zero");
  });

  it("needs text on every objective and the one v1 trigger", () => {
    const noText = vision();
    noText.objectives[1] = { ...noText.objectives[1], text: "  " };
    expect(visionProblem(noText)).toContain("its own text");
    expect(visionProblem({ objectives: vision().objectives })).toContain("trigger");
    expect(visionProblem({ objectives: vision().objectives, trigger: { all_objectives_done: false } }))
      .toContain("all_objectives_done");
  });
});

describe("where a vision stands", () => {
  const measures: Record<string, number> = {
    "seats_filled_in:kitchen": 3,
    seats_filled: 12,
  };
  const measure = (m: string) => (m in measures ? measures[m] : null);

  it("derives measured objectives from the measurement, never the stored tick", () => {
    const p = visionProgress(vision(), measure);
    expect(p.objectives[0].done).toBe(true);
    expect(p.objectives[0].current).toBe(3);
    // The declared one keeps its human tick.
    expect(p.objectives[1].done).toBe(false);
    expect(p.allDone).toBe(false);
    expect(p.done).toBe(1);
    expect(p.total).toBe(2);
  });

  it("meets only when every objective is done", () => {
    const v = vision();
    v.objectives[1] = { ...v.objectives[1], done: true };
    expect(visionProgress(v, measure).allDone).toBe(true);
  });

  it("can UN-meet when seats empty out, so the prompt says what is true today", () => {
    const v = vision();
    v.objectives[0] = { ...v.objectives[0], done: true, current: 3 };
    v.objectives[1] = { ...v.objectives[1], done: true };
    const p = visionProgress(v, () => 1);
    expect(p.objectives[0].done).toBe(false);
    expect(p.allDone).toBe(false);
  });

  it("keeps the stored reading when the metric cannot be measured right now", () => {
    const v = vision();
    v.objectives[0] = { ...v.objectives[0], current: 2 };
    const p = visionProgress(v, () => null);
    expect(p.objectives[0].current).toBe(2);
    expect(p.objectives[0].done).toBe(false);
  });

  it("returns a NEW block and never mutates the stored one", () => {
    const v = vision();
    const before = JSON.stringify(v);
    visionProgress(v, measure);
    expect(JSON.stringify(v)).toBe(before);
  });
});
