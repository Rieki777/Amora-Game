/**
 * Pure helpers for the direct-message report queue. No fetching, no DOM, the
 * same rule messaging.ts follows.
 *
 * A report on a private conversation is the one moderation surface where the
 * queue must show LESS than it could. The server hands over exactly one
 * message body and the thread it sat in, and it hands over no author name, no
 * surrounding lines and no way to open the conversation. Every one of those
 * absences is deliberate, so the copy here is written to be honest about the
 * limit instead of implying the moderator is seeing a thread.
 *
 * The shapes mirror GET /api/admin/messages/reports.
 */

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface MessageReport {
  id: string;
  conversationId: string;
  conversationKind: "direct" | "group" | "crew" | null;
  conversationName: string | null;
  messageId: string;
  /** Empty when the author deleted the line before a moderator reached it. */
  body: string;
  deleted: boolean;
  authorId: string;
  reporter: string;
  reason: string | null;
  status: ReportStatus;
  at: string;
}

/**
 * Where the reported line was said, without naming anyone who was in the
 * room. A direct thread has no name on purpose: naming it would mean naming
 * the two people in it, and the report is about one message.
 */
export function reportPlace(report: MessageReport): string {
  if (report.conversationKind === "direct") return "In a direct thread";
  const name = (report.conversationName ?? "").trim();
  if (report.conversationKind === "crew") return name ? `In the crew "${name}"` : "In a crew thread";
  return name ? `In the group "${name}"` : "In a group thread";
}

/**
 * The reported line, or the reason it is not here.
 *
 * A deleted message reaches the queue as an empty body, and a blank card
 * would read as a rendering fault. The moderator still has the reporter's
 * words, and the tombstone is itself information: the line came down before
 * anyone looked at it.
 */
export function reportedLine(report: MessageReport): { text: string; present: boolean } {
  if (report.deleted) {
    return { text: "The author deleted this message. Its text is gone.", present: false };
  }
  const body = (report.body ?? "").trim();
  if (!body) return { text: "This message carries no text.", present: false };
  return { text: body, present: true };
}

/**
 * What the queue can and cannot tell a moderator about this report.
 *
 * Printed on every card, deliberately. A moderator who does not know that the
 * surrounding conversation is withheld will read one line as the whole story
 * and judge it that way.
 */
export const DISCLOSURE_NOTE =
  "One reported message, and nothing else from the conversation. Private threads stay private, and the author is identified to the server alone.";

/** The empty state, per tab. A quiet queue is the outcome to hope for. */
export function emptyQueueLine(status: ReportStatus): string {
  if (status === "open") return "No open reports. A quiet queue is the good outcome.";
  if (status === "resolved") return "Nothing marked handled yet.";
  return "Nothing dismissed yet.";
}

/**
 * Whether a report can still be acted on. The server updates rows that are
 * still open and answers 404 otherwise, so a resolved card shows no buttons
 * and a moderator never presses one that cannot work.
 */
export function canAct(report: MessageReport): boolean {
  return report.status === "open";
}
