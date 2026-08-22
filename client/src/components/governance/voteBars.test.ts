/**
 * The two bars, and the defect they exist to prevent.
 *
 * The design's first improvement is that agreement and participation are TWO
 * measurements, and the two cases below are the whole argument: nine people out
 * of a hundred all voting yes, and a hundred out of a hundred split down the
 * middle. A single bar reads one of those as a triumph and the other as a
 * failure, and it has them the wrong way round.
 *
 * Also held here: abstain counts toward one bar and not the other (which is
 * what makes abstain a real instrument rather than a wasted vote), zero is its
 * own state rather than a shade of failure, and every bar carries a mark and a
 * sentence so nothing means anything by colour alone.
 */
import { describe, expect, it } from "vitest";
import { dialsForMethod, evaluateBallot } from "@shared/governanceEngine";
import {
  BLOCKING_OBJECTION_STATUSES,
  CROWD_FIGURES,
  FIGURE_SHARE_PCT,
  countdown,
  crowdFill,
  crowdFront,
  objectionState,
  pctText,
  quorumBar,
  spoken,
  standingObjections,
  tickMsFor,
  unityBar,
  weightText,
} from "./voteBars";

describe("the two bars are two measurements", () => {
  it("nine of a hundred, all agreeing: unity is met and quorum is not", () => {
    const tallies = { yesW: 9, noW: 0, abstainW: 0 };
    const unity = unityBar(tallies, 80, "custom");
    const quorum = quorumBar(tallies, 100, 20);

    expect(unity.valuePct).toBe(100);
    expect(unity.mark).toBe("met");
    expect(quorum.valuePct).toBe(9);
    expect(quorum.mark).toBe("short");
    // And the engine agrees with the bars, which is the point of importing it.
    expect(evaluateBallot({ method: "custom", unityPct: 80, quorumPct: 20, totalWeight: 100, tallies })).toBe("no_quorum");
  });

  it("a hundred of a hundred, split down the middle: quorum is met and unity is not", () => {
    const tallies = { yesW: 50, noW: 50, abstainW: 0 };
    const unity = unityBar(tallies, 80, "custom");
    const quorum = quorumBar(tallies, 100, 20);

    expect(unity.valuePct).toBe(50);
    expect(unity.mark).toBe("short");
    expect(quorum.valuePct).toBe(100);
    expect(quorum.mark).toBe("met");
    expect(evaluateBallot({ method: "custom", unityPct: 80, quorumPct: 20, totalWeight: 100, tallies })).toBe("failed");
  });

  it("abstain lifts quorum and leaves unity alone", () => {
    const withoutAbstain = { yesW: 8, noW: 2, abstainW: 0 };
    const withAbstain = { yesW: 8, noW: 2, abstainW: 40 };

    expect(unityBar(withAbstain, 80, "custom").valuePct).toBe(unityBar(withoutAbstain, 80, "custom").valuePct);
    expect(quorumBar(withAbstain, 100, 20).valuePct).toBeGreaterThan(quorumBar(withoutAbstain, 100, 20).valuePct);
    // The instrument works: abstaining carried this ballot over its quorum
    // without anyone taking a side they did not hold.
    expect(quorumBar(withoutAbstain, 100, 20).mark).toBe("short");
    expect(quorumBar(withAbstain, 100, 20).mark).toBe("met");
  });
});

describe("marks and readings", () => {
  it("zero is its own state, never a red bar", () => {
    const nothing = { yesW: 0, noW: 0, abstainW: 0 };
    expect(unityBar(nothing, 80, "custom").mark).toBe("none");
    expect(quorumBar(nothing, 100, 20).mark).toBe("none");
    expect(unityBar(nothing, 80, "custom").reading).toContain("Nobody has taken a side");
    expect(quorumBar(nothing, 100, 20).reading).toContain("Nobody has voted");
  });

  it("every bar carries a sentence, so colour is never the only signal", () => {
    const cases = [
      unityBar({ yesW: 9, noW: 1, abstainW: 0 }, 80, "custom"),
      unityBar({ yesW: 1, noW: 9, abstainW: 0 }, 80, "custom"),
      unityBar({ yesW: 0, noW: 0, abstainW: 5 }, 80, "custom"),
      quorumBar({ yesW: 9, noW: 1, abstainW: 0 }, 100, 20),
      quorumBar({ yesW: 1, noW: 0, abstainW: 0 }, 100, 20),
    ];
    for (const bar of cases) {
      expect(bar.reading.length).toBeGreaterThan(15);
      expect(["met", "short", "none"]).toContain(bar.mark);
    }
  });

  it("consensus reads as everyone rather than as a percentage", () => {
    expect(unityBar({ yesW: 3, noW: 0, abstainW: 1 }, 100, "consensus").reading).toContain("Everyone");
    expect(unityBar({ yesW: 3, noW: 1, abstainW: 0 }, 100, "consensus").reading).toContain("Not everyone");
  });

  it("holds a bar inside 0 through 100 whatever it is handed", () => {
    expect(quorumBar({ yesW: 500, noW: 0, abstainW: 0 }, 100, 20).valuePct).toBe(100);
    expect(quorumBar({ yesW: 1, noW: 0, abstainW: 0 }, 0, 20).valuePct).toBe(0);
    expect(unityBar({ yesW: 1, noW: 0, abstainW: 0 }, 400, "custom").thresholdPct).toBe(100);
  });

  it("names the weight that has spoken against the weight that could", () => {
    expect(spoken({ yesW: 2, noW: 1, abstainW: 3 }, 20)).toEqual({ spokenWeight: 6, totalWeight: 20 });
    expect(weightText(3)).toBe("3");
    expect(weightText(2.5)).toBe("2.5");
    expect(weightText(1.23456789)).toBe("1.2346");
    expect(pctText(66.666)).toBe("66.7%");
    expect(pctText(50)).toBe("50%");
  });
});

describe("a moon resting exactly on the line has not carried", () => {
  const dials = dialsForMethod("majority", { unityPct: 80, quorumPct: 20 });

  it("reads half of half as short, because majority is strictly more than half", () => {
    const split = { yesW: 50, noW: 50, abstainW: 0 };
    const bar = unityBar(split, dials.unityPct, "majority");

    expect(bar.valuePct).toBe(50);
    expect(bar.thresholdPct).toBe(50);
    expect(bar.mark).toBe("short");
    expect(bar.reading).toContain("resting exactly on");
    // The engine is the authority, and the picture agrees with it.
    expect(
      evaluateBallot({ method: "majority", ...dials, totalWeight: 100, tallies: split }),
    ).toBe("failed");
  });

  it("carries one vote above the line and fails one vote below it", () => {
    const above = { yesW: 51, noW: 50, abstainW: 0 };
    const below = { yesW: 50, noW: 51, abstainW: 0 };

    expect(unityBar(above, dials.unityPct, "majority").mark).toBe("met");
    expect(unityBar(above, dials.unityPct, "majority").reading).toContain("above the 50%");
    expect(unityBar(below, dials.unityPct, "majority").mark).toBe("short");
    expect(unityBar(below, dials.unityPct, "majority").reading).toContain("below the 50%");
    expect(evaluateBallot({ method: "majority", ...dials, totalWeight: 101, tallies: above })).toBe("passed");
    expect(evaluateBallot({ method: "majority", ...dials, totalWeight: 101, tallies: below })).toBe("failed");
  });

  it("leaves the other methods clearing their notch AT it, the way the engine does", () => {
    // custom: `unity >= unityPct`. Exactly 80 carries.
    const exactly80 = { yesW: 80, noW: 20, abstainW: 0 };
    expect(unityBar(exactly80, 80, "custom").mark).toBe("met");
    expect(evaluateBallot({ method: "custom", unityPct: 80, quorumPct: 20, totalWeight: 100, tallies: exactly80 })).toBe("passed");

    // consensus: everyone who took a side, which is unity of exactly 100.
    const everyone = { yesW: 3, noW: 0, abstainW: 1 };
    expect(unityBar(everyone, 100, "consensus").mark).toBe("met");
    expect(evaluateBallot({ method: "consensus", unityPct: 100, quorumPct: 20, totalWeight: 4, tallies: everyone })).toBe("passed");
  });

  it("still says nobody has taken a side when nobody has", () => {
    const silent = { yesW: 0, noW: 0, abstainW: 4 };
    expect(unityBar(silent, 50, "majority").mark).toBe("none");
    expect(unityBar(silent, 50, "majority").reading).toContain("Nobody has taken a side");
  });
});

describe("the field of silhouettes maps to WEIGHT, never to heads", () => {
  it("stands twenty figures, each worth five percent of the frozen weight", () => {
    expect(CROWD_FIGURES).toBe(20);
    expect(FIGURE_SHARE_PCT).toBe(5);
    expect(crowdFill(0)).toHaveLength(20);
  });

  it("is empty at nothing and whole at everything", () => {
    expect(crowdFill(0).every((f) => f === 0)).toBe(true);
    expect(crowdFill(100).every((f) => f === 1)).toBe(true);
  });

  it("fills one figure per share, left to right", () => {
    expect(crowdFill(5)[0]).toBe(1);
    expect(crowdFill(5)[1]).toBe(0);
    expect(crowdFill(50).filter((f) => f === 1)).toHaveLength(10);
    expect(crowdFill(50).filter((f) => f === 0)).toHaveLength(10);
  });

  it("stands the remainder as a PART of a figure instead of rounding it away", () => {
    expect(crowdFill(2.5)[0]).toBeCloseTo(0.5, 10);
    expect(crowdFill(9)[0]).toBe(1);
    expect(crowdFill(9)[1]).toBeCloseTo(0.8, 10);
    expect(crowdFill(9)[2]).toBe(0);
  });

  it("draws the founder's case: one voice in a village of four hundred", () => {
    // One member of weight 1 votes yes where the frozen total weight is 400.
    const tallies = { yesW: 1, noW: 0, abstainW: 0 };
    const unity = unityBar(tallies, 80, "custom");
    const quorum = quorumBar(tallies, 400, 40);
    const field = crowdFill(quorum.valuePct);

    // A FULL MOON.
    expect(unity.valuePct).toBe(100);
    expect(unity.mark).toBe("met");
    // Over an ALMOST EMPTY FIELD: a sliver of the first figure, nothing else.
    expect(quorum.valuePct).toBe(0.25);
    expect(quorum.mark).toBe("short");
    expect(field[0]).toBeCloseTo(0.05, 10);
    expect(field.slice(1).every((f) => f === 0)).toBe(true);
    // And the sliver is never zero, so the field never says nobody voted.
    expect(field[0]).toBeGreaterThan(0);
    expect(quorum.reading).not.toContain("Nobody has voted");
  });

  it("says the same thing about a whale as it does about a crowd", () => {
    // Weight mode `token`: one member carries a hundred times another. The
    // field measures the WEIGHT that spoke, so one whale fills most of it.
    const whaleAlone = { yesW: 100, noW: 0, abstainW: 0 };
    const everyoneElse = { yesW: 0, noW: 0, abstainW: 5 };
    const total = 105;

    expect(crowdFill(quorumBar(whaleAlone, total, 40).valuePct).filter((f) => f === 1)).toHaveLength(19);
    expect(crowdFill(quorumBar(everyoneElse, total, 40).valuePct).filter((f) => f === 1)).toHaveLength(0);
    // Five members out of six is most of the HEADS and almost none of the field.
    expect(quorumBar(everyoneElse, total, 40).mark).toBe("short");
  });

  it("puts the notch where the fill would stand at the threshold", () => {
    // One arithmetic for both, so the notch cannot drift off the fill front.
    expect(crowdFront(0)).toEqual({ figure: 0, within: 0 });
    expect(crowdFront(80)).toEqual({ figure: 16, within: 0 });
    expect(crowdFront(100)).toEqual({ figure: 19, within: 1 });
    expect(crowdFront(9).figure).toBe(1);
    expect(crowdFront(9).within).toBeCloseTo(0.8, 10);
    // The front at a value equals the notch at that same threshold, always.
    for (const pct of [0, 0.25, 5, 9, 33.3, 50, 66.7, 80, 99.9, 100]) {
      const fills = crowdFill(pct);
      const front = crowdFront(pct);
      expect(fills.slice(0, front.figure).every((f) => f === 1)).toBe(true);
      expect(fills[front.figure]).toBeCloseTo(front.within, 10);
    }
  });

  it("clamps a field it cannot read instead of drawing a broken row", () => {
    expect(crowdFill(400).every((f) => f === 1)).toBe(true);
    expect(crowdFill(-40).every((f) => f === 0)).toBe(true);
    expect(crowdFill(Number.NaN).every((f) => f === 0)).toBe(true);
    expect(crowdFill(50, 0)).toHaveLength(1);
    expect(crowdFill(50, 4)).toEqual([1, 1, 0, 0]);
  });
});

describe("consent has no agreement to draw", () => {
  it("stores no unity threshold at all, which is why no moon belongs on it", () => {
    // The reason this state exists, asserted against the engine itself.
    expect(dialsForMethod("consent", { unityPct: 80, quorumPct: 40 }).unityPct).toBe(0);
    // And the evaluator never reads unity: one no, zero objections, carried.
    expect(
      evaluateBallot({
        method: "consent",
        unityPct: 0,
        quorumPct: 40,
        totalWeight: 10,
        tallies: { yesW: 1, noW: 9, abstainW: 0 },
        openObjections: 0,
      }),
    ).toBe("passed");
  });

  it("reads the objections instead, and says quorum still has to arrive", () => {
    expect(objectionState(0).mark).toBe("met");
    expect(objectionState(0).reading).toContain("enough of the village has spoken");
    expect(objectionState(1).mark).toBe("short");
    expect(objectionState(1).reading).toContain("One objection is standing");
    expect(objectionState(3).reading).toContain("3 objections are standing");
  });

  it("survives a count it cannot read", () => {
    expect(objectionState(-2).mark).toBe("met");
    expect(objectionState(Number.NaN).mark).toBe("met");
  });

  it("counts an UPHELD objection as standing, the way the close route does", () => {
    // server/lib/ballots.ts standingObjectionCount: status IN ('open','integrated').
    // An upheld objection means the proposal has to change, so it blocks.
    expect(BLOCKING_OBJECTION_STATUSES).toEqual(["open", "integrated"]);
    const objections = [
      { status: "open" },
      { status: "integrated" },
      { status: "concern" },
      { status: "withdrawn" },
    ];
    expect(standingObjections(objections)).toBe(2);
    expect(standingObjections([{ status: "integrated" }])).toBe(1);
    expect(standingObjections([{ status: "concern" }, { status: "withdrawn" }])).toBe(0);
    expect(standingObjections([])).toBe(0);
    // And the reading follows the count, so an upheld objection is never
    // reported as nothing standing in the way.
    expect(objectionState(standingObjections([{ status: "integrated" }])).mark).toBe("short");
  });
});

describe("the clock", () => {
  const now = Date.parse("2026-08-22T12:00:00.000Z");
  const at = (iso: string) => countdown(iso, now);

  it("counts days and a stable clock", () => {
    expect(at("2026-08-24T15:14:09.000Z").text).toBe("2 days 03:14:09");
    expect(at("2026-08-23T12:00:31.000Z").text).toBe("1 day 00:00:31");
    expect(at("2026-08-22T12:00:09.000Z").text).toBe("00:00:09");
  });

  it("says the period ended rather than counting backwards", () => {
    const past = at("2026-08-21T12:00:00.000Z");
    expect(past.ended).toBe(true);
    expect(past.remainingMs).toBe(0);
    expect(past.text).not.toContain("-");
    expect(past.reading).toContain("ended");
  });

  it("survives a date it cannot read", () => {
    expect(countdown("not a date", now).ended).toBe(true);
  });

  it("reads the span in words, with no ticking colons", () => {
    expect(at("2026-08-24T15:14:09.000Z").reading).toBe("2 days 3 hours left to vote");
    expect(at("2026-08-22T12:00:31.000Z").reading).toBe("less than a minute left to vote");
    expect(at("2026-08-22T12:45:00.000Z").reading).toBe("45 minutes left to vote");
  });

  it("ticks per second only when a second could matter", () => {
    expect(tickMsFor(9 * 86_400_000)).toBe(300_000);
    expect(tickMsFor(6 * 3_600_000)).toBe(60_000);
    expect(tickMsFor(30_000)).toBe(1_000);
    expect(tickMsFor(0)).toBe(60_000);
  });
});
