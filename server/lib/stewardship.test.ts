/**
 * The steward's rules that need no database.
 *
 * Three things are pinned here, and each one is a sentence the founder wrote:
 *
 *  - WHICH DECISIONS WAIT. A per-subject setting, defaulting to all, so the
 *    training wheels come off one subject at a time rather than by a boolean
 *    somebody has to be brave enough to flip.
 *  - A REFUSAL CARRIES A REASON. "Yes a steward veto absolutely should carry a
 *    reason." A blank one is how that requirement gets met without being met.
 *  - AN EMPTY SEAT IS NOT AN ERROR. "it's perfectly fine to have no stewards
 *    and for the game to have self/executing agreements." The vacancy sentence
 *    has to be able to say that without sounding like a fault report.
 *
 * The database halves (the decision row, the seating, the vacancy read) are in
 * server/stewardship.db.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  ADVISORY,
  approvalReasonProblem,
  autoExecutes,
  needsSteward,
  refusalReasonProblem,
  stewardIsAskedAtAll,
  STEWARD_APPROVE,
  STEWARD_SUBJECTS_KEY,
  AUTO_EXECUTE_SUBJECTS_KEY,
} from "./stewardship";
import { ALL_CAPABILITIES, CAPABILITY_LABELS, TRANSFERABLE, DENIABLE } from "../../shared/capabilities";
import { CAPABILITY_CONSEQUENCE } from "../../shared/draftKinds";
import { VARIABLES_BY_KEY } from "../../shared/gameVariables";

describe("which decisions wait for a steward", () => {
  it("waits on everything by default, because a young village runs on training wheels", () => {
    // The founder's default, read off the registry rather than retyped, so a
    // change to the default fails here instead of shipping silently.
    const def = VARIABLES_BY_KEY[STEWARD_SUBJECTS_KEY];
    expect(def, "the setting is registered, or nothing can turn it").toBeTruthy();
    expect(def.default).toBe("all");
    expect(needsSteward("mechanics", def.default)).toBe(true);
    expect(needsSteward("village_launch", def.default)).toBe(true);
  });

  it("never waits on an advisory vote, which executes nothing", () => {
    // A queue entry for a decision that cannot take effect would be a promise
    // about an act that does not exist.
    expect(needsSteward(ADVISORY, "all")).toBe(false);
    expect(needsSteward(ADVISORY, "advisory,mechanics")).toBe(false);
  });

  it("honours a named list, and treats an unnamed subject as free", () => {
    expect(needsSteward("mechanics", "mechanics,mint_rule")).toBe(true);
    expect(needsSteward("role_seat", "mechanics,mint_rule")).toBe(false);
  });

  it("waits on nothing when the village says none, or leaves it blank", () => {
    for (const raw of ["none", "", "  ", "off"]) {
      expect(needsSteward("mechanics", raw), raw).toBe(false);
    }
  });

  it("tolerates the spacing and casing a person actually types", () => {
    expect(needsSteward("mechanics", " Mechanics , mint_rule ")).toBe(true);
  });
});

describe("which decisions carry themselves", () => {
  it("carries nothing by default, so nothing applies itself until the village says so", () => {
    const def = VARIABLES_BY_KEY[AUTO_EXECUTE_SUBJECTS_KEY];
    expect(def, "the setting is registered").toBeTruthy();
    expect(def.default).toBe("none");
    expect(autoExecutes("mechanics", def.default)).toBe(false);
  });

  it("is the other end of one gradient, not a second switch", () => {
    // A village may hand one subject over and keep the steward on the rest.
    expect(autoExecutes("role_seat", "role_seat")).toBe(true);
    expect(autoExecutes("mechanics", "role_seat")).toBe(false);
  });

  it("leaves governance.auto_apply_enabled meaning exactly what it always meant", () => {
    // The mechanics brake keeps its own key and its own default. Nothing here
    // changes what an existing village's setting does.
    const brake = VARIABLES_BY_KEY["governance.auto_apply_enabled"];
    expect(brake.default).toBe("true");
    expect(brake.ring).toBe("founder");
  });
});

describe("whether this village asks a steward for anything", () => {
  it("asks, on the default, even before the village has held a single vote", () => {
    // The trap this closes: answering from the list of subject types a village
    // has used would tell a brand-new village it had already outgrown the seat.
    expect(stewardIsAskedAtAll("all")).toBe(true);
    expect(stewardIsAskedAtAll("mechanics")).toBe(true);
  });

  it("stops asking when the village says none", () => {
    expect(stewardIsAskedAtAll("none")).toBe(false);
    expect(stewardIsAskedAtAll("")).toBe(false);
  });
});

describe("a refusal carries a reason", () => {
  it("refuses an empty reason", () => {
    expect(refusalReasonProblem("")).toBeTruthy();
  });

  it("refuses a reason that is only whitespace", () => {
    // The way the requirement gets met without being met.
    expect(refusalReasonProblem("   \n\t ")).toBeTruthy();
    expect(refusalReasonProblem(null)).toBeTruthy();
    expect(refusalReasonProblem(undefined)).toBeTruthy();
  });

  it("accepts a real sentence", () => {
    expect(refusalReasonProblem("This turns the mint on before the ledger is settled.")).toBeNull();
  });

  it("refuses a reason longer than the record holds", () => {
    expect(refusalReasonProblem("x".repeat(4001))).toBeTruthy();
  });

  it("lets an approval say nothing, and still holds it to the length", () => {
    // An approval is the village's own decision taking effect. Asking for a
    // justification to allow what was already voted for would be asking the
    // steward to defend the village to itself.
    expect(approvalReasonProblem("")).toBeNull();
    expect(approvalReasonProblem("x".repeat(4001))).toBeTruthy();
  });
});

describe("the capability, in all five places", () => {
  /*
   * Adding a capability key is five edits and a missed one is invisible until
   * something renders a dotted key at a member. `capabilities.test.ts` pins
   * the first three against each other; these pin the two that live outside
   * that file, so the whole set fails here rather than in production.
   */
  it("is in the canonical list", () => {
    expect(ALL_CAPABILITIES).toContain(STEWARD_APPROVE);
  });

  it("has a label a member can read, and never the raw key", () => {
    expect(CAPABILITY_LABELS[STEWARD_APPROVE]).toBeTruthy();
    expect(CAPABILITY_LABELS[STEWARD_APPROVE]).not.toContain("steward.approve");
  });

  it("has the consequence sentence the registry serves", () => {
    expect(CAPABILITY_CONSEQUENCE[STEWARD_APPROVE]).toBeTruthy();
  });

  it("can move to a role the village declared, because the seat is meant to change hands", () => {
    expect(TRANSFERABLE[STEWARD_APPROVE]).toBe(true);
  });

  it("can be paused by a warning badge, the same as every other job the village hands out", () => {
    expect(DENIABLE[STEWARD_APPROVE]).toBe(true);
  });
});
