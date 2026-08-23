/**
 * MOVING A VILLAGE'S GOVERNANCE TO HYPHA IS A MIGRATION, and this is the named
 * answer for what happens to a decision that is already running when it starts.
 *
 * THE ANSWER IS: FINISH HERE, THEN SWITCH. Nothing in flight moves, nothing in
 * flight is cancelled, and the flip takes effect on the next decision opened.
 *
 * That is not a policy invented here. It is what the snapshot law already makes
 * true, and this module's job was to name it, prove it and show it:
 *
 *   - A ballot freezes its method, its dials, its electorate and its weights
 *     inside the transaction that opens it (`server/lib/ballots.ts`), and every
 *     later read is of those frozen columns. `governance.default_method` is read
 *     ONCE, at the moment a ballot opens, and never again. So a ballot that is
 *     already open cannot notice the flip, by construction.
 *   - Applying a passed proposal keys on the PROPOSAL's own status, never on the
 *     village's current method. A proposal that passed an on-site ballot still
 *     applies after the flip, through the path it was already on.
 *   - The flip's only live effect is on the next open: opening an on-site ballot
 *     is refused once the method is `hypha`, with a sentence saying so.
 *
 * The gap this closes is that none of that was VISIBLE. A founder flipping the
 * dial saw a saved value and no statement about the decisions already running,
 * which is the same shape as a knob that cannot act: the state is correct and
 * the founder's belief about it is not. `switchoverPreflight` is the sentence
 * they should have been reading.
 *
 * Pure on purpose. The counts come from the store, so every branch is testable
 * without a database and the wording lives in one place.
 */

/** Statuses that mean a decision has started and has not landed. */
export const IN_FLIGHT_STATUSES = ["open", "to_hypha", "onsite_vote", "passed_claimed"] as const;
export type InFlightStatus = (typeof IN_FLIGHT_STATUSES)[number];

export interface SwitchoverPreflight {
  /** Which way this village would be moving. */
  direction: "to-hypha" | "to-onsite" | "none";
  /** How many decisions are mid-flight right now. */
  inFlight: number;
  /** Per status, so the sentence can name what is actually running. */
  byStatus: Record<string, number>;
  /** The rule, said the same way every time. Shipped copy. */
  rule: string;
  /** What these specific decisions will do. Shipped copy. */
  effect: string;
  /** True when a decision would be stranded. Always false, and proven by test. */
  strands: boolean;
}

const RULE =
  "Decisions already running finish under the rules they opened with. A ballot freezes its method, " +
  "its electorate and its weights when it opens, and it reads them from that frozen copy for the rest " +
  "of its life. Changing how the village decides takes effect on the next decision opened, never on one " +
  "already under way.";

/**
 * What flipping `governance.default_method` would do to what is running now.
 *
 * `strands` is a field rather than a comment because it is the thing a founder
 * is actually asking, and because a test can assert on a field. It is false in
 * every branch: there is no combination of open decisions and target method
 * that leaves one with nowhere to go, and `switchover.test.ts` proves that by
 * walking a real ballot across a real flip instead of by asserting this line.
 */
export function switchoverPreflight(input: {
  currentMethod: string;
  targetMethod: string;
  byStatus: Record<string, number>;
}): SwitchoverPreflight {
  const byStatus: Record<string, number> = {};
  let inFlight = 0;
  for (const s of IN_FLIGHT_STATUSES) {
    const n = Math.max(0, Number(input.byStatus[s] ?? 0));
    if (n > 0) byStatus[s] = n;
    inFlight += n;
  }

  const from = String(input.currentMethod ?? "").trim();
  const to = String(input.targetMethod ?? "").trim();
  const direction: SwitchoverPreflight["direction"] =
    from === to ? "none" : to === "hypha" ? "to-hypha" : from === "hypha" ? "to-onsite" : "none";

  return { direction, inFlight, byStatus, rule: RULE, effect: effectFor(direction, inFlight, byStatus), strands: false };
}

function effectFor(
  direction: SwitchoverPreflight["direction"],
  inFlight: number,
  byStatus: Record<string, number>,
): string {
  if (direction === "none") {
    return inFlight === 0
      ? "Nothing is running, and this change moves nothing."
      : `${inFlight} decision(s) are running. This change does not move any of them.`;
  }
  if (inFlight === 0) {
    return direction === "to-hypha"
      ? "Nothing is running, so this village moves to Hypha cleanly. The next proposal crosses instead of opening a ballot here."
      : "Nothing is running, so this village moves to its own vote cleanly. The next proposal opens a ballot here instead of crossing.";
  }
  const parts: string[] = [];
  if (byStatus.onsite_vote) {
    parts.push(
      `${byStatus.onsite_vote} on an open ballot here, which closes on the method and the electorate it opened with and still applies afterwards`,
    );
  }
  if (byStatus.to_hypha) {
    parts.push(`${byStatus.to_hypha} already at Hypha for the vote, which comes home the same way`);
  }
  if (byStatus.passed_claimed) {
    parts.push(`${byStatus.passed_claimed} reported passed and waiting to be verified, which is unaffected`);
  }
  if (byStatus.open) {
    parts.push(
      `${byStatus.open} still gathering support, which will take the ${direction === "to-hypha" ? "Hypha" : "on-site"} route when somebody takes ${byStatus.open === 1 ? "it" : "them"} forward`,
    );
  }
  return `${inFlight} decision(s) are running: ${parts.join("; ")}. None of them is stranded.`;
}
