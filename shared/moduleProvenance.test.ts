/**
 * The wire format, pinned.
 *
 * This file is the reason `shared/moduleProvenance.ts` is shared rather than a
 * server helper: the report a counter reads is a contract between two programs
 * in two repositories, and a contract nobody can run is a comment. Everything
 * here is pure, so it runs without a database and fails in a second.
 *
 * The two properties a regression would be most expensive on are pinned first
 * and hardest: the SATURATING CAP that makes the number un-gameable, and the
 * SEAL that makes a closed cycle unattributable to any member. The database
 * side of both is pinned in `server/moduleUsage.test.ts` and driven over HTTP
 * in `server/modulePool.e2e.test.ts`. This is the third leg: a counter reading
 * a report it did not build refuses one that broke either.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildModuleUsageReport,
  moduleProvenance,
  moduleUsageReportProblems,
  MODULE_USAGE_PROTOCOL,
  reachOf,
  type CycleCounts,
  type ModuleUsageReport,
} from "./moduleProvenance";
import {
  isBuilderNamespace,
  moduleListingProblems,
  MODULES,
  MODULE_LIBRARY_CONTRACT_VERSION,
  type ModuleDef,
} from "./modules";

const base = (over: Partial<ModuleDef> = {}): ModuleDef => ({
  id: "sample",
  name: "Sample",
  description: "A module.",
  tier: "included",
  dataClass: "none",
  requires: [],
  recommends: [],
  capabilities: [],
  variableKeys: [],
  apiPrefixes: ["/api/sample"],
  ...over,
});

const counts = (over: Partial<CycleCounts> = {}): CycleCounts => ({
  cycleId: "lunar-000900",
  sealed: false,
  sealedAt: null,
  activeMembers: 4,
  modules: [{ moduleId: "tools", membersReached: 3 }],
  ...over,
});

const report = (over: Partial<ModuleUsageReport> = {}): ModuleUsageReport => ({
  ...buildModuleUsageReport(counts(), "instance-1", MODULES),
  ...over,
});

describe("the cap, which is the whole anti-inflation argument", () => {
  it("divides by the members who showed up", () => {
    expect(reachOf(3, 4)).toBe(0.75);
    expect(reachOf(3, 400)).toBe(0.0075);
  });

  it("holds one village at one however far the counts drift apart", () => {
    // A partial re-seal, or a numerator and a denominator read a moment apart,
    // can put the raw division above one. Inflating members inflates the
    // denominator as fast as the numerator, so the ceiling is one village.
    expect(reachOf(5, 2)).toBe(1);
    expect(reachOf(4000, 4)).toBe(1);
  });

  it("calls a cycle nobody was active in zero rather than dividing by it", () => {
    expect(reachOf(0, 0)).toBe(0);
    expect(reachOf(7, 0)).toBe(0);
  });

  it("refuses a report claiming more than one village's worth of weight", () => {
    const bad = report();
    bad.modules[0]!.reach = 4;
    const problems = moduleUsageReportProblems(bad);
    expect(problems.join(" ")).toContain("between none and one");
  });

  it("refuses a reach that its own counts do not produce", () => {
    // The subtle one. Every number here is inside its own range, and the
    // division still does not hold, which is what a village inflating its
    // favourite module by a plausible amount would look like on the wire.
    const bad = report();
    bad.modules[0]!.reach = 0.9;
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("its own counts give 0.75");
  });

  it("refuses a module that reached more people than were active", () => {
    const bad = buildModuleUsageReport(
      counts({ activeMembers: 2, modules: [{ moduleId: "tools", membersReached: 9 }] }),
      "instance-1",
      MODULES,
    );
    // The reach is capped, so the arithmetic still closes. The counts do not.
    expect(bad.modules[0]!.reach).toBe(1);
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("which cannot happen");
  });

  it("refuses a module listed twice, whose reach would be counted twice", () => {
    const bad = report();
    bad.modules.push({ ...bad.modules[0]! });
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("appears twice");
  });

  it("refuses a line measured against a denominator the report does not report", () => {
    const bad = report();
    bad.modules[0]!.activeMembers = 2;
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("and the report says 4");
  });
});

describe("the seal, which is a privacy property", () => {
  it("carries the seal time on a sealed cycle, and none on an open one", () => {
    const open = buildModuleUsageReport(counts(), "instance-1", MODULES);
    expect(open.sealed).toBe(false);
    expect(open.sealedAt).toBeNull();

    const sealedAt = "2026-08-29T12:00:00.000Z";
    const sealed = buildModuleUsageReport(counts({ sealed: true, sealedAt }), "instance-1", MODULES);
    expect(sealed.sealed).toBe(true);
    expect(sealed.sealedAt).toBe(sealedAt);
    expect(moduleUsageReportProblems(sealed)).toEqual([]);
  });

  it("refuses a sealed report with no seal time, which is a settlement with no date", () => {
    const bad = report({ sealed: true, sealedAt: null });
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("gives no seal time");
  });

  it("refuses an open report that carries a seal time", () => {
    const bad = report({ sealed: false, sealedAt: "2026-08-29T12:00:00.000Z" });
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("one of the two is wrong");
  });

  it("carries no member anywhere, on an open cycle or a sealed one", () => {
    /*
     * The report is built from counts and there is no field that could hold a
     * person, which is the structural half of the guarantee. This is the
     * observable half: every key and every value, read as text.
     */
    for (const r of [
      buildModuleUsageReport(counts(), "instance-1", MODULES),
      buildModuleUsageReport(counts({ sealed: true, sealedAt: "2026-08-29T12:00:00.000Z" }), "i", MODULES),
    ]) {
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/user|member_id|memberId|email|@/i);
      for (const m of r.modules) {
        expect(Object.keys(m).sort()).toEqual([
          "activeMembers",
          "builderHandle",
          "builderNamespace",
          "builtBy",
          "disposition",
          "membersReached",
          "moduleId",
          "platformBuilt",
          "reach",
        ]);
      }
    }
  });
});

describe("provenance travels with the module", () => {
  it("reads the credit off the registry entry and nowhere else", () => {
    const p = moduleProvenance(
      base({ id: "atlas", builtBy: "Ada Lovelace", builtByAccount: "ada", builtByNamespace: "example.org" }),
    );
    expect(p).toEqual({
      moduleId: "atlas",
      builtBy: "Ada Lovelace",
      builderHandle: "ada",
      builderNamespace: "example.org",
      platformBuilt: false,
      disposition: "paid",
    });
  });

  it("calls a module with no credit platform built, and recycles its share", () => {
    expect(moduleProvenance(base())).toMatchObject({
      builtBy: null,
      builderHandle: null,
      builderNamespace: null,
      platformBuilt: true,
      disposition: "recycled",
    });
  });

  it("says a core module is platform built too", () => {
    expect(moduleProvenance(base({ core: true }))).toMatchObject({ platformBuilt: true, disposition: "recycled" });
  });

  it("marks a module that charges as owed nothing from the pool", () => {
    const priced = base({
      builtBy: "Ada Lovelace",
      pricing: { amount: 900, currency: "USD", period: "month", billingUrl: "https://example.org/buy" },
    });
    expect(moduleProvenance(priced).disposition).toBe("none");
  });

  it("makes the recycling visible on the wire and not only on the village page", () => {
    // R59: an author or a village should SEE the platform's share going back
    // in. Every line the report carries says where its share goes.
    const r = buildModuleUsageReport(counts(), "instance-1", MODULES);
    expect(r.modules.length).toBeGreaterThan(0);
    for (const m of r.modules) expect(["paid", "recycled", "none"]).toContain(m.disposition);
    expect(r.modules.every((m) => m.platformBuilt)).toBe(true);
    expect(r.modules.every((m) => m.disposition === "recycled")).toBe(true);
  });

  it("drops a module the registry does not know rather than inventing a credit", () => {
    /*
     * A real case: a village keeps running a module upstream withdrew and
     * deleted, and its marks outlive the entry. Reporting it as platform built
     * would credit the platform for somebody else's work, and a fallback that
     * invents a value is worse than the row not being there.
     */
    const r = buildModuleUsageReport(
      counts({ modules: [{ moduleId: "tools", membersReached: 3 }, { moduleId: "ghost", membersReached: 4 }] }),
      "instance-1",
      MODULES,
    );
    expect(r.modules.map((m) => m.moduleId)).toEqual(["tools"]);
  });

  it("orders by reach, then by id, so two runs of one input cannot disagree", () => {
    const r = buildModuleUsageReport(
      counts({
        activeMembers: 4,
        modules: [
          { moduleId: "events", membersReached: 1 },
          { moduleId: "forum", membersReached: 4 },
          { moduleId: "tools", membersReached: 3 },
        ],
      }),
      "instance-1",
      MODULES,
    );
    expect(r.modules.map((m) => m.moduleId)).toEqual(["forum", "tools", "events"]);
  });
});

describe("the payout identity, checked on the wire", () => {
  const withBuilder = (over: Partial<ModuleUsageReport["modules"][number]>) => {
    const r = report();
    r.modules[0] = { ...r.modules[0]!, builtBy: "Ada Lovelace", platformBuilt: false, disposition: "paid", ...over };
    return r;
  };

  it("accepts a handle with the system that asserts it", () => {
    expect(moduleUsageReportProblems(withBuilder({ builderHandle: "ada", builderNamespace: "example.org" }))).toEqual([]);
  });

  it("accepts a builder with no handle at all, because the share accrues", () => {
    // Absence is a real state. The share is still theirs, it is held, and the
    // statement names what is missing. Eligibility never depends on this.
    expect(moduleUsageReportProblems(withBuilder({ builderHandle: null, builderNamespace: null }))).toEqual([]);
  });

  it("refuses a handle with nowhere to resolve it", () => {
    const problems = moduleUsageReportProblems(withBuilder({ builderHandle: "ada", builderNamespace: null }));
    expect(problems.join(" ")).toContain("nowhere to resolve");
  });

  it("refuses a wallet address by name, which is the mistake somebody will make", () => {
    const problems = moduleUsageReportProblems(
      withBuilder({ builderHandle: "0x1234567890abcdef1234567890abcdef12345678", builderNamespace: "example.org" }),
    );
    expect(problems.join(" ")).toContain("wallet address");
    // And not ALSO the generic message, which would bury the useful one.
    expect(problems.join(" ")).not.toContain("lowercase letters, digits and hyphens");
  });

  it("refuses a handle that is not handle shaped", () => {
    const problems = moduleUsageReportProblems(withBuilder({ builderHandle: "Ada@Example", builderNamespace: "example.org" }));
    expect(problems.join(" ")).toContain("no at sign and no address");
  });

  it("refuses a namespace with nobody in it", () => {
    const problems = moduleUsageReportProblems(withBuilder({ builderHandle: null, builderNamespace: "example.org" }));
    expect(problems.join(" ")).toContain("nobody in it to pay");
  });

  it("refuses a payout handle credited to nobody", () => {
    const r = report();
    r.modules[0] = { ...r.modules[0]!, builderHandle: "ada", builderNamespace: "example.org" };
    expect(moduleUsageReportProblems(r).join(" ")).toContain("credits nobody");
  });

  it("refuses a platformBuilt flag that disagrees with the credit line", () => {
    const r = report();
    r.modules[0] = { ...r.modules[0]!, builtBy: "Ada Lovelace", platformBuilt: true };
    expect(moduleUsageReportProblems(r).join(" ")).toContain("so one of the two is wrong");
  });

  it("takes a host name as a namespace and refuses a bare word", () => {
    expect(isBuilderNamespace("regen.example")).toBe(true);
    expect(isBuilderNamespace("a.b.c.example")).toBe(true);
    expect(isBuilderNamespace("localhost")).toBe(false);
    expect(isBuilderNamespace("Example.Org")).toBe(false);
    expect(isBuilderNamespace("-lead.example")).toBe(false);
    expect(isBuilderNamespace(`${"a".repeat(250)}.example`)).toBe(false);
  });

  it("refuses a registry entry carrying half a payout identity, at boot and in the lint", () => {
    const handleOnly = moduleListingProblems([base({ builtBy: "Ada", builtByAccount: "ada" })]);
    expect(handleOnly.join(" ")).toContain("no account system that asserts it");

    const namespaceOnly = moduleListingProblems([base({ builtBy: "Ada", builtByNamespace: "example.org" })]);
    expect(namespaceOnly.join(" ")).toContain("no account in it");

    const badHost = moduleListingProblems([base({ builtBy: "Ada", builtByAccount: "ada", builtByNamespace: "nope" })]);
    expect(badHost.join(" ")).toContain("host name");

    expect(
      moduleListingProblems([base({ builtBy: "Ada", builtByAccount: "ada", builtByNamespace: "example.org" })]),
    ).toEqual([]);
  });

  it("leaves the shipped registry clean", () => {
    expect(moduleListingProblems(MODULES)).toEqual([]);
  });
});

describe("the report a counter did not build", () => {
  it("passes a report this village would serve", () => {
    expect(moduleUsageReportProblems(report())).toEqual([]);
  });

  it("refuses a protocol it does not speak", () => {
    expect(moduleUsageReportProblems(report({ protocol: "module-usage/9" })).join(" ")).toContain("this reader speaks");
    expect(MODULE_USAGE_PROTOCOL).toBe("module-usage/1");
  });

  it("refuses a report that names no deployment, because there is nothing to decide about", () => {
    // The sybil defence is a counter's membership decision and cannot live
    // here. What lives here is making sure it has something to decide about.
    expect(moduleUsageReportProblems(report({ instanceId: "" })).join(" ")).toContain("names no deployment");
  });

  it("refuses rubbish without throwing, because a counter reads strangers", () => {
    expect(moduleUsageReportProblems(null)).toEqual(["the report is not an object"]);
    expect(moduleUsageReportProblems("a string")).toEqual(["the report is not an object"]);
    expect(moduleUsageReportProblems({}).length).toBeGreaterThan(0);
    expect(moduleUsageReportProblems({ protocol: MODULE_USAGE_PROTOCOL, instanceId: "i", cycleId: "c", sealed: false, activeMembers: 0 }).join(" "))
      .toContain("carries no module list");
  });

  it("refuses counts that are not counts", () => {
    const bad = report();
    bad.modules[0]!.membersReached = 1.5;
    expect(moduleUsageReportProblems(bad).join(" ")).toContain("which is not a count");

    const negative = report({ activeMembers: -1 });
    expect(moduleUsageReportProblems(negative).join(" ")).toContain("which is not a count");
  });

  it("reports an empty cycle as an empty cycle rather than a failure", () => {
    const empty = buildModuleUsageReport(counts({ activeMembers: 0, modules: [] }), "instance-1", MODULES);
    expect(empty.modules).toEqual([]);
    expect(moduleUsageReportProblems(empty)).toEqual([]);
  });
});

describe("the contract version, checked rather than reported", () => {
  it("agrees with the document a builder reads", () => {
    /*
     * `scripts/module-facts.mjs` prints a disagreement and exits zero, and the
     * intake workflow treats it as a warning on purpose, because our
     * bookkeeping should never block a builder's listing. That left nothing
     * failing when the two drifted. A listing is stamped with the CONSTANT, so
     * a document saying something else is a document a builder was misled by.
     */
    const body = fs.readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..", "docs", "MODULE_LIBRARY_CONTRACT.md"),
      "utf8",
    );
    const stated = /\*\*Version\s+([0-9]+\.[0-9]+)\b/i.exec(body)?.[1];
    expect(stated).toBe(MODULE_LIBRARY_CONTRACT_VERSION);
  });
});
