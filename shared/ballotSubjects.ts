/**
 * WHAT A SUBJECT ASKS OF THE VILLAGE, per `ballots.subject_type` (R68).
 *
 * Until this file, every village-wide ballot resolved through ONE pair of
 * dials whatever it was about: a quest payout and a change to the Game itself
 * both landed on `governance.unity_pct` and `governance.quorum_pct`. The
 * founder's ruling is that they should not, and his stated reason is awareness
 * over caution: a big change should need enough people paying attention that
 * it cannot pass on a quiet week.
 *
 * ── THE SHAPE, AND WHY IT IS FLOORS ─────────────────────────────────────────
 *
 * A subject declares MINIMUMS. The village's own dials still decide, and the
 * ballot freezes whichever number is higher. Three reasons this is a floor and
 * never an override:
 *
 *  1. R56 says a village sets its own dials, including a 1% quorum. A registry
 *     that OVERRODE would quietly lower a village that had chosen 100 for
 *     everything, which is the platform overruling a decision the village
 *     made about itself.
 *  2. R68's own words are "significantly MORE % of overall voice". More is a
 *     floor. A fixed pair is a different instruction.
 *  3. A floor composes. A later subject can raise one dial and leave the other
 *     where the village put it, and the two settings never fight.
 *
 * ── WHY A SUBJECT MAY ALSO FIX THE METHOD ───────────────────────────────────
 *
 * `evaluateBallot` reads `unity_pct` for `custom` alone. `majority` compares
 * against a hard 50 and ignores the column; `consensus` reads the tallies;
 * `consent` conducts no unity at all. So a floor of 100 stamped on a ballot
 * running `majority` would sit in the row, render on the decision page, and
 * decide nothing. Every member reading that vote would be told it needed
 * everyone when it needed half.
 *
 * A stamped dial the evaluator never reads is a lie with a number on it. So a
 * subject whose ruling is expressed AS NUMBERS names the one method that
 * conducts numbers, the same way `dialsForMethod` already lets a method fix
 * what its own sentence fixes.
 *
 * ── HOW TO ADD ONE ──────────────────────────────────────────────────────────
 *
 * One entry here, keyed by the `subject_type` the route passes to `openBallot`.
 * A subject absent from this registry keeps today's behaviour exactly: the
 * village's dials, the village's method, no floor on the roll. Absence is the
 * safe direction, so a subject type a later lane adds cannot inherit a
 * threshold nobody chose for it.
 */
import { dialsForMethod, type BallotMethod, type MethodDials } from "./governanceEngine";

export interface SubjectThresholds {
  /**
   * The least unity this subject may be decided on, 0 to 100. The ballot
   * freezes `max(this, the village's own)`.
   */
  minUnityPct: number;
  /** The least quorum, same rule. */
  minQuorumPct: number;
  /**
   * How many people must hold a voice before this kind of ballot may open at
   * all. 0 means the engine's own rule stands, which is that an electorate of
   * one is enough.
   */
  minElectorate: number;
  /**
   * The method this subject conducts, when its ruling is expressed as numbers
   * and only the dial-reading method can carry them. Absent means the village
   * decides the method the way it decides every other ballot's.
   */
  method?: BallotMethod;
  /**
   * The fact a member reads on the surface that opens this. A fact, never an
   * argument: it says what the numbers are and stops there.
   */
  why: string;
}

/**
 * ── THE ONE ENTRY TODAY: STARTING THE GAME ──────────────────────────────────
 *
 * R74, in the founder's words: the button that marked a village launched
 * "actually generates the first proposal that requires 100% unity and 100%
 * quorum to launch and a minimum of 3 people."
 *
 * R67 is why the numbers are these numbers. A founder builds the whole Game
 * alone: modules, dials, quests, seasons, every requirement on the launch
 * journey. Starting it is the one act that is not theirs, because starting it
 * turns on token issuance, and a token issued is a claim on everybody. So the
 * first vote a village ever holds asks for everyone.
 *
 * THE FLOOR OF THREE is R67's other half. A Game needs three people to play.
 * Below three, the surface says how many hold a voice and offers nothing to
 * press.
 *
 * `custom` for the reason in this file's header: the ruling is a pair of
 * numbers, and `custom` is the only method that decides by the numbers a
 * ballot freezes.
 */
export const VILLAGE_LAUNCH = "village_launch";

/**
 * THE ONE `subject_ref` A LAUNCH BALLOT EVER CARRIES, and it is a constant
 * because that is what makes the vote RE-RUNNABLE without any machinery.
 *
 * `ballots.open_key` is `${subject_type}:${subject_ref}` and it is UNIQUE, so
 * while a launch vote is running no second one can open, race-free, on the
 * index instead of on an application check. Closing rewrites the key to carry
 * the ballot's own id, which frees it immediately. A launch vote that missed
 * its participation can therefore be closed and asked again the same hour, and
 * the ballot that missed stays closed and immutable with its own frozen roll.
 *
 * The constant is also the query. `ballotsFor(VILLAGE_LAUNCH, LAUNCH_SUBJECT_REF)`
 * is every time a village has ever asked itself this question, in order, with
 * no join and no extra column.
 */
export const LAUNCH_SUBJECT_REF = "start";

export const SUBJECT_THRESHOLDS: Readonly<Record<string, SubjectThresholds>> = {
  [VILLAGE_LAUNCH]: {
    minUnityPct: 100,
    minQuorumPct: 100,
    minElectorate: 3,
    method: "custom",
    why: "Starting the Game turns on token issuance, so it asks for every member on the roll to vote and every one of them to agree.",
  },
};

/** What this subject asks, or null when it asks nothing of its own. */
export function thresholdsForSubject(subjectType: string): SubjectThresholds | null {
  return SUBJECT_THRESHOLDS[subjectType] ?? null;
}

/**
 * The method a ballot on this subject conducts.
 *
 * `villageMethod` is what `villageBallotMethod(governance.default_method)`
 * answered, and it can be the string "hypha", which is not a ballot method at
 * all. A subject that fixes its own method answers over both, which is what
 * lets a village that decides its rule changes on Hypha still start its own
 * Game here: there is no chain leg for "this village began".
 */
export function methodForSubject(
  subjectType: string,
  villageMethod: BallotMethod | "hypha",
): BallotMethod | "hypha" {
  return thresholdsForSubject(subjectType)?.method ?? villageMethod;
}

/**
 * The dials a ballot on this subject freezes: the method's own answer, raised
 * to the subject's floor. Both halves are pure, so the surface that previews a
 * threshold and the route that stamps it are the same arithmetic.
 */
export function dialsForSubject(
  subjectType: string,
  method: BallotMethod,
  village: MethodDials,
): MethodDials {
  const base = dialsForMethod(method, village);
  const floor = thresholdsForSubject(subjectType);
  if (!floor) return base;
  return {
    unityPct: Math.max(base.unityPct, floor.minUnityPct),
    quorumPct: Math.max(base.quorumPct, floor.minQuorumPct),
  };
}

/**
 * Whether the roll is big enough for this subject, said as a fact.
 *
 * R55 and R56 both land on this sentence, so it counts and stops. A village of
 * two is young. It is not behind, it is not failing, and nothing here tells it
 * what to want. `null` means the floor is met.
 */
export function electorateFloorProblem(subjectType: string, onTheRoll: number): string | null {
  const floor = thresholdsForSubject(subjectType);
  if (!floor || floor.minElectorate <= 0) return null;
  if (onTheRoll >= floor.minElectorate) return null;
  const short = floor.minElectorate - onTheRoll;
  const people = onTheRoll === 1 ? "One member holds a voice" : `${onTheRoll} members hold a voice`;
  const more = short === 1 ? "One more member" : `${short} more members`;
  return `${people} in this village today. ${more} and the village can vote to start its Game.`;
}
