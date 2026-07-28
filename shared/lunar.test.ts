/**
 * Pins the lunar algorithm to known values so it can never silently drift from
 * regen-civics. Both products key distribution records on cycleNumber; if a
 * constant here changes, cycle 328 stops meaning the same lunation in both
 * codebases and every historical record misaligns. These tests are the tripwire.
 */
import { describe, expect, it } from "vitest";
import {
  REFERENCE_NEW_MOON_MS,
  SYNODIC_MONTH_DAYS,
  SYNODIC_MONTH_MS,
  cycleBoundsFor,
  cycleBoundsByNumber,
  daysRemainingInCycle,
  moonPhase,
  moonPhaseName,
} from "./lunar";
import { cycleIdFor, formatCycleId, parseCycleId, settleCycle, dueCycles } from "../server/lib/gratitude-cycles";

describe("lunar constants, pinned to regen-civics", () => {
  it("uses the Meeus reference new moon and mean synodic month", () => {
    expect(REFERENCE_NEW_MOON_MS).toBe(Date.UTC(2000, 0, 6, 18, 14, 0));
    expect(SYNODIC_MONTH_DAYS).toBe(29.53058867);
  });

  it("computes cycle 328 for 2026-07-26, the pinned cross-product check", () => {
    // Computed once from the shared constants and pinned as a literal. If this
    // fails, the algorithm diverged from regen-civics. Do not update the number
    // to make the test pass; find out what changed.
    const b = cycleBoundsFor(new Date("2026-07-26T00:00:00Z"));
    expect(b.cycleNumber).toBe(328);
    expect(b.startsAt.toISOString()).toBe("2026-07-14T19:01:38.436Z");
    expect(b.endsAt.toISOString()).toBe("2026-08-13T07:45:41.297Z");
  });

  it("has monotonic, gap-free cycle bounds", () => {
    const a = cycleBoundsByNumber(328);
    const b = cycleBoundsByNumber(329);
    expect(a.endsAt.getTime()).toBe(b.startsAt.getTime());
    // Date stores whole milliseconds, so the length may differ from the real
    // constant by up to 1ms of truncation.
    expect(Math.abs(a.endsAt.getTime() - a.startsAt.getTime() - SYNODIC_MONTH_MS)).toBeLessThan(1);
  });

  it("reports a new moon at the reference epoch", () => {
    expect(moonPhase(new Date(REFERENCE_NEW_MOON_MS))).toBe(0);
    expect(moonPhaseName(0)).toBe("New moon");
    expect(moonPhaseName(0.5)).toBe("Full moon");
  });

  it("counts days remaining, never negative", () => {
    const justBeforeEnd = new Date(cycleBoundsByNumber(328).endsAt.getTime() - 60_000);
    expect(daysRemainingInCycle(justBeforeEnd)).toBe(1);
  });
});

describe("cycle ids", () => {
  it("formats sortable lunar ids and round-trips them", () => {
    expect(formatCycleId(328)).toBe("lunar-000328");
    expect(parseCycleId("lunar-000328")).toBe(328);
    expect(cycleIdFor(new Date("2026-07-26T00:00:00Z"))).toBe("lunar-000328");
  });

  it("never matches legacy calendar-month ids", () => {
    expect(parseCycleId("2026-07")).toBeNull();
  });
});

describe("settleCycle", () => {
  const entry = (from: string, to: string, amount: number, cycleId = "lunar-000327") => ({
    id: `g-${from}-${to}-${amount}`,
    fromId: from,
    toId: to,
    amount,
    cycleId,
  });

  it("totals per recipient and counts distinct senders", () => {
    const rows = settleCycle(
      [entry("a", "b", 5), entry("a", "b", 3), entry("c", "b", 2), entry("b", "a", 7)],
      "lunar-000327",
    );
    expect(rows).toEqual([
      // S27 added the channel split; kind-less legacy entries count as acks.
      // `receivedEligible` equals `received` here because no eligibility set
      // was passed — ungated, every amount counts toward the pool.
      { userId: "b", received: 10, receivedEligible: 10, receivedHearts: 0, receivedAcks: 10, distinctSenders: 2 },
      { userId: "a", received: 7, receivedEligible: 7, receivedHearts: 0, receivedAcks: 7, distinctSenders: 1 },
    ]);
  });

  it("ignores entries from other cycles, including legacy month ids", () => {
    const rows = settleCycle([entry("a", "b", 5, "2026-07"), entry("a", "b", 4, "lunar-000326")], "lunar-000327");
    expect(rows).toEqual([]);
  });
});

describe("dueCycles", () => {
  it("finds finished lunations with activity, oldest first, and skips closed ones", () => {
    const now = new Date("2026-07-26T00:00:00Z"); // inside cycle 328
    const entries = [
      { id: "g1", fromId: "a", toId: "b", amount: 1, cycleId: "lunar-000326" },
      { id: "g2", fromId: "a", toId: "b", amount: 1, cycleId: "lunar-000327" },
      { id: "g3", fromId: "a", toId: "b", amount: 1, cycleId: "lunar-000328" }, // current: not due
    ];
    const due = dueCycles([], entries, now);
    expect(due.map((c) => c.cycleNumber)).toEqual([326, 327]);

    const afterClosing326 = dueCycles(
      [{ id: "lunar-000326", cycleNumber: 326, startsAt: "", endsAt: "", status: "closed" }],
      entries,
      now,
    );
    expect(afterClosing326.map((c) => c.cycleNumber)).toEqual([327]);
  });
});
