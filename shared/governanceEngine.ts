/**
 * The decision engine's math (round 5, lane G1). Pure, both ways: the same
 * unity and quorum a ballot page previews are the ones the close route
 * evaluates, because they are one function each, imported by both sides —
 * the shared/power.ts posture applied to arithmetic.
 *
 * The math is Hypha 2.0's exactly (dho-web-client, Apache 2.0, founder-owned;
 * src/utils/proposal-parsing.js voting()/isAccepted(), harvest section 3):
 *
 *   unity  = (pass + fail > 0) ? passW / (passW + failW) : 0
 *   quorum = supply > 0 ? (abstain + pass + fail) / supply : 0
 *   passed = quorum >= quorumThreshold && unity >= unityThreshold
 *
 * Abstain is EXCLUDED from unity and COUNTS toward quorum: a genuine "help it
 * reach quorum without taking sides" instrument.
 *
 * Everything here evaluates against a ballot's own SNAPSHOT columns, never
 * live settings. That is the constitutional rule "A vote is counted against
 * the day it opened", and it is why every function takes the dials as
 * arguments instead of reading a registry.
 */

import type { DecidesById } from "./power";

/** The methods a ballot can conduct. `custom` is the village's own dials. */
export type BallotMethod = "majority" | "custom" | "consensus" | "consent";

export type BallotOutcome = "passed" | "failed" | "no_quorum";

export interface BallotTallies {
  /** Weighted sums read from ballot_votes joined to ballot_electorate. */
  yesW: number;
  noW: number;
  abstainW: number;
}

/** Unity as a percentage, 0-100. Abstain is excluded on purpose. */
export function unityPctOf(t: BallotTallies): number {
  const decided = t.yesW + t.noW;
  return decided > 0 ? (t.yesW / decided) * 100 : 0;
}

/** Quorum as a percentage of the frozen total weight, 0-100. Abstain counts. */
export function quorumPctOf(t: BallotTallies, totalWeight: number): number {
  if (!(totalWeight > 0)) return 0;
  return ((t.yesW + t.noW + t.abstainW) / totalWeight) * 100;
}

export interface EvaluateInput {
  method: BallotMethod;
  /** Snapshot dials from the ballot row, as percentages 0-100. */
  unityPct: number;
  quorumPct: number;
  /** Snapshot of SUM(electorate weights) at open. */
  totalWeight: number;
  tallies: BallotTallies;
  /** Consent mode: objections still standing `open`. Ignored elsewhere. */
  openObjections?: number;
}

/**
 * The one evaluation. Quorum is checked first for every method, so a vote
 * too few people showed up for reads as no_quorum instead of a verdict on
 * the question itself.
 *
 *   majority   unity strictly above 50: "More than half carries it."
 *   consensus  unity exactly 100 with at least one yes: everyone who voted
 *              (beyond abstentions) agrees.
 *   custom     unity at or above the snapshot unity_pct (the Hypha 80/20
 *              surface with the village's own numbers).
 *   consent    unity is not evaluated. Participation meets quorum and zero
 *              objections remain open (S3.0: only objections block).
 */
export function evaluateBallot(input: EvaluateInput): BallotOutcome {
  const quorum = quorumPctOf(input.tallies, input.totalWeight);
  if (quorum < input.quorumPct) return "no_quorum";
  if (input.method === "consent") {
    return (input.openObjections ?? 0) === 0 ? "passed" : "failed";
  }
  const unity = unityPctOf(input.tallies);
  if (input.method === "majority") return unity > 50 ? "passed" : "failed";
  if (input.method === "consensus") {
    return input.tallies.noW === 0 && input.tallies.yesW > 0 ? "passed" : "failed";
  }
  return unity >= input.unityPct ? "passed" : "failed";
}

/**
 * Which ballot method a decides-by conducts, if any (GOV_DESIGN section 2.3).
 *
 *   "hypha"  routes to the existing to_hypha leg, unchanged — that is the
 *            whole degradation story, so it is a named answer, never null.
 *   null     no ballot: the named decider records the outcome themselves
 *            (lead/elders/founder decides, do-ocracy), or the mode is not in
 *            v1 (delegated), or the village wrote its own word (other).
 */
export function methodForDecidesBy(id: DecidesById | string): BallotMethod | "hypha" | null {
  switch (id) {
    case "majority":
      return "majority";
    case "consensus":
      return "consensus";
    case "consent":
      return "consent";
    case "hypha":
      return "hypha";
    default:
      return null;
  }
}

export interface MethodDials {
  unityPct: number;
  quorumPct: number;
}

/**
 * The dials a method SNAPSHOTS at open, given the village's current settings.
 * Presets fix what the method's own sentence fixes and take the rest from the
 * village: majority is definitionally "more than half" (the stored 50 pairs
 * with evaluateBallot's strict comparison), consensus is definitionally
 * everyone, consent conducts no unity at all so it stores 0 and the evaluator
 * never reads it.
 */
export function dialsForMethod(method: BallotMethod, village: MethodDials): MethodDials {
  switch (method) {
    case "majority":
      return { unityPct: 50, quorumPct: village.quorumPct };
    case "consensus":
      return { unityPct: 100, quorumPct: village.quorumPct };
    case "consent":
      return { unityPct: 0, quorumPct: village.quorumPct };
    default:
      return { unityPct: village.unityPct, quorumPct: village.quorumPct };
  }
}

export const BALLOT_METHODS: readonly BallotMethod[] = ["majority", "custom", "consensus", "consent"];

export const VOTE_CHOICES = ["yes", "no", "abstain"] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];
