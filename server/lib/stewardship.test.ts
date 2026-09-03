/**
 * The steward's rules that need no database.
 *
 * REWRITTEN FROM THE APPROVAL MODEL, and every rewritten assertion is here
 * because the rule it pinned is now wrong rather than because the test was.
 * The founder ruled on 2026-09-03 that the steward does not approve anything:
 * a decision the village carried lands on its own, and the seat's one power is
 * to stop it inside the window before it lands. So the old tests that pinned
 * "which decisions WAIT for a steward", "which decisions carry themselves",
 * and "an approval may carry no words" pinned a model that no longer exists.
 * What replaced each one:
 *
 *  - WHAT THE SEAT MAY STOP. One list, not two. The second list said nothing
 *    the first did not once nothing waits.
 *  - A VETO CARRIES A REASON. Unchanged in substance, and the cap came down
 *    from 4000 to 2000 because this is public permanent free text about a
 *    named neighbour.
 *  - AN EMPTY SEAT IS NOT AN ERROR, and the sentence no longer says anything
 *    waits, because nothing does.
 *  - THE COUNCIL, which is new: any single steward stops a decision unless the
 *    village turns the council on.
 *  - THE TERM IS AN INSTANT FROM THE CLOCK, which is new, and is the whole of
 *    what stops a seat that can veto from outliving its mandate.
 *
 * The database halves (the veto row, the seating, the vacancy read, the term
 * history) are in server/stewardship.db.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  ADVISORY,
  DEFAULT_TERM_CYCLES,
  REASON_MAX,
  REASON_NOTICE,
  keyIsVetoLocked,
  mayVeto,
  noObjectionReasonProblem,
  stewardMayVetoAnything,
  subjectMap,
  termEndsAtFromCycles,
  vetoReasonProblem,
  vetoWatchMarksDue,
  vetoWindowIsKnown,
  STEWARD_COUNCIL_KEY,
  STEWARD_SUBJECTS_KEY,
  STEWARD_VETO,
  VETO_HOURS_KEY,
} from "./stewardship";
import { stewardSeatRefusal, STEWARD_SEAT_REFUSAL } from "./roleGrants";
import { ALL_CAPABILITIES, CAPABILITY_LABELS, TRANSFERABLE, DENIABLE } from "../../shared/capabilities";
import { CAPABILITY_CONSEQUENCE } from "../../shared/draftKinds";
import { VARIABLES_BY_KEY } from "../../shared/gameVariables";
import { cycleBoundsFor } from "../../shared/lunar";

describe("which decisions a steward can stop", () => {
  it("can stop everything by default, because a young village runs on training wheels", () => {
    // The founder's default, read off the registry rather than retyped, so a
    // change to the default fails here instead of shipping silently.
    const def = VARIABLES_BY_KEY[STEWARD_SUBJECTS_KEY];
    expect(def, "the setting is registered, or nothing can turn it").toBeTruthy();
    expect(def.default).toBe("all");
    expect(mayVeto("mechanics", def.default)).toBe(true);
    expect(mayVeto("village_launch", def.default)).toBe(true);
  });

  it("can never stop an advisory vote, which changes nothing", () => {
    expect(mayVeto(ADVISORY, "all")).toBe(false);
    expect(mayVeto(ADVISORY, "advisory,mechanics")).toBe(false);
  });

  it("honours a named list, and treats an unnamed subject as out of reach", () => {
    expect(mayVeto("mechanics", "mechanics,mint_rule")).toBe(true);
    expect(mayVeto("role_seat", "mechanics,mint_rule")).toBe(false);
  });

  it("can stop nothing when the village says none, or leaves it blank", () => {
    for (const raw of ["none", "", "  ", "off"]) {
      expect(mayVeto("mechanics", raw), raw).toBe(false);
    }
  });

  it("tolerates the spacing and casing a person actually types", () => {
    expect(mayVeto("mechanics", " Mechanics , mint_rule ")).toBe(true);
  });

  it("answers as one map, so a surface never re-derives the rule per row", () => {
    const map = subjectMap(["mechanics", ADVISORY]);
    expect(map.map((m) => m.subjectType)).toEqual(["mechanics", ADVISORY]);
  });
});

describe("what a steward may NEVER stop, however the list is set", () => {
  /*
   * The audit of 2026-09-03 asked one question the plan had no answer to: what
   * stops a steward vetoing the ballot that removes them? Nothing did. The
   * seat blocked its own unseating, blocked the edit that would exempt it, and
   * the term that was supposed to end it hung on a season list that never
   * turned. These are the two carve-outs that answer it.
   */
  it("puts the veto map, the council switch and the window length out of reach", () => {
    expect(keyIsVetoLocked(STEWARD_SUBJECTS_KEY)).toBe(true);
    expect(keyIsVetoLocked(STEWARD_COUNCIL_KEY)).toBe(true);
    expect(keyIsVetoLocked(VETO_HOURS_KEY)).toBe(true);
  });

  it("leaves every other setting exactly where it was", () => {
    expect(keyIsVetoLocked("governance.auto_apply_enabled")).toBe(false);
    expect(keyIsVetoLocked("governance.quorum_pct")).toBe(false);
  });
});

describe("the two settings the gradient is now made of", () => {
  it("runs no council by default, so any one seated steward can stop a decision", () => {
    const def = VARIABLES_BY_KEY[STEWARD_COUNCIL_KEY];
    expect(def, "the setting is registered, or nothing can turn it").toBeTruthy();
    expect(def.default).toBe("false");
    expect(def.criticality).toBe("constitutional");
  });

  it("has retired the second list, because nothing waits for a steward any more", () => {
    // The old `governance.auto_execute_subjects` named subjects that applied
    // themselves with no steward in the loop. Under the veto model every
    // subject does that, so the key said nothing and is gone.
    expect(VARIABLES_BY_KEY["governance.auto_execute_subjects"]).toBeUndefined();
  });

  it("leaves governance.auto_apply_enabled meaning exactly what it always meant", () => {
    // The mechanics brake keeps its own key and its own default. Nothing here
    // changes what an existing village's setting does.
    const brake = VARIABLES_BY_KEY["governance.auto_apply_enabled"];
    expect(brake.default).toBe("true");
    expect(brake.ring).toBe("founder");
  });
});

describe("whether this village leaves the seat anything to stop", () => {
  it("does, on the default, even before the village has held a single vote", () => {
    // The trap this closes: answering from the list of subject types a village
    // has used would tell a brand-new village it had already outgrown the seat.
    expect(stewardMayVetoAnything("all")).toBe(true);
    expect(stewardMayVetoAnything("mechanics")).toBe(true);
  });

  it("does not, when the village says none", () => {
    expect(stewardMayVetoAnything("none")).toBe(false);
    expect(stewardMayVetoAnything("")).toBe(false);
  });
});

describe("a veto carries a reason", () => {
  it("refuses an empty reason", () => {
    expect(vetoReasonProblem("")).toBeTruthy();
  });

  it("refuses a reason that is only whitespace", () => {
    // The way the requirement gets met without being met.
    expect(vetoReasonProblem("   \n\t ")).toBeTruthy();
    expect(vetoReasonProblem(null)).toBeTruthy();
    expect(vetoReasonProblem(undefined)).toBeTruthy();
  });

  it("accepts a real sentence", () => {
    expect(vetoReasonProblem("This turns the mint on before the ledger is settled.")).toBeNull();
  });

  it("caps the reason at 2000 characters, down from the 4000 an approval allowed", () => {
    // It came down because this is public permanent free text about a named
    // neighbour, and a shorter cap is the cheapest part of that being true.
    expect(REASON_MAX).toBe(2000);
    expect(vetoReasonProblem("x".repeat(2000))).toBeNull();
    expect(vetoReasonProblem("x".repeat(2001))).toBeTruthy();
  });

  it("lets a no-objection say nothing, and still holds it to the length", () => {
    expect(noObjectionReasonProblem("")).toBeNull();
    expect(noObjectionReasonProblem("x".repeat(2001))).toBeTruthy();
  });

  it("says above the input that the words are public, permanent and redactable", () => {
    expect(REASON_NOTICE).toContain("public and permanent");
    expect(REASON_NOTICE).toContain("redacted");
  });
});

describe("the window, and the difference between open and unknown", () => {
  it("knows of no window until the dispatcher registers one", () => {
    // A build without the dispatcher lane has no lands_at to read, and saying
    // "the window is open" there would let a veto land after the decision did.
    // Saying "closed" would make the route dead. So it says neither.
    expect(vetoWindowIsKnown()).toBe(false);
  });

  it("marks the three moments a steward is told about, and only once each is due", () => {
    const carried = new Date("2026-03-01T00:00:00.000Z");
    const lands = new Date("2026-03-04T00:00:00.000Z");
    const at = (iso: string) => vetoWatchMarksDue({ carriedAt: carried, landsAt: lands }, new Date(iso));
    expect(at("2026-02-28T23:00:00.000Z")).toEqual([]);
    expect(at("2026-03-01T00:00:00.000Z")).toEqual(["carried"]);
    expect(at("2026-03-02T13:00:00.000Z")).toEqual(["carried", "halfway"]);
    expect(at("2026-03-03T22:30:00.000Z")).toEqual(["carried", "halfway", "two-hours-left"]);
  });

  it("marks nothing on a window with no width, rather than marking everything", () => {
    const t = new Date("2026-03-01T00:00:00.000Z");
    expect(vetoWatchMarksDue({ carriedAt: t, landsAt: t }, t)).toEqual([]);
    expect(vetoWatchMarksDue({ carriedAt: "not a date", landsAt: t }, t)).toEqual([]);
  });
});

describe("a term is an instant from the clock, never a season", () => {
  /*
   * The audit traced the old path: the term was "the next season turn",
   * seasons are an ungoverned admin list, both shipped entries end on one
   * date, and a founding season is documented as open-ended. A term hung on
   * that list never comes due, and the term is the only backstop on a seat
   * that can veto a decision the village carried.
   */
  it("lands on a cycle boundary, so a seat ends when everything else turns", () => {
    const from = new Date("2026-03-15T11:00:00.000Z");
    const ends = termEndsAtFromCycles(3, from);
    const here = cycleBoundsFor(from);
    expect(cycleBoundsFor(ends).cycleNumber).toBe(here.cycleNumber + 3);
    expect(ends.getTime()).toBeGreaterThan(from.getTime());
  });

  it("never returns a term of zero cycles, however it is asked", () => {
    const from = new Date("2026-03-15T11:00:00.000Z");
    for (const n of [0, -4, Number.NaN]) {
      expect(termEndsAtFromCycles(n as number, from).getTime(), String(n)).toBeGreaterThan(from.getTime());
    }
  });

  it("runs for three cycles by default, which is a season's worth of moons", () => {
    expect(DEFAULT_TERM_CYCLES).toBe(3);
  });
});

describe("the seat is the village's, and no admin route may give or take it", () => {
  /*
   * Risk 1 of the audit, in one sentence: once the steward is a veto, the veto
   * is the only human brake on a Game change, it lives on the roles plane, and
   * the roles plane has an admin path. So one account could seat itself as
   * steward, unseat the elected one, and stop whatever it liked, with a record
   * that reads as ordinary administration.
   */
  it("refuses to touch a role that already carries the veto", () => {
    const no = stewardSeatRefusal({ id: "steward", capabilities: [STEWARD_VETO] });
    expect(no).toBeTruthy();
    expect(no!.status).toBe(409);
    expect(no!.body.error).toBe(STEWARD_SEAT_REFUSAL);
  });

  it("refuses to ADD the veto to a role that does not carry it", () => {
    const no = stewardSeatRefusal({ id: "circle", capabilities: ["forum.post"] }, ["forum.post", STEWARD_VETO]);
    expect(no).toBeTruthy();
  });

  it("refuses to REMOVE the veto by writing a list without it", () => {
    // The removal path is the one an admin would reach for to clear the room,
    // and a guard that only watched additions would leave it wide open.
    const no = stewardSeatRefusal({ id: "steward", capabilities: [STEWARD_VETO] }, ["forum.post"]);
    expect(no).toBeTruthy();
  });

  it("names the two ballots, so an administrator is told where the door is", () => {
    const no = stewardSeatRefusal({ id: "steward", capabilities: [STEWARD_VETO] });
    expect(no!.body.ballots).toEqual(["role_seat", "role_unseat"]);
    expect(String(no!.body.error)).toContain("role_seat");
    expect(String(no!.body.error)).toContain("role_unseat");
  });

  it("lets every other role through untouched", () => {
    expect(stewardSeatRefusal({ id: "circle", capabilities: ["forum.post"] })).toBeNull();
    expect(stewardSeatRefusal({ id: "circle", capabilities: [] }, ["forum.post"])).toBeNull();
    expect(stewardSeatRefusal(null)).toBeNull();
  });

  it("reads a capability list however the driver hands it over", () => {
    // MySQL returns a JSON column parsed on one driver version and as a string
    // on another, and a guard that saw only one of them would be off on half
    // the deployments.
    expect(stewardSeatRefusal({ id: "steward", capabilities: JSON.stringify([STEWARD_VETO]) })).toBeTruthy();
    expect(stewardSeatRefusal({ id: "steward", capabilities: "not json at all" })).toBeNull();
  });
});

describe("the capability, in all five places", () => {
  /*
   * Adding or renaming a capability key is five edits and a missed one is
   * invisible until something renders a dotted key at a member.
   * `capabilities.test.ts` pins the first three against each other; these pin
   * the two that live outside that file, so the whole set fails here rather
   * than in production.
   */
  it("is in the canonical list", () => {
    expect(ALL_CAPABILITIES).toContain(STEWARD_VETO);
  });

  it("has left no trace of the name it used to have", () => {
    expect(ALL_CAPABILITIES).not.toContain("steward.approve" as never);
  });

  it("has a label a member can read, and never the raw key", () => {
    expect(CAPABILITY_LABELS[STEWARD_VETO]).toBeTruthy();
    expect(CAPABILITY_LABELS[STEWARD_VETO]).not.toContain("steward.veto");
  });

  it("has the consequence sentence the registry serves", () => {
    expect(CAPABILITY_CONSEQUENCE[STEWARD_VETO]).toBeTruthy();
  });

  it("can move to a role the village declared, because the seat is meant to change hands", () => {
    expect(TRANSFERABLE[STEWARD_VETO]).toBe(true);
  });

  it("CANNOT be paused by a warning badge, which was true of the approval and is not of this", () => {
    // A warning badge is written by an admin. Leaving this key deniable would
    // put the removal the ballots own back inside the badge panel, which is
    // the same door under a different name.
    expect(DENIABLE[STEWARD_VETO]).toBe(false);
  });
});
