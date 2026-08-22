import { describe, expect, it } from "vitest";
import {
  ACTIVITY_WINDOW_MS,
  POLL_ACTIVE_MS,
  POLL_HIDDEN_MS,
  POLL_IDLE_MS,
  POLL_MAX_MS,
  pollDelay,
} from "./notificationStore";

const at = (over: Partial<Parameters<typeof pollDelay>[0]> = {}) =>
  pollDelay({ hidden: false, idleFor: 0, failures: 0, ...over });

describe("pollDelay", () => {
  it("polls fastest while somebody is on the page and touching it", () => {
    expect(at()).toBe(POLL_ACTIVE_MS);
    expect(at({ idleFor: ACTIVITY_WINDOW_MS - 1 })).toBe(POLL_ACTIVE_MS);
  });

  it("eases off once the page has been left alone", () => {
    expect(at({ idleFor: ACTIVITY_WINDOW_MS })).toBe(POLL_IDLE_MS);
    expect(at({ idleFor: 60 * 60_000 })).toBe(POLL_IDLE_MS);
  });

  it("backs a long way off when the tab is in the background", () => {
    expect(at({ hidden: true })).toBe(POLL_HIDDEN_MS);
    // Even a member who was active a second before hiding the tab.
    expect(at({ hidden: true, idleFor: 0 })).toBe(POLL_HIDDEN_MS);
  });

  it("is never slower than the old fixed timer while a member is present", () => {
    // The whole point of the change: 120s was the floor, and now it is a
    // ceiling that only an idle or hidden tab reaches.
    expect(at()).toBeLessThan(120_000);
    expect(at({ idleFor: ACTIVITY_WINDOW_MS })).toBeLessThan(120_000);
  });

  it("doubles away from a server that is refusing, and stops at the ceiling", () => {
    expect(at({ failures: 1 })).toBe(POLL_ACTIVE_MS * 2);
    expect(at({ failures: 2 })).toBe(POLL_ACTIVE_MS * 4);
    expect(at({ failures: 9 })).toBe(POLL_MAX_MS);
    expect(at({ failures: 40 })).toBe(POLL_MAX_MS);
  });

  it("lets a failure override the fast path, so a bad afternoon is not hammered", () => {
    expect(at({ failures: 3, idleFor: 0, hidden: false })).toBeGreaterThan(POLL_ACTIVE_MS);
  });
});
