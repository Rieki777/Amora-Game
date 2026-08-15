import { describe, expect, it } from "vitest";
import {
  MANAGED_LISTING_CAP,
  MODULES,
  MODULE_LIBRARY_CONTRACT_VERSION,
  moduleListingProblems,
  registrySecretKeys,
  supportRoute,
  vendorModules,
  type ModuleDef,
} from "./modules";

/**
 * The tier is defined by where the credential lives. These assertions are what
 * keep that mechanical: a listing whose credential sits in the wrong plane is
 * not mislabelled, it is a different tier wearing the wrong word.
 *
 * `assertModuleGraph` throws on the same function at boot, and this file is why
 * a malformed entry fails in CI without anybody having to start a server.
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
  url: "https://example.invalid/product",
  supportUrl: "https://example.invalid/support",
  supportEmail: "support@example.invalid",
  statusUrl: "https://example.invalid/status",
  termsUrl: "https://example.invalid/terms",
  secretKeys: ["example_api_key"],
  liveness: { mode: "window", withinHours: 24 } as const,
};

describe("the shipped registry", () => {
  it("gives every module a tier and a data class", () => {
    for (const m of MODULES) {
      expect(m.tier, m.id).toBeDefined();
      expect(["included", "connected", "managed"], m.id).toContain(m.tier);
      expect(["none", "village-content", "member-pii"], m.id).toContain(m.dataClass);
    }
  });

  it("carries no listing problems", () => {
    expect(moduleListingProblems()).toEqual([]);
  });

  it("ships no listing yet, so the library adds no secret slot", () => {
    expect(vendorModules()).toEqual([]);
    expect(registrySecretKeys()).toEqual([]);
  });

  it("routes every platform module's support at the platform", () => {
    for (const m of MODULES) {
      expect(supportRoute(m).party, m.id).toBe("platform");
      expect(supportRoute(m).vendorName, m.id).toBeNull();
    }
  });
});

describe("what a listing must carry", () => {
  it("accepts a well-formed connected listing", () => {
    expect(moduleListingProblems([base({ tier: "connected", vendor: { ...goodVendor } })])).toEqual([]);
  });

  it("refuses a listing with no named counterparty", () => {
    const problems = moduleListingProblems([base({ tier: "connected" })]);
    expect(problems.join(" ")).toContain("names no counterparty");
  });

  it("refuses a listing with no support email, at every tier", () => {
    const noEmail = { ...goodVendor, supportEmail: "" };
    expect(moduleListingProblems([base({ tier: "connected", vendor: noEmail })]).join(" ")).toContain("support email");
    expect(
      moduleListingProblems([
        base({ tier: "managed", vendor: { ...noEmail, secretKeys: [], managedEnvKey: "EXAMPLE_PLATFORM_KEY" } }),
      ]).join(" "),
    ).toContain("support email");
  });

  it("refuses a listing with no support URL", () => {
    const problems = moduleListingProblems([base({ tier: "connected", vendor: { ...goodVendor, supportUrl: "" } })]);
    expect(problems.join(" ")).toContain("supportUrl");
  });

  it("refuses a managed listing that puts its credential in the village's store", () => {
    const problems = moduleListingProblems([
      base({ tier: "managed", vendor: { ...goodVendor, managedEnvKey: "EXAMPLE_PLATFORM_KEY" } }),
    ]);
    expect(problems.join(" ")).toContain("platform-held");
  });

  it("refuses a managed listing that names no environment variable", () => {
    const problems = moduleListingProblems([base({ tier: "managed", vendor: { ...goodVendor, secretKeys: [] } })]);
    expect(problems.join(" ")).toContain("names no environment variable");
  });

  it("refuses a managed listing that prints setup steps the village cannot perform", () => {
    const problems = moduleListingProblems([
      base({
        tier: "managed",
        vendor: { ...goodVendor, secretKeys: [], managedEnvKey: "EXAMPLE_PLATFORM_KEY", setupSteps: ["Log into their dashboard"] },
      }),
    ]);
    expect(problems.join(" ")).toContain("no account here");
  });

  it("refuses a connected listing with no key the village can hold", () => {
    const problems = moduleListingProblems([base({ tier: "connected", vendor: { ...goodVendor, secretKeys: [] } })]);
    expect(problems.join(" ")).toContain("no secret slot");
  });

  it("refuses an included module that carries a counterparty", () => {
    const problems = moduleListingProblems([base({ tier: "included", vendor: { ...goodVendor } })]);
    expect(problems.join(" ")).toContain("carries a vendor record");
  });

  it("refuses a liveness window of zero hours", () => {
    const problems = moduleListingProblems([
      base({ tier: "connected", vendor: { ...goodVendor, liveness: { mode: "window", withinHours: 0 } } }),
    ]);
    expect(problems.join(" ")).toContain("liveness window");
  });
});

describe("who a village is sent to", () => {
  it("sends a connected listing at the vendor, by name and by address", () => {
    const route = supportRoute(base({ tier: "connected", vendor: { ...goodVendor } }));
    expect(route.party).toBe("vendor");
    expect(route.vendorName).toBe("Example Systems Ltd");
    expect(route.supportUrl).toBe("https://example.invalid/support");
    expect(route.supportEmail).toBe("support@example.invalid");
  });

  it("never names the vendor behind a managed listing", () => {
    const route = supportRoute(
      base({ tier: "managed", vendor: { ...goodVendor, secretKeys: [], managedEnvKey: "EXAMPLE_PLATFORM_KEY" } }),
    );
    expect(route.party).toBe("platform");
    expect(route.vendorName).toBeNull();
  });
});

describe("secret slots the registry contributes", () => {
  it("takes a connected listing's slots", () => {
    expect(registrySecretKeys([base({ tier: "connected", vendor: { ...goodVendor } })])).toEqual(["example_api_key"]);
  });

  it("takes nothing from a managed listing, whatever it declares", () => {
    // Belt and braces: moduleListingProblems already refuses this shape, and
    // the derivation refuses it a second time, because a managed credential
    // reaching the village's store is the one mistake with no recovery.
    const rogue = base({ tier: "managed", vendor: { ...goodVendor, secretKeys: ["should_never_appear"] } });
    expect(registrySecretKeys([rogue])).toEqual([]);
  });
});

describe("the managed cap", () => {
  const managed = (id: string) =>
    base({ id, tier: "managed", vendor: { ...goodVendor, secretKeys: [], managedEnvKey: `${id.toUpperCase()}_KEY`, setupSteps: undefined } });

  it("allows two, because the second is a transition slot", () => {
    expect(moduleListingProblems([managed("m1"), managed("m2")])).toEqual([]);
  });

  it("refuses a third", () => {
    const problems = moduleListingProblems([managed("m1"), managed("m2"), managed("m3")]);
    expect(problems.join(" ")).toContain(`against a cap of ${MANAGED_LISTING_CAP}`);
  });

  it("counts only managed, so connected listings are uncapped", () => {
    const connected = (id: string) => base({ id, tier: "connected", vendor: { ...goodVendor } });
    expect(moduleListingProblems([connected("c1"), connected("c2"), connected("c3"), connected("c4")])).toEqual([]);
  });
});

describe("the contract version", () => {
  it("is a value a listing can be stamped against", () => {
    expect(MODULE_LIBRARY_CONTRACT_VERSION).toMatch(/^\d+\.\d+$/);
  });
});
