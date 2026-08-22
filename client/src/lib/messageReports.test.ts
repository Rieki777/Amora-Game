import { describe, expect, it } from "vitest";
import {
  canAct,
  DISCLOSURE_NOTE,
  emptyQueueLine,
  reportedLine,
  reportPlace,
  type MessageReport,
} from "./messageReports";

/**
 * The DM report queue's words.
 *
 * The property worth pinning is the one a nicer-looking card would break: a
 * direct thread is never named, because naming it names the two people in it,
 * and the report is about one message.
 */

const report = (over: Partial<MessageReport> = {}): MessageReport => ({
  id: "mrp-1",
  conversationId: "cnv-1",
  conversationKind: "direct",
  conversationName: null,
  messageId: "msg-1",
  body: "you should not be here",
  deleted: false,
  authorId: "usr-9",
  reporter: "Ana",
  reason: "This has happened three times now.",
  status: "open",
  at: "2026-08-20T10:00:00.000Z",
  ...over,
});

describe("reportPlace", () => {
  it("never names a direct thread", () => {
    expect(reportPlace(report())).toBe("In a direct thread");
    // Even if the server ever started sending one, the queue would not print it.
    expect(reportPlace(report({ conversationName: "Ana and Ben" }))).toBe("In a direct thread");
  });

  it("names a group or a crew, which already have public names", () => {
    expect(reportPlace(report({ conversationKind: "group", conversationName: "Kitchen rota" })))
      .toBe('In the group "Kitchen rota"');
    expect(reportPlace(report({ conversationKind: "crew", conversationName: "Build crew" })))
      .toBe('In the crew "Build crew"');
  });

  it("copes with a nameless group and an unknown kind", () => {
    expect(reportPlace(report({ conversationKind: "group", conversationName: "  " })))
      .toBe("In a group thread");
    expect(reportPlace(report({ conversationKind: null, conversationName: null })))
      .toBe("In a group thread");
  });
});

describe("reportedLine", () => {
  it("shows the reported message", () => {
    expect(reportedLine(report())).toEqual({ text: "you should not be here", present: true });
  });

  it("explains a tombstone instead of rendering a blank card", () => {
    const gone = reportedLine(report({ deleted: true, body: "" }));
    expect(gone.present).toBe(false);
    expect(gone.text).toBe("The author deleted this message. Its text is gone.");
  });

  it("explains an empty body that is not a tombstone", () => {
    expect(reportedLine(report({ body: "   " })).present).toBe(false);
  });
});

describe("the queue's honesty about what it is not showing", () => {
  it("tells a moderator the conversation around this line is withheld", () => {
    expect(DISCLOSURE_NOTE).toContain("nothing else from the conversation");
  });

  it("has an empty line for every tab", () => {
    expect(emptyQueueLine("open")).toBe("No open reports. A quiet queue is the good outcome.");
    expect(emptyQueueLine("resolved")).toBe("Nothing marked handled yet.");
    expect(emptyQueueLine("dismissed")).toBe("Nothing dismissed yet.");
  });

  it("offers actions only where the server will accept them", () => {
    // PUT /api/admin/messages/reports/:id updates rows still open and answers
    // 404 otherwise, so a handled card shows no buttons at all.
    expect(canAct(report())).toBe(true);
    expect(canAct(report({ status: "resolved" }))).toBe(false);
    expect(canAct(report({ status: "dismissed" }))).toBe(false);
  });
});
