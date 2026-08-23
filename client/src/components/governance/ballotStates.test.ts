/**
 * THE DECISION SURFACES' VOCABULARY AGAINST THE ONE THE SERVER CAN SEND.
 *
 * Third file in the same series, for the same defect class: a hand-kept client
 * mirror of a server enumeration, read through `Record<Union, T>` with no
 * fallback, so `pnpm check` asserts a claim about the server instead of
 * checking one and the first unfamiliar value throws inside a list. It shipped
 * as a crash twice (GameMechanics.tsx, ObjectionPanel.tsx) before anybody went
 * looking for the third.
 *
 * THE AUTHORITY IS DIFFERENT FOR EACH MAP HERE, and that is the whole reason
 * this file reads three sources instead of one:
 *
 *   - `VOTE_CHOICES` and `BALLOT_METHODS` live in `shared/governanceEngine.ts`,
 *     which is in this same TypeScript program. `Record<VoteChoice, T>` is
 *     therefore genuinely checked: a fourth choice added there turns the
 *     declaration red without any help from this file. What the compiler
 *     CANNOT see is a server that is ahead of this build, which is the case
 *     the fallbacks exist for, so those are what the tests below exercise.
 *
 *   - `ballots`.`status` is a VARCHAR with a comment. No migration constrains
 *     it, so the only enumeration is the union on `BallotRow` in
 *     `server/lib/ballots.ts`, read as text. Same shape as
 *     objectionStates.test.ts, and for the same reason.
 *
 * A SIXTH BALLOT STATUS ADDED TO THE SERVER FAILS THIS FILE, which is the
 * point.
 *
 * AND THE FALLBACKS ARE TESTED FOR HONESTY, not only for existing. Two of the
 * three shipped as `?? SOME_REAL_ENTRY`, which is worse than crashing in the
 * one way that matters: the page states a specific fact it does not know. The
 * outcome card fell back to `failed`, so a decision the village CARRIED under
 * a status this build had not heard of would have read "Did not carry" to
 * every member. The method tip fell back to the `custom` sentence and the
 * weight tip to the `equal` sentence, each explaining a rule that may not be
 * this ballot's. So each test below asserts the fallback is not any known
 * entry, which is a thing a future edit can actually get wrong.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BALLOT_METHODS, VOTE_CHOICES } from "@shared/governanceEngine";
import { DECISION_OUTCOME_COPY } from "./DecisionOutcome";
import { VOTER_ROLL_CHOICES, choiceMark } from "./VoterRoll";
import { DECISION_METHOD_TIPS, DECISION_WEIGHT_TIPS } from "@/pages/Decision";

const ROOT = path.resolve(__dirname, "../../../..");

/**
 * The statuses a ballot row can hold, off the server's own type. The column is
 * a varchar, so this union is the only rule there is.
 */
function ballotStatusesFromServer(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "server/lib/ballots.ts"), "utf8");
  const m = src.match(/status:\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+")\s*;/);
  if (!m) throw new Error("no ballot status union found in server/lib/ballots.ts");
  const states = [...m[1].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
  // A control on the reader itself: if the regex ever drifts onto some other
  // union in that file, this is the value it cannot accidentally be right about.
  expect(states, "the union read does not look like ballot statuses").toContain("no_quorum");
  return states;
}

describe("the decision surfaces speak every state the server can send", () => {
  it("the outcome card has a word for every ballot status the server declares", () => {
    const statuses = ballotStatusesFromServer();
    // eslint-disable-next-line no-console
    console.log(`[states] ${statuses.length} ballot status(es): ${statuses.join(", ")}`);
    const missing = statuses.filter((s) => !(s in DECISION_OUTCOME_COPY));
    expect(missing, `no outcome copy for ballot status(es): ${missing.join(", ")}`).toEqual([]);
  });

  it("only `passed` is treated as settled law", () => {
    // The `law` flag drives the celebration and reads as "this is now the
    // village's decision". A fallback that guessed a status into a lawful one
    // would announce a decision nobody made.
    const lawful = Object.entries(DECISION_OUTCOME_COPY)
      .filter(([, v]) => v.law)
      .map(([k]) => k);
    expect(lawful).toEqual(["passed"]);
  });

  it("the voter roll has a mark for every vote choice, and reads an unknown one", () => {
    const missing = VOTE_CHOICES.filter((c) => !(c in VOTER_ROLL_CHOICES));
    expect(missing, `no mark for vote choice(s): ${missing.join(", ")}`).toEqual([]);

    // The exact shape that shipped and crashed: an index into a total-typed
    // Record with a value the union never held, then a property read off it.
    const unknown = choiceMark("a_choice_from_a_later_lane" as never);
    expect(unknown).toBeDefined();
    expect(unknown.icon).toBeTruthy();
    // Honest: it never claims the member voted one of the three real ways.
    const realLabels = VOTE_CHOICES.map((c) => VOTER_ROLL_CHOICES[c].label);
    expect(realLabels).not.toContain(unknown.label);
  });

  it("the decision page explains every method, and never explains the wrong one", () => {
    const missing = BALLOT_METHODS.filter((m) => !(m in DECISION_METHOD_TIPS));
    expect(missing, `no tip for ballot method(s): ${missing.join(", ")}`).toEqual([]);

    const src = fs.readFileSync(path.join(ROOT, "client/src/pages/Decision.tsx"), "utf8");
    const m = src.match(/const UNKNOWN_METHOD_TIP\s*=\s*\n?\s*"([^"]+)"/);
    expect(m, "UNKNOWN_METHOD_TIP was not found in Decision.tsx").toBeTruthy();
    const fallback = m![1];
    // It used to be METHOD_TIP.custom, which describes one specific rule.
    expect(Object.values(DECISION_METHOD_TIPS)).not.toContain(fallback);
  });

  it("the decision page explains every weight mode, and never explains the wrong one", () => {
    for (const mode of ["equal", "token", "custom"]) {
      expect(DECISION_WEIGHT_TIPS, `no tip for weight mode ${mode}`).toHaveProperty(mode);
    }
    const src = fs.readFileSync(path.join(ROOT, "client/src/pages/Decision.tsx"), "utf8");
    const m = src.match(/const UNKNOWN_WEIGHT_TIP\s*=\s*\n?\s*"([^"]+)"/);
    expect(m, "UNKNOWN_WEIGHT_TIP was not found in Decision.tsx").toBeTruthy();
    // It used to be WEIGHT_MODE_TIP.equal, which tells a member every vote on
    // the roll weighs the same. On a token ballot that is simply false.
    expect(Object.values(DECISION_WEIGHT_TIPS)).not.toContain(m![1]);
  });
});
