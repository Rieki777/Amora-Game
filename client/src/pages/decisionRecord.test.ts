/**
 * WHAT A DECISION PAGE SAYS IT CHANGED, AND WHERE THAT SENTENCE COMES FROM.
 *
 * The outcome card had exactly one source for "What changed": `applied` off
 * the close response. That value exists in the browser session that closed
 * the vote and nowhere else, so the card knew what a decision had changed for
 * about a minute and then forgot it, permanently, on precisely the decisions
 * a village comes back to. A member opening a carried mechanics decision the
 * next morning read the outcome, the numbers and the sentence, and nothing at
 * all about what had moved in the world because of it.
 *
 * `appliedToShow` is the whole of that choice, pulled out so it can be
 * checked rather than eyeballed inside a hundred lines of JSX. The rule it
 * holds is the one that matters: THE ACT'S OWN ANSWER WINS WHERE IT EXISTS,
 * including when that answer is that nothing moved. A close that applied
 * nothing and explained why in `held` must not have its empty list quietly
 * swapped for a ledger read taken at a different moment, because those two
 * facts can differ and only one of them is what just happened.
 *
 * The e2e half of this lives in `server/seatRecord.routes.e2e.test.ts`, which
 * closes a real ballot and then reads the record back with a token that is
 * not the closer's. This file holds the branch; that one holds the data.
 */
import { describe, expect, it } from "vitest";
import { appliedToShow } from "./Decision";

describe("which answer about what changed a decision page shows", () => {
  it("shows the ledger's answer on a cold load, which is every visit after the first", () => {
    // No `justClosed`: a member arriving on a decision months later. This is
    // the case that had nothing to show at all.
    expect(appliedToShow(null, { appliedKeys: ["governance.vote_days"] })).toEqual(["governance.vote_days"]);
  });

  it("shows the close's own answer in the session that closed it", () => {
    expect(
      appliedToShow({ applied: ["gratitude.base_budget"] }, { appliedKeys: [] }),
    ).toEqual(["gratitude.base_budget"]);
  });

  it("keeps an empty answer from the close, rather than replacing it from the ledger", () => {
    // A pass whose changes are held for the cycle close applies nothing NOW
    // and says so in `held`. Reaching past that to the ledger would put a
    // "what changed" list under a card whose own sentence says nothing has
    // moved yet.
    expect(appliedToShow({ applied: [] }, { appliedKeys: ["economy.claims_week_days"] })).toEqual([]);
  });

  it("says nothing when neither source has anything, instead of an empty heading", () => {
    expect(appliedToShow(null, null)).toBeUndefined();
    expect(appliedToShow(null, { appliedKeys: [] })).toEqual([]);
  });
});
