/**
 * The sentence an action owes its actor.
 *
 * Found while closing the reporting loop, in four more places with the same
 * shape: a handler posts, the screen does not change, and the response is
 * dropped on the floor. A member taps Accept on an introduction, or gives a
 * volunteer slot back, and cannot tell a success from a dead network.
 *
 * Two rules, and the second is the one that bites:
 *
 *  1. an action that changes nothing visible says whether it worked;
 *  2. a confirmation is printed AFTER the answer arrives, never before.
 *     `dropSlot` said "Given back." on the way out of the function, so a
 *     refused DELETE printed a confirmation of something that did not
 *     happen. Silence is bad; a false yes is worse, because the member stops
 *     checking.
 */

export interface ActionResponse {
  ok: boolean;
  /** Whatever the server said went wrong, when it said anything. */
  error?: string | null;
}

/** The fallback when the server said nothing a person can read. */
export const ACTION_FAILED = "That did not go through. Try again in a moment.";

/**
 * What to say once an action has answered. Null on success, so a call site
 * that already has its own confirmation keeps it, and every call site is
 * forced to handle the failure case explicitly.
 */
export function actionError(res: ActionResponse): string | null {
  if (res.ok) return null;
  const said = (res.error ?? "").trim();
  return said || ACTION_FAILED;
}
