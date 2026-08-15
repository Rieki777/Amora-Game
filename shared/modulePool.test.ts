import { describe, expect, it } from "vitest";
import { MODULES, type ModuleDef } from "./modules";
import {
  isBasePayoutAddress,
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

  it("never depends on a payout address, so a builder with no wallet still earns", () => {
    const withAddress = base({
      builtBy: "Ada Lovelace",
      builtByPayout: { chain: "base", address: "0x4E617cd113364193d215d107AdD6fa50418AA2E4" },
    });
    const without = base({ builtBy: "Ada Lovelace" });
    expect(poolStatus(withAddress)).toEqual(poolStatus(without));
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

describe("a payout address", () => {
  it("accepts a Base address", () => {
    expect(isBasePayoutAddress("0x4E617cd113364193d215d107AdD6fa50418AA2E4")).toBe(true);
  });

  it("refuses one that is too short, too long, or not hex", () => {
    expect(isBasePayoutAddress("0x4E617cd113364193d215d107AdD6fa50418AA2E")).toBe(false);
    expect(isBasePayoutAddress("0x4E617cd113364193d215d107AdD6fa50418AA2E44")).toBe(false);
    expect(isBasePayoutAddress("0xZZZ17cd113364193d215d107AdD6fa50418AA2E4")).toBe(false);
    expect(isBasePayoutAddress("4E617cd113364193d215d107AdD6fa50418AA2E4")).toBe(false);
  });

  it("refuses a malformed address rather than aiming a transfer at nothing", () => {
    const defs = [base({ builtBy: "Ada Lovelace", builtByPayout: { chain: "base", address: "0xnope" } })];
    expect(modulePayoutProblems(defs)).toHaveLength(1);
    expect(modulePayoutProblems(defs)[0]).toContain("not a Base address");
  });

  it("refuses an address with nobody credited behind it", () => {
    const defs = [base({ builtByPayout: { chain: "base", address: "0x4E617cd113364193d215d107AdD6fa50418AA2E4" } })];
    expect(modulePayoutProblems(defs)[0]).toContain("credits nobody");
  });

  it("accepts a well-formed payout", () => {
    const defs = [
      base({
        builtBy: "Ada Lovelace",
        builtByPayout: { chain: "base", address: "0x4E617cd113364193d215d107AdD6fa50418AA2E4" },
      }),
    ];
    expect(modulePayoutProblems(defs)).toEqual([]);
  });
});
