/**
 * What a member hears when the bug or the idea they sent in is triaged.
 *
 * Scoped to `feedbackStatusNotice` and nothing else in the feedback spine:
 * relay mechanics and fingerprinting are DB-backed and live in the route
 * suites. Everything here is a copy and privacy judgement, so it runs without
 * a database on any machine.
 *
 * The load-bearing assertion is that none of the queue's own five words
 * reaches the member. They reported a broken thing; they are owed a sentence
 * about their report, never a status code from somebody's admin panel.
 */
import { describe, expect, it } from "vitest";
import { feedbackStatusNotice } from "./feedback";

const QUEUE_WORDS = ["new", "seen", "planned", "done", "declined"];
const SPEAKING = ["seen", "planned", "done", "declined"];

describe("feedbackStatusNotice", () => {
  it("says nothing about a founder correcting their own filing", () => {
    expect(feedbackStatusNotice("new", "bug")).toBeNull();
    expect(feedbackStatusNotice("new", "idea")).toBeNull();
  });

  it("speaks for every landing place a member is waiting on", () => {
    for (const kind of ["bug", "idea"]) {
      for (const status of SPEAKING) {
        const notice = feedbackStatusNotice(status, kind);
        expect(notice, `${kind} at ${status} said nothing`).toBeTruthy();
        expect(notice!.headline.length).toBeGreaterThan(10);
        expect(notice!.line.length).toBeGreaterThan(10);
      }
    }
  });

  it("calls a bug a report and an idea an idea", () => {
    expect(feedbackStatusNotice("seen", "bug")!.headline).toBe("Someone read your report");
    expect(feedbackStatusNotice("seen", "idea")!.headline).toBe("Someone read your idea");
    expect(feedbackStatusNotice("planned", "idea")!.headline).toContain("build");
    expect(feedbackStatusNotice("planned", "bug")!.headline).toContain("fix");
    expect(feedbackStatusNotice("done", "bug")!.headline).toContain("fixed");
  });

  it("treats an unknown kind as a report, which is the safer of the two", () => {
    expect(feedbackStatusNotice("seen", "")!.headline).toBe("Someone read your report");
    expect(feedbackStatusNotice("seen", "wishlist")!.headline).toBe("Someone read your report");
  });

  it("says no plainly, and invites the next one", () => {
    const declined = feedbackStatusNotice("declined", "idea")!;
    expect(declined.line).toContain("keep sending them");
  });

  it("never leaks a queue word into anything the member reads", () => {
    for (const kind of ["bug", "idea"]) {
      for (const status of SPEAKING) {
        const notice = feedbackStatusNotice(status, kind)!;
        const whole = `${notice.headline} ${notice.line}`.toLowerCase();
        for (const word of QUEUE_WORDS) {
          expect(whole, `${kind} at ${status} said "${word}" at the member`).not.toContain(word);
        }
      }
    }
  });

  it("refuses to speak for a status it does not know", () => {
    expect(feedbackStatusNotice("archived", "bug")).toBeNull();
    expect(feedbackStatusNotice("", "bug")).toBeNull();
  });
});
