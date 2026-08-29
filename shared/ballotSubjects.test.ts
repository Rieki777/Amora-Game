/**
 * The per-subject threshold seam (R68), and the three properties that make it
 * a seam and not a special case for launch:
 *
 *  - a subject the registry does not name behaves exactly as it does today;
 *  - a floor RAISES and never lowers, so a village that asks for more keeps
 *    its own number;
 *  - the stamped dials are the dials the evaluator actually reads, which is
 *    the whole reason a subject may fix its method.
 */
import { describe, expect, it } from "vitest";
import {
  dialsForSubject,
  electorateFloorProblem,
  methodForSubject,
  SUBJECT_THRESHOLDS,
  thresholdsForSubject,
  VILLAGE_LAUNCH,
} from "./ballotSubjects";
import { dialsForMethod, evaluateBallot, type BallotMethod } from "./governanceEngine";

const village = { unityPct: 80, quorumPct: 20 };

describe("per-subject thresholds", () => {
  it("leaves an unnamed subject exactly where it is today", () => {
    for (const method of ["custom", "majority", "consensus", "consent"] as BallotMethod[]) {
      expect(dialsForSubject("mechanics", method, village)).toEqual(dialsForMethod(method, village));
      expect(dialsForSubject("advisory", method, village)).toEqual(dialsForMethod(method, village));
    }
    expect(thresholdsForSubject("mechanics")).toBeNull();
    expect(methodForSubject("mechanics", "consent")).toBe("consent");
    expect(methodForSubject("mechanics", "hypha")).toBe("hypha");
    expect(electorateFloorProblem("mechanics", 1)).toBeNull();
  });

  it("raises the launch ballot to 100 and 100", () => {
    expect(dialsForSubject(VILLAGE_LAUNCH, "custom", village)).toEqual({ unityPct: 100, quorumPct: 100 });
  });

  it("never lowers a village that asks for more than the floor", () => {
    // A floor is a minimum. A village at 100/100 on everything keeps its own
    // numbers, and a floor below them changes nothing.
    const strict = { unityPct: 100, quorumPct: 100 };
    expect(dialsForSubject(VILLAGE_LAUNCH, "custom", strict)).toEqual(strict);
    expect(dialsForSubject("mechanics", "custom", strict)).toEqual(strict);
  });

  it("fixes the launch method, so the frozen numbers are the numbers that decide", () => {
    // The defect this exists to stop: a village on `majority` would freeze
    // 100/100 into the row and `evaluateBallot` would carry it at 51%.
    expect(methodForSubject(VILLAGE_LAUNCH, "majority")).toBe("custom");
    expect(methodForSubject(VILLAGE_LAUNCH, "consent")).toBe("custom");
    // A village that decides its rule changes on Hypha still starts its own
    // Game here. There is no chain leg for a village beginning.
    expect(methodForSubject(VILLAGE_LAUNCH, "hypha")).toBe("custom");

    const method = methodForSubject(VILLAGE_LAUNCH, "majority") as BallotMethod;
    const dials = dialsForSubject(VILLAGE_LAUNCH, method, village);
    // Three members, one silent: 2 of 3 weight voted, so quorum is 66.7.
    expect(
      evaluateBallot({
        method,
        ...dials,
        totalWeight: 3,
        tallies: { yesW: 2, noW: 0, abstainW: 0 },
      }),
    ).toBe("no_quorum");
    // Everybody voted, one against.
    expect(
      evaluateBallot({
        method,
        ...dials,
        totalWeight: 3,
        tallies: { yesW: 2, noW: 1, abstainW: 0 },
      }),
    ).toBe("failed");
    // Everybody voted, everybody agreed.
    expect(
      evaluateBallot({
        method,
        ...dials,
        totalWeight: 3,
        tallies: { yesW: 3, noW: 0, abstainW: 0 },
      }),
    ).toBe("passed");
  });

  it("counts an abstention toward quorum and leaves unity alone, on launch too", () => {
    // Abstain is defined once, in the engine, and a subject floor does not get
    // to redefine it. Three on the roll, all three answered, one took no side.
    const method = methodForSubject(VILLAGE_LAUNCH, "custom") as BallotMethod;
    const dials = dialsForSubject(VILLAGE_LAUNCH, method, village);
    expect(
      evaluateBallot({ method, ...dials, totalWeight: 3, tallies: { yesW: 2, noW: 0, abstainW: 1 } }),
    ).toBe("passed");
  });

  it("says how many more members before a launch vote can open", () => {
    expect(electorateFloorProblem(VILLAGE_LAUNCH, 0)).toContain("3 more members");
    expect(electorateFloorProblem(VILLAGE_LAUNCH, 1)).toBe(
      "One member holds a voice in this village today. 2 more members and the village can vote to start its Game.",
    );
    expect(electorateFloorProblem(VILLAGE_LAUNCH, 2)).toContain("One more member");
    expect(electorateFloorProblem(VILLAGE_LAUNCH, 3)).toBeNull();
    expect(electorateFloorProblem(VILLAGE_LAUNCH, 40)).toBeNull();
  });

  it("keeps every registry entry sane, whatever a later lane adds", () => {
    for (const [subject, t] of Object.entries(SUBJECT_THRESHOLDS)) {
      expect(subject.length, subject).toBeLessThanOrEqual(24); // ballots.subject_type is varchar(24)
      expect(t.minUnityPct, subject).toBeGreaterThanOrEqual(0);
      expect(t.minUnityPct, subject).toBeLessThanOrEqual(100);
      expect(t.minQuorumPct, subject).toBeGreaterThanOrEqual(0);
      expect(t.minQuorumPct, subject).toBeLessThanOrEqual(100);
      expect(t.minElectorate, subject).toBeGreaterThanOrEqual(0);
      expect(t.why.trim().length, subject).toBeGreaterThan(0);
      /*
       * A floor above 50 on a subject that has NOT fixed its method is the
       * defect this whole file exists to stop: `majority` and `consent` ignore
       * `unity_pct`, so the number would be frozen, rendered and never read.
       */
      if (t.minUnityPct > 50) expect(t.method, subject).toBe("custom");
    }
  });
});
