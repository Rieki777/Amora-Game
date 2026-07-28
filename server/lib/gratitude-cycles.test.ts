/**
 * Pure-function tests for the settlement math (S27): the channel split and
 * the Sybil eligibility filter. These are the two properties the founders'
 * Hypha report depends on, so they get direct tests rather than riding the
 * loop test alone.
 */
import { describe, expect, it } from "vitest";
import { settleCycle, type GratitudeEntryLike } from "./gratitude-cycles";

const entry = (over: Partial<GratitudeEntryLike>): GratitudeEntryLike => ({
  id: `g-${Math.abs(JSON.stringify(over).split("").reduce((a, c) => a + c.charCodeAt(0), 0))}`,
  fromId: "sender",
  toId: "recipient",
  amount: 1,
  cycleId: "lunar-000100",
  ...over,
});

describe("settleCycle", () => {
  it("splits hearts from acknowledgments and never blends them", () => {
    const totals = settleCycle(
      [
        entry({ fromId: "a", amount: 5, kind: "gratitude" }),
        entry({ fromId: "b", amount: 1, kind: "heart" }),
        entry({ fromId: "c", amount: 2, kind: "heart" }),
      ],
      "lunar-000100",
    );
    expect(totals).toEqual([
      { userId: "recipient", received: 8, receivedEligible: 8, receivedHearts: 3, receivedAcks: 5, distinctSenders: 3 },
    ]);
  });

  it("treats kind-less legacy rows as acknowledgments", () => {
    const totals = settleCycle([entry({ amount: 4 })], "lunar-000100");
    expect(totals[0].receivedAcks).toBe(4);
    expect(totals[0].receivedHearts).toBe(0);
  });

  it("Sybil rule: an ineligible sender counts toward neither breadth nor the pool", () => {
    const totals = settleCycle(
      [
        entry({ fromId: "member-1", amount: 5 }),
        entry({ fromId: "alt-account", amount: 1, kind: "heart" }),
        entry({ fromId: "alt-account-2", amount: 1, kind: "heart" }),
      ],
      "lunar-000100",
      new Set(["member-1"]),
    );
    // `received` stays the honest record of what was sent — the founders
    // carry that figure and its channel split to Hypha, so it is never
    // rewritten.
    expect(totals[0].received).toBe(7);
    // But the pool splits on `receivedEligible`, and so does breadth.
    //
    // This corrects an earlier reading of the rule, which filtered breadth
    // alone on the grounds that "amounts came from real budgets". The budgets
    // are real; the accounts are not. Eligibility here means having consented
    // on a quest or reached member stage, so a farm of do-nothing alts is
    // exactly what it excludes — and paying out on their sends would have let
    // signing up N times enlarge one member's share of real value while the
    // leaderboard beside it stayed correctly unimpressed.
    expect(totals[0].receivedEligible).toBe(5);
    expect(totals[0].distinctSenders).toBe(1);
  });

  it("with no eligibility set at all, every amount counts (the ungated default)", () => {
    const totals = settleCycle(
      [entry({ fromId: "x", amount: 3 }), entry({ fromId: "y", amount: 4 })],
      "lunar-000100",
    );
    expect(totals[0].received).toBe(7);
    expect(totals[0].receivedEligible).toBe(7);
  });

  it("without an eligibility set, behaves exactly as before", () => {
    const totals = settleCycle(
      [entry({ fromId: "x" }), entry({ fromId: "y" })],
      "lunar-000100",
    );
    expect(totals[0].distinctSenders).toBe(2);
  });
});
