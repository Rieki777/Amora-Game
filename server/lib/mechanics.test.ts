/**
 * The proposals domain logic, pinned: qualification composition, change-set
 * validation (ring, bounds, no-ops, duplicates, size), and the canonical
 * document carrying the [gm:] marker + machine-readable change-set the
 * bridge phase will match on-chain events against.
 */
import { describe, expect, it } from "vitest";
import { parseHyphaProposalId, proposerStanding, validateChangeSet, proposalMarkdown, displayChangeValue } from "./mechanics";
import { VARIABLES_BY_KEY } from "../../shared/gameVariables";

// validateChangeSet only touches the pool for the cooldown query; with
// cooldownDays 0 it never dials out, so a throwing stub proves that too.
const noPool = new Proxy({}, { get: () => { throw new Error("pool must not be touched when cooldown is off"); } }) as any;

describe("proposer standing", () => {
  it("a badge deny closes everything — the remedy lever", () => {
    const s = proposerStanding(true, true, 10_000, 0);
    expect(s.denied).toBe(true);
    expect(s.qualified).toBe(false);
    expect(s.mayDraft).toBe(false);
  });

  it("capability + threshold = qualified", () => {
    expect(proposerStanding(true, false, 1000, 1000).qualified).toBe(true);
    expect(proposerStanding(true, false, 999, 1000).qualified).toBe(false);
  });

  it("admins bypass the standing bar but never a deny", () => {
    expect(proposerStanding(true, false, 0, 1000, true).qualified).toBe(true);
    expect(proposerStanding(true, true, 0, 1000, true).denied).toBe(true);
  });

  it("below the bar still drafts — the on-ramp, not a wall", () => {
    const noCap = proposerStanding(false, false, 0, 0);
    expect(noCap.qualified).toBe(false);
    expect(noCap.mayDraft).toBe(true);
    const noStanding = proposerStanding(true, false, 0, 500);
    expect(noStanding.qualified).toBe(false);
    expect(noStanding.mayDraft).toBe(true);
  });
});

describe("change-set validation", () => {
  const effective = (key: string) =>
    ({ "gratitude.base_budget": "100", "gratitude.pool_per_cycle": "1000", "quest.consent_cap_mode": "posted" })[key] ?? "";

  it("accepts a clean set and captures the live baseline", async () => {
    const { problems, normalized } = await validateChangeSet(
      noPool,
      [{ key: "gratitude.base_budget", to: "150" }, { key: "quest.consent_cap_mode", to: "capped" }],
      effective,
      0,
    );
    expect(problems).toEqual([]);
    expect(normalized).toEqual([
      { key: "gratitude.base_budget", from: "100", to: "150" },
      { key: "quest.consent_cap_mode", from: "posted", to: "capped" },
    ]);
  });

  it("refuses founder-held dials — Ring 1 is not proposable", async () => {
    const { problems } = await validateChangeSet(noPool, [{ key: "abuse.register_per_ip_hourly", to: "50" }], effective, 0);
    expect(problems[0].problem).toContain("founder-held");
  });

  it("refuses out-of-bounds values — bounds are constitutional", async () => {
    const { problems } = await validateChangeSet(noPool, [{ key: "gratitude.base_budget", to: "999999999" }], effective, 0);
    expect(problems.length).toBe(1);
  });

  it("refuses no-ops, unknown dials, duplicates, and oversized sets", async () => {
    const noop = await validateChangeSet(noPool, [{ key: "gratitude.base_budget", to: "100" }], effective, 0);
    expect(noop.problems[0].problem).toContain("would not change anything");
    const unknown = await validateChangeSet(noPool, [{ key: "no.such_dial", to: "1" }], effective, 0);
    expect(unknown.problems[0].problem).toContain("No such dial");
    const dup = await validateChangeSet(
      noPool,
      [{ key: "gratitude.base_budget", to: "150" }, { key: "gratitude.base_budget", to: "200" }],
      effective,
      0,
    );
    expect(dup.problems.some((p) => p.problem.includes("twice"))).toBe(true);
    const big = await validateChangeSet(
      noPool,
      Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, to: "1" })),
      effective,
      0,
    );
    expect(big.problems[0].problem).toContain("at most 12");
  });

  it("a partial-bad set is refused whole — what is voted on is what was checked", async () => {
    const { problems, normalized } = await validateChangeSet(
      noPool,
      [{ key: "gratitude.base_budget", to: "150" }, { key: "no.such_dial", to: "1" }],
      effective,
      0,
    );
    expect(problems.length).toBe(1);
    // normalized still carries the good change; the ROUTE refuses on any
    // problem — this shape lets the client show both the good and the bad.
    expect(normalized.length).toBe(1);
  });
});

describe("the proposal document", () => {
  it("carries the [gm:] marker, the human table, and the machine block", () => {
    const md = proposalMarkdown({
      id: "gmp-test-1",
      title: "Widen the gratitude budget",
      rationale: "The village grew and the budget did not.",
      changeSet: [{ key: "gratitude.base_budget", from: "100", to: "150" }],
      villageName: "Testville",
      proposerName: "Ada",
      supports: 4,
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(md).toContain("[gm:gmp-test-1]");
    // The row carries the dial's OWN label, read from the registry, so a
    // rename of the label is a rename in one place. Hard-coding the string
    // here pinned "Base sending budget per cycle" and went red when R73
    // renamed the dial to an allowance, which is a copy edit reported as a
    // behaviour failure. The shape of the row is what this asserts.
    const label = VARIABLES_BY_KEY["gratitude.base_budget"].label;
    expect(label.length).toBeGreaterThan(0);
    expect(md).toContain(`| ${label} (\`gratitude.base_budget\`) | 100 Gratitude | **150 Gratitude** |`);
    expect(md).toContain('"marker": "gm:gmp-test-1"');
    expect(md).toContain("4 member(s) supported it");
    // The machine block round-trips.
    const json = md.slice(md.indexOf("```json") + 7, md.lastIndexOf("```"));
    expect(JSON.parse(json).changes).toEqual([{ key: "gratitude.base_budget", from: "100", to: "150" }]);
  });

  it("cycle-close changes carry the timing note voters should see", () => {
    const md = proposalMarkdown({
      id: "gmp-test-2",
      title: "t",
      rationale: "r",
      changeSet: [{ key: "gratitude.pool_per_cycle", from: "1000", to: "1500" }],
      villageName: "V",
      proposerName: "P",
      supports: 0,
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(md).toContain("takes effect at the next cycle close");
  });

  it("display values read like the game, not like storage", () => {
    expect(displayChangeValue("gratitude.require_message", "true")).toBe("On");
    expect(displayChangeValue("quest.consent_cap_mode", "posted")).toBe("Exactly the posted amount");
    expect(displayChangeValue("gratitude.base_budget", "100")).toBe("100 Gratitude");
  });
});

describe("parseHyphaProposalId", () => {
  it("takes the id from a pasted Hypha URL — last numeric path segment wins", () => {
    expect(parseHyphaProposalId("https://app.hypha.earth/en/dho/my-village/agreements/777")).toBe("777");
    expect(parseHyphaProposalId("https://app.hypha.earth/en/dho/my-village/agreements/777?tab=votes#top")).toBe("777");
    expect(parseHyphaProposalId("https://app.hypha.earth/proposal/5704/")).toBe("5704");
  });

  it("accepts the bare number a founder might paste instead", () => {
    expect(parseHyphaProposalId("5704")).toBe("5704");
    expect(parseHyphaProposalId("  777  ")).toBe("777");
  });

  it("refuses to guess when nothing numeric is there", () => {
    expect(parseHyphaProposalId("https://app.hypha.earth/en/dho/my-village")).toBeNull();
    expect(parseHyphaProposalId("not a url at all")).toBeNull();
    expect(parseHyphaProposalId("")).toBeNull();
  });
});
