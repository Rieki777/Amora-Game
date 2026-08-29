/**
 * THE FOUR THINGS A REFUSAL MAY SAY, AND THE ONE IT MAY NOT.
 *
 * `castVote` refused everybody who was not on a roll with one sentence: "You
 * are outside this ballot's electorate. Who may vote froze when it opened."
 * The first half is true of everyone it reaches. The second half names TIMING
 * as the cause, and timing is the cause for exactly one of the people who
 * meet it.
 *
 * `buildElectorate` runs the one gate over every member at open, and
 * `capabilityDecision` refuses a warning badge's deny before it looks at any
 * grant. So a member carrying a warning that denies `ballot.vote` is left off
 * every roll built while it stands, opens a vote, is told the roll froze when
 * it opened, and has nowhere in the product to learn that a warning is why.
 * The freeze was named and the cause was hidden. It is the same shape as an
 * outcome card reading "Did not carry" over a decision the village carried: a
 * sentence that is true of one situation, served for a different one.
 *
 * Pure, so every branch is checked including the one no route reaches. The
 * end-to-end half lives in `server/seatRecord.routes.e2e.test.ts`, which
 * creates a real warning badge, awards it, opens a ballot after it, and reads
 * the sentence off the route.
 */
import { describe, expect, it } from "vitest";
import { offRollSentence } from "./ballots";

/** The half that lied, in the words it lied in. */
const TIMING = ["froze", "Who may vote"];

describe("what a member is told when they are not on a ballot's roll", () => {
  it("names the warning when a warning is what is holding the vote back", () => {
    const said = offRollSentence({ mayVoteNow: false, deniedByWarning: true });
    expect(said).toContain("A warning on your account is holding voting back");
    // Never the clock. She would have been off a roll built at any hour.
    for (const word of TIMING) expect(said).not.toContain(word);
    // And it says the fact once, with nothing in it about what she should
    // have done differently (R56).
    expect(said.toLowerCase()).not.toContain("should");
    expect(said).not.toContain("!");
  });

  it("says the account cannot vote yet when the gate refuses it for anything else", () => {
    const said = offRollSentence({ mayVoteNow: false, deniedByWarning: false });
    expect(said).toContain("Voting is not open to your account at the moment");
    // It must not borrow the warning's sentence, which would accuse somebody
    // of carrying a warning they do not have.
    expect(said).not.toContain("warning");
  });

  it("keeps the freeze for the one person the freeze actually kept out", () => {
    // Holds the vote right now, and was not on this roll when it was built:
    // joined afterwards, or was granted it afterwards. This is the case the
    // old sentence described, and it stays.
    const said = offRollSentence({ mayVoteNow: true, deniedByWarning: false });
    expect(said).toContain("It froze when this vote opened");
    expect(said).not.toContain("warning");
  });

  it("names no cause at all when the caller could not work one out", () => {
    // No route reaches this: the vote route always reads the gate. It is the
    // fail-safe direction for a later caller that cannot, and it is the first
    // half of the old sentence word for word, because that half never lied.
    const said = offRollSentence();
    expect(said).toContain("outside this ballot's electorate");
    for (const word of TIMING) expect(said).not.toContain(word);
    expect(said).not.toContain("warning");
  });

  it("gives all four cases their own sentence", () => {
    const all = [
      offRollSentence(),
      offRollSentence({ mayVoteNow: true, deniedByWarning: false }),
      offRollSentence({ mayVoteNow: false, deniedByWarning: false }),
      offRollSentence({ mayVoteNow: false, deniedByWarning: true }),
    ];
    expect(new Set(all).size, "two cases share a sentence, so one of them is being told the other's fact").toBe(4);
  });
});
