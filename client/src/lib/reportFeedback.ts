/**
 * What a member is told the moment they report something. Pure, so both
 * report controls can be held to the same words.
 *
 * The defect this exists to close: the flag button in a direct thread called
 * a helper that returned a boolean nobody read, so a member reporting
 * harassment saw the prompt close and nothing else. No confirmation, no
 * failure, no change on screen. The forum's control was better by an inch,
 * printing a generic "Done." into a shared status slot several screens below
 * the button.
 *
 * Three things every message here has to do:
 *  1. say the report was received;
 *  2. say what happens next, so silence afterwards is expected instead of
 *     ominous;
 *  3. fail out loud, because a report that vanished is worse than one that
 *     was refused.
 *
 * A second press is a SUCCESS, not an error. Pressing the flag twice is what
 * a worried person does, and the server stores one report either way. Telling
 * them it failed would read as the report having been lost.
 */

export interface ReportResponse {
  ok: boolean;
  status: number;
  /** The DM route answers `fresh: false` when this member already reported it. */
  fresh?: boolean;
  /** Whatever the server said went wrong. */
  error?: string | null;
}

export interface ReportFeedback {
  tone: "success" | "error";
  message: string;
}

/** Sent, and what follows. */
export const REPORT_SENT =
  "Report sent. A steward reads it, and you get a notification once it is closed.";
/** Already on file. The village is holding it either way. */
export const REPORT_ALREADY =
  "You already reported this. It is with the stewards, and you get a notification once it is closed.";
/** The honest failure: nothing was filed, and pressing again is the fix. */
export const REPORT_FAILED = "That report did not send. Try again in a moment.";

export function reportFeedback(res: ReportResponse): ReportFeedback {
  if (res.ok) {
    return { tone: "success", message: res.fresh === false ? REPORT_ALREADY : REPORT_SENT };
  }
  // 409 on a report route means one thing: this member already filed it.
  if (res.status === 409) return { tone: "success", message: REPORT_ALREADY };
  const said = (res.error ?? "").trim();
  return { tone: "error", message: said || REPORT_FAILED };
}

/**
 * The other end of the same loop: what the moderation queues say about a
 * report that is already closed.
 *
 * Both queues write `resolved_by` and `resolved_at` on every close and until
 * now neither read them back, so a handled card looked exactly like a card
 * nobody had touched. Who closed it is the only record of the decision, and a
 * steward looking at a resolved tab is usually asking whether to reopen it.
 *
 * Rows closed before the columns were surfaced can carry a status and no
 * timestamp, so that case gets its own honest sentence.
 *
 * The date is formatted by the caller, which keeps this pure and keeps one
 * locale decision in one place.
 */
export function resolutionLine(
  report: { status: string; resolvedBy?: string | null; resolvedAt?: string | null },
  formatDate: (iso: string) => string,
): string | null {
  if (report.status === "open") return null;
  const verb = report.status === "dismissed" ? "Dismissed" : "Marked handled";
  if (!report.resolvedAt) return `${verb}, before this queue kept a record of who and when.`;
  const who = (report.resolvedBy ?? "").trim() || "a steward";
  return `${verb} by ${who} on ${formatDate(report.resolvedAt)}.`;
}
