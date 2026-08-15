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
 * module is per-village state, and how much a builder is owed is hub
 * arithmetic over every village at once. Neither belongs to a registry entry.
 * This file answers one question: may this module be paid from the pool at
 * all. The hub asks it once per module and does the rest.
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
 * A Base address, checked for shape and nothing else.
 *
 * Shape is all any code here can honestly check. Whether the address is
 * controlled by the person named in `builtBy` is a human question, and the
 * hub's cycle statement is reviewed by a human before any value moves, which
 * is where that question is actually answered.
 */
const BASE_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isBasePayoutAddress(address: string): boolean {
  return BASE_ADDRESS.test(address);
}

/**
 * Payout-shape problems, as a list of sentences, in the house style of
 * `moduleListingProblems`.
 *
 * A malformed address is worse than a missing one. Missing means the share
 * accrues and the statement says so; malformed means a transfer aimed at
 * nothing, so it fails here instead.
 */
export function modulePayoutProblems(defs: readonly ModuleDef[]): string[] {
  const problems: string[] = [];
  for (const m of defs) {
    const payout = m.builtByPayout;
    if (!payout) continue;
    if (!m.builtBy?.trim()) {
      problems.push(`module "${m.id}": names a payout address and credits nobody. A payout needs a builder to pay`);
    }
    if (payout.chain !== "base") {
      problems.push(`module "${m.id}": pays out on "${payout.chain}". $ReGen lives on Base and the pool pays there`);
    }
    if (!isBasePayoutAddress(String(payout.address ?? ""))) {
      problems.push(`module "${m.id}": gives a payout address that is not a Base address, which is 0x and forty hex characters`);
    }
  }
  return problems;
}
