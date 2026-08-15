import { describe, expect, it } from "vitest";
import { MODULES, type ModuleDef } from "./modules";
import {
  isBuilderHandle,
  modulePayoutProblems,
  poolEligibleModules,
  poolStatus,
} from "./modulePool";

/**
 * Eligibility is DERIVED, and these assertions are what keep it that way: every
 * case here is stated as registry fields going in and a verdict coming out, so
 * a future stored flag would have to disagree with a test to exist.
 */
const base = (over: Partial<ModuleDef>): ModuleDef => ({
  id: "fixture",
  name: "Fixture",
  description: "A registry entry that exists only inside this test.",
  tier: "included",
  dataClass: "none",
  requires: [],
  recommends: [],
  capabilities: [],
  variableKeys: [],
  apiPrefixes: ["/api/fixture"],
  ...over,
});

const goodVendor = {
  legalName: "Example Systems Ltd",
  url: "https://example.com/product",
  supportUrl: "https://example.com/support",
  supportEmail: "support@example.com",
  statusUrl: "https://status.example.com",
  termsUrl: "https://example.com/terms",
  secretKeys: ["example_api_key"],
  liveness: { mode: "on-demand" } as const,
};

describe("who the pool pays", () => {
  it("takes a free module somebody outside the platform wrote", () => {
    const m = base({ builtBy: "Ada Lovelace" });
    expect(poolStatus(m)).toEqual({ eligible: true, reason: "free-third-party" });
  });

  it("leaves out a module the platform wrote itself", () => {
    expect(poolStatus(base({}))).toEqual({ eligible: false, reason: "platform-built" });
  });

  it("reads a blank credit as the platform's own, the same way the registry lint does", () => {
    expect(poolStatus(base({ builtBy: "   " }))).toEqual({ eligible: false, reason: "platform-built" });
  });

  it("leaves out a core module", () => {
    expect(poolStatus(base({ core: true, builtBy: "Ada Lovelace" }))).toEqual({
      eligible: false,
      reason: "core",
    });
  });

  it("leaves out a module that charges the village", () => {
    const m = base({
      builtBy: "Ada Lovelace",
      tier: "connected",
      vendor: goodVendor,
      pricing: {
        amount: 900,
        currency: "USD",
        period: "month",
        billingUrl: "https://example.com/buy",
        licenceKey: "example_api_key",
      },
    });
    expect(poolStatus(m)).toEqual({ eligible: false, reason: "paid" });
  });

  it("keeps a listing that prices itself at zero, because zero is free out loud", () => {
    const m = base({
      builtBy: "Ada Lovelace",
      tier: "connected",
      vendor: goodVendor,
      pricing: { amount: 0, currency: "USD", period: "month", billingUrl: "https://example.com/buy" },
    });
    expect(poolStatus(m)).toEqual({ eligible: true, reason: "free-third-party" });
  });

  it("leaves out a withdrawn module even where it was free and third party", () => {
    const m = base({ builtBy: "Ada Lovelace", withdrawn: { since: "2026-08-01" } });
    expect(poolStatus(m)).toEqual({ eligible: false, reason: "withdrawn" });
  });

  it("reports the most structural reason first when several apply", () => {
    const m = base({
      core: true,
      builtBy: "Ada Lovelace",
      withdrawn: { since: "2026-08-01" },
    });
    expect(poolStatus(m).reason).toBe("core");
  });

  it("never depends on an account, so a builder with no ReGen Civics login still earns", () => {
    const withAccount = base({ builtBy: "Ada Lovelace", builtByAccount: "ada" });
    const without = base({ builtBy: "Ada Lovelace" });
    expect(poolStatus(withAccount)).toEqual(poolStatus(without));
  });

  it("filters a registry down to the eligible entries, in registry order", () => {
    const defs = [
      base({ id: "a", builtBy: "Ada Lovelace" }),
      base({ id: "b" }),
      base({ id: "c", builtBy: "Grace Hopper" }),
    ];
    expect(poolEligibleModules(defs).map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("the shipped registry", () => {
  it("gives every module a pool verdict", () => {
    for (const m of MODULES) {
      const status = poolStatus(m);
      expect(typeof status.eligible).toBe("boolean");
      expect(status.reason).toBeTruthy();
    }
  });

  it("pays nobody out of the pool for the platform's own work", () => {
    // Every module shipped today is the platform's own, so the pool is empty
    // and the treasury owes nothing. The day a third party lands one, this
    // number moves and the statement has a line in it.
    for (const m of poolEligibleModules(MODULES)) {
      expect(m.builtBy?.trim()).toBeTruthy();
      expect(m.core ?? false).toBe(false);
    }
  });

  it("carries no payout problems", () => {
    expect(modulePayoutProblems(MODULES)).toEqual([]);
  });
});

describe("the builder's ReGen Civics account", () => {
  it("accepts an ordinary handle", () => {
    expect(isBuilderHandle("ada")).toBe(true);
    expect(isBuilderHandle("ada-lovelace")).toBe(true);
    expect(isBuilderHandle("ada_lovelace_1815")).toBe(true);
  });

  it("refuses an at sign, a space, an uppercase letter, or a URL", () => {
    expect(isBuilderHandle("@ada")).toBe(false);
    expect(isBuilderHandle("ada lovelace")).toBe(false);
    expect(isBuilderHandle("Ada")).toBe(false);
    expect(isBuilderHandle("https://example.com/ada")).toBe(false);
    expect(isBuilderHandle("a")).toBe(false);
    expect(isBuilderHandle("")).toBe(false);
  });

  it("names the wallet-address mistake specifically, and only once", () => {
    const defs = [
      base({
        builtBy: "Ada Lovelace",
        builtByAccount: "0x4e617cd113364193d215d107add6fa50418aa2e4",
      }),
    ];
    const problems = modulePayoutProblems(defs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("links their own address in their own profile");
  });

  it("refuses a handle shaped like a display name", () => {
    const defs = [base({ builtBy: "Ada Lovelace", builtByAccount: "@AdaLovelace" })];
    expect(modulePayoutProblems(defs)).toHaveLength(1);
    expect(modulePayoutProblems(defs)[0]).toContain("A handle is lowercase letters");
  });

  it("refuses an account with nobody credited behind it", () => {
    const defs = [base({ builtByAccount: "ada" })];
    expect(modulePayoutProblems(defs)[0]).toContain("credits nobody");
  });

  it("accepts a well-formed pairing", () => {
    const defs = [base({ builtBy: "Ada Lovelace", builtByAccount: "ada" })];
    expect(modulePayoutProblems(defs)).toEqual([]);
  });

  it("says nothing about a module that names no account, because that is a real state", () => {
    expect(modulePayoutProblems([base({ builtBy: "Ada Lovelace" })])).toEqual([]);
  });
});
