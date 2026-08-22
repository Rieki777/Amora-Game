import { describe, expect, it } from "vitest";
import { ACTION_FAILED, actionError } from "./actionOutcome";

describe("actionError", () => {
  it("says nothing when the action worked", () => {
    expect(actionError({ ok: true })).toBeNull();
    // Even a body that carries a stale error field: `ok` decides.
    expect(actionError({ ok: true, error: "ignore me" })).toBeNull();
  });

  it("prefers the server's own words", () => {
    expect(actionError({ ok: false, error: "That seat is already taken" })).toBe("That seat is already taken");
  });

  it("still says something when the server said nothing", () => {
    // The exact case the sweep found: a fetch that failed with no readable
    // body, and a handler that printed nothing at all.
    for (const res of [{ ok: false }, { ok: false, error: "" }, { ok: false, error: null }, { ok: false, error: "   " }]) {
      expect(actionError(res)).toBe(ACTION_FAILED);
    }
  });
});
