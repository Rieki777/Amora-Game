/**
 * The per-subject threshold seam (R68), and the three properties that make it
 * a seam and not a special case for launch:
 *
 *  - a subject the registry does not name behaves exactly as it does today;
 *  - a floor RAISES and never lowers, so a village that asks for more keeps
 *    its own number;
 *  - the stamped dials are the dials the evaluator actually reads, which is
 *    the whole reason a subject may fix its method.
 *
 * The last describe block adds a fourth: a roll of three HEADS is not the same
 * fact as a roll of three VOICES, and on a 100/100 subject only the second one
 * makes the frozen document true.
 */
import { describe, expect, it } from "vitest";
import {
  dialsForSubject,
  electorateFloorProblem,
  methodForSubject,
  rollProblem,
  SUBJECT_THRESHOLDS,
  thresholdsForSubject,
  weightFloorProblem,
  VILLAGE_LAUNCH,
} from "./ballotSubjects";
import { dialsForMethod, evaluateBallot, quorumPctOf, unityPctOf, type BallotMethod } from "./governanceEngine";

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
      /*
       * A subject that asks for 100% QUORUM and does not also ask every seat
       * to weigh something is asking a question its own answer cannot make
       * true: `quorumPctOf` divides by the frozen total weight, so a roll
       * carrying zero-weight seats reaches 100% without them. The bypass this
       * clause exists to stop is measured directly two describes down.
       */
      if (t.minQuorumPct >= 100) expect(t.everySeatWeighs, subject).toBe(true);
    }
  });
});

describe("a roll of three heads is not a roll of three voices", () => {
  const seats = (...weights: number[]) => weights.map((weight) => ({ weight }));

  it("REPRODUCES the bypass the weight floor closes, in arithmetic", () => {
    /*
     * Measured against the shipped engine on 2026-08-30. Custom weight mode,
     * the founder allocated 1 and nobody else allocated at all. Every guard
     * that existed passes and one person carries the vote.
     */
    const roll = seats(1, 0, 0);
    const totalWeight = roll.reduce((s, e) => s + e.weight, 0);
    expect(electorateFloorProblem(VILLAGE_LAUNCH, roll.length)).toBeNull(); // three heads
    expect(roll.length).toBeGreaterThan(0); // openBallot's roll guard
    expect(totalWeight).toBeGreaterThan(0); // openBallot's weight guard

    const method = methodForSubject(VILLAGE_LAUNCH, "custom") as BallotMethod;
    const dials = dialsForSubject(VILLAGE_LAUNCH, method, { unityPct: 80, quorumPct: 20 });
    const tallies = { yesW: 1, noW: 0, abstainW: 0 }; // the founder alone
    expect(quorumPctOf(tallies, totalWeight)).toBe(100);
    expect(unityPctOf(tallies)).toBe(100);
    expect(evaluateBallot({ method, ...dials, totalWeight, tallies })).toBe("passed");

    // And the one thing that now stands between that roll and this engine.
    expect(rollProblem(VILLAGE_LAUNCH, roll)).toContain("no voting weight");
  });

  it("says how many seats weigh nothing, in words, and counts them right", () => {
    expect(weightFloorProblem(VILLAGE_LAUNCH, seats(1, 0, 0))).toBe(
      "2 of the 3 members on the roll carry no voting weight today. " +
        "This vote asks every one of them, so it opens once each of them carries some weight.",
    );
    expect(weightFloorProblem(VILLAGE_LAUNCH, seats(1, 1, 0))).toContain("One of the 3 members");
    expect(weightFloorProblem(VILLAGE_LAUNCH, seats(1, 1, 1))).toBeNull();
  });

  it("treats a negative or unset weight as no weight, because both are", () => {
    expect(weightFloorProblem(VILLAGE_LAUNCH, seats(1, 1, -3))).toContain("One of the 3");
    expect(weightFloorProblem(VILLAGE_LAUNCH, [{ weight: Number.NaN }, { weight: 1 }, { weight: 1 }])).toContain(
      "One of the 3",
    );
  });

  it("does NOT flatten weight: skew is the village's business, zero is not", () => {
    // R56. An allocation of 100/5/1 opens, because 100% quorum still needs all
    // three to answer and 100% unity still needs none of them to object.
    const roll = seats(100, 5, 1);
    expect(rollProblem(VILLAGE_LAUNCH, roll)).toBeNull();
    const method = methodForSubject(VILLAGE_LAUNCH, "custom") as BallotMethod;
    const dials = dialsForSubject(VILLAGE_LAUNCH, method, { unityPct: 80, quorumPct: 20 });
    const totalWeight = 106;
    // The heaviest member alone: 100 of 106 is not everybody.
    expect(evaluateBallot({ method, ...dials, totalWeight, tallies: { yesW: 100, noW: 0, abstainW: 0 } })).toBe(
      "no_quorum",
    );
    // Everybody answers, the lightest objects: 100/101 is not unanimous.
    expect(evaluateBallot({ method, ...dials, totalWeight, tallies: { yesW: 105, noW: 1, abstainW: 0 } })).toBe(
      "failed",
    );
    expect(evaluateBallot({ method, ...dials, totalWeight, tallies: { yesW: 106, noW: 0, abstainW: 0 } })).toBe(
      "passed",
    );
  });

  it("asks the head count FIRST, so a young village hears the kinder fact", () => {
    // Two members, neither allocated. Both things are true; "one more member"
    // is the one that says what to do next.
    expect(rollProblem(VILLAGE_LAUNCH, seats(0, 0))).toContain("One more member");
  });

  it("asks nothing of a subject that did not ask for it", () => {
    expect(weightFloorProblem("mechanics", seats(0, 0, 0))).toBeNull();
    expect(rollProblem("mechanics", seats(0, 0, 0))).toBeNull();
    // mint_rule raises quorum to 50 and deliberately keeps no roll floor.
    expect(weightFloorProblem("mint_rule", seats(1, 0))).toBeNull();
  });
});
