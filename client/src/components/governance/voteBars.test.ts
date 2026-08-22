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
import { evaluateBallot } from "@shared/governanceEngine";
import { countdown, pctText, quorumBar, spoken, tickMsFor, unityBar, weightText } from "./voteBars";

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
