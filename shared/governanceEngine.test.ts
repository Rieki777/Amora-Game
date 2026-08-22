/**
 * The decision engine's math, pinned to Hypha 2.0's formulas (harvest section
 * 3): abstain is EXCLUDED from unity and COUNTS toward quorum, evaluation
 * reads only what the caller hands in (the ballot's frozen snapshot), and the
 * zero edges answer 0 instead of dividing by it.
 */
import { describe, expect, it } from "vitest";
import {
  dialsForMethod,
  evaluateBallot,
  methodForDecidesBy,
  villageBallotMethod,
  quorumPctOf,
  unityPctOf,
} from "./governanceEngine";

const t = (yesW: number, noW: number, abstainW = 0) => ({ yesW, noW, abstainW });

describe("unity", () => {
  it("is yes over yes plus no, as a percentage", () => {
    expect(unityPctOf(t(8, 2))).toBe(80);
    expect(unityPctOf(t(1, 1))).toBe(50);
    expect(unityPctOf(t(3, 0))).toBe(100);
  });

  it("excludes abstain entirely", () => {
    expect(unityPctOf(t(8, 2, 90))).toBe(80);
  });

  it("answers 0 when nobody took a side, including the all-abstain ballot", () => {
    expect(unityPctOf(t(0, 0))).toBe(0);
    expect(unityPctOf(t(0, 0, 50))).toBe(0);
  });
});

describe("quorum", () => {
  it("counts every vote cast, abstains included, against the frozen supply", () => {
    expect(quorumPctOf(t(1, 1, 2), 20)).toBe(20);
    expect(quorumPctOf(t(5, 0, 0), 10)).toBe(50);
  });

  it("answers 0 for a zero or negative total weight instead of dividing by it", () => {
    expect(quorumPctOf(t(5, 5), 0)).toBe(0);
    expect(quorumPctOf(t(5, 5), -1)).toBe(0);
  });
});

describe("evaluateBallot: the table", () => {
  const custom = { method: "custom" as const, unityPct: 80, quorumPct: 20, totalWeight: 100 };

  it("the Hypha 80/20 surface: both bars met passes", () => {
    expect(evaluateBallot({ ...custom, tallies: t(16, 4) })).toBe("passed"); // unity 80, quorum 20
  });

  it("unity short of the bar fails", () => {
    expect(evaluateBallot({ ...custom, tallies: t(15, 5) })).toBe("failed"); // unity 75
  });

  it("quorum short answers no_quorum, whatever the votes said", () => {
    expect(evaluateBallot({ ...custom, tallies: t(19, 0) })).toBe("no_quorum"); // 19% turnout, unanimous
  });

  it("abstain drags a ballot over quorum without touching unity", () => {
    // 8 yes + 2 no is 10% turnout: dead. 10 abstains double it: alive, and
    // unity is still 80.
    expect(evaluateBallot({ ...custom, tallies: t(8, 2) })).toBe("no_quorum");
    expect(evaluateBallot({ ...custom, tallies: t(8, 2, 10) })).toBe("passed");
  });

  it("majority is strictly more than half", () => {
    const majority = { method: "majority" as const, unityPct: 50, quorumPct: 20, totalWeight: 100 };
    expect(evaluateBallot({ ...majority, tallies: t(11, 10) })).toBe("passed");
    expect(evaluateBallot({ ...majority, tallies: t(10, 10) })).toBe("failed"); // a tie is not a majority
    expect(evaluateBallot({ ...majority, tallies: t(10, 11) })).toBe("failed");
  });

  it("consensus is everyone who took a side, and at least one yes", () => {
    const consensus = { method: "consensus" as const, unityPct: 100, quorumPct: 20, totalWeight: 100 };
    expect(evaluateBallot({ ...consensus, tallies: t(20, 0) })).toBe("passed");
    expect(evaluateBallot({ ...consensus, tallies: t(19, 1) })).toBe("failed");
    expect(evaluateBallot({ ...consensus, tallies: t(0, 0, 25) })).toBe("failed"); // all abstain: quorum met, nobody agreed
  });

  it("consent ignores unity and turns on standing objections", () => {
    const consent = { method: "consent" as const, unityPct: 0, quorumPct: 20, totalWeight: 100 };
    expect(evaluateBallot({ ...consent, tallies: t(1, 19), openObjections: 0 })).toBe("passed");
    expect(evaluateBallot({ ...consent, tallies: t(19, 1), openObjections: 1 })).toBe("failed");
    expect(evaluateBallot({ ...consent, tallies: t(5, 0), openObjections: 0 })).toBe("no_quorum");
  });

  it("the zero edges: an empty ballot is no_quorum, never a crash or a pass", () => {
    expect(evaluateBallot({ ...custom, tallies: t(0, 0) })).toBe("no_quorum");
    expect(evaluateBallot({ ...custom, totalWeight: 0, tallies: t(0, 0) })).toBe("no_quorum");
  });

  it("weighted votes: one heavy voter can carry unity and sink quorum", () => {
    // 90 of the 100 weight sits with one member who stayed home.
    expect(evaluateBallot({ ...custom, tallies: t(10, 0) })).toBe("no_quorum");
    // The heavy member alone IS quorum and unity.
    expect(evaluateBallot({ ...custom, tallies: t(90, 0) })).toBe("passed");
  });
});

describe("decidesBy presets", () => {
  it("maps the conductable methods and routes hypha to the shipped leg", () => {
    expect(methodForDecidesBy("majority")).toBe("majority");
    expect(methodForDecidesBy("consensus")).toBe("consensus");
    expect(methodForDecidesBy("consent")).toBe("consent");
    expect(methodForDecidesBy("custom")).toBe("custom");
    expect(methodForDecidesBy("hypha")).toBe("hypha");
  });

  it("answers null where the named decider records the outcome themselves", () => {
    for (const id of ["lead_decides", "elders_decide", "founder_decides", "do_ocracy", "delegated", "other"]) {
      expect(methodForDecidesBy(id)).toBeNull();
    }
  });

  /*
   * The route that opened the first ballot carried its own inline copy of the
   * method list while this function sat exported and uncalled. Two copies of
   * one rule disagree eventually, and a disagreement about the method is a
   * disagreement about what passing MEANS. These cases pin the one rule that
   * both village-wide open routes now read.
   */
  it("resolves every setting `governance.default_method` can hold", () => {
    expect(villageBallotMethod("majority")).toBe("majority");
    expect(villageBallotMethod("consensus")).toBe("consensus");
    expect(villageBallotMethod("consent")).toBe("consent");
    expect(villageBallotMethod("custom")).toBe("custom");
    expect(villageBallotMethod("hypha")).toBe("hypha");
  });

  it("falls to the village's own dials for anything it does not recognise", () => {
    // The conservative direction: a stored value nobody recognises decides by
    // the numbers the village actually set, never by a preset those numbers
    // were never checked against.
    for (const stored of ["", "lead_decides", "delegated", "other", "MAJORITY", "sortition"]) {
      expect(villageBallotMethod(stored), stored).toBe("custom");
    }
    expect(villageBallotMethod(undefined as unknown as string)).toBe("custom");
  });

  it("presets fix what the method's sentence fixes and take the rest from the village", () => {
    const village = { unityPct: 80, quorumPct: 20 };
    expect(dialsForMethod("majority", village)).toEqual({ unityPct: 50, quorumPct: 20 });
    expect(dialsForMethod("consensus", village)).toEqual({ unityPct: 100, quorumPct: 20 });
    expect(dialsForMethod("consent", village)).toEqual({ unityPct: 0, quorumPct: 20 });
    expect(dialsForMethod("custom", village)).toEqual({ unityPct: 80, quorumPct: 20 });
  });
});
