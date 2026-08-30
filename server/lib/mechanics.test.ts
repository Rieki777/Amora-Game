/**
 * The proposals domain logic, pinned: qualification composition, change-set
 * validation (ring, bounds, no-ops, duplicates, size), and the canonical
 * document carrying the [gm:] marker + machine-readable change-set the
 * bridge phase will match on-chain events against.
 */
import { describe, expect, it } from "vitest";
import { parseHyphaProposalId, proposerStanding, validateChangeSet, proposalMarkdown, displayChangeValue, type MintRuleValues } from "./mechanics";
import { mintRuleKey, type MintRuleField } from "../../shared/mintRuleKeys";
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

/**
 * A BALLOT NAMING A MINTING RULE (R81, R84).
 *
 * The village votes on the rules that mint. `validateChangeSet` is where a
 * proposal stops being able to name one, so it is where the fix has to hold.
 * The case that matters most is the MIXED set: a ballot carries one threshold,
 * the threshold comes from the subject type, and a set that is two subjects
 * would be conducted at a price that is wrong for half of it.
 */
describe("a change set that names a minting rule", () => {
  const SEAT_GRATITUDE = "rule-role.cycle-gratitude";
  const QUEST_VOICE = "rule-quest.completed-village-voice";

  const rules = (): Map<string, MintRuleValues> =>
    new Map([
      [SEAT_GRATITUDE, { trigger: "role.cycle", tokenSlug: "gratitude", amount: 20, ceiling: 100, enabled: true }],
      [QUEST_VOICE, { trigger: "quest.completed", tokenSlug: "village-voice", amount: 10, ceiling: 100, enabled: true }],
    ]);
  const readRules = async (ids: string[]) => {
    const all = rules();
    return new Map(ids.filter((id) => all.has(id)).map((id) => [id, all.get(id)!]));
  };
  const effective = (key: string) => ({ "gratitude.base_budget": "100" })[key] ?? "";
  const key = (ruleId: string, field: MintRuleField) => mintRuleKey(ruleId, field);

  it("accepts a rule change and captures what the rule pays today", async () => {
    const { problems, normalized } = await validateChangeSet(
      noPool,
      [{ key: key(SEAT_GRATITUDE, "amount"), to: "30" }],
      effective,
      0,
      readRules,
    );
    expect(problems).toEqual([]);
    expect(normalized).toEqual([{ key: key(SEAT_GRATITUDE, "amount"), from: "20", to: "30" }]);
  });

  it("REFUSES A MIXED SET, because two subjects have no one price", async () => {
    const { problems, normalized } = await validateChangeSet(
      noPool,
      [{ key: "gratitude.base_budget", to: "150" }, { key: key(SEAT_GRATITUDE, "amount"), to: "30" }],
      effective,
      0,
      readRules,
    );
    expect(problems.length).toBe(1);
    expect(problems[0].problem).toContain("two proposals");
    expect(normalized).toEqual([]);
  });

  it("refuses a rule this village does not have", async () => {
    const { problems } = await validateChangeSet(
      noPool,
      [{ key: mintRuleKey("rule-invented-thing", "amount"), to: "5" }],
      effective,
      0,
      readRules,
    );
    expect(problems[0].problem).toContain("no minting rule by that name");
  });

  it("refuses a value the rule could never take", async () => {
    const zero = await validateChangeSet(noPool, [{ key: key(SEAT_GRATITUDE, "amount"), to: "0" }], effective, 0, readRules);
    expect(zero.problems[0].problem).toContain("greater than zero");
    const negative = await validateChangeSet(noPool, [{ key: key(SEAT_GRATITUDE, "ceiling"), to: "-1" }], effective, 0, readRules);
    expect(negative.problems[0].problem).toContain("zero or more");
    const word = await validateChangeSet(noPool, [{ key: key(SEAT_GRATITUDE, "enabled"), to: "yes" }], effective, 0, readRules);
    expect(word.problems[0].problem).toContain("true or false");
  });

  it("refuses a no-op even when it is wearing a decimal costume", async () => {
    // `mint_rules.amount` is decimal(18,4), so 20 and 20.0000 are one number
    // in two spellings. Without normalising, the village would be asked to
    // decide something that was already true.
    const same = await validateChangeSet(noPool, [{ key: key(SEAT_GRATITUDE, "amount"), to: "20.0000" }], effective, 0, readRules);
    expect(same.problems[0].problem).toContain("would not change anything");
  });

  it("refuses a set that builds a rule paying above its own ceiling", async () => {
    const built = await validateChangeSet(
      noPool,
      [{ key: key(SEAT_GRATITUDE, "amount"), to: "60" }, { key: key(SEAT_GRATITUDE, "ceiling"), to: "50" }],
      effective,
      0,
      readRules,
    );
    expect(built.problems.length).toBe(1);
    expect(built.problems[0].problem).toContain("is above the");
  });

  it("accepts the amount and the ceiling moving together", async () => {
    const together = await validateChangeSet(
      noPool,
      [{ key: key(SEAT_GRATITUDE, "amount"), to: "150" }, { key: key(SEAT_GRATITUDE, "ceiling"), to: "200" }],
      effective,
      0,
      readRules,
    );
    expect(together.problems).toEqual([]);
    expect(together.normalized.length).toBe(2);
  });

  it("refuses the same rule setting twice, and reads two rules at once", async () => {
    const twice = await validateChangeSet(
      noPool,
      [{ key: key(SEAT_GRATITUDE, "amount"), to: "30" }, { key: key(SEAT_GRATITUDE, "amount"), to: "40" }],
      effective,
      0,
      readRules,
    );
    expect(twice.problems.some((p) => p.problem.includes("twice"))).toBe(true);
    const two = await validateChangeSet(
      noPool,
      [{ key: key(SEAT_GRATITUDE, "amount"), to: "30" }, { key: key(QUEST_VOICE, "amount"), to: "15" }],
      effective,
      0,
      readRules,
    );
    expect(two.problems).toEqual([]);
    expect(two.normalized.length).toBe(2);
  });

  it("says so instead of guessing when this build has no reader for the rules", async () => {
    const { problems } = await validateChangeSet(noPool, [{ key: key(SEAT_GRATITUDE, "amount"), to: "30" }], effective, 0);
    expect(problems[0].problem).toContain("cannot take a minting rule to a vote");
  });

  it("names what it pays for on the document, never the column", async () => {
    const md = proposalMarkdown({
      id: "gmp-mint",
      title: "Pay a seat more",
      rationale: "The seats carry more than they used to.",
      changeSet: [{ key: key(SEAT_GRATITUDE, "amount"), from: "20", to: "30" }],
      villageName: "Larksfield",
      proposerName: "Rye",
      supports: 3,
      createdAt: "2026-08-30T00:00:00.000Z",
      mintRules: rules(),
    });
    expect(md).toContain("role.cycle in gratitude: how much it pays");
    expect(md).toContain("what it pays for");
    expect(md).toContain("takes effect at the next moon");
    // The frozen document must never promise that a carried mint is live.
    expect(md).not.toContain("applied exactly as listed");
  });
});
