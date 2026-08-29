/**
 * The $ReGen builders' pool, module side.
 *
 * ReGen Civics pays a pool of $ReGen every lunar cycle, split across the
 * third-party modules villages actually run. A builder who charges for a
 * module bills the village directly and is out of the pool by construction.
 * The default is the pool, so the economic incentive points at keeping a
 * module free for every village to use.
 *
 * WHY THIS IS DERIVED AND NEVER STORED. Eligibility is a function of three
 * fields the registry already carries: `core`, `builtBy`, `pricing` and
 * `withdrawn`. A stored `pool.eligible` flag would be a fourth fact that can
 * disagree with the other three, and the day it does the disagreement pays
 * somebody the wrong amount. So there is one function, it reads the registry
 * entry in front of it, and there is nothing to keep in sync.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT KNOW. Whether a village is RUNNING a
 * module is per-village state; how much a builder is owed is hub arithmetic
 * over every village at once; and WHERE the money goes is a Base address the
 * builder links inside their own ReGen Civics profile, which the hub reads at
 * statement time and this file never sees. None of the three belongs to a
 * registry entry. This file answers one question: may this module be paid from
 * the pool at all. The hub asks it once per module and does the rest.
 */
import { isPaid, type ModuleDef } from "./modules";

/**
 * Why a module is in the pool or out of it.
 *
 *   free-third-party  somebody outside the platform wrote it, it charges the
 *                     village nothing, and it is still offered. In the pool.
 *   paid              it carries a price above zero, so the builder is already
 *                     paid by the villages running it. Out, by the builder's
 *                     own choice, which is the whole design.
 *   platform-built    the registry credits nobody outside the platform. It
 *                     earns, and its earnings return to the pool (R59).
 *   core              the game the platform is born playing. Same disposition
 *                     as platform-built, said separately because a core module
 *                     cannot be turned off and a reader will ask.
 *   withdrawn         no longer offered. Villages already running it keep
 *                     running it, and the catalog stopped listing it, so the
 *                     pool stops counting it.
 */
export type PoolReason =
  | "free-third-party"
  | "paid"
  | "platform-built"
  | "core"
  | "withdrawn";

/**
 * Where an eligible module's share goes, which R59 made a separate question
 * from whether it earns one.
 *
 *   paid      a builder outside the platform is owed this. The hub settles it
 *             against the handle in their own ReGen Civics profile, or records
 *             it as accrued and names what is missing when there is no handle.
 *   recycled  nobody is owed this. It returns to the pool and is given out
 *             again next cycle.
 *   none      the module is not eligible, so there is no share to place.
 */
export type PoolDisposition = "paid" | "recycled" | "none";

export interface PoolStatus {
  eligible: boolean;
  reason: PoolReason;
  disposition: PoolDisposition;
}

/**
 * Whether this module may draw from the builders' pool, why, and where its
 * share goes.
 *
 * R59, the founder, answering exactly this collision: "Platform made modules
 * can still earn ReGen to keep the system flowing well but those earnings just
 * cycle back into the bucket to give out again next cycle."
 *
 * So being written by the platform stopped being a reason to earn nothing and
 * became a reason to be owed nothing. The module earns its share on the same
 * measure as everybody else, and the share returns to the pool instead of
 * being paid to anyone. That is what keeps the measurement honest: a pool that
 * excluded the platform's own modules would be splitting a fixed sum among
 * whoever remained, which quietly pays third-party builders for the platform's
 * usage as well as their own.
 *
 * THE ORDER OF THE CHECKS CHANGED WITH R59, and the reason is worth reading.
 * It used to run most-structural-first, because every check was an exclusion
 * and core was the most permanent one. Now core and platform-built are
 * INCLUSIONS, so the two real exclusions have to be asked first. Otherwise a
 * withdrawn platform module would report `recycled` and go on absorbing weight
 * out of a pool it left, which is not a rounding difference: weight absorbed
 * and recycled is weight the remaining builders do not get paid this cycle.
 *
 * `isPaid` rather than "carries a pricing record": a listing that states
 * `amount: 0` is free out loud, and `priceLine` already renders it as Free.
 * The test is whether a village pays, and zero is not a payment.
 */
export function poolStatus(def: ModuleDef): PoolStatus {
  if (def.withdrawn) return { eligible: false, reason: "withdrawn", disposition: "none" };
  if (isPaid(def)) return { eligible: false, reason: "paid", disposition: "none" };
  if (def.core) return { eligible: true, reason: "core", disposition: "recycled" };
  if (!def.builtBy?.trim()) return { eligible: true, reason: "platform-built", disposition: "recycled" };
  return { eligible: true, reason: "free-third-party", disposition: "paid" };
}

/** Every module that may draw from the pool, in registry order. */
export function poolEligibleModules(defs: readonly ModuleDef[]): ModuleDef[] {
  return defs.filter((m) => poolStatus(m).eligible);
}

/**
 * Every module whose share is paid to somebody, in registry order.
 *
 * Separate from `poolEligibleModules` because after R59 the two answer
 * genuinely different questions, and a surface that asked the first one when it
 * meant the second would report that the platform is paying itself.
 */
export function poolPaidModules(defs: readonly ModuleDef[]): ModuleDef[] {
  return defs.filter((m) => poolStatus(m).disposition === "paid");
}

/**
 * A builder handle, checked for shape and nothing else.
 *
 * Shape is all any code here can honestly check, and shape is all it needs to
 * check. Whether the handle names a real account, whether that account has a
 * Hypha account and a Base address linked, and whether the person holding it
 * is the person credited above are all questions the ACCOUNT SYSTEM answers at
 * statement time against its own member records. Which system that is comes
 * from `builtByNamespace` beside the handle, because R64 makes one shared
 * roster an unsafe assumption. None of these can be answered from a registry
 * file, and a check here that pretended to would be the kind of green that
 * means nothing.
 *
 * The pattern is COPIED from the hub's own `HANDLE_RE` (regen-civics
 * `server/db.ts`), character for character, because a handle this file accepts
 * and the hub cannot store is a handle that resolves to nobody. Note there are
 * no underscores in it: the hub allows lowercase letters, digits and hyphens,
 * 3 to 40 characters, and never starts or ends on a hyphen. If the hub ever
 * widens its rule, widen this one the same way.
 */
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

export function isBuilderHandle(handle: string): boolean {
  return HANDLE.test(handle);
}

/**
 * Payout-identity problems, as a list of sentences, in the house style of
 * `moduleListingProblems`.
 *
 * A malformed handle is worse than a missing one. Missing means the share
 * accrues and the statement says so out loud; malformed means a lookup that
 * finds nobody and reports the same "no account" as a builder who never opened
 * one, so the two states would be indistinguishable at exactly the moment
 * somebody is owed money. It fails here instead.
 */
export function modulePayoutProblems(defs: readonly ModuleDef[]): string[] {
  const problems: string[] = [];
  for (const m of defs) {
    const account = m.builtByAccount;
    if (account === undefined) continue;
    if (!m.builtBy?.trim()) {
      problems.push(`module "${m.id}": names a payout account and credits nobody. A payment needs a builder to pay`);
    }
    if (/^0x/i.test(account)) {
      // Checked before the shape, and exclusive of it, so the one mistake a
      // person is actually likely to make gets the sentence that explains it
      // instead of a generic "that is not a handle".
      problems.push(
        `module "${m.id}": puts what looks like a wallet address where the payout handle goes. The builder links their own address in their own profile, on the account system named beside the handle, and whoever settles a cycle reads it there`,
      );
    } else if (!isBuilderHandle(account)) {
      problems.push(
        `module "${m.id}": gives "${account}" as a payout account. A handle is lowercase letters, digits and hyphens, with no at sign and no address`,
      );
    }
  }
  return problems;
}
