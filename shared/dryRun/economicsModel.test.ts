/**
 * THE SMALLEST HONEST DRY RUN: one cycle, one member, one quest, on both
 * clocks, with conservation asserted at every step.
 *
 * The point of this file is not that the model agrees with itself. A test can
 * only ever prove a behaviour is INTENDED. So every expected number below is
 * DERIVED BY READING THE REAL CODE, and the derivation is written out beside
 * the assertion with the file and the line it came from. If the engine changes
 * and the model does not, the derivation comment is where the disagreement
 * shows up first.
 *
 * It needs no database, and the last test in this file proves that
 * structurally: it walks the model's import graph from disk and fails if
 * anything under `server/` or the `mysql2` package is ever reachable from it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALENDAR_CLOCK, LUNAR_CLOCK, clockFor } from "../cycleClock";
import { VARIABLES_BY_KEY } from "../gameVariables";
import {
  DEFAULT_ECONOMICS_ASSUMPTIONS,
  describeAssumptions,
  parseEconomicsAssumptions,
} from "./economicsAssumptions";
import { assertConserved, economicsModel, readEconomicsMemo } from "./economicsModel";
import { makeRng } from "./rng";
import { initialState, simulate } from "./simulate";
import type { ClockMode } from "../cycleClock";
import type { SimState, TokenSpec, VillageSnapshot } from "./types";

// ── The instant the whole file runs from ────────────────────────────────────
//
// Named once and stated out loud, because two clocks from the SAME instant is
// the only comparison that says anything. Midday UTC, deliberately inside a
// month and inside a lunation rather than on either boundary.
const AT_ISO = "2026-09-03T12:00:00.000Z";
const AT = new Date(AT_ISO);

const SEED = 20260903;

// ── The seven tokens, as this village's registry really holds them ──────────
//
// slugs, kinds and decimals from drizzle/0006_token_registry.sql:41 (gratitude,
// amora, voice), drizzle/0007_village_credits_token.sql:10 (credits),
// server/lib/economy.ts:122 (village-voice, decimals 3 from VOICE_DECIMALS at
// economy.ts:151), server/lib/stays.ts:60 (stay-credit) and
// server/lib/library.ts:44 (library-credit). Every other token takes the
// column default, `decimals int NOT NULL DEFAULT 0` (0006:32).
//
// Faucets from `faucetFor` (server/lib/economy.ts:1028) and the four system
// account ids it names: RECOGNITION_FAUCET and CYCLE_POOL_FAUCET and
// MINT_FAUCET (server/lib/ledger.ts:63,64,67), VOICE_MINT (economy.ts:109) and
// LIBRARY_MINT (economy.ts:72). `amora` and `voice` are Hypha-governed mirrors
// and `faucetFor` returns null for both, which is why they have none.
//
// Sinks from `spendSinkFor` (server/lib/spending.ts:139).
function tokens(): TokenSpec[] {
  return [
    { slug: "gratitude", kind: "recognition", decimals: 0, faucet: "sys:gratitude-pool", sinks: ["sys:treasury"] },
    { slug: "amora", kind: "equity", decimals: 0, faucet: null, sinks: [] }, // brand-ok: the equity slug drizzle/0006_token_registry.sql:43 really seeds, and a snapshot fixture has to carry the registry the engine really reads. Same category as the migration itself, which is baselined for the same reason.
    { slug: "voice", kind: "voice", decimals: 0, faucet: null, sinks: [] },
    { slug: "credits", kind: "credit", decimals: 0, faucet: "sys:cycle-pool", sinks: ["sys:treasury"] },
    { slug: "village-voice", kind: "voice", decimals: 3, faucet: "sys:voice-mint", sinks: ["sys:treasury"] },
    { slug: "stay-credit", kind: "credit", decimals: 0, faucet: "sys:mint", sinks: ["sys:mint"] },
    { slug: "library-credit", kind: "credit", decimals: 0, faucet: "sys:library-mint", sinks: ["sys:treasury"] },
  ];
}

/**
 * The five faucets, the treasury and the one member, all present and all
 * empty.
 *
 * An empty row and a zero balance are the same number here, which is right:
 * `economySeed` grants nobody anything ("Neither is a genesis grant",
 * server/lib/economySeed.ts:14) so a fresh village starts at zero everywhere.
 * An ABSENT faucet account is a different fact and the model raises
 * `econ_faucet_account_missing` for it, so every faucet is listed.
 */
function balances(): Record<string, Record<string, bigint>> {
  return {
    "sys:gratitude-pool": {},
    "sys:cycle-pool": {},
    "sys:voice-mint": {},
    "sys:mint": {},
    "sys:library-mint": {},
    "sys:treasury": {},
    "mem:u1": {},
  };
}

/**
 * The DEFAULT mint rules, converted to minor units.
 *
 * Straight off `RULES` in server/lib/economySeed.ts:135-166, with the ids the
 * seed writes at economySeed.ts:227 (`rule-${trigger}-${token}`). The human
 * figures there are multiplied by the token's own scale the way
 * `toLedgerUnits` (server/lib/economy.ts:154) does it, so village-voice rides
 * in thousandths and everything else in whole units.
 */
function mintRules() {
  return [
    {
      id: "rule-quest.completed-village-voice",
      trigger: "quest.completed",
      tokenSlug: "village-voice",
      recipient: "claimant",
      amount: BigInt(10000),
      ceiling: BigInt(100000),
      enabled: true,
    },
    {
      id: "rule-quest.completed-credits",
      trigger: "quest.completed",
      tokenSlug: "credits",
      recipient: "claimant",
      amount: BigInt(25),
      ceiling: BigInt(250),
      enabled: true,
    },
    {
      id: "rule-role.cycle-village-voice",
      trigger: "role.cycle",
      tokenSlug: "village-voice",
      recipient: "holder",
      amount: BigInt(50000),
      ceiling: BigInt(200000),
      enabled: true,
    },
    {
      id: "rule-role.cycle-credits",
      trigger: "role.cycle",
      tokenSlug: "credits",
      recipient: "holder",
      amount: BigInt(25),
      ceiling: BigInt(250),
      enabled: true,
    },
    // Seeded OFF on purpose (economySeed.ts:165 and the block comment above it).
    {
      id: "rule-role.cycle-gratitude",
      trigger: "role.cycle",
      tokenSlug: "gratitude",
      recipient: "holder",
      amount: BigInt(20),
      ceiling: BigInt(100),
      enabled: false,
    },
  ];
}

/**
 * One member, holding no seat.
 *
 * The stage is `member` and NOT `resident`. `resident` is the example in the
 * contract's own doc comment (shared/dryRun/types.ts:92) and there is no such
 * stage: `GAME_CONFIG.stages` (shared/gameConfig.ts:424-437) runs visitor,
 * guest, immersant, participant, member, contributor, quest-seeker, initiate,
 * co-creator, role-holder, guide, sage. A member at a stage off that list has
 * no `progression.multiplier.<stage>` variable, and `variable()`
 * (server/lib/variables.ts:39) THROWS on a key with no definition, so the real
 * server would 500 on their next gift. The `econ_stage_no_multiplier` test
 * below proves the model says so.
 */
function members() {
  return [{ id: "u1", accountId: "mem:u1", stage: "member", seats: [] as string[] }];
}

/**
 * The village, at the chosen instant, on the chosen clock.
 *
 * `variables` is EMPTY, and that is the honest shape: the database stores
 * changed values only and platform defaults inherit (CLAUDE.md, Five config
 * planes). One test below runs the same cycle with every default materialised
 * and asserts the balances come out identical, so the model is right whichever
 * way a snapshot reader fills the map.
 */
function snapshot(mode: ClockMode, overrides: Record<string, string> = {}): VillageSnapshot {
  return {
    atIso: AT_ISO,
    clock: { mode, timezone: "UTC" },
    tokens: tokens(),
    balances: balances(),
    mintRules: mintRules(),
    variables: { ...overrides },
    members: members(),
    // The four core modules are always public and cannot be disabled
    // (CLAUDE.md, Modules and access).
    modules: { quests: "public", gratitude: "public", progression: "public", profiles: "public" },
  };
}

/** The smallest honest run: one quest confirmed, nothing given, nothing spent. */
const ONE_QUEST = {
  questsConfirmedPerMemberPerCycle: 1,
  gratitudeAllowanceGivenShare: 0,
  sinkSpendPerMemberPerCycle: BigInt(0),
  gratitudePerConfirmedQuest: BigInt(0),
  poolClosedEachCycle: true,
  issuanceOpen: true,
};

/** Every non-zero balance, as sorted `account/slug=amount` lines. */
function nonZero(state: SimState): string[] {
  const out: string[] = [];
  for (const account of Object.keys(state.balances)) {
    const row = state.balances[account] ?? {};
    for (const slug of Object.keys(row)) {
      if (row[slug] !== BigInt(0)) out.push(`${account}/${slug}=${String(row[slug])}`);
    }
  }
  return out.sort();
}

/** One cycle through the real engine, and the live state the model returned. */
function runOneCycle(mode: ClockMode, overrides: Record<string, string> = {}) {
  const snap = snapshot(mode, overrides);
  const model = economicsModel(ONE_QUEST);
  const result = simulate({ snapshot: snap, changes: [], cycles: 1, seed: SEED }, [model]);
  // `simulate`'s recorded state is a field-by-field clone that drops the
  // model's memo, so the memo is read from a direct step over the same
  // initial state and the same generator. Both are the vendored engine's own
  // entry points (shared/dryRun/simulate.ts:319 and shared/dryRun/rng.ts:34).
  const stepped = model.step(initialState(snap), 1, makeRng(SEED));
  return { snap, model, result, stepped, memo: readEconomicsMemo(stepped)! };
}

describe("economics model, the smallest honest dry run", () => {
  it("pays one confirmed quest exactly what the engine would post", () => {
    const { result } = runOneCycle("lunar");
    const after = result.proposed[0].state;

    /*
     * THE DERIVATION, function by function and line by line.
     *
     *  1. `mintForConfirmedClaim` (server/lib/economy.ts:1117) reads
     *     `rulesFor(pool, "quest.completed")` (economy.ts:1141), which returns
     *     the ENABLED rules for that trigger (economy.ts:434).
     *  2. It skips the recognition token outright (economy.ts:1145: "Recognition
     *     is the consent route's job"), so no `gratitude` rule can fire here.
     *  3. Both default rules carry a fixed amount, so neither takes the
     *     from_source refusal at economy.ts:1147.
     *  4. Neither is zero (economy.ts:1166) and `ruleCannotPay`
     *     (economy.ts:1059) clears both: each token is registered,
     *     platform-governed, active, and has a faucet.
     *  5. `toLedgerUnits` (economy.ts:154) is
     *     `Math.round(human * 10 ** decimals)`:
     *       village-voice, amount 10 (economySeed.ts:140), decimals 3
     *         (VOICE_DECIMALS, economy.ts:151)  ->  round(10 * 1000)  = 10000
     *       credits, amount 25 (economySeed.ts:161), decimals 0
     *         (drizzle/0006_token_registry.sql:32)  ->  round(25 * 1) =    25
     *  6. NOTHING CLAMPS. `clampToCeiling` (economy.ts:505) is never called by
     *     `mintForConfirmedClaim`, and the only caller of it anywhere in the
     *     repository is server/economy.test.ts. So the ceilings of 100 and 250
     *     bound nothing and the full amount is posted.
     *  7. `mint` (economy.ts:462) calls `postTransfer` with
     *     `from: faucetFor(slug)` (economy.ts:1189) and
     *     `to: memberAccount(claim.userId)` (economy.ts:492, ledger.ts:70),
     *     which is `mem:u1`.
     *       faucetFor("village-voice") = VOICE_MINT     = "sys:voice-mint"
     *       faucetFor("credits")       = CYCLE_POOL_FAUCET = "sys:cycle-pool"
     *  8. A faucet's negative balance IS that token's issued supply
     *     (ledger.ts:8), so each faucet holds the exact negative.
     */
    expect(after.balances["mem:u1"]["village-voice"]).toBe(BigInt(10000));
    expect(after.balances["mem:u1"].credits).toBe(BigInt(25));
    expect(after.balances["sys:voice-mint"]["village-voice"]).toBe(BigInt(-10000));
    expect(after.balances["sys:cycle-pool"].credits).toBe(BigInt(-25));

    // Every other account is untouched, stated as the whole set so a stray
    // posting anywhere shows up as an extra line and not as a silent pass.
    expect(nonZero(after)).toEqual([
      "mem:u1/credits=25",
      "mem:u1/village-voice=10000",
      "sys:cycle-pool/credits=-25",
      "sys:voice-mint/village-voice=-10000",
    ]);

    // In human units: 10.000 village voice and 25 credits, which is what a
    // member would read on their chip (`fromLedgerUnits`, economy.ts:160).
    expect(Number(after.balances["mem:u1"]["village-voice"]) / 1000).toBe(10);
    expect(Number(after.balances["mem:u1"].credits)).toBe(25);
  });

  it("holds conservation over every account after the cycle, faucets included", () => {
    const { model, result, stepped } = runOneCycle("lunar");
    // From invariants(), over the engine's recorded state and over the live one.
    expect(model.invariants(result.proposed[0].state)).toEqual([]);
    expect(model.invariants(stepped)).toEqual([]);
    expect(result.violations).toEqual([]);

    // And summed by hand, so this assertion does not depend on the same code
    // path the model's own check uses.
    const totals: Record<string, bigint> = {};
    for (const account of Object.keys(stepped.balances)) {
      const row = stepped.balances[account] ?? {};
      for (const slug of Object.keys(row)) {
        totals[slug] = (totals[slug] ?? BigInt(0)) + row[slug];
      }
    }
    for (const slug of Object.keys(totals)) {
      expect(`${slug}=${String(totals[slug])}`).toBe(`${slug}=0`);
    }
  });

  it("reads the same answer whether the snapshot carries the defaults or inherits them", () => {
    // The database stores changed values only. A snapshot reader that
    // materialised every default must reach the same balances as one that
    // wrote nothing, or the preview depends on how it was loaded.
    const materialised: Record<string, string> = {};
    for (const key of Object.keys(VARIABLES_BY_KEY)) {
      materialised[key] = VARIABLES_BY_KEY[key].default;
    }
    const inherited = runOneCycle("lunar");
    const explicit = runOneCycle("lunar", materialised);
    expect(nonZero(explicit.stepped)).toEqual(nonZero(inherited.stepped));
    expect(explicit.memo.allowanceTotal).toBe(inherited.memo.allowanceTotal);
  });
});

describe("economics model, the same cycle on both clocks", () => {
  it("gives the same balances, different cycle ids and different boundaries", () => {
    const lunar = runOneCycle("lunar");
    const calendar = runOneCycle("calendar");

    // Same money.
    expect(nonZero(calendar.stepped)).toEqual(nonZero(lunar.stepped));

    // Different names for the cycle, each one exactly what the seam gives for
    // this instant. Read from `clockFor`, never from a string typed here.
    expect(lunar.memo.cycleId).toBe(clockFor("lunar").idFor(AT));
    expect(calendar.memo.cycleId).toBe(clockFor("calendar").idFor(AT));
    expect(lunar.memo.cycleId).toMatch(/^lunar-\d{6}$/);
    expect(calendar.memo.cycleId).toMatch(/^month-\d{4}-\d{2}$/);
    expect(calendar.memo.cycleId).toBe("month-2026-09");
    expect(lunar.memo.cycleId).not.toBe(calendar.memo.cycleId);

    // Different boundaries, and the state's instant moved to the next one.
    expect(lunar.memo.nextBoundaryAt).toBe(LUNAR_CLOCK.nextBoundaryAfter(AT).toISOString());
    expect(calendar.memo.nextBoundaryAt).toBe(CALENDAR_CLOCK.nextBoundaryAfter(AT).toISOString());
    expect(calendar.memo.nextBoundaryAt).toBe("2026-10-01T00:00:00.000Z");
    expect(lunar.memo.nextBoundaryAt).not.toBe(calendar.memo.nextBoundaryAt);
    expect(lunar.stepped.atIso).toBe(lunar.memo.nextBoundaryAt);
    expect(calendar.stepped.atIso).toBe(calendar.memo.nextBoundaryAt);

    // And the bounds the cycle ran under are the clock's own.
    expect(calendar.memo.startsAt).toBe(CALENDAR_CLOCK.boundsFor(AT).startsAt.toISOString());
    expect(calendar.memo.endsAt).toBe(CALENDAR_CLOCK.boundsFor(AT).endsAt.toISOString());
    expect(lunar.memo.startsAt).toBe(LUNAR_CLOCK.boundsFor(AT).startsAt.toISOString());
    expect(lunar.memo.endsAt).toBe(LUNAR_CLOCK.boundsFor(AT).endsAt.toISOString());
  });
});

describe("economics model, invariants", () => {
  it("catches a posting with one leg missing, naming the token and the sum", () => {
    const { model, stepped } = runOneCycle("lunar");
    // A corrupted state: the member keeps the voice they were paid and the
    // faucet that paid it never went negative. One leg of a two-leg move.
    const broken: SimState = {
      ...stepped,
      balances: { ...stepped.balances, "sys:voice-mint": {} },
    };
    const found = model.invariants(broken);
    const conservation = found.filter((v) => v.invariant === "ledger.conservation");
    expect(conservation).toHaveLength(1);
    expect(conservation[0].detail).toContain("village-voice");
    expect(conservation[0].detail).toContain("10000");
  });

  it("catches a non-faucet account holding a negative balance", () => {
    const { model, stepped } = runOneCycle("lunar");
    const broken: SimState = {
      ...stepped,
      balances: {
        ...stepped.balances,
        "mem:u1": { ...stepped.balances["mem:u1"], credits: BigInt(-5) },
        "sys:treasury": { credits: BigInt(30) },
      },
    };
    const found = model.invariants(broken);
    expect(found.map((v) => v.invariant)).toContain("ledger.no_negative_non_faucet");
    const negative = found.filter((v) => v.invariant === "ledger.no_negative_non_faucet")[0];
    expect(negative.detail).toContain("mem:u1");
    expect(negative.detail).toContain("stay_night");
    // And the same fact reaches a member as a sentence.
    const codes = model.flags(broken, 1).map((f) => f.code);
    expect(codes).toContain("econ_negative_balance");
  });

  it("throws from the guard step runs after every posting", () => {
    // `assertConserved` is the check `post` calls after EVERY two-account
    // move, so a cycle that returns at all is a cycle that balanced the whole
    // way through. Exercised directly here, because the public path cannot be
    // made to break it on purpose, which is the point.
    const { stepped } = runOneCycle("lunar");
    expect(() => assertConserved(stepped.balances, "village-voice", "the cycle")).not.toThrow();
    expect(() => assertConserved(stepped.balances, "credits", "the cycle")).not.toThrow();

    const oneLegged = { ...stepped.balances, "sys:voice-mint": {} };
    let message = "";
    try {
      assertConserved(oneLegged, "village-voice", "a posting with one leg");
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("economics.conservation broke");
    expect(message).toContain("village-voice");
    expect(message).toContain("10000");
    expect(message).toContain("a posting with one leg");
  });
});

describe("economics model, determinism", () => {
  it("answers the same state twice from the same seed", () => {
    const snap = snapshot("lunar");
    const model = economicsModel({ ...ONE_QUEST, questsConfirmedPerMemberPerCycle: 1.5 });
    const first = model.step(initialState(snap), 1, makeRng(SEED));
    const second = model.step(initialState(snap), 1, makeRng(SEED));
    const shape = (s: SimState) => JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? `${String(v)}n` : v));
    expect(shape(second)).toBe(shape(first));
    expect(shape(first)).toContain("mem:u1");
  });

  it("mutates nothing it was handed", () => {
    const snap = snapshot("lunar");
    const before = initialState(snap);
    const frozen = JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? `${String(v)}n` : v));
    economicsModel(ONE_QUEST).step(before, 1, makeRng(SEED));
    expect(JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? `${String(v)}n` : v))).toBe(frozen);
    expect(before.atIso).toBe(AT_ISO);
  });
});

describe("economics model, flags", () => {
  it("reports the whole allowance expiring in a village of one", () => {
    const { model, stepped } = runOneCycle("lunar");
    const flags = model.flags(stepped, 1);
    const expired = flags.filter((f) => f.code === "econ_gratitude_expired");
    expect(expired).toHaveLength(1);
    /*
     * The allowance is `Math.round(numberVar("gratitude.base_budget") *
     * stageMultiplier)` (`allowanceFor`, server/lib/economy.ts:628). The base
     * budget defaults to 100 (shared/gameVariables.ts:105) and the multiplier
     * for `member` is `progression.multiplier.member`, generated from
     * GAME_CONFIG.stages with the stage's own `gratitudeMultiplier` of 2
     * (shared/gameVariables.ts:1707, shared/gameConfig.ts:429). So 200, and
     * recognition has no decimals, so 200 minor units.
     */
    expect(readEconomicsMemo(stepped)!.allowanceTotal).toBe(BigInt(200));
    expect(readEconomicsMemo(stepped)!.gratitudeExpired).toBe(BigInt(200));
    expect(expired[0].sentence).toContain("200");
    // `checkGive` refuses a gift to yourself (economy.ts:706), so one member
    // can never spend a point of it.
    expect(expired[0].actionable).toContain("themselves");
  });

  it("says the pool is set in whole tokens when the pool token holds decimals", () => {
    const { model, stepped } = runOneCycle("lunar", { "gratitude.pool_token": "village-voice" });
    const flags = model.flags(stepped, 1);
    const pool = flags.filter((f) => f.code === "econ_pool_in_whole_tokens");
    expect(pool).toHaveLength(1);
    // gratitude.pool_per_cycle defaults to 1000 (shared/gameVariables.ts:117)
    // and the close hands that number straight to `postTransfer`
    // (server/index.ts:21444), which reads it as minor units.
    expect(pool[0].sentence).toContain("1.000");
    expect(pool[0].severity).toBe("danger");
    // And the default pool token has no decimals, so a default village is clear.
    const clean = runOneCycle("lunar");
    expect(clean.model.flags(clean.stepped, 1).map((f) => f.code)).not.toContain("econ_pool_in_whole_tokens");
  });

  it("names a rule that can never pay, and one that reaches the preview as zero", () => {
    const snap = snapshot("lunar");
    snap.mintRules = snap.mintRules.concat([
      {
        id: "rule-quest.completed-hypha-mirror",
        trigger: "quest.completed",
        tokenSlug: "voice",
        recipient: "claimant",
        amount: BigInt(5),
        ceiling: BigInt(50),
        enabled: true,
      },
      {
        id: "rule-quest.completed-from-source",
        trigger: "quest.completed",
        tokenSlug: "credits",
        recipient: "claimant",
        amount: null,
        ceiling: BigInt(50),
        enabled: true,
      },
      {
        id: "rule-quest.completed-rounded-away",
        trigger: "quest.completed",
        tokenSlug: "stay-credit",
        recipient: "claimant",
        amount: BigInt(0),
        ceiling: BigInt(50),
        enabled: true,
      },
    ]);
    const model = economicsModel(ONE_QUEST);
    const stepped = model.step(initialState(snap), 1, makeRng(SEED));
    const flags = model.flags(stepped, 1);
    const cannotPay = flags.filter((f) => f.code === "econ_rule_cannot_pay");
    // `ruleCannotPay` (economy.ts:1059) refuses a token with no faucet, which
    // is what `faucetFor` returns for the Hypha-governed `voice` mirror
    // (economy.ts:1028). The from_source rule is the refusal at economy.ts:1147.
    expect(cannotPay.map((f) => f.sentence).join(" ")).toContain("no faucet");
    expect(cannotPay.map((f) => f.sentence).join(" ")).toContain("reads its amount from the work");
    expect(flags.map((f) => f.code)).toContain("econ_amount_rounds_away");
    for (const flag of flags) expect(typeof flag.sentence).toBe("string");
    // Nothing was paid in either broken token.
    expect(stepped.balances["mem:u1"].voice).toBeUndefined();
    expect(stepped.balances["mem:u1"]["stay-credit"]).toBeUndefined();
  });

  it("names a faucet account the ledger does not hold", () => {
    const snap = snapshot("lunar");
    delete snap.balances["sys:voice-mint"];
    const model = economicsModel(ONE_QUEST);
    const flags = model.flags(initialState(snap), 0);
    const missing = flags.filter((f) => f.code === "econ_faucet_account_missing");
    expect(missing).toHaveLength(1);
    expect(missing[0].sentence).toContain("sys:voice-mint");
  });

  it("names a member at a stage the ladder does not carry", () => {
    const snap = snapshot("lunar");
    // `resident` is the example in the contract's doc comment and is not a
    // stage this platform has. See the note on `members()` above.
    expect(VARIABLES_BY_KEY["progression.multiplier.resident"]).toBeUndefined();
    snap.members = [{ id: "u1", accountId: "mem:u1", stage: "resident", seats: [] }];
    const model = economicsModel(ONE_QUEST);
    const stepped = model.step(initialState(snap), 1, makeRng(SEED));
    const flags = model.flags(stepped, 1);
    const unknown = flags.filter((f) => f.code === "econ_stage_no_multiplier");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].sentence).toContain("resident");
    expect(unknown[0].severity).toBe("danger");
    // The quest still pays: the stage only decides the giving allowance.
    expect(stepped.balances["mem:u1"].credits).toBe(BigInt(25));
  });

  it("says nothing is issued at all while the village has not started its Game", () => {
    const model = economicsModel({ ...ONE_QUEST, issuanceOpen: false });
    const stepped = model.step(initialState(snapshot("lunar")), 1, makeRng(SEED));
    // `issuanceRefusal` (server/lib/gameStart.ts:150) refuses every posting out
    // of a faucet until the launch vote carries, and `postTransfer` asks it on
    // every faucet leg (server/lib/ledger.ts:416).
    expect(nonZero(stepped)).toEqual([]);
    expect(model.flags(stepped, 1).map((f) => f.code)).toContain("econ_issuance_closed");
    expect(readEconomicsMemo(stepped)!.issuanceRefusals).toBe(2);
  });

  it("says the ceiling on a fixed-amount rule bounds nothing", () => {
    const snap = snapshot("lunar");
    // Ten quests in the cycle takes the credits rule from 25 to 250, which is
    // its whole ceiling (economySeed.ts:161), and the engine pays it anyway.
    const model = economicsModel({ ...ONE_QUEST, questsConfirmedPerMemberPerCycle: 10 });
    const stepped = model.step(initialState(snap), 1, makeRng(SEED));
    expect(stepped.balances["mem:u1"].credits).toBe(BigInt(250));
    const hit = model.flags(stepped, 1).filter((f) => f.code === "econ_ceiling_always_hit");
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.map((f) => f.sentence).join(" ")).toContain("nothing in the mint path reads that ceiling");
  });

  it("pays a seat holder from the role.cycle rules and a seatless member nothing", () => {
    const seatless = runOneCycle("lunar");
    expect(seatless.stepped.balances["mem:u1"].credits).toBe(BigInt(25));

    const snap = snapshot("lunar");
    snap.members = [{ id: "u1", accountId: "mem:u1", stage: "member", seats: ["seat-1"] }];
    const model = economicsModel(ONE_QUEST);
    const stepped = model.step(initialState(snap), 1, makeRng(SEED));
    /*
     * `runSettlement` (server/lib/economy.ts:1297) pays every payable
     * `role.cycle` rule once per live seat (economy.ts:1354). The defaults are
     * 50 village voice and 25 credits (economySeed.ts:162,163), so one seat
     * adds 50000 thousandths and 25 credits on top of the quest's 10000 and 25.
     * The disabled gratitude rule (economySeed.ts:165) pays nothing.
     */
    expect(stepped.balances["mem:u1"]["village-voice"]).toBe(BigInt(60000));
    expect(stepped.balances["mem:u1"].credits).toBe(BigInt(50));
    expect(stepped.balances["mem:u1"].gratitude).toBeUndefined();
    expect(model.invariants(stepped)).toEqual([]);
  });
});

describe("economics assumptions", () => {
  it("defaults to the cautious village and prints every one of them", () => {
    const sentences = describeAssumptions(DEFAULT_ECONOMICS_ASSUMPTIONS);
    expect(sentences).toHaveLength(6);
    for (const s of sentences) expect(s.length).toBeGreaterThan(20);
    expect(sentences.join(" ")).toContain("expires unused");
  });

  it("is total over any input the engine might hand it", () => {
    expect(parseEconomicsAssumptions(undefined)).toEqual(DEFAULT_ECONOMICS_ASSUMPTIONS);
    expect(parseEconomicsAssumptions(null)).toEqual(DEFAULT_ECONOMICS_ASSUMPTIONS);
    expect(parseEconomicsAssumptions("nonsense")).toEqual(DEFAULT_ECONOMICS_ASSUMPTIONS);
    expect(parseEconomicsAssumptions({ questsConfirmedPerMemberPerCycle: "oops" })).toEqual(
      DEFAULT_ECONOMICS_ASSUMPTIONS,
    );
    expect(parseEconomicsAssumptions({ gratitudeAllowanceGivenShare: 9 }).gratitudeAllowanceGivenShare).toBe(1);
    expect(parseEconomicsAssumptions({ gratitudeAllowanceGivenShare: -3 }).gratitudeAllowanceGivenShare).toBe(0);
    expect(parseEconomicsAssumptions({ sinkSpendPerMemberPerCycle: "42" }).sinkSpendPerMemberPerCycle).toBe(
      BigInt(42),
    );
    expect(parseEconomicsAssumptions({ issuanceOpen: "false" }).issuanceOpen).toBe(false);
  });

  it("gives recognition away only when somebody else can receive it", () => {
    const snap = snapshot("lunar");
    snap.balances["mem:u2"] = {};
    snap.members = [
      { id: "u1", accountId: "mem:u1", stage: "member", seats: [] },
      { id: "u2", accountId: "mem:u2", stage: "member", seats: [] },
    ];
    const model = economicsModel({ ...ONE_QUEST, gratitudeAllowanceGivenShare: 1 });
    const stepped = model.step(initialState(snap), 1, makeRng(SEED));
    const memo = readEconomicsMemo(stepped)!;
    /*
     * Two members, each with an allowance of 200 (see above), each giving all
     * of it. `shareCapFor` (economy.ts:683) is
     * `max(1, floor(total * gratitude.max_share_per_recipient / 100))`, and the
     * share defaults to 25 (shared/gameVariables.ts:239), so 50 to any one
     * person. There is exactly one other person, so each giver places 50 and
     * 150 of each allowance expires. `give` (economy.ts:981) mints the
     * recognition fresh from the recognition faucet to the RECEIVER.
     */
    expect(memo.allowanceTotal).toBe(BigInt(400));
    expect(memo.gratitudeGiven).toBe(BigInt(100));
    expect(memo.gratitudeExpired).toBe(BigInt(300));
    expect(stepped.balances["mem:u1"].gratitude).toBe(BigInt(50));
    expect(stepped.balances["mem:u2"].gratitude).toBe(BigInt(50));
    expect(stepped.balances["sys:gratitude-pool"].gratitude).toBe(BigInt(-100));
    // And the value pool follows the recognition, split by it and floored
    // (server/index.ts:21417). 1000 credits, halved.
    expect(memo.poolDistributed).toBe(BigInt(1000));
    expect(stepped.balances["mem:u1"].credits).toBe(BigInt(525));
    expect(model.invariants(stepped)).toEqual([]);
  });
});

describe("economics model, more than one cycle", () => {
  it("splits the pool by what was given THIS cycle, never by the balance", () => {
    const snap = snapshot("lunar");
    snap.balances["mem:u2"] = {};
    snap.members = [
      { id: "u1", accountId: "mem:u1", stage: "member", seats: [] },
      { id: "u2", accountId: "mem:u2", stage: "member", seats: [] },
    ];
    const model = economicsModel({ ...ONE_QUEST, gratitudeAllowanceGivenShare: 1 });
    const result = simulate({ snapshot: snap, changes: [], cycles: 2, seed: SEED }, [model]);
    expect(result.violations).toEqual([]);
    const first = result.proposed[0].state;
    const second = result.proposed[1].state;
    /*
     * The close reads `gratitude_log` rows INSIDE the cycle window
     * (`settleCycle`, server/lib/gratitude-cycles.ts:202, called from
     * server/index.ts:21399 for each due cycle), so the split is by what was
     * given this cycle. Reading the balance instead would carry cycle 1's
     * recognition into cycle 2's denominator and pay the same gift twice.
     * Two cycles, 1000 credits released in each: 500 each per cycle.
     */
    expect(first.balances["mem:u1"].gratitude).toBe(BigInt(50));
    expect(second.balances["mem:u1"].gratitude).toBe(BigInt(100));
    expect(first.balances["mem:u1"].credits).toBe(BigInt(525));
    expect(second.balances["mem:u1"].credits).toBe(BigInt(1050));
    expect(second.balances["sys:cycle-pool"].credits).toBe(BigInt(-2100));
    expect(model.invariants(second)).toEqual([]);
  });

  it("moves the instant one boundary per cycle on each clock", () => {
    for (const mode of ["lunar", "calendar"] as ClockMode[]) {
      const model = economicsModel(ONE_QUEST);
      const clock = clockFor(mode);
      const result = simulate({ snapshot: snapshot(mode), changes: [], cycles: 3, seed: SEED }, [model]);
      expect(result.proposed).toHaveLength(3);
      expect(result.proposed[0].atIso).toBe(AT_ISO);
      expect(result.proposed[1].atIso).toBe(clock.nextBoundaryAfter(AT).toISOString());
      expect(result.proposed[2].atIso).toBe(
        clock.nextBoundaryAfter(clock.nextBoundaryAfter(AT)).toISOString(),
      );
      // Three quests paid, one a cycle.
      expect(result.proposed[2].state.balances["mem:u1"].credits).toBe(BigInt(75));
    }
  });
});

describe("the cardinal rule, as an import graph", () => {
  it("cannot reach anything under server/ and cannot reach mysql2", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(here, "..", "..");
    const entry = path.join(here, "economicsModel.ts");

    const seen: Record<string, true> = {};
    const bare: string[] = [];
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen[file]) continue;
      seen[file] = true;
      if (file.endsWith(".json")) continue;
      const text = fs.readFileSync(file, "utf8");
      const specifiers: string[] = [];
      for (const m of text.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g)) specifiers.push(m[1]);
      for (const m of text.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) specifiers.push(m[1]);
      for (const spec of specifiers) {
        if (!spec.startsWith(".")) {
          bare.push(spec);
          continue;
        }
        const base = path.resolve(path.dirname(file), spec);
        const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, "index.ts")];
        const resolved = candidates.filter((c) => fs.existsSync(c) && fs.statSync(c).isFile())[0];
        expect(resolved, `unresolved import ${spec} from ${file}`).toBeTruthy();
        queue.push(resolved);
      }
    }

    const reached = Object.keys(seen).map((f) => path.relative(root, f).split(path.sep).join("/")).sort();
    expect(reached.length).toBeGreaterThan(1);
    for (const file of reached) {
      expect(file.startsWith("server/"), `${file} is under server/`).toBe(false);
      expect(file.startsWith("client/"), `${file} is under client/`).toBe(false);
    }
    expect(bare).not.toContain("mysql2");
    expect(bare).not.toContain("mysql2/promise");
    expect(bare.filter((b) => b.indexOf("mysql") >= 0)).toEqual([]);
  });
});
