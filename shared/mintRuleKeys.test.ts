/**
 * The address a ballot uses to name a minting rule, pinned.
 *
 * The property that carries the whole design is the FIRST one: a mint rule key
 * and a game dial key can never be mistaken for each other. If that ever stops
 * holding, `validateChangeSet` starts sending a mint rule down the dial writer
 * or the other way round, and both directions are a silent wrong number in the
 * one table that decides what the village pays.
 */
import { describe, expect, it } from "vitest";
import { VARIABLES_BY_KEY } from "./gameVariables";
import {
  AMOUNT_FROM_SOURCE,
  MINT_RULE_FIELDS,
  displayMintRuleValue,
  isMintRuleKey,
  mintRuleKey,
  mintRuleValueNumber,
  mintRuleValueProblem,
  parseMintRuleKey,
} from "./mintRuleKeys";

describe("mint rule keys cannot be confused with dials", () => {
  it("no dial in the registry parses as a mint rule key", () => {
    const keys = Object.keys(VARIABLES_BY_KEY);
    // A zero-length registry would pass every assertion below without
    // checking anything, which is the shape of a green gate that ran nothing.
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      expect(isMintRuleKey(key), key).toBe(false);
      expect(parseMintRuleKey(key), key).toBeNull();
    }
  });

  it("no mint rule key collides with a dial", () => {
    for (const field of MINT_RULE_FIELDS) {
      const key = mintRuleKey("rule-role.cycle-gratitude", field);
      expect(VARIABLES_BY_KEY[key], key).toBeUndefined();
    }
  });
});

describe("reading a mint rule key", () => {
  it("round trips a real seeded rule id, dots and all", () => {
    for (const ruleId of ["rule-quest.completed-village-voice", "rule-role.cycle-gratitude"]) {
      for (const field of MINT_RULE_FIELDS) {
        expect(parseMintRuleKey(mintRuleKey(ruleId, field))).toEqual({ ruleId, field });
      }
    }
  });

  it("returns null instead of guessing", () => {
    expect(parseMintRuleKey("governance.unity_pct")).toBeNull();
    expect(parseMintRuleKey("mint:rule-role.cycle-gratitude")).toBeNull();
    expect(parseMintRuleKey("mint:rule-role.cycle-gratitude:recipient")).toBeNull();
    expect(parseMintRuleKey("mint::amount")).toBeNull();
    expect(parseMintRuleKey("mint:rule-x:")).toBeNull();
  });
});

describe("what a field will accept", () => {
  it("an amount is above zero, or reads itself from the work", () => {
    expect(mintRuleValueProblem("amount", "20")).toBeNull();
    expect(mintRuleValueProblem("amount", AMOUNT_FROM_SOURCE)).toBeNull();
    expect(mintRuleValueProblem("amount", "0")).toContain("greater than zero");
    expect(mintRuleValueProblem("amount", "-1")).toContain("greater than zero");
    expect(mintRuleValueProblem("amount", "many")).toContain("number");
    expect(mintRuleValueProblem("amount", "")).toContain("number");
  });

  it("a ceiling is zero or more, and zero means zero", () => {
    expect(mintRuleValueProblem("ceiling", "0")).toBeNull();
    expect(mintRuleValueProblem("ceiling", "100")).toBeNull();
    expect(mintRuleValueProblem("ceiling", "-1")).toContain("zero or more");
    // The amount's escape hatch is the amount's alone. A ceiling read off the
    // work is an open faucet with a form in front of it.
    expect(mintRuleValueProblem("ceiling", AMOUNT_FROM_SOURCE)).toContain("number");
  });

  it("enabled is on or off and nothing else", () => {
    expect(mintRuleValueProblem("enabled", "true")).toBeNull();
    expect(mintRuleValueProblem("enabled", "false")).toBeNull();
    expect(mintRuleValueProblem("enabled", "1")).toContain("true or false");
    expect(mintRuleValueProblem("enabled", "yes")).toContain("true or false");
  });
});

describe("what a member reads", () => {
  it("says the value, never the column", () => {
    expect(displayMintRuleValue("enabled", "true")).toBe("On");
    expect(displayMintRuleValue("enabled", "false")).toBe("Off");
    expect(displayMintRuleValue("amount", AMOUNT_FROM_SOURCE)).toContain("posted for");
    expect(displayMintRuleValue("amount", "20")).toBe("20");
  });

  it("the source spelling becomes a real null for the column", () => {
    expect(mintRuleValueNumber("amount", AMOUNT_FROM_SOURCE)).toBeNull();
    expect(mintRuleValueNumber("amount", "20")).toBe(20);
    expect(mintRuleValueNumber("ceiling", "0")).toBe(0);
  });
});
