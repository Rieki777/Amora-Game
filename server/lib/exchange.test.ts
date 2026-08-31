/**
 * WHAT MONEY MAY BUY, and the two doors between a card payment and a vote.
 *
 * Measured against the built server on 2026-08-30, both doors were open:
 *
 *  1. `tradingProblem` refused recognition by name and hypha-governed tokens
 *     by governance, and asked nothing at all about `voice` or `equity` kinds.
 *     `server/lib/economy.ts` registers `village-voice` as kind `voice` with
 *     governance `platform` on purpose (a hypha mirror cannot accrue), so the
 *     village's own governance token could be listed, priced, stocked out of
 *     `sys:mint` and sold. `server/lib/voiceClaim.ts` turns a voice balance
 *     into on-chain governance the day `BRIDGE_DISPATCH_BUILT` flips.
 *
 *  2. `weightTokenProblem` refused only non-platform tokens, so
 *     `governance.weight_token` could name an ordinary CREDIT token that was
 *     listed on the exchange, and a card payment was voting weight with no
 *     voice token in the story at all.
 *
 * Every test below drives the state that made each hole real, not the default
 * state where neither is reachable.
 *
 * No database: the token registry and the listing set are in-memory caches
 * filled from two tables, and these are decisions about their contents.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { registerToken, tokenDef, type TokenDef } from "./ledger";
import { VILLAGE_VOICE } from "./economy";
import {
  exchangeSettings,
  isListedForTrade,
  listingProblem,
  purchaseProblem,
  tradingProblem,
  weightTokenListingProblem,
} from "./exchange";
import { weightTokenProblem } from "./governanceWeights";
import { loadVariables } from "./variables";

/** Fill the token registry directly, the way `spending.test.ts` does. */
function loadRegistry(rows: Array<Partial<TokenDef> & { slug: string }>): Promise<void> {
  const full = rows.map((r) => ({
    slug: r.slug,
    name: r.name ?? r.slug,
    kind: r.kind ?? "credit",
    governance: r.governance ?? "platform",
    transferable: r.transferable ? 1 : 0,
    decimals: r.decimals ?? 0,
    active: r.active === false ? 0 : 1,
    is_example: r.isExample ? 1 : 0,
  }));
  const pool: any = { query: async () => [full, []] };
  return registerToken(pool, { slug: "ignored", name: "ignored", kind: "credit", governance: "platform", transferable: false });
}

/**
 * Fill the listing cache the same way: one SELECT that returns the rows under
 * test. `exchangeSettings` is the function that refreshes the set, which is
 * what makes this the real path and not a private hook opened for a test.
 */
function loadListings(rows: Array<{ slug: string; purchasable?: boolean; swappable?: boolean; active?: boolean; isExample?: boolean }>): Promise<unknown> {
  const full = rows.map((r) => ({
    token_slug: r.slug,
    purchasable: r.purchasable ? 1 : 0,
    swappable: r.swappable ? 1 : 0,
    active: r.active === false ? 0 : 1,
    is_example: r.isExample ? 1 : 0,
    sort_order: 0,
    min_stage_to_buy: null,
    max_swap_out_per_cycle: 0,
    max_swap_out_per_member_per_cycle: 0,
    swap_halted_at: null,
    swap_halted_by: null,
    swap_halt_reason: null,
    example_stock: null,
  }));
  const pool: any = { query: async () => [full, []] };
  return exchangeSettings(pool);
}

/** Set the two governance dials the weight rule reads, and nothing else. */
function loadDials(overrides: Record<string, string>): Promise<void> {
  const pool: any = {
    query: async () => [Object.entries(overrides).map(([config_key, value]) => ({ config_key, value })), []],
  };
  return loadVariables(pool);
}

const GRATITUDE = { slug: "gratitude", name: "Gratitude", kind: "recognition", transferable: true };
const CREDITS = { slug: "credits", name: "Village Credits", kind: "credit", transferable: true };
/** The village's own governance token, exactly as `ensureVoiceToken` makes it. */
const VOICE = { slug: VILLAGE_VOICE, name: "Village Voice", kind: "voice", decimals: 3 };
/** A platform equity token. The 0006 seed's equity row is a hypha mirror, so
 *  the equity refusal used to ride on `governance` and never on the kind. */
const SHARES = { slug: "village-shares", name: "Village Shares", kind: "equity" };
/**
 * A Hypha-governed equity mirror, named generically the way `spending.test.ts`
 * names its own: the real deployment's equity slug is one village's brand, and
 * the platform's tests are inside the brand ratchet. What is under test is the
 * GOVERNANCE, which is what refuses.
 */
const MIRROR = { slug: "equity-mirror", name: "Equity Mirror", kind: "equity", governance: "hypha" as const };

beforeEach(async () => {
  await loadRegistry([GRATITUDE, CREDITS, VOICE, SHARES, MIRROR]);
  await loadListings([]);
  await loadDials({});
});

describe("only credits are bought and swapped", () => {
  it("sells the village's own credits", () => {
    expect(tradingProblem("credits")).toBeNull();
    expect(purchaseProblem("credits")).toBeNull();
    expect(listingProblem("credits", { purchasable: true, swappable: true })).toBeNull();
  });

  it("REFUSES the village's voice token at every door", () => {
    // The exact registry row `ensureVoiceToken` writes: platform-governed,
    // kind voice. It passed all three of these before 2026-08-30.
    expect(tokenDef(VILLAGE_VOICE)).toMatchObject({ kind: "voice", governance: "platform" });
    expect(tradingProblem(VILLAGE_VOICE)).toMatch(/not the platform's to sell/);
    expect(purchaseProblem(VILLAGE_VOICE)).toMatch(/not the platform's to sell/);
    expect(listingProblem(VILLAGE_VOICE, { purchasable: true, swappable: false })).toMatch(/voice/);
    expect(listingProblem(VILLAGE_VOICE, { purchasable: false, swappable: true })).toMatch(/voice/);
  });

  it("refuses a PLATFORM equity token, not just the hypha mirror", () => {
    // The old rule refused equity only through `governance === 'hypha'`, which
    // held for the seeded row by accident of the seed and for nothing else.
    expect(tradingProblem("village-shares")).toMatch(/Only credits are bought/);
    expect(tradingProblem("equity-mirror")).toMatch(/Hypha/);
  });

  it("keeps refusing recognition in its own words", () => {
    expect(tradingProblem("gratitude")).toMatch(/earned through contribution/);
  });

  it("refuses a kind nobody has invented yet", async () => {
    // The test is positive (`kind !== "credit"`), so a later migration cannot
    // add a kind that trades because nobody remembered to add a refusal.
    await loadRegistry([{ slug: "land-share", name: "Land Share", kind: "commons" }]);
    expect(tradingProblem("land-share")).toMatch(/Only credits are bought/);
  });

  it("delisting is always legal, whatever the token is", () => {
    expect(listingProblem(VILLAGE_VOICE, { purchasable: false, swappable: false })).toBeNull();
  });
});

describe("the token that weighs votes is not the token money buys", () => {
  it("refuses to LIST the weight token while it is weighing votes", async () => {
    await loadDials({ "governance.weight_mode": "token", "governance.weight_token": "credits" });
    expect(weightTokenListingProblem("credits")).toMatch(/voting weight on sale/);
    expect(tradingProblem("credits")).toMatch(/voting weight on sale/);
    expect(purchaseProblem("credits")).toMatch(/voting weight on sale/);
  });

  it("refuses to WEIGH VOTES with a token that is listed", async () => {
    await loadListings([{ slug: "credits", purchasable: true }]);
    expect(isListedForTrade("credits")).toBe(true);
    expect(weightTokenProblem("credits")).toMatch(/A token money can buy is not what weighs a vote/);
  });

  it("counts a swap listing too, and an inactive one not at all", async () => {
    await loadListings([{ slug: "credits", swappable: true }]);
    expect(weightTokenProblem("credits")).toMatch(/listed on the exchange/);
    await loadListings([{ slug: "credits", purchasable: true, active: false }]);
    expect(weightTokenProblem("credits")).toBeNull();
  });

  it("ignores a standing EXAMPLE listing, which sells nothing", async () => {
    await loadListings([{ slug: "credits", purchasable: true, isExample: true }]);
    expect(isListedForTrade("credits")).toBe(false);
    expect(weightTokenProblem("credits")).toBeNull();
  });

  it("leaves the shipped posture alone: gratitude weighs votes and never trades", async () => {
    // `governance.weight_token` defaults to gratitude and `weight_mode` to
    // equal, so no village gets either refusal without choosing to.
    await loadListings([{ slug: "credits", purchasable: true }]);
    expect(weightTokenProblem("gratitude")).toBeNull();
    expect(weightTokenListingProblem("credits")).toBeNull(); // mode is equal
    expect(tradingProblem("credits")).toBeNull();
  });

  it("still refuses a hypha mirror for weight, in its own words", () => {
    expect(weightTokenProblem("equity-mirror")).toMatch(/mirrored here/);
    expect(weightTokenProblem("no-such-token")).toMatch(/exists in this village's registry/);
  });
});
