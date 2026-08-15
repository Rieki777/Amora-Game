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
 *   platform-built    the registry credits nobody outside the platform, so
 *                     paying it would pay ReGen Civics out of ReGen Civics'
 *                     own pool.
 *   core              the game the platform is born playing. Same reason as
 *                     platform-built, said separately because a core module
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

export interface PoolStatus {
  eligible: boolean;
  reason: PoolReason;
}

/**
 * Whether this module may draw from the builders' pool, and why.
 *
 * The order of the checks is the order of the reasons a person would give,
 * most structural first. Core and platform-built are properties of who wrote
 * it and never change; withdrawn and paid are choices somebody made later. A
 * module that is several of these at once reports the first one, so the
 * sentence a builder reads is the one they can act on.
 *
 * `isPaid` rather than "carries a pricing record": a listing that states
 * `amount: 0` is free out loud, and `priceLine` already renders it as Free.
 * The test is whether a village pays, and zero is not a payment.
 */
export function poolStatus(def: ModuleDef): PoolStatus {
  if (def.core) return { eligible: false, reason: "core" };
  if (!def.builtBy?.trim()) return { eligible: false, reason: "platform-built" };
  if (def.withdrawn) return { eligible: false, reason: "withdrawn" };
  if (isPaid(def)) return { eligible: false, reason: "paid" };
  return { eligible: true, reason: "free-third-party" };
}

/** Every module that may draw from the pool, in registry order. */
export function poolEligibleModules(defs: readonly ModuleDef[]): ModuleDef[] {
  return defs.filter((m) => poolStatus(m).eligible);
}

/**
 * A ReGen Civics handle, checked for shape and nothing else.
 *
 * Shape is all any code here can honestly check, and shape is all it needs to
 * check. Whether the handle names a real account, whether that account has a
 * Hypha account and a Base address linked, and whether the person holding it
 * is the person credited above are all questions the HUB answers at statement
 * time against its own member records. None of them can be answered from a
 * registry file, and a check here that pretended to would be the kind of
 * green that means nothing.
 *
 * Deliberately narrow: lowercase letters, digits, hyphens and underscores. A
 * handle with a leading `@`, a space, or a URL in it is somebody writing a
 * display name into a lookup key, and the lookup would silently miss.
 */
const HANDLE = /^[a-z0-9][a-z0-9_-]{1,38}$/;

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
      problems.push(`module "${m.id}": names a ReGen Civics account and credits nobody. A payment needs a builder to pay`);
    }
    if (/^0x/i.test(account)) {
      // Checked before the shape, and exclusive of it, so the one mistake a
      // person is actually likely to make gets the sentence that explains it
      // instead of a generic "that is not a handle".
      problems.push(
        `module "${m.id}": puts what looks like a wallet address where the ReGen Civics handle goes. The builder links their own address in their own profile and the hub reads it there`,
      );
    } else if (!isBuilderHandle(account)) {
      problems.push(
        `module "${m.id}": gives "${account}" as a ReGen Civics account. A handle is lowercase letters, digits, hyphens and underscores, with no at sign and no address`,
      );
    }
  }
  return problems;
}
