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
   * Whether every member on the roll must carry weight above zero before this
   * subject may be asked. See the block above `weightFloorProblem` for why a
   * head count alone is not enough on a subject whose ruling is 100 and 100.
   */
  everySeatWeighs?: boolean;
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
 * THE FLOOR OF THREE COUNTS HEADS, AND THE ENGINE COUNTS WEIGHT. That gap is
 * what `everySeatWeighs` closes, and the block above `weightFloorProblem` is
 * the whole of why.
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

/**
 * ── THE SECOND ENTRY: CHANGING WHAT THE VILLAGE MINTS ───────────────────────
 *
 * R81, in the founder's words: "all minting of tokens go through the
 * governance process." R84 says which reading that is: the village votes on
 * the RULES, and issuance then runs under rules the village already set.
 *
 * A proposal whose change set names a minting rule opens under this subject
 * instead of `mechanics`. Everything else about it is a mechanics proposal:
 * the same row, the same support threshold, the same document, the same
 * executor. The subject type is what carries the threshold, so it is what has
 * to differ.
 *
 * ── WHY THE QUORUM RISES AND THE UNITY DOES NOT ─────────────────────────────
 *
 * R68 gives the reason thresholds are tiered at all, and it is a specific
 * reason: "so people have to become aware of the changes and be wanting them
 * (for them to vote on them)". AWARENESS is the word. Quorum is the dial that
 * measures awareness, because quorum is how much of the roll turned up. Unity
 * measures agreement among whoever did. So the ruling's own stated reason
 * lands on quorum, and raising unity would be answering a question nobody
 * asked.
 *
 * There is a second reason, and it is the one that decides the METHOD field.
 * `evaluateBallot` reads `quorumPct` FIRST, for every method, before it looks
 * at anything else. It reads `unityPct` for `custom` alone. So a quorum floor
 * is a true statement under all four methods, and a unity floor would be a
 * number sitting in the row deciding nothing on three of them, which is the
 * lie with a number on it this file's header refuses. A quorum floor therefore
 * does not have to seize the village's choice of method, and it does not.
 *
 * ── WHERE 50 COMES FROM, AND WHERE IT DOES NOT ──────────────────────────────
 *
 * The founder has not named a number for this one. 50 is not invented for it
 * either: it is already this engine's own constant, the hard 50 `majority`
 * compares against in `evaluateBallot` and the unity `dialsForMethod` stamps
 * for it. Said as a sentence, it is "more than half the village's voting
 * weight was in the room when this was decided", which is the smallest claim
 * that answers R68's awareness test.
 *
 * It also sits inside the range R74 opened. Launch is 100 and 100 because
 * starting a Game is irreversible. A mint rule change is not: it takes effect
 * at the next moon at the earliest, and the next vote can move it back. So it
 * belongs above the ordinary default of 20 and below launch, and 50 is the one
 * number in that range this codebase already uses for something.
 *
 * THE FLOOR NEVER LOWERS ANYONE. A village that set its quorum to 80 keeps 80
 * here, because `dialsForSubject` takes the higher of the two.
 *
 * ── WHY THERE IS NO ELECTORATE FLOOR ────────────────────────────────────────
 *
 * Three was considered and refused. A launched village already cleared three
 * at launch, so the floor would only ever bite a village that has SHRUNK, and
 * the effect would be to take the mint back off a small village and leave it
 * with the admin panel. R54's test is whether a thing moves a power toward the
 * village or entrenches the scaffolding, and that fails it. A village of two
 * governing itself is still governing itself.
 */
export const MINT_RULE = "mint_rule";

export const SUBJECT_THRESHOLDS: Readonly<Record<string, SubjectThresholds>> = {
  [VILLAGE_LAUNCH]: {
    minUnityPct: 100,
    minQuorumPct: 100,
    minElectorate: 3,
    everySeatWeighs: true,
    method: "custom",
    why: "Starting the Game turns on token issuance, so it asks for every member on the roll to vote and every one of them to agree.",
  },
  [MINT_RULE]: {
    minUnityPct: 0,
    minQuorumPct: 50,
    minElectorate: 0,
    why: "This one changes what the village mints, so it asks for more than half the village's voting weight to take part. How much of that has to agree is the village's own setting.",
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

/** One seat on a frozen roll: who was asked, and what their answer weighs. */
export interface RollSeat {
  weight: number;
}

/**
 * ── WHY A HEAD COUNT IS NOT ENOUGH ON A 100/100 SUBJECT ─────────────────────
 *
 * `electorateFloorProblem` counts HEADS and `governanceEngine` counts WEIGHT,
 * and until this function existed nothing joined the two. Measured against the
 * built server on 2026-08-30, that gap was a complete bypass of R67:
 *
 *   `governance.weight_mode` is a founder dial. In `custom` mode a member with
 *   no row in `governance_weights` resolves to weight 0 (fail closed, and
 *   right on its own terms). A founder allocates 1 to themselves and nothing
 *   to anybody else. Three members are on the roll, so the floor of three is
 *   met. `openBallot` accepts it, because the roll is not empty and the total
 *   weight is 1. The founder votes yes. Quorum is 1 of 1, unity is 1 of 1, and
 *   the engine reports 100 and 100 on one vote out of three. The frozen
 *   document tells the village that 3 people held a voice and that it carried
 *   on 100% participation and 100% agreement. Token issuance then opens, and
 *   issuance does not come back.
 *
 * `token` mode has the same shape for a different reason: weight is a balance,
 * and a balance of zero is a seat that weighs nothing. So the rule is written
 * over RESOLVED WEIGHTS and not over a mode, and it holds for every mode the
 * engine has now or later.
 *
 * ── WHY THIS SHAPE AND NOT A SECOND QUORUM ──────────────────────────────────
 *
 * The other candidate was to count quorum over people as well as weight, and
 * require both to reach 100. This is equivalent and cheaper. With every seat
 * above zero, weight quorum of 100% is reached only when the weights of the
 * voters sum to the whole roll, and a sum of strictly positive numbers reaches
 * its total only when every term is present. So "every seat weighs something"
 * plus the 100% the subject already declares IS a 100% count of people, proved
 * rather than tracked, with no second column on `ballots`, no second number in
 * the frozen snapshot, and no change to the engine every other subject shares.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It does not flatten weights. A village whose allocation table reads 100, 5
 * and 1 still opens its launch vote, and still needs all three to answer and
 * none to object, because unity of 100 means zero weight voted no whatever the
 * weights are. Refusing skew would be the platform overruling R56, and skew is
 * not the hole. Zero is the hole.
 *
 * It does not read `weight_mode`. A rule written against a mode is a rule a
 * future fourth mode inherits by accident or escapes by accident.
 *
 * It says nothing about abstention. A launch can still carry on one yes and
 * two abstentions, because that is R74 plus the engine's stated abstain rule,
 * and it takes three people choosing to answer. That is a documented decision,
 * not this gap.
 */
export function weightFloorProblem(subjectType: string, roll: readonly RollSeat[]): string | null {
  const floor = thresholdsForSubject(subjectType);
  if (!floor?.everySeatWeighs) return null;
  const silent = roll.filter((seat) => !(Number(seat.weight) > 0)).length;
  if (silent === 0) return null;
  const who =
    silent === 1
      ? `One of the ${roll.length} members on the roll carries no voting weight today`
      : `${silent} of the ${roll.length} members on the roll carry no voting weight today`;
  return `${who}. This vote asks every one of them, so it opens once each of them carries some weight.`;
}

/**
 * Everything wrong with the roll for this subject, cheapest first, or null.
 *
 * One function because there is one question a surface asks ("may this village
 * be asked this?") and one place a route refuses. Two separate calls at each of
 * the two call sites is how the second check gets added to one of them.
 */
export function rollProblem(subjectType: string, roll: readonly RollSeat[]): string | null {
  return electorateFloorProblem(subjectType, roll.length) ?? weightFloorProblem(subjectType, roll);
}
