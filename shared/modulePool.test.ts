import { describe, expect, it } from "vitest";
import { MODULES, type ModuleDef } from "./modules";
import {
  isBuilderHandle,
  modulePayoutProblems,
  poolEligibleModules,
  poolPaidModules,
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
  it("takes a free module somebody outside the platform wrote, and pays it", () => {
    const m = base({ builtBy: "Ada Lovelace" });
    expect(poolStatus(m)).toEqual({ eligible: true, reason: "free-third-party", disposition: "paid" });
  });

  it("takes a module the platform wrote itself, and recycles its share (R59)", () => {
    expect(poolStatus(base({}))).toEqual({
      eligible: true,
      reason: "platform-built",
      disposition: "recycled",
    });
  });

  it("reads a blank credit as the platform's own, the same way the registry lint does", () => {
    expect(poolStatus(base({ builtBy: "   " }))).toEqual({
      eligible: true,
      reason: "platform-built",
      disposition: "recycled",
    });
  });

  it("takes a core module, and recycles its share", () => {
    expect(poolStatus(base({ core: true, builtBy: "Ada Lovelace" }))).toEqual({
      eligible: true,
      reason: "core",
      disposition: "recycled",
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
    expect(poolStatus(m)).toEqual({ eligible: false, reason: "paid", disposition: "none" });
  });

  it("keeps a listing that prices itself at zero, because zero is free out loud", () => {
    const m = base({
      builtBy: "Ada Lovelace",
      tier: "connected",
      vendor: goodVendor,
      pricing: { amount: 0, currency: "USD", period: "month", billingUrl: "https://example.com/buy" },
    });
    expect(poolStatus(m)).toEqual({ eligible: true, reason: "free-third-party", disposition: "paid" });
  });

  it("leaves out a withdrawn module even where it was free and third party", () => {
    const m = base({ builtBy: "Ada Lovelace", withdrawn: { since: "2026-08-01" } });
    expect(poolStatus(m)).toEqual({ eligible: false, reason: "withdrawn", disposition: "none" });
  });

  it("lets a withdrawal beat a core or platform credit, so a left listing stops absorbing weight", () => {
    /*
     * The check order had to invert for R59. Core and platform-built are now
     * inclusions, so if they were still asked first a withdrawn platform module
     * would report `recycled` and keep taking a share of a pool it had left.
     * That is not cosmetic: weight absorbed and recycled is weight the
     * remaining builders are not paid this cycle.
     */
    const m = base({ core: true, builtBy: "Ada Lovelace", withdrawn: { since: "2026-08-01" } });
    expect(poolStatus(m)).toEqual({ eligible: false, reason: "withdrawn", disposition: "none" });
  });

  it("never depends on an account, so a builder with no ReGen Civics login still earns", () => {
    const withAccount = base({ builtBy: "Ada Lovelace", builtByAccount: "ada" });
    const without = base({ builtBy: "Ada Lovelace" });
    expect(poolStatus(withAccount)).toEqual(poolStatus(without));
  });

  it("counts a platform module as eligible and a third-party one as paid", () => {
    const defs = [
      base({ id: "a", builtBy: "Ada Lovelace" }),
      base({ id: "b" }),
      base({ id: "c", builtBy: "Grace Hopper" }),
      base({ id: "d", withdrawn: { since: "2026-08-01" } }),
    ];
    // R59: the platform's own module earns, so it is IN the eligible set.
    expect(poolEligibleModules(defs).map((m) => m.id)).toEqual(["a", "b", "c"]);
    // Only somebody outside the platform is owed anything.
    expect(poolPaidModules(defs).map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("the shipped registry", () => {
  it("gives every module a pool verdict and a disposition", () => {
    for (const m of MODULES) {
      const status = poolStatus(m);
      expect(typeof status.eligible).toBe("boolean");
      expect(status.reason).toBeTruthy();
      expect(["paid", "recycled", "none"]).toContain(status.disposition);
      expect(status.eligible).toBe(status.disposition !== "none");
    }
  });

  it("owes nobody anything today, and recycles every share it awards", () => {
    /*
     * No module in the registry carries a `builtBy` credit, so every one of
     * them is the platform's own. Under R59 that makes them all ELIGIBLE and
     * all RECYCLED: the pool awards shares, the shares return to the pool, and
     * the treasury owes nothing to anybody. The day a third party lands a
     * module this assertion moves and the statement gains a payable line.
     */
    expect(poolPaidModules(MODULES)).toEqual([]);
    for (const m of poolEligibleModules(MODULES)) {
      expect(poolStatus(m).disposition).toBe("recycled");
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
    expect(isBuilderHandle("ada1815")).toBe(true);
  });

  it("refuses an at sign, a space, an uppercase letter, or a URL", () => {
    expect(isBuilderHandle("@ada")).toBe(false);
    expect(isBuilderHandle("ada lovelace")).toBe(false);
    expect(isBuilderHandle("Ada")).toBe(false);
    expect(isBuilderHandle("https://example.com/ada")).toBe(false);
    expect(isBuilderHandle("")).toBe(false);
  });

  it("matches the hub's own handle rule, so an accepted handle is a storable one", () => {
    /*
     * Copied from regen-civics `server/db.ts` HANDLE_RE. Underscores are the
     * trap: they read as handle-ish and the hub refuses them, so a registry
     * that accepted one would name an account that can never exist.
     */
    const hub = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
    const cases = ["ada", "ada-lovelace", "a", "ada_lovelace", "-ada", "ada-", "ADA", "ada.lovelace"];
    for (const c of cases) expect(isBuilderHandle(c)).toBe(hub.test(c));
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
