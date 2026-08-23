/**
 * The builders' pool, split.
 *
 * One pure function turns a set of weights into whole $ReGen amounts, and it
 * guarantees the only property that matters: WHAT GOES OUT PLUS WHAT COMES
 * BACK EQUALS WHAT THE POOL HELD. Not approximately, not up to rounding, and
 * not once the fractions are dropped. Exactly.
 *
 * WHY THAT IS THE WHOLE POINT. A pro-rata split is division, division leaves
 * remainders, and the obvious implementation drops them. A pool of 10000 split
 * across seven modules by `Math.floor` loses up to six $ReGen every cycle. Six
 * is nothing; six every lunar cycle forever, in a ledger whose first invariant
 * is that the balances sum to zero, is a slow leak that surfaces years later as
 * a number nobody can explain and a trust problem nobody can close. The
 * founders' rule holds here: state what is true, and a pool that cannot say
 * where every unit went is not stating anything.
 *
 * So this uses LARGEST REMAINDER (the Hare quota). Every module takes the floor
 * of its exact share, and the units left over go one each to the modules with
 * the largest dropped fractions, highest first, ties broken by module id so two
 * runs of the same input can never disagree. The leftover is always smaller
 * than the number of modules sharing it, because it is the sum of proper
 * fractions, so there is always somewhere for every unit to land.
 *
 * WHERE R59 LIVES. `disposition` comes from `poolStatus` and says whether a
 * share is owed to somebody or returns to the pool. This function never decides
 * that and never looks at a registry entry; it takes the answer and does the
 * arithmetic. Keeping the two apart is what lets the closure test below be a
 * statement about the arithmetic alone.
 */
import type { PoolDisposition } from "./modulePool";

/**
 * The $ReGen the hub puts into the builders' pool each lunar cycle.
 *
 * A CONSTANT and deliberately not a game variable, which is the one config
 * decision in this file worth arguing about. The five config planes would put a
 * number like this in plane 1, behaviour, where a village admin can change it.
 * A village must never be able to change it. The pool is the hub's money, split
 * across every village at once, and a knob here would let any fork write its
 * own pool size into its own statement, which is a fork printing money in a
 * report somebody else settles from.
 *
 * So the hub is authoritative and this is a MIRROR, carried here for one
 * purpose: to let a village read its own statement and check the arithmetic
 * closes without waiting on a hub round trip. `10000` matches the shape of
 * `gratitude.pool_per_cycle`, the platform's other lunar pool. When the hub
 * publishes a real figure through the `/api/platform/info` handshake, this
 * becomes the fallback for a village that has not heard one yet.
 */
export const MODULE_POOL_PER_CYCLE = 10000;

/** One module's claim on the pool. `weight` is unitless and never negative. */
export interface PoolShareInput {
  moduleId: string;
  /**
   * The module's measured usage, summed across every village the hub counts.
   * `server/lib/moduleUsage.ts` explains what a village contributes and why it
   * is capped at one. Zero is a real weight and earns zero.
   */
  weight: number;
  /** From `poolStatus`. An entry that is not eligible never reaches here. */
  disposition: PoolDisposition;
  /**
   * Whether the credited builder has a ReGen Civics handle for the hub to
   * settle against. False means the share is still theirs and is held for them,
   * which is the behaviour `ModuleDef.builtByAccount` already promises: "the
   * hub's cycle statement records that share as unpaid and names what is
   * missing". Ignored for a recycled share, which is owed to nobody.
   */
  hasPayoutAccount?: boolean;
}

/**
 * What happens to one module's share, which is a finer question than where it
 * came from.
 *
 *   payable   a builder outside the platform is owed it and can be paid now.
 *   accrued   a builder outside the platform is owed it and there is no handle
 *             to pay, so it is held and the statement names what is missing.
 *   recycled  nobody is owed it. It returns to the pool for the next cycle.
 */
export type PoolSettlement = "payable" | "accrued" | "recycled";

export interface PoolShare {
  moduleId: string;
  weight: number;
  /** Whole $ReGen. The sum of every share is exactly the pool. */
  share: number;
  disposition: PoolDisposition;
  settlement: PoolSettlement;
}

export interface PoolSplit {
  /** What the pool held going in. */
  pool: number;
  totalWeight: number;
  /** Every input, in descending share then module id. Zero shares included. */
  shares: PoolShare[];
  /** Owed and settleable now. */
  payable: number;
  /** Owed, held, waiting on a handle. */
  accrued: number;
  /** Everything owed to somebody: `payable + accrued`. */
  distributed: number;
  /** Owed to nobody, returning to the pool: `pool - distributed`. */
  recycled: number;
}

/**
 * Split `pool` across `inputs` by weight.
 *
 * Refuses a pool that is not a whole non-negative number and refuses a negative
 * weight, both loudly. A silent coercion here writes a wrong number into a
 * statement somebody is paid from, and the ledger's own posture is that an
 * invariant is enforced with a failure and never with a comment.
 *
 * Zero total weight returns the whole pool as recycled. That is the honest
 * answer to "nobody used anything this cycle", and it is also the state the
 * platform ships in: no module in the registry carries a `builtBy` credit
 * today, so every module is platform-built, every share recycles, and the pool
 * rolls forward whole until the first outside builder lists a module.
 */
export function computeModulePoolShares(
  inputs: readonly PoolShareInput[],
  pool: number,
): PoolSplit {
  // isSafeInteger and not isInteger: above 2^53 the sums below stop being
  // exact, so a pool that large would pass every closure check in this file
  // while silently losing units. The hub reuses this with its own pool size.
  if (!Number.isSafeInteger(pool) || pool < 0) {
    throw new Error(`pool must be a whole non-negative number of $ReGen, got ${String(pool)}`);
  }
  for (const i of inputs) {
    if (!Number.isFinite(i.weight) || i.weight < 0) {
      throw new Error(`module "${i.moduleId}" has weight ${String(i.weight)}, which is not a usable weight`);
    }
    if (i.disposition === "none") {
      throw new Error(`module "${i.moduleId}" is not eligible for the pool and cannot be given a share`);
    }
  }

  const totalWeight = inputs.reduce((n, i) => n + i.weight, 0);
  // Each weight is finite and the total still is not, so the weights overflowed
  // between them. Every `exact` below would be a NaN and the split would fail
  // later with an arithmetic message that names none of this.
  if (!Number.isFinite(totalWeight)) {
    throw new Error(`the weights sum to ${String(totalWeight)}, so no share can be computed from them`);
  }
  const settlementOf = (i: PoolShareInput): PoolSettlement =>
    i.disposition === "recycled" ? "recycled" : i.hasPayoutAccount ? "payable" : "accrued";

  // Nothing was used, or nothing is eligible. The pool keeps every unit.
  if (totalWeight <= 0 || pool === 0) {
    const shares = inputs
      .map((i) => ({ moduleId: i.moduleId, weight: i.weight, share: 0, disposition: i.disposition, settlement: settlementOf(i) }))
      .sort(byShareThenId);
    const empty: PoolSplit = { pool, totalWeight, shares, payable: 0, accrued: 0, distributed: 0, recycled: pool };
    assertPoolCloses(empty);
    return empty;
  }

  // Floor everybody, then hand the leftover to the largest dropped fractions.
  // Only a module with real weight can receive a leftover unit: a module nobody
  // opened has a zero fraction and must finish on zero, never on one because
  // the sort happened to reach it.
  const scored = inputs.map((i) => {
    const exact = (pool * i.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { input: i, share: floor, fraction: exact - floor };
  });
  const leftover = pool - scored.reduce((n, s) => n + s.share, 0);
  const claimants = scored
    .filter((s) => s.input.weight > 0)
    .sort((a, b) => b.fraction - a.fraction || (a.input.moduleId < b.input.moduleId ? -1 : 1));
  // The leftover is the sum of the dropped fractions, and every claimant
  // dropped less than one, so there is always a claimant for every unit. If
  // that ever stops being true the arithmetic changed underneath this file and
  // the pool would silently keep the difference.
  if (leftover > claimants.length) {
    throw new Error(`pool split left ${leftover} $ReGen with only ${claimants.length} modules able to take it`);
  }
  for (let n = 0; n < leftover; n += 1) claimants[n]!.share += 1;

  const shares: PoolShare[] = scored
    .map((s) => ({
      moduleId: s.input.moduleId,
      weight: s.input.weight,
      share: s.share,
      disposition: s.input.disposition,
      settlement: settlementOf(s.input),
    }))
    .sort(byShareThenId);

  const sumOf = (k: PoolSettlement) => shares.reduce((n, s) => (s.settlement === k ? n + s.share : n), 0);
  const payable = sumOf("payable");
  const accrued = sumOf("accrued");
  const distributed = payable + accrued;
  // Everything the pool held and does not owe to anybody. That is the shares
  // marked recycled, and it is also anything the split never allocated at all,
  // which is how the zero-weight case stays closed without a second rule.
  const recycled = pool - distributed;

  const split: PoolSplit = { pool, totalWeight, shares, payable, accrued, distributed, recycled };
  assertPoolCloses(split);
  return split;
}

function byShareThenId(a: PoolShare, b: PoolShare): number {
  return b.share - a.share || (a.moduleId < b.moduleId ? -1 : 1);
}

/**
 * The closure check, as a function so a caller can run it on a split it
 * received over the wire instead of trusting the sender.
 *
 * WHICH OF THESE HAS FORCE DEPENDS ON WHO IS CALLING, and saying so plainly is
 * worth more than the reassurance of a long list.
 *
 * On a split this file just built, the first three are tautologies:
 * `distributed` was ASSIGNED `payable + accrued` and `recycled` was ASSIGNED
 * `pool - distributed` a few lines earlier, so they cannot disagree however
 * broken the allocation above them is. Only the fourth has force internally,
 * and it is the one that matters: it is what would catch a `Math.floor`
 * quietly dropping remainders.
 *
 * On a split that arrived from somewhere else, which is why this is exported,
 * all four have force and each catches a different lie. That is the case the
 * hub is in when it reads a village's numbers, and it is the case the tampering
 * test exercises.
 *
 * The fourth is conditional on purpose. A cycle in which nothing was used has
 * no module to attribute anything to, and the whole pool recycles unallocated.
 * That is a real state and not a failure.
 */
export function assertPoolCloses(split: PoolSplit): void {
  const buckets = split.payable + split.accrued + split.recycled;
  if (buckets !== split.pool) {
    throw new Error(`pool does not close: payable ${split.payable} plus accrued ${split.accrued} plus recycled ${split.recycled} is ${buckets}, and the pool held ${split.pool}`);
  }
  if (split.distributed !== split.payable + split.accrued) {
    throw new Error(`pool does not close: distributed ${split.distributed} is not payable ${split.payable} plus accrued ${split.accrued}`);
  }
  const owed = split.shares.reduce((n, s) => (s.settlement === "recycled" ? n : n + s.share), 0);
  if (owed !== split.distributed) {
    throw new Error(`pool does not close: the shares owed to builders sum to ${owed}, and the split reports ${split.distributed} distributed`);
  }
  const summed = split.shares.reduce((n, s) => n + s.share, 0);
  if (split.totalWeight > 0 && summed !== split.pool) {
    throw new Error(`pool does not close: the shares sum to ${summed} against a pool of ${split.pool}`);
  }
}

/**
 * What the pool holds next cycle: its own size plus everything that came back.
 *
 * A separate function because the recycling is the part a reader will not
 * believe without seeing it applied, and because the hub carries a pool size
 * from its own budget that this repo never sees.
 */
export function nextCyclePool(base: number, split: PoolSplit): number {
  return base + split.recycled;
}
