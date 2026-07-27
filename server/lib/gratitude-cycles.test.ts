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
      { userId: "recipient", received: 8, receivedHearts: 3, receivedAcks: 5, distinctSenders: 3 },
    ]);
  });

  it("treats kind-less legacy rows as acknowledgments", () => {
    const totals = settleCycle([entry({ amount: 4 })], "lunar-000100");
    expect(totals[0].receivedAcks).toBe(4);
    expect(totals[0].receivedHearts).toBe(0);
  });

  it("Sybil rule: ineligible senders still move VALUE but never count as breadth", () => {
    const totals = settleCycle(
      [
        entry({ fromId: "member-1", amount: 5 }),
        entry({ fromId: "alt-account", amount: 1, kind: "heart" }),
        entry({ fromId: "alt-account-2", amount: 1, kind: "heart" }),
      ],
      "lunar-000100",
      new Set(["member-1"]),
    );
    // The received total is untouched — the pool weights on amounts, and
    // amounts came from real budgets. Only BREADTH is filtered, because
    // breadth is what badges later escalate into capabilities.
    expect(totals[0].received).toBe(7);
    expect(totals[0].distinctSenders).toBe(1);
  });

  it("without an eligibility set, behaves exactly as before", () => {
    const totals = settleCycle(
      [entry({ fromId: "x" }), entry({ fromId: "y" })],
      "lunar-000100",
    );
    expect(totals[0].distinctSenders).toBe(2);
  });
});
