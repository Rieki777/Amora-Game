/**
 * The member's half of the reporting loop.
 *
 * These assertions are about a promise, not a string: whatever the wording
 * becomes, a member who pressed the flag must end up knowing (a) whether it
 * landed and (b) that somebody will come back to them. A future edit that
 * drops either half fails here.
 */
import { describe, expect, it } from "vitest";
import {
  REPORT_ALREADY,
  REPORT_FAILED,
  REPORT_SENT,
  reportFeedback,
  resolutionLine,
} from "./reportFeedback";

/** Fixed, so the assertions are about the sentence and never the locale. */
const on = (iso: string) => `day ${iso.slice(8, 10)}`;

describe("reportFeedback", () => {
  it("confirms a fresh report and says what happens next", () => {
    const out = reportFeedback({ ok: true, status: 200, fresh: true });
    expect(out.tone).toBe("success");
    expect(out.message).toBe(REPORT_SENT);
    // The two halves of the promise, held separately from the wording.
    expect(out.message.toLowerCase()).toContain("sent");
    expect(out.message.toLowerCase()).toContain("notification");
  });

  it("treats a route that answers no fresh flag as a plain confirmation", () => {
    // The forum route answers `{ success: true }` with no `fresh` field. An
    // absent flag must not read as a duplicate.
    expect(reportFeedback({ ok: true, status: 200 }).message).toBe(REPORT_SENT);
  });

  it("reads a second press as reassurance, never as a failure", () => {
    // Both shapes of "you already did this": the DM route's `fresh: false`
    // and the forum route's 409.
    const again = reportFeedback({ ok: true, status: 200, fresh: false });
    expect(again.tone).toBe("success");
    expect(again.message).toBe(REPORT_ALREADY);

    const conflict = reportFeedback({ ok: false, status: 409, error: "You already reported this" });
    expect(conflict.tone, "an anxious double press is not an error").toBe("success");
    expect(conflict.message).toBe(REPORT_ALREADY);
    expect(conflict.message.toLowerCase()).toContain("notification");
  });

  it("fails out loud, preferring the server's own words", () => {
    const refused = reportFeedback({ ok: false, status: 404, error: "No message with that id" });
    expect(refused.tone).toBe("error");
    expect(refused.message).toBe("No message with that id");
  });

  it("still says something when the server said nothing", () => {
    // The case the old code produced: a failed POST and a silent screen.
    for (const res of [
      { ok: false, status: 500 },
      { ok: false, status: 500, error: "" },
      { ok: false, status: 0, error: null },
    ]) {
      const out = reportFeedback(res);
      expect(out.tone).toBe("error");
      expect(out.message).toBe(REPORT_FAILED);
    }
  });
});

describe("resolutionLine", () => {
  it("says nothing about a report nobody has closed", () => {
    expect(resolutionLine({ status: "open", resolvedBy: null, resolvedAt: null }, on)).toBeNull();
  });

  it("names the steward and the day for both closing verbs", () => {
    const at = "2026-08-14T09:30:00.000Z";
    expect(resolutionLine({ status: "resolved", resolvedBy: "Ana Ruiz", resolvedAt: at }, on)).toBe(
      "Marked handled by Ana Ruiz on day 14.",
    );
    // Dismissed is a different decision and says so. The reporter is told
    // neither word: this line is the moderator's record.
    expect(resolutionLine({ status: "dismissed", resolvedBy: "Ana Ruiz", resolvedAt: at }, on)).toBe(
      "Dismissed by Ana Ruiz on day 14.",
    );
  });

  it("falls back to a role when the closer left no name", () => {
    // A password-only admin has no member row, so resolved_by is null and the
    // server hands over a role instead of a name. An empty string is the same
    // case arriving one layer later.
    const at = "2026-08-14T09:30:00.000Z";
    expect(resolutionLine({ status: "resolved", resolvedBy: null, resolvedAt: at }, on)).toBe(
      "Marked handled by a steward on day 14.",
    );
    expect(resolutionLine({ status: "resolved", resolvedBy: "   ", resolvedAt: at }, on)).toBe(
      "Marked handled by a steward on day 14.",
    );
  });

  it("is honest about rows closed before the record existed", () => {
    // Every report resolved before this shipped has a status and a timestamp
    // in the database; a row that somehow carries neither must not render as
    // "closed by a steward on Invalid Date".
    expect(resolutionLine({ status: "resolved", resolvedBy: null, resolvedAt: null }, on)).toBe(
      "Marked handled, before this queue kept a record of who and when.",
    );
  });
});
