/**
 * The declare rights matrix, and the pin on the one exception.
 *
 * docs/ADR_2026-08_REPRESENTS_CIRCLE_DECLARES.md records the only place a
 * fact from the seat plane participates in a permission decision: a live
 * holder of a seat flagged represents_circle may declare how THAT circle
 * decides. This file is the pinning test the ADR names. If a change makes
 * one of these assertions move, the ADR is the document to argue with first.
 */
import { describe, expect, it } from "vitest";
import { ALL_CAPABILITIES, STAGE_UNLOCKS } from "../../shared/capabilities";
import {
  circleDecidesProblem,
  declarableTargets,
  mayDeclare,
  projectDecidesByDomains,
  villagePowerProblem,
  type DeclareContext,
} from "./orgChart";

const seat = (id: string, circleId: string, over: Partial<DeclareContext["roles"][number]> = {}) => ({
  id,
  circleId,
  representsCircle: true,
  active: true,
  isExample: false,
  ...over,
});

const holding = (orgRoleId: string, userId: string, over: Partial<DeclareContext["assignments"][number]> = {}) => ({
  orgRoleId,
  userId,
  endedAt: null,
  isExample: false,
  ...over,
});

const ctx = (over: Partial<DeclareContext> = {}): DeclareContext => ({
  isAdmin: false,
  hasOrgDeclare: false,
  userId: "u-ada",
  roles: [],
  assignments: [],
  ...over,
});

describe("the rights matrix (P10)", () => {
  it("admin declares anywhere", () => {
    const c = ctx({ isAdmin: true });
    expect(mayDeclare("village", c)).toBe(true);
    expect(mayDeclare("kitchen", c)).toBe(true);
  });

  it("org.declare declares anywhere", () => {
    const c = ctx({ hasOrgDeclare: true });
    expect(mayDeclare("village", c)).toBe(true);
    expect(mayDeclare("kitchen", c)).toBe(true);
  });

  it("a live holder of a represents_circle seat declares for that circle", () => {
    const c = ctx({
      roles: [seat("kitchen-delegate", "kitchen")],
      assignments: [holding("kitchen-delegate", "u-ada")],
    });
    expect(mayDeclare("kitchen", c)).toBe(true);
  });

  it("a stranger, a plain member and an unflagged seat declare nothing", () => {
    expect(mayDeclare("kitchen", ctx())).toBe(false);
    expect(mayDeclare("kitchen", ctx({ userId: null }))).toBe(false);
    const unflagged = ctx({
      roles: [seat("kitchen-lead", "kitchen", { representsCircle: false })],
      assignments: [holding("kitchen-lead", "u-ada")],
    });
    expect(mayDeclare("kitchen", unflagged)).toBe(false);
  });
});

describe("the pin: the bridge stays exactly one circle wide", () => {
  const delegate = ctx({
    roles: [seat("kitchen-delegate", "kitchen")],
    assignments: [holding("kitchen-delegate", "u-ada")],
  });

  it("opens nothing at village level", () => {
    expect(mayDeclare("village", delegate)).toBe(false);
  });

  it("opens nothing in any other circle", () => {
    expect(mayDeclare("council", delegate)).toBe(false);
    expect(mayDeclare("land", delegate)).toBe(false);
  });

  it("closes when the holding ends", () => {
    const ended = ctx({
      roles: [seat("kitchen-delegate", "kitchen")],
      assignments: [holding("kitchen-delegate", "u-ada", { endedAt: new Date("2026-08-01") })],
    });
    expect(mayDeclare("kitchen", ended)).toBe(false);
  });

  it("never opens through somebody else's holding", () => {
    const other = ctx({
      roles: [seat("kitchen-delegate", "kitchen")],
      assignments: [holding("kitchen-delegate", "u-bo")],
    });
    expect(mayDeclare("kitchen", other)).toBe(false);
  });

  it("treats example seats and example seatings as inert", () => {
    const exampleSeat = ctx({
      roles: [seat("ex-delegate", "kitchen", { isExample: true })],
      assignments: [holding("ex-delegate", "u-ada")],
    });
    expect(mayDeclare("kitchen", exampleSeat)).toBe(false);
    const exampleSeating = ctx({
      roles: [seat("kitchen-delegate", "kitchen")],
      assignments: [holding("kitchen-delegate", "u-ada", { isExample: true })],
    });
    expect(mayDeclare("kitchen", exampleSeating)).toBe(false);
  });

  it("ignores a rested seat", () => {
    const rested = ctx({
      roles: [seat("kitchen-delegate", "kitchen", { active: false })],
      assignments: [holding("kitchen-delegate", "u-ada")],
    });
    expect(mayDeclare("kitchen", rested)).toBe(false);
  });

  it("a circle literally named village never reaches the village door", () => {
    // declarableTargets skips a circle id of "village", so a village cannot
    // accidentally hand its shape to a circle by naming one after itself.
    const odd = ctx({
      roles: [seat("delegate", "village")],
      assignments: [holding("delegate", "u-ada")],
    });
    expect(declarableTargets(odd, ["village", "kitchen"])).toEqual([]);
  });

  it("org.declare is never granted by climbing", () => {
    // The appointment rule: the key exists, and no stage unlocks it. This is
    // the assertion the ADR points at when someone reaches for a rung.
    expect(ALL_CAPABILITIES).toContain("org.declare");
    expect(Object.keys(STAGE_UNLOCKS)).not.toContain("org.declare");
  });
});

describe("declarableTargets, which feeds viewer.mayDeclare", () => {
  it("lists village first for admins, then every circle", () => {
    expect(declarableTargets(ctx({ isAdmin: true }), ["kitchen", "land"])).toEqual([
      "village",
      "kitchen",
      "land",
    ]);
  });

  it("lists only the represented circle for a delegate", () => {
    const c = ctx({
      roles: [seat("kitchen-delegate", "kitchen")],
      assignments: [holding("kitchen-delegate", "u-ada")],
    });
    expect(declarableTargets(c, ["kitchen", "land"])).toEqual(["kitchen"]);
  });

  it("lists nothing for a plain member", () => {
    expect(declarableTargets(ctx(), ["kitchen", "land"])).toEqual([]);
  });
});

describe("what a declaration may say", () => {
  it("village power needs a valid shape and method", () => {
    expect(villagePowerProblem({ shape: "circle", decidesBy: "consent" })).toBeNull();
    expect(villagePowerProblem({ shape: "other", shapeGloss: "Two stewards hold it", decidesBy: "consent" })).toBeNull();
    expect(villagePowerProblem({ shape: "holacracy", decidesBy: "consent" })).toContain("must be one of");
    expect(villagePowerProblem({ shape: "other", decidesBy: "consent" })).toContain("one line");
    expect(villagePowerProblem({ shape: "circle", decidesBy: "vibes" })).toContain("must be one of");
    expect(villagePowerProblem(null)).toContain("shape");
  });

  it("refuses stowaway keys by name", () => {
    expect(villagePowerProblem({ shape: "circle", decidesBy: "consent", isAdmin: true })).toContain('"isAdmin"');
  });

  it("stores exactly {method, gloss} per domain: residue is stripped at write", () => {
    // The security review's one note, closed: a valid domain entry can
    // arrive carrying stowaway keys, and a JSON column that stores the body
    // as given hands unvalidated data to every future reader. The write
    // path projects, so only the vocabulary's own fields survive.
    expect(
      projectDecidesByDomains({
        money: { method: "consent", gloss: "  ask first  ", sneak: "payload", nested: { deep: 1 } },
        rules: { method: "hypha" },
      }),
    ).toEqual({
      money: { method: "consent", gloss: "ask first" },
      rules: { method: "hypha" },
    });
    expect(projectDecidesByDomains({})).toBeNull();
    expect(projectDecidesByDomains(null)).toBeNull();
    expect(projectDecidesByDomains([])).toBeNull();
    // An entry with no method carries nothing worth keeping.
    expect(projectDecidesByDomains({ money: { gloss: "orphan" } })).toBeNull();
    const projected = projectDecidesByDomains({ money: { method: "consent", extra: true } })!;
    expect(JSON.stringify(projected)).not.toContain("extra");
  });

  it("a circle may declare, override by domain, or clear back to the default", () => {
    expect(circleDecidesProblem({ decidesBy: "consent" })).toBeNull();
    expect(circleDecidesProblem({ decidesBy: null })).toBeNull();
    expect(
      circleDecidesProblem({
        decidesBy: "consent",
        decidesByDomains: { money: { method: "lead_decides" } },
      }),
    ).toBeNull();
    expect(circleDecidesProblem({ decidesBy: "feudalism" })).toContain("must be one of");
    expect(circleDecidesProblem({ decidesBy: "consent", decidesByDomains: { weather: { method: "consent" } } })).toContain('"weather"');
    expect(circleDecidesProblem({ decidesBy: "consent", sneak: 1 })).toContain('"sneak"');
  });
});
