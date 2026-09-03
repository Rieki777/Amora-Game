/**
 * THE ECONOMICS HALF OF THE DRY RUN: what one cycle does to balances.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * A founder standing up a village today cannot see a season before thirteen
 * people are depending on it. This model runs the season on paper. It is pure
 * arithmetic over the snapshot, it holds no connection, and it answers the one
 * question a founder cannot otherwise ask: if we set the dials here, who ends
 * up holding what, and what breaks.
 *
 * ── THE CARDINAL RULE, AS AN IMPORT GRAPH ──────────────────────────────────
 *
 * Nothing in `shared/dryRun/` imports anything under `server/`. This file
 * therefore MIRRORS the engine and never calls it: the faucet map, the
 * allow-negative set, the sink map and the mint order below are copies, each
 * one carrying the file and the function it was copied from. A copy can drift,
 * and the answer to that is `economicsModel.test.ts`, which derives every
 * expected number from the real code by reading it, and which walks this
 * file's import graph and fails if anything under `server/` or `mysql2` ever
 * becomes reachable from here.
 *
 * ── IT DESCRIBES WHAT THE CODE DOES, NOT WHAT ANYONE INTENDED ──────────────
 *
 * Three places where those differ, all of them found by reading and all of
 * them modelled the way the code actually behaves:
 *
 *   1. `mintForConfirmedClaim` (server/lib/economy.ts:1117) NEVER CALLS
 *      `clampToCeiling`. Nothing in the shipped server does: the only caller
 *      of that function anywhere is `server/economy.test.ts`. A fixed-amount
 *      rule therefore pays its amount every single time it fires, and its
 *      `ceiling` column bounds nothing at all. So this model does not clamp
 *      either, and it raises a flag saying the cap is decorative.
 *   2. `runSettlement` (server/lib/economy.ts:1297) does NOTHING with the
 *      cycle pool. It pays `role.cycle` rules to seat holders and stops. The
 *      value pool is released by `POST /api/admin/cycles/close`
 *      (server/index.ts:21349), which is a human pressing a button. A village
 *      that never presses it never distributes a token, so the release is an
 *      assumption here and it says so out loud.
 *   3. `mintForConfirmedClaim` skips the recognition token and ignores the
 *      rule's `recipient` column: it always pays the claimant. Both are
 *      modelled as written.
 *
 * ── MINOR UNITS AND bigint ─────────────────────────────────────────────────
 *
 * Every amount here is a `bigint` in minor units, because the ledger stores
 * integers and a preview of somebody's money that is close is worse than no
 * preview. `BigInt("...")` throughout, never a `123n` literal, which the build
 * target refuses (CLAUDE.md, House traps).
 *
 * ── WAVE 2 ─────────────────────────────────────────────────────────────────
 *
 * Two flags are deliberately absent and there is no hook for either.
 * CONCENTRATION needs `shareOfTotal` from `shared/governanceShare.ts`, which
 * is not on this branch. DECAY has no setting in the variables registry to
 * read. Both belong to the wave that lands those two files.
 */
import { clockFor } from "../cycleClock";
import { VARIABLES_BY_KEY, parseVariable } from "../gameVariables";
import type { DomainModel, Flag, MemberSpec, MintRuleSpec, Rng, SimState, TokenSpec, Violation } from "./types";
import {
  DEFAULT_ECONOMICS_ASSUMPTIONS,
  describeAssumptions,
  type EconomicsAssumptions,
} from "./economicsAssumptions";

// ── What the engine knows, mirrored by name ─────────────────────────────────

/**
 * The only sources that may drive a NON-FAUCET account below zero.
 *
 * Mirrored from `ALLOW_NEGATIVE_SOURCES` in server/lib/ledger.ts:257, spelt
 * out here because this file may not import it. This model never posts either
 * of these sources, so in practice any negative non-faucet balance it produces
 * is a violation. The set is still written down so the check reads as the
 * ledger's rule and not as "negative is always wrong".
 */
export const ALLOW_NEGATIVE_SOURCES = ["stay_night", "payment_reversal"];

/** The recognition token's slug (`HEARTS`, server/lib/economy.ts:78). */
export const RECOGNITION_SLUG = "gratitude";

/** The trigger a confirmed quest fires (server/lib/economy.ts:1141). */
export const QUEST_TRIGGER = "quest.completed";

/** The trigger a cycle close fires for seat holders (economy.ts:1309). */
export const ROLE_TRIGGER = "role.cycle";

/**
 * Where a spent token lands, mirrored from `spendSinkFor`
 * (server/lib/spending.ts:139). Stay credits retire into the faucet that
 * issued them; everything else lands in the treasury, which is an ordinary
 * account the village can spend from.
 */
export const TREASURY = "sys:treasury";
export const STAY_CREDIT_SLUG = "stay-credit";
export const MINT_FAUCET = "sys:mint";

export function spendSinkFor(tokenSlug: string): string {
  return tokenSlug === STAY_CREDIT_SLUG ? MINT_FAUCET : TREASURY;
}

// ── The memo the model keeps between step and flags ─────────────────────────

/** One rule's activity in one cycle, so the ceiling flags have something to read. */
export interface RuleActivity {
  ruleId: string;
  tokenSlug: string;
  minted: bigint;
  ceiling: bigint | null;
  fired: number;
}

/** A rule that was enabled, in force, and paid nobody. Mirrors `ruleCannotPay`. */
export interface UnpayableRule {
  ruleId: string;
  tokenSlug: string;
  reason: string;
}

/**
 * WHAT THE MODEL REMEMBERS ABOUT THE CYCLE IT JUST RAN.
 *
 * `SimState` has no room for any of this, so the memo rides on the state as an
 * extra field. See the report to the governance session: `simulate`'s
 * `cloneState` rebuilds the state field by field, so the memo survives every
 * spread inside a pass and is dropped from the recorded `CycleResult.state`.
 * `flags` is called on the live state, so it always sees it.
 */
export interface EconomicsMemo {
  /** Which cycle this memo describes. */
  cycle: number;
  /** The village's own id for the cycle, from `clock.idFor`. */
  cycleId: string;
  /** The cycle's own bounds, from `clock.boundsFor`. */
  startsAt: string;
  endsAt: string;
  /** Where the state's instant moved to, from `clock.nextBoundaryAfter`. */
  nextBoundaryAt: string;
  /** How many two-account moves this cycle made. */
  postings: number;
  /** Quests the assumptions said were confirmed this cycle. */
  questsConfirmed: number;
  /** Allowance granted this cycle, summed over the roll, in minor units. */
  allowanceTotal: bigint;
  /** Recognition actually given this cycle, in minor units. */
  gratitudeGiven: bigint;
  /** Allowance that expired unused this cycle, in minor units (founder ruling R9). */
  gratitudeExpired: bigint;
  /** The token the value pool pays, and its size as the dial reads it. */
  poolToken: string;
  poolSize: bigint;
  /** What the pool actually released, and what its floors left behind. */
  poolDistributed: bigint;
  poolRemainder: bigint;
  /** Whether the pool close ran at all this cycle. */
  poolClosed: boolean;
  /** Per rule, what fired and what it paid. */
  rules: RuleActivity[];
  /** Rules that promised something the engine could not deliver. */
  unpayable: UnpayableRule[];
  /** The last posting source that DEBITED each account, for the negative check. */
  lastDebitSource: Record<string, string>;
  /** Faucet postings the closed-issuance gate refused. */
  issuanceRefusals: number;
  /** Member stages with no `progression.multiplier.<stage>` in the registry. */
  stagesWithoutMultiplier: string[];
}

/** A state carrying the economics memo. `step` returns one of these. */
export interface EconomicsSimState extends SimState {
  economics: EconomicsMemo;
}

/** The memo on this state, or null when nothing has stepped it yet. */
export function readEconomicsMemo(state: SimState): EconomicsMemo | null {
  const memo = (state as Partial<EconomicsSimState>).economics;
  return memo && typeof memo === "object" ? memo : null;
}

// ── Reading the registry the way the server reads it ────────────────────────

/**
 * A variable's value, mirroring `variable()` in server/lib/variables.ts:38.
 *
 * The DEFINITION decides whether the key exists at all, and the snapshot's map
 * supplies only the village's overrides. That order matters and it is the
 * server's: `variable()` throws on a key with no definition WHETHER OR NOT the
 * village stored a value for it. Null here is that throw, made answerable.
 */
function variableValue(state: SimState, key: string): number | boolean | string | null {
  const def = VARIABLES_BY_KEY[key];
  if (!def) return null;
  return parseVariable(def, state.variables[key]);
}

/** `numberVar`, with null where the server would throw on an unknown key. */
function numberVariable(state: SimState, key: string): number | null {
  const v = variableValue(state, key);
  if (v === null) return null;
  return typeof v === "number" ? v : Number(v) || 0;
}

/** `stringVar`, with null where the server would throw on an unknown key. */
function stringVariable(state: SimState, key: string): string | null {
  const v = variableValue(state, key);
  return v === null ? null : String(v);
}

// ── The book: every posting is two legs and conservation is checked ─────────

interface Book {
  balances: Record<string, Record<string, bigint>>;
  faucets: Record<string, true>;
  lastDebitSource: Record<string, string>;
  postings: number;
  issuanceRefusals: number;
  issuanceOpen: boolean;
}

function balanceOf(book: Book, account: string, slug: string): bigint {
  const row = book.balances[account];
  const held = row ? row[slug] : undefined;
  return held === undefined ? BigInt(0) : held;
}

function setBalance(book: Book, account: string, slug: string, value: bigint): void {
  const row = book.balances[account] ?? {};
  row[slug] = value;
  book.balances[account] = row;
}

/**
 * The one check that has to hold after EVERY posting, not only at the end.
 *
 * A run that summed to zero at the end could still have passed through a state
 * it could never have reached, and a preview derived from an impossible state
 * is worse than no preview. It throws, because a broken posting is a defect in
 * this model and not news about the village.
 */
function assertConservation(book: Book, slug: string, context: string): void {
  let sum = BigInt(0);
  const accounts = Object.keys(book.balances);
  for (let i = 0; i < accounts.length; i += 1) {
    sum += balanceOf(book, accounts[i], slug);
  }
  if (sum !== BigInt(0)) {
    throw new Error(
      `economics.conservation broke on "${slug}" after ${context}: the balances over every account sum to ${String(sum)} and every token must sum to zero.`,
    );
  }
}

/**
 * One two-account move in minor units, with the ledger's own refusals.
 *
 * Mirrors `validateLeg` and `postTransfer` (server/lib/ledger.ts:243 and 368):
 * a positive amount, two different accounts, issuance closed until the village
 * starts its Game, and no non-faucet account below zero unless the source is
 * in the allow-negative set. Returns false when the ledger would have refused,
 * which is what makes an unaffordable spend a smaller spend instead of a lie.
 */
function post(
  book: Book,
  from: string,
  to: string,
  slug: string,
  amount: bigint,
  source: string,
): boolean {
  if (amount <= BigInt(0)) return false;
  if (!from || !to || from === to) return false;
  const fromIsFaucet = book.faucets[from] === true;
  if (fromIsFaucet && !book.issuanceOpen) {
    book.issuanceRefusals += 1;
    return false;
  }
  const after = balanceOf(book, from, slug) - amount;
  const negativeAllowed = ALLOW_NEGATIVE_SOURCES.indexOf(source) >= 0;
  if (!fromIsFaucet && after < BigInt(0) && !negativeAllowed) return false;
  setBalance(book, from, slug, after);
  setBalance(book, to, slug, balanceOf(book, to, slug) + amount);
  book.lastDebitSource[from] = source;
  book.postings += 1;
  assertConservation(book, slug, `${source} of ${String(amount)} from ${from} to ${to}`);
  return true;
}

// ── Mirrors of the engine's refusals ────────────────────────────────────────

/** Ten to the power n as a bigint. Written as a loop because the build target
 *  refuses the exponent operator on a bigint (TS2791). */
function powTen(n: number): bigint {
  let out = BigInt(1);
  const places = Math.max(0, Math.trunc(n));
  for (let i = 0; i < places; i += 1) out *= BigInt(10);
  return out;
}

function tokenBySlug(tokens: TokenSpec[], slug: string): TokenSpec | null {
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].slug === slug) return tokens[i];
  }
  return null;
}

/**
 * Why this rule cannot pay, or null when it can.
 *
 * Mirrors `ruleCannotPay` (server/lib/economy.ts:1059) in the order the engine
 * hits the refusals. `TokenSpec` carries no `active` flag and no `governance`
 * column, so two of the engine's four reasons are read off what the snapshot
 * does carry: a `kind` of `equity` or `voice` on a token with no faucet is a
 * Hypha mirror, and the faucet test catches it either way.
 */
export function ruleCannotPay(tokens: TokenSpec[], slug: string): string | null {
  const def = tokenBySlug(tokens, slug);
  if (!def) return `there is no token called "${slug}" in this village's registry`;
  if (!def.faucet) return `${slug} has no faucet, so the engine has nowhere to issue it from`;
  return null;
}

// ── Copying a state without structuredClone ─────────────────────────────────

/**
 * A whole copy, written out by hand.
 *
 * `structuredClone` does not carry a bigint in every runtime this build runs
 * on, and a clone that silently dropped a balance would be the worst possible
 * defect in a preview of somebody's money. So the copy is explicit.
 */
function copyBalances(source: Record<string, Record<string, bigint>>): Record<string, Record<string, bigint>> {
  const out: Record<string, Record<string, bigint>> = {};
  const accounts = Object.keys(source);
  for (let i = 0; i < accounts.length; i += 1) {
    const inner: Record<string, bigint> = {};
    const from = source[accounts[i]] ?? {};
    const slugs = Object.keys(from);
    for (let j = 0; j < slugs.length; j += 1) inner[slugs[j]] = from[slugs[j]];
    out[accounts[i]] = inner;
  }
  return out;
}

function faucetIndex(tokens: TokenSpec[]): Record<string, true> {
  const out: Record<string, true> = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const faucet = tokens[i].faucet;
    if (faucet) out[faucet] = true;
  }
  return out;
}

// ── The step ────────────────────────────────────────────────────────────────

function rulesForTrigger(rules: MintRuleSpec[], trigger: string): MintRuleSpec[] {
  const out: MintRuleSpec[] = [];
  for (let i = 0; i < rules.length; i += 1) {
    if (rules[i].trigger === trigger && rules[i].enabled) out.push(rules[i]);
  }
  return out;
}

function activityFor(list: RuleActivity[], rule: MintRuleSpec): RuleActivity {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].ruleId === rule.id) return list[i];
  }
  const fresh: RuleActivity = {
    ruleId: rule.id,
    tokenSlug: rule.tokenSlug,
    minted: BigInt(0),
    ceiling: rule.ceiling,
    fired: 0,
  };
  list.push(fresh);
  return fresh;
}

function noteUnpayable(list: UnpayableRule[], rule: MintRuleSpec, reason: string): void {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].ruleId === rule.id) return;
  }
  list.push({ ruleId: rule.id, tokenSlug: rule.tokenSlug, reason });
}

/** How many quests this member confirms this cycle, fractional part seeded. */
function questsThisCycle(rate: number, rng: Rng): number {
  const whole = Math.floor(rate);
  const fraction = rate - whole;
  if (fraction <= 0) return whole;
  return rng.next() < fraction ? whole + 1 : whole;
}

/**
 * The allowance a member may give this cycle, in minor units.
 *
 * `allowanceFor` (server/lib/economy.ts:610) computes
 * `Math.round(numberVar("gratitude.base_budget") * stageMultiplier)`, and the
 * multiplier is `numberVar("progression.multiplier.<stage>")`
 * (server/index.ts:3922). Recognition has no decimals in any village that has
 * not changed it, so the whole number the server computes is already minor
 * units; the token's own `decimals` is applied here so a village that scaled
 * it still gets the right answer.
 */
function allowanceFor(state: SimState, member: MemberSpec, recognition: TokenSpec | null): bigint {
  const base = numberVariable(state, "gratitude.base_budget");
  const multiplier = numberVariable(state, `progression.multiplier.${member.stage}`);
  if (base === null || multiplier === null) return BigInt(0);
  const whole = Math.round(base * Math.max(0, multiplier));
  if (!(whole > 0)) return BigInt(0);
  const decimals = recognition ? Math.max(0, Math.trunc(recognition.decimals)) : 0;
  return BigInt(whole) * powTen(decimals);
}

/**
 * The most one member may put on ONE other member this cycle.
 *
 * Mirrors `shareCapFor` (server/lib/economy.ts:683):
 * `max(1, floor(total * gratitude.max_share_per_recipient / 100))`, and zero
 * when the allowance itself is zero. The floor of 1 is the engine's, and it is
 * a bound and never a guess: one percent of an allowance of 50 rounds to zero,
 * and a zero there would refuse every send in the village.
 */
function shareCapFor(state: SimState, allowanceTotal: bigint): bigint {
  if (allowanceTotal <= BigInt(0)) return BigInt(0);
  const share = numberVariable(state, "gratitude.max_share_per_recipient");
  if (share === null) return BigInt(0);
  const capped = (allowanceTotal * BigInt(Math.trunc(share))) / BigInt(100);
  return capped < BigInt(1) ? BigInt(1) : capped;
}

/**
 * ONE CYCLE, in the order the engine does it.
 *
 * Pure. It reads the state it is handed, mutates nothing in it, and returns a
 * new one. Conservation is re-proven after every single posting inside `post`,
 * so a cycle that returns at all is a cycle that held together the whole way
 * through.
 */
function stepCycle(
  state: SimState,
  cycle: number,
  rng: Rng,
  assumptions: EconomicsAssumptions,
): EconomicsSimState {
  const clock = clockFor(state.clock ? state.clock.mode : "lunar");
  const at = new Date(state.atIso);
  const bounds = clock.boundsFor(at);
  const nextBoundary = clock.nextBoundaryAfter(at);

  const tokens = state.tokens ?? [];
  const members = state.members ?? [];
  const recognition = tokenBySlug(tokens, RECOGNITION_SLUG);

  const book: Book = {
    balances: copyBalances(state.balances ?? {}),
    faucets: faucetIndex(tokens),
    lastDebitSource: {},
    postings: 0,
    issuanceRefusals: 0,
    issuanceOpen: assumptions.issuanceOpen,
  };

  const ruleActivity: RuleActivity[] = [];
  const unpayable: UnpayableRule[] = [];
  const stagesWithoutMultiplier: string[] = [];

  // ── 1. Confirmed quests fire the quest.completed rules ────────────────────
  //
  // `mintForConfirmedClaim` (server/lib/economy.ts:1117), guard for guard and
  // in its order. It skips recognition (the consent route already minted it),
  // it refuses a from_source rule outright because a quest posts no amount in
  // any token but recognition, it stays quiet about a rule set to zero, it
  // reports a rule the engine cannot honour, and it pays the CLAIMANT whatever
  // the rule's `recipient` column says.
  const questRules = rulesForTrigger(state.mintRules ?? [], QUEST_TRIGGER);
  let questsConfirmed = 0;
  for (let m = 0; m < members.length; m += 1) {
    const member = members[m];
    const quests = questsThisCycle(assumptions.questsConfirmedPerMemberPerCycle, rng);
    questsConfirmed += quests;
    for (let q = 0; q < quests; q += 1) {
      // The recognition a confirmed quest pays comes from the quest's own
      // advertised range, which the snapshot holds no copy of. Zero unless the
      // village supplied a figure, and `describeAssumptions` says so.
      if (assumptions.gratitudePerConfirmedQuest > BigInt(0) && recognition && recognition.faucet) {
        post(
          book,
          recognition.faucet,
          member.accountId,
          RECOGNITION_SLUG,
          assumptions.gratitudePerConfirmedQuest,
          "quest_consent",
        );
      }
      for (let r = 0; r < questRules.length; r += 1) {
        const rule = questRules[r];
        if (rule.tokenSlug === RECOGNITION_SLUG) continue;
        const activity = activityFor(ruleActivity, rule);
        if (rule.amount === null) {
          noteUnpayable(
            unpayable,
            rule,
            "this rule reads its amount from the work, and a quest posts no amount in this token",
          );
          continue;
        }
        if (rule.amount <= BigInt(0)) continue;
        const problem = ruleCannotPay(tokens, rule.tokenSlug);
        if (problem) {
          noteUnpayable(unpayable, rule, problem);
          continue;
        }
        const faucet = tokenBySlug(tokens, rule.tokenSlug)!.faucet!;
        // No clamp. `mintForConfirmedClaim` never calls `clampToCeiling`, so a
        // fixed amount pays in full however high the total climbs. See the
        // header, and the ceiling flags below.
        if (post(book, faucet, member.accountId, rule.tokenSlug, rule.amount, "quest_consent")) {
          activity.minted += rule.amount;
          activity.fired += 1;
        }
      }
    }
  }

  // ── 2. Gratitude, given from the allowance, within the per-person share ───
  //
  // `give` (server/lib/economy.ts:934) mints fresh recognition from the
  // recognition faucet to the RECEIVER and takes nothing from the giver, so
  // the allowance is the only thing bounding it. `checkGive` refuses a gift to
  // yourself, which is why a village of one gives nothing at all.
  let allowanceTotal = BigInt(0);
  let gratitudeGiven = BigInt(0);
  // Recognition RECEIVED THIS CYCLE THROUGH A GIFT, keyed by account. It is
  // this figure and not the account's balance that the cycle close splits the
  // pool by, and the difference is load-bearing twice over. A balance carries
  // every earlier cycle's recognition, and the close reads `gratitude_log`
  // rows inside the cycle window (`settleCycle`, server/lib/gratitude-cycles.ts:202
  // by way of server/index.ts:21399). And ONLY THE GIVING PATH WRITES THAT
  // TABLE: `writeGratitudeRow` is called from `give` (economy.ts:954) and
  // `sendGratitude` (gratitude.ts:144) and from nowhere else, so the
  // recognition a confirmed quest mints (server/index.ts:20616, a bare
  // `postTransfer`) never reaches the split. A village whose recognition comes
  // mostly from quests routes almost none of its value pool.
  const receivedThisCycle: Record<string, bigint> = {};
  for (let m = 0; m < members.length; m += 1) {
    const giver = members[m];
    if (VARIABLES_BY_KEY[`progression.multiplier.${giver.stage}`] === undefined) {
      if (stagesWithoutMultiplier.indexOf(giver.stage) < 0) stagesWithoutMultiplier.push(giver.stage);
    }
    const total = allowanceFor(state, giver, recognition);
    allowanceTotal += total;
    if (total <= BigInt(0)) continue;
    if (!(assumptions.gratitudeAllowanceGivenShare > 0)) continue;
    if (!recognition || !recognition.faucet) continue;
    const cap = shareCapFor(state, total);
    if (cap <= BigInt(0)) continue;
    const intended =
      (total * BigInt(Math.round(assumptions.gratitudeAllowanceGivenShare * 10000))) / BigInt(10000);
    let left = intended;
    for (let r = 0; r < members.length && left > BigInt(0); r += 1) {
      const receiver = members[r];
      if (receiver.id === giver.id) continue;
      const amount = left < cap ? left : cap;
      if (post(book, recognition.faucet, receiver.accountId, RECOGNITION_SLUG, amount, "gratitude_received")) {
        left -= amount;
        gratitudeGiven += amount;
        receivedThisCycle[receiver.accountId] = (receivedThisCycle[receiver.accountId] ?? BigInt(0)) + amount;
      }
    }
  }

  // ── 3. Sinks ──────────────────────────────────────────────────────────────
  //
  // `spendSinkFor` (server/lib/spending.ts:139) decides where a spent token
  // lands. A member can only spend what they hold, because `postTransfer`
  // refuses to drive a non-faucet account below zero, so `post` returns false
  // and the smaller truth is what the preview shows.
  const poolTokenSlug = stringVariable(state, "gratitude.pool_token") ?? "";
  if (assumptions.sinkSpendPerMemberPerCycle > BigInt(0) && poolTokenSlug) {
    const sink = spendSinkFor(poolTokenSlug);
    for (let m = 0; m < members.length; m += 1) {
      const member = members[m];
      const held = balanceOf(book, member.accountId, poolTokenSlug);
      const asked = assumptions.sinkSpendPerMemberPerCycle;
      const amount = held < asked ? held : asked;
      post(book, member.accountId, sink, poolTokenSlug, amount, "spend");
    }
  }

  // ── 4a. The cycle closes: runSettlement pays the seats ────────────────────
  //
  // `runSettlement` (server/lib/economy.ts:1297) reads the `role.cycle` rules,
  // names the unpayable ones ONCE, and then pays every payable rule to every
  // live seat holder, once per SEAT. A member holding no seat is paid nothing,
  // which is the whole of what the code does for them.
  const roleRules = rulesForTrigger(state.mintRules ?? [], ROLE_TRIGGER);
  const payableRoleRules: MintRuleSpec[] = [];
  for (let r = 0; r < roleRules.length; r += 1) {
    const rule = roleRules[r];
    activityFor(ruleActivity, rule);
    const problem = ruleCannotPay(tokens, rule.tokenSlug);
    if (problem) {
      noteUnpayable(unpayable, rule, problem);
      continue;
    }
    payableRoleRules.push(rule);
  }
  for (let m = 0; m < members.length; m += 1) {
    const member = members[m];
    const seats = member.seats ?? [];
    for (let s = 0; s < seats.length; s += 1) {
      for (let r = 0; r < payableRoleRules.length; r += 1) {
        const rule = payableRoleRules[r];
        if (rule.amount === null || rule.amount <= BigInt(0)) continue;
        const activity = activityFor(ruleActivity, rule);
        const faucet = tokenBySlug(tokens, rule.tokenSlug)!.faucet!;
        if (post(book, faucet, member.accountId, rule.tokenSlug, rule.amount, "role_cycle")) {
          activity.minted += rule.amount;
          activity.fired += 1;
        }
      }
    }
  }

  // ── 4b. The cycle closes: the value pool, if a human presses the button ───
  //
  // `POST /api/admin/cycles/close` (server/index.ts:21349) splits
  // `gratitude.pool_per_cycle` among the people who received recognition this
  // cycle, in proportion to it, with `Math.floor` keeping every remainder in
  // the pool. The amount it hands `postTransfer` is the dial's own number,
  // which the ledger reads as MINOR UNITS, so a pool paying a token with
  // decimals releases a thousandth of what the dial says. See the
  // `econ_pool_in_whole_tokens` flag.
  const poolSizeRaw = numberVariable(state, "gratitude.pool_per_cycle") ?? 0;
  const poolSize = poolSizeRaw > 0 ? BigInt(Math.trunc(poolSizeRaw)) : BigInt(0);
  let poolDistributed = BigInt(0);
  const poolClosed = assumptions.poolClosedEachCycle;
  if (poolClosed && poolSize > BigInt(0) && gratitudeGiven > BigInt(0) && poolTokenSlug) {
    const poolToken = tokenBySlug(tokens, poolTokenSlug);
    const poolFaucet = poolToken ? poolToken.faucet : null;
    if (poolFaucet && poolTokenSlug !== RECOGNITION_SLUG) {
      for (let m = 0; m < members.length; m += 1) {
        const member = members[m];
        const received = receivedThisCycle[member.accountId] ?? BigInt(0);
        if (received <= BigInt(0)) continue;
        const share = (received * poolSize) / gratitudeGiven;
        if (post(book, poolFaucet, member.accountId, poolTokenSlug, share, "gratitude_pool")) {
          poolDistributed += share;
        }
      }
    }
  }

  // ── 5. Unspent allowance expires ──────────────────────────────────────────
  //
  // Founder ruling R9: show underutilisation. Nothing is posted, because
  // nothing was ever stored: `allowanceFor` computes the figure from what was
  // given, so an allowance nobody spent simply stops existing at the boundary.
  // The number is kept here so the flag can report it.
  const gratitudeExpired = allowanceTotal - gratitudeGiven;

  const memo: EconomicsMemo = {
    cycle,
    cycleId: bounds.id,
    startsAt: bounds.startsAt.toISOString(),
    endsAt: bounds.endsAt.toISOString(),
    nextBoundaryAt: nextBoundary.toISOString(),
    postings: book.postings,
    questsConfirmed,
    allowanceTotal,
    gratitudeGiven,
    gratitudeExpired: gratitudeExpired > BigInt(0) ? gratitudeExpired : BigInt(0),
    poolToken: poolTokenSlug,
    poolSize,
    poolDistributed,
    poolRemainder: poolClosed ? poolSize - poolDistributed : BigInt(0),
    poolClosed,
    rules: ruleActivity,
    unpayable,
    lastDebitSource: book.lastDebitSource,
    issuanceRefusals: book.issuanceRefusals,
    stagesWithoutMultiplier,
  };

  return {
    atIso: nextBoundary.toISOString(),
    cycle,
    clock: { mode: state.clock.mode, timezone: state.clock.timezone },
    tokens: tokens.map((t) => ({ ...t, sinks: (t.sinks ?? []).slice() })),
    balances: book.balances,
    mintRules: (state.mintRules ?? []).map((r) => ({ ...r })),
    variables: { ...(state.variables ?? {}) },
    members: members.map((m) => ({ ...m, seats: (m.seats ?? []).slice() })),
    modules: { ...(state.modules ?? {}) },
    governance: {
      cyclesElapsed: state.governance.cyclesElapsed,
      landedPaths: state.governance.landedPaths.slice(),
      revertedPaths: state.governance.revertedPaths.slice(),
    },
    economics: memo,
  };
}

// ── Invariants ──────────────────────────────────────────────────────────────

/** Every token slug that appears anywhere in this state. */
function allSlugs(state: SimState): string[] {
  const seen: Record<string, true> = {};
  const tokens = state.tokens ?? [];
  for (let i = 0; i < tokens.length; i += 1) seen[tokens[i].slug] = true;
  const accounts = Object.keys(state.balances ?? {});
  for (let i = 0; i < accounts.length; i += 1) {
    const row = state.balances[accounts[i]] ?? {};
    const slugs = Object.keys(row);
    for (let j = 0; j < slugs.length; j += 1) seen[slugs[j]] = true;
  }
  return Object.keys(seen).sort();
}

function invariantsOf(state: SimState): Violation[] {
  const out: Violation[] = [];
  const faucets = faucetIndex(state.tokens ?? []);
  const memo = readEconomicsMemo(state);
  const accounts = Object.keys(state.balances ?? {}).sort();
  const slugs = allSlugs(state);

  for (let i = 0; i < slugs.length; i += 1) {
    const slug = slugs[i];
    let sum = BigInt(0);
    for (let a = 0; a < accounts.length; a += 1) {
      const row = state.balances[accounts[a]] ?? {};
      const held = row[slug];
      if (held !== undefined) sum += held;
    }
    if (sum !== BigInt(0)) {
      out.push({
        invariant: "ledger.conservation",
        cycle: state.cycle,
        detail: `${slug}: the balances over all ${accounts.length} account(s), faucets included, sum to ${String(sum)} and every token must sum to 0.`,
      });
    }
  }

  for (let a = 0; a < accounts.length; a += 1) {
    const account = accounts[a];
    if (faucets[account] === true) continue;
    const row = state.balances[account] ?? {};
    const held = Object.keys(row);
    for (let j = 0; j < held.length; j += 1) {
      const slug = held[j];
      const value = row[slug];
      if (value >= BigInt(0)) continue;
      const source = memo ? memo.lastDebitSource[account] : undefined;
      if (source && ALLOW_NEGATIVE_SOURCES.indexOf(source) >= 0) continue;
      out.push({
        invariant: "ledger.no_negative_non_faucet",
        cycle: state.cycle,
        detail: `${account} holds ${String(value)} ${slug} on an ordinary account, and only a faucet may go below zero. The last debit there was ${source ? `"${source}"` : "not recorded by this run"}, and the ledger permits a negative only from ${ALLOW_NEGATIVE_SOURCES.join(", ")}.`,
      });
    }
  }

  return out;
}

// ── Flags ───────────────────────────────────────────────────────────────────

function humanUnits(minor: bigint, decimals: number): string {
  const places = Math.max(0, Math.trunc(decimals));
  if (places === 0) return String(minor);
  const scale = powTen(places);
  const whole = minor / scale;
  const rest = minor < BigInt(0) ? -(minor % scale) : minor % scale;
  return `${String(whole)}.${String(rest).padStart(places, "0")}`;
}

function decimalsOf(tokens: TokenSpec[], slug: string): number {
  const def = tokenBySlug(tokens, slug);
  return def ? Math.max(0, Math.trunc(def.decimals)) : 0;
}

function flagsOf(state: SimState, cycle: number, assumptions: EconomicsAssumptions): Flag[] {
  const out: Flag[] = [];
  const tokens = state.tokens ?? [];
  const memo = readEconomicsMemo(state);
  const members = state.members ?? [];

  // (g) A faucet account the snapshot holds no row for. An absent account and
  // a zero balance are the same number and a different fact: the ledger
  // refuses a posting out of a system account that does not exist.
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.faucet) continue;
    if (state.balances && state.balances[token.faucet] !== undefined) continue;
    out.push({
      code: "econ_faucet_account_missing",
      severity: "danger",
      cycle,
      sentence: `${token.slug} says it is issued from ${token.faucet}, and this village's ledger holds no such account.`,
      actionable: `Create ${token.faucet} before anything tries to issue ${token.slug}. Until it exists every posting out of it is refused.`,
    });
  }

  // (a) A rule that can never pay, and (b) an amount that reaches this preview
  // as nothing. Both are read off the rules themselves, so they answer even
  // before a cycle has run.
  const rules = state.mintRules ?? [];
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (!rule.enabled) continue;
    const problem = ruleCannotPay(tokens, rule.tokenSlug);
    if (problem) {
      out.push({
        code: "econ_rule_cannot_pay",
        severity: "warning",
        cycle,
        sentence: `The rule on ${rule.trigger} promises ${rule.tokenSlug} and pays nobody, because ${problem}.`,
        actionable: `Turn this rule off, or give ${rule.tokenSlug} a faucet. Every surface in the village currently advertises a payout that never arrives.`,
      });
      continue;
    }
    if (rule.amount === null && rule.trigger === QUEST_TRIGGER) {
      out.push({
        code: "econ_rule_cannot_pay",
        severity: "warning",
        cycle,
        sentence: `The rule on ${rule.trigger} reads its amount from the work, and a quest posts no amount in ${rule.tokenSlug}, so it can never pay on any quest.`,
        actionable: `Give this rule a fixed amount, or turn it off. Only the recognition a quest advertises rides on the work itself.`,
      });
      continue;
    }
    if (rule.amount !== null && rule.amount <= BigInt(0)) {
      out.push({
        code: "econ_amount_rounds_away",
        severity: "warning",
        cycle,
        sentence: `The rule on ${rule.trigger} is enabled and reaches this preview as zero minor units of ${rule.tokenSlug}, so it pays nobody.`,
        actionable: `Either the village set this to zero on purpose, or the amount it holds is smaller than ${rule.tokenSlug} can carry and was lost on the way in. The column holds four decimal places and the token holds ${decimalsOf(tokens, rule.tokenSlug)}, so check the rule against what you meant to type.`,
      });
    }
  }

  // (i) Issuance closed. Nothing can be minted at all until the launch vote
  // carries, so a preview of a village in that state is a preview of nothing.
  if (!assumptions.issuanceOpen) {
    out.push({
      code: "econ_issuance_closed",
      severity: "warning",
      cycle,
      sentence: "This village has not started its Game, so every posting out of a faucet is refused and no token is issued at all.",
      actionable: "Carry the launch vote. Until it does, quest rewards, seat payouts and the value pool all pay nothing.",
    });
  }

  // (h) A member whose stage has no allowance multiplier in the registry. The
  // server throws on this key, so it is not a quiet zero anywhere real.
  if (memo) {
    for (let i = 0; i < memo.stagesWithoutMultiplier.length; i += 1) {
      const stage = memo.stagesWithoutMultiplier[i];
      out.push({
        code: "econ_stage_no_multiplier",
        severity: "danger",
        cycle,
        sentence: `Somebody in this village is at the "${stage}" stage, and there is no progression.multiplier.${stage} in the variables registry.`,
        actionable: `Add "${stage}" to the ladder or move the member to a stage that is on it. The server reads this key on every gift and refuses an unknown one, so nobody at this stage can give anything.`,
      });
    }
  }

  // (j) The recognition a confirmed quest pays is not in the snapshot.
  if (memo && memo.questsConfirmed > 0 && assumptions.gratitudePerConfirmedQuest === BigInt(0)) {
    out.push({
      code: "econ_quest_recognition_unmodelled",
      severity: "notice",
      cycle,
      sentence: `${memo.questsConfirmed} quest(s) were confirmed this cycle and this preview shows no recognition for them, because a quest pays the range it advertises on itself and the snapshot holds no copy of any quest.`,
      actionable: "Tell the preview what a typical quest pays, and the recognition, the value pool it routes, and the totals below all move with it.",
    });
  }

  // (d) Founder ruling R9: show underutilisation, with the amount.
  if (memo && memo.cycle === cycle && memo.gratitudeExpired > BigInt(0)) {
    const decimals = decimalsOf(tokens, RECOGNITION_SLUG);
    out.push({
      code: "econ_gratitude_expired",
      severity: "notice",
      cycle,
      sentence: `${humanUnits(memo.gratitudeExpired, decimals)} of the ${humanUnits(memo.allowanceTotal, decimals)} recognition this village could have given expired unused at the end of this cycle.`,
      actionable:
        members.length <= 1
          ? "One member cannot give recognition to anybody, because a member may not thank themselves. The allowance means nothing until a second person joins."
          : "Allowance does not roll over. Lower the base allowance, or give people more reason to use it.",
    });
  }

  // (c) The pool against what the village can route through it.
  if (memo && memo.cycle === cycle && memo.poolSize > BigInt(0)) {
    const poolDecimals = decimalsOf(tokens, memo.poolToken);
    if (memo.allowanceTotal > memo.poolSize) {
      out.push({
        code: "econ_pool_exhausts",
        severity: "warning",
        cycle,
        sentence: `This village can route ${String(memo.allowanceTotal)} recognition through a pool of ${String(memo.poolSize)} ${memo.poolToken} a cycle, so from cycle ${cycle} one unit of recognition is worth less than one minor unit of ${memo.poolToken} and every small share floors to nothing.`,
        actionable: `Raise gratitude.pool_per_cycle above ${String(memo.allowanceTotal)}, or lower gratitude.base_budget, so a unit of recognition is still worth something as the roll grows.`,
      });
    }
    if (memo.poolClosed && memo.poolRemainder > BigInt(0)) {
      out.push({
        code: "econ_pool_exhausts",
        severity: "notice",
        cycle,
        sentence: `The value pool released ${humanUnits(memo.poolDistributed, poolDecimals)} of its ${humanUnits(memo.poolSize, poolDecimals)} ${memo.poolToken} this cycle and the remaining ${humanUnits(memo.poolRemainder, poolDecimals)} stayed unissued.`,
        actionable: "Shares round down and the remainder never leaves the faucet. A pool that keeps most of itself back every cycle is sized for a bigger village than this one.",
      });
    }
    // The dial says tokens and the ledger reads minor units.
    if (poolDecimals > 0) {
      out.push({
        code: "econ_pool_in_whole_tokens",
        severity: "danger",
        cycle,
        sentence: `The value pool is set to ${String(memo.poolSize)} ${memo.poolToken}, and ${memo.poolToken} holds ${poolDecimals} decimal places, so the close releases ${humanUnits(memo.poolSize, poolDecimals)} of it and not ${String(memo.poolSize)}.`,
        actionable: `Point gratitude.pool_token at a token with no decimal places, or set gratitude.pool_per_cycle to ${String(memo.poolSize * powTen(poolDecimals))} to release what the dial reads.`,
      });
    }
  }

  // (f) Ceilings: never reached, or reached and not honoured.
  if (memo && memo.cycle === cycle) {
    for (let i = 0; i < memo.rules.length; i += 1) {
      const activity = memo.rules[i];
      const ceiling = activity.ceiling;
      if (ceiling === null || ceiling <= BigInt(0)) continue;
      const decimals = decimalsOf(tokens, activity.tokenSlug);
      if (activity.minted >= ceiling) {
        out.push({
          code: "econ_ceiling_always_hit",
          severity: "warning",
          cycle,
          sentence: `The rule on ${activity.tokenSlug} paid ${humanUnits(activity.minted, decimals)} this cycle against a ceiling of ${humanUnits(ceiling, decimals)}, and the engine issued all of it, because nothing in the mint path reads that ceiling.`,
          actionable: `Lower the amount itself. The ceiling column bounds only the rules that read their amount from the work, and this one does not.`,
        });
      } else if (activity.minted > BigInt(0) && activity.minted * BigInt(10) < ceiling) {
        out.push({
          code: "econ_ceiling_never_reached",
          severity: "notice",
          cycle,
          sentence: `The rule on ${activity.tokenSlug} paid ${humanUnits(activity.minted, decimals)} this cycle against a ceiling of ${humanUnits(ceiling, decimals)}, which is more than ten times what it pays.`,
          actionable: "A cap this far above the payout tells a reader nothing about what the rule can cost. Bring it near what the village expects to issue.",
        });
      }
    }
  }

  // (e) A negative balance on an account that is not a faucet.
  const violations = invariantsOf(state);
  for (let i = 0; i < violations.length; i += 1) {
    if (violations[i].invariant !== "ledger.no_negative_non_faucet") continue;
    out.push({
      code: "econ_negative_balance",
      severity: "danger",
      cycle,
      sentence: `An account that is not a faucet is holding a negative balance. ${violations[i].detail}`,
      actionable: "Only a faucet may go negative, and its negative balance is that token's issued supply. A negative anywhere else means value was moved that never existed.",
    });
  }

  return out;
}

// ── The model ───────────────────────────────────────────────────────────────

/** The economics model, plus the assumptions it ran under, for printing. */
export interface EconomicsModel extends DomainModel {
  name: "economics";
  assumptions: EconomicsAssumptions;
  /** One plain sentence per assumption, for printing beside the seed. */
  describeAssumptions(): string[];
}

/**
 * The economics model, ready to hand to `simulate` beside the governance one.
 *
 * `assumptions` is optional and defaults to the cautious village. When the
 * engine starts carrying `SimInput.assumptions.economics`, the wiring is
 * `economicsModel(parseEconomicsAssumptions(input.assumptions?.economics))`
 * and nothing in this file changes.
 */
export function economicsModel(assumptions?: Partial<EconomicsAssumptions>): EconomicsModel {
  const settled: EconomicsAssumptions = { ...DEFAULT_ECONOMICS_ASSUMPTIONS, ...(assumptions ?? {}) };
  return {
    name: "economics",
    assumptions: settled,
    describeAssumptions(): string[] {
      return describeAssumptions(settled);
    },
    step(state: SimState, cycle: number, rng: Rng): SimState {
      return stepCycle(state, cycle, rng, settled);
    },
    flags(state: SimState, cycle: number): Flag[] {
      return flagsOf(state, cycle, settled);
    },
    invariants(state: SimState): Violation[] {
      return invariantsOf(state);
    },
  };
}
