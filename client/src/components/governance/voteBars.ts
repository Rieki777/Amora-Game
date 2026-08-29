/**
 * THE TWO-MEASUREMENT TRUTH.
 *
 * This module exists to make one defect unbuildable: a single reading that
 * shows agreement and participation at the same time. That reading is a lie in
 * both directions. Nine people out of a hundred, all voting yes, fills it; so
 * does a hundred out of a hundred split down the middle. Hypha draws two bars
 * for exactly this reason (harvest section 2, `voting-result.vue` renders two
 * `progress-percentage` bars), and this file makes them two FUNCTIONS with
 * two return types, so no caller can accidentally merge them.
 *
 * The DRAWING is now the founder's own, and it changed nothing here:
 *
 *   > "for quorum a small icon with many silhouettes of people that fill up as
 *   > we get more of the quorum (what % of all voice tokens/voters) met and
 *   > unity (what % for or against) is a moon so a 80% threshold would show a
 *   > red line needing the moon to get to that 80% illumination (if first
 *   > person votes yes we're at 100% moon illumination but very little of the
 *   > silhouettes, etc."
 *
 * That last clause is the design's whole teaching, and it is the same fact the
 * two functions below already carried: one yes vote is a FULL MOON over an
 * ALMOST EMPTY FIELD. `unityBar` feeds the moon, `quorumBar` feeds the field,
 * and `crowdFill` further down says how a figure maps to weight.
 *
 *   UNITY   how the people who voted have divided. Abstentions are EXCLUDED,
 *           because someone who declined to take a side has not taken one.
 *           Green when it clears the threshold, red when it is short.
 *   QUORUM  how much of the frozen electorate has spoken at all. Abstentions
 *           COUNT, because showing up is the thing being measured. Grey
 *           always: participation is not agreement, and colouring it green
 *           would make "enough people voted" read as "it passed".
 *
 * The percentages come from `shared/governanceEngine`, the same two functions
 * the close route calls. A page that computed its own would eventually preview
 * an outcome the server did not reach, and the member would have been told a
 * number nobody honoured.
 *
 * NOTHING MEANS ANYTHING BY COLOUR ALONE (house accessibility rule). Every
 * bar carries a `mark` ('met' | 'short' | 'none') that the component renders
 * as a check, a cross or a dash, and a `reading` sentence that says the same
 * thing in words for a screen reader and for anyone in greyscale.
 */
import { quorumPctOf, unityPctOf, type BallotMethod, type BallotTallies } from "@shared/governanceEngine";

export type BarMark = "met" | "short" | "none";

export interface BarReading {
  /** Where the fill sits, 0-100, already clamped for rendering. */
  valuePct: number;
  /** Where the notch sits, 0-100. */
  thresholdPct: number;
  mark: BarMark;
  /** What the bar says, in words. Never redundant with the number beside it. */
  reading: string;
}

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
/** One decimal, and no trailing ".0" on a whole number. */
export const pctText = (n: number): string => `${Math.round(clamp(n) * 10) / 10}%`;

/**
 * WHERE A NUMBER SITS AGAINST ITS THRESHOLD. Never `none`, and that is the
 * whole point of the split.
 *
 * This used to return `none` for any value of zero, under the argument that
 * "at zero nobody has disagreed with anything, and painting that red tells a
 * member the village has rejected a proposal it has not yet read." The
 * argument is right and the test was wrong, because ZERO PERCENT AGREEMENT IS
 * NOT AN EMPTY BALLOT. A vote where the only person who answered said no has
 * unity of exactly zero, and it was shown as "none yet": a member voted, the
 * village closed the vote on their no, and the record told them nobody had
 * ever taken a side. That is the strongest disagreement the engine can
 * measure, rendered as an absence.
 *
 * Whether anything HAPPENED is a different question from where a number sits,
 * and only the caller knows the answer to it. `unityBar` asks whether anybody
 * took a side; `quorumBar` asks whether any weight has spoken. Each states its
 * own emptiness test in its own words, where the argument for it can be read.
 *
 * `strict` is the majority method's comparison and it is load-bearing.
 * `evaluateBallot` reads majority as `unity > 50`, so a ballot resting exactly
 * on half has NOT carried. A mark computed with `>=` would draw a check beside
 * a vote the close route is about to fail, which is the exact defect this
 * module exists to make unbuildable, one method further in.
 */
function markAgainst(valuePct: number, thresholdPct: number, strict = false): "met" | "short" {
  const clears = strict ? valuePct > thresholdPct : valuePct >= thresholdPct;
  return clears ? "met" : "short";
}

/**
 * THE AGREEMENT MOON. Among those who took a side, how many took this one.
 *
 * `method` changes the sentence and, for majority alone, the comparison:
 * consensus and custom clear their notch at it, and majority has to pass it.
 * The notch is the ballot's own frozen `unityPct`, whichever method it is.
 *
 * CONSENT NEVER REACHES HERE. `dialsForMethod` stores `unityPct: 0` for a
 * consent ballot and `evaluateBallot` returns on objections before unity is
 * read at all, so a consent ballot has no agreement threshold to draw. Callers
 * render `objectionState` in its place. This function still answers for
 * consent if it is handed one, and what it answers is arithmetic against a
 * threshold nobody honours, which is why no surface asks it.
 */
export function unityBar(
  tallies: BallotTallies,
  unityThresholdPct: number,
  method: BallotMethod,
): BarReading {
  const value = clamp(unityPctOf(tallies));
  const threshold = clamp(unityThresholdPct);
  const decided = tallies.yesW + tallies.noW;
  const strict = method === "majority";
  // NOBODY TOOK A SIDE is the only emptiness this bar has. Everything else,
  // zero included, is a real reading of a real vote.
  const mark: BarMark = decided > 0 ? markAgainst(value, threshold, strict) : "none";
  const onTheLine = strict && decided > 0 && value === threshold;
  const reading =
    decided <= 0
      ? "Nobody has taken a side yet"
      : method === "consensus"
        ? mark === "met"
          ? "Everyone who took a side agrees"
          : "Not everyone who took a side agrees"
        : onTheLine
          ? `Agreement is resting exactly on ${pctText(threshold)}, and this vote needs more than that`
          : strict
            ? mark === "met"
              ? `Agreement is above the ${pctText(threshold)} this vote needs`
              : `Agreement is below the ${pctText(threshold)} this vote needs`
            : mark === "met"
              ? `Agreement is at or above the ${pctText(threshold)} this vote needs`
              : `Agreement is below the ${pctText(threshold)} this vote needs`;
  return { valuePct: value, thresholdPct: threshold, mark, reading };
}

/**
 * THE PARTICIPATION FIELD. How much of the frozen electorate has spoken.
 *
 * Deliberately a different return path from unityBar even though the shape
 * matches: the two are never computed in one call, so there is no function in
 * this codebase that could return "the reading".
 */
export function quorumBar(
  tallies: BallotTallies,
  totalWeight: number,
  quorumThresholdPct: number,
): BarReading {
  const value = clamp(quorumPctOf(tallies, totalWeight));
  const threshold = clamp(quorumThresholdPct);
  /*
   * NOBODY HAS SPOKEN, measured in weight because that is what this bar
   * counts. It reads correctly for every village that allocates weight, and
   * it is the one case where a zero is genuinely an absence rather than a
   * reading: no weight has spoken means the field is empty.
   *
   * Its edge, stated because the next person will meet it: in `custom` mode a
   * member holding no allocated weight can vote and move this by nothing at
   * all, and the sentence would say nobody has voted when somebody has. That
   * needs a head count, which this function is not given and both of its
   * callers hold. Flagged rather than half-fixed.
   */
  const mark: BarMark = value > 0 ? markAgainst(value, threshold) : "none";
  const reading =
    mark === "none"
      ? "Nobody has voted yet"
      : mark === "met"
        ? `Enough of the village has spoken to make this vote count, which took ${pctText(threshold)}`
        : `Not enough of the village has spoken yet. This vote needs ${pctText(threshold)}`;
  return { valuePct: value, thresholdPct: threshold, mark, reading };
}

/** The weight that has spoken, and the weight that could. */
export function spoken(tallies: BallotTallies, totalWeight: number): { spokenWeight: number; totalWeight: number } {
  return { spokenWeight: tallies.yesW + tallies.noW + tallies.abstainW, totalWeight };
}

/**
 * "N of M weight has spoken", in the village's own numbers rather than a
 * percentage. Weights are rarely whole, so they print without trailing zeros.
 */
export const weightText = (n: number): string => {
  const rounded = Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;
  return String(rounded);
};

// ── The field of silhouettes ─────────────────────────────────────────────────

/**
 * HOW MANY FIGURES STAND IN THE FIELD, and why it is a fixed number.
 *
 * The founder's design draws quorum as "many silhouettes of people that fill
 * up as we get more of the quorum (what % of all voice tokens/voters)". The
 * parenthesis is the whole problem: tokens AND voters, and under `token`
 * weight mode those two are different measurements. One member can carry a
 * hundred times another's weight, so a field of one figure per member would
 * fill by heads and state something the ballot does not count.
 *
 * So a figure is a SHARE OF THE FROZEN TOTAL WEIGHT, never a person. Twenty
 * figures, each worth five percent.
 *
 *   TWENTY, because the field has to read from a village of four to a village
 *   of four hundred, and a share field is the only one that does. Four
 *   silhouettes would vanish as a picture and four hundred would be a smear.
 *   Twenty reads as a crowd at a glance and still resolves into countable
 *   figures at the size a card can spare.
 *
 *   FIVE PERCENT EACH, because that is 100 / 20 and nothing else. It is not
 *   tuned to any village's numbers, and it must not be: the moment the figure
 *   count follows the member count, the same picture means two things in two
 *   villages.
 *
 * The remainder stands as a PART of a figure, so a single voice in a village
 * of four hundred is a sliver of the first silhouette and not a rounded-away
 * zero. That sliver is the founder's teaching case, drawn: a full moon over an
 * almost empty field.
 *
 * The real numbers travel beside the field in words, always, through `spoken`
 * and `weightText`. A field is a shape, and a shape is not a readout.
 */
export const CROWD_FIGURES = 20;

/** What one figure is worth, as a percentage of the frozen total weight. */
export const FIGURE_SHARE_PCT = 100 / CROWD_FIGURES;

/**
 * How full each figure stands, left to right, 0 through 1.
 *
 * The field fills as one wipe, so the fill front and the threshold notch are
 * read against the same axis: at a quorum of 80 the front sits exactly where
 * an 80 notch sits, and a member can see the gap without doing arithmetic.
 */
export function crowdFill(valuePct: number, figures: number = CROWD_FIGURES): number[] {
  const count = Math.max(1, Math.trunc(figures) || 1);
  const filled = (clamp(valuePct) / 100) * count;
  return Array.from({ length: count }, (_, i) => Math.min(1, Math.max(0, filled - i)));
}

/**
 * WHERE THE WIPE'S FRONT STANDS: which figure it is inside, and how far across
 * that figure, 0 through 1.
 *
 * The threshold notch is drawn at the front the field WOULD have at the
 * threshold, through this same function, so the notch and the fill are placed
 * by one piece of arithmetic. A notch positioned as a plain percentage of the
 * row's width would drift away from the fill front by however much gap sits
 * between the figures, and it would drift by a different amount at every
 * value.
 */
export function crowdFront(
  valuePct: number,
  figures: number = CROWD_FIGURES,
): { figure: number; within: number } {
  const fills = crowdFill(valuePct, figures);
  const i = fills.findIndex((f) => f < 1);
  return i === -1 ? { figure: fills.length - 1, within: 1 } : { figure: i, within: fills[i] };
}

// ── Consent, which has no agreement to draw ──────────────────────────────────

/*
 * HOW MANY OBJECTIONS STAND IS THE SERVER'S NUMBER NOW, AND THIS FILE NO
 * LONGER COUNTS THEM.
 *
 * There used to be a `standingObjections()` here that filtered an objections
 * array on `["open","integrated"]`, mirroring `standingObjectionCount` in
 * server/lib/ballots.ts. The mirror existed because `integrated` surprises
 * people: upholding an objection means the proposal has to CHANGE, so the
 * ballot closes as failed, and a surface counting only `open` told a member
 * nothing stood in the way of a decision the close route was about to refuse.
 *
 * Both ballot payloads now carry `standingObjections`, computed by the same
 * function the close route evaluates with, so the mirror became the second of
 * two sources for one fact. The list payload settled it: a CARD builds no
 * objections array at all, so the server number is the only source there, and
 * a detail page that kept counting for itself would have been a different
 * authority on the same question one screen away. Two copies of one rule
 * disagree eventually, and here the disagreement lands on somebody who thinks
 * they know whether their vote carries.
 *
 * So every surface reads `ballot.standingObjections`. `objectionState` below
 * takes that number and says what it means; it never derives it.
 */

export interface ObjectionReading {
  mark: BarMark;
  /** What the objections say, in words. */
  reading: string;
}

/**
 * WHAT STANDS IN THE PLACE OF THE MOON ON A CONSENT BALLOT.
 *
 * A consent ballot is not decided by how many agree. `dialsForMethod` stores
 * `unityPct: 0` for it and `evaluateBallot` returns on `openObjections` before
 * unity is ever read. Drawing a moon there would put a threshold on the page
 * that decides nothing, so this is what the surface draws instead.
 *
 * Zero open objections is `met` about the OBJECTION condition alone, and the
 * sentence says so: the field of silhouettes still has to fill before anything
 * carries, and that is the other half of the same card.
 */
export function objectionState(openCount: number): ObjectionReading {
  const open = Math.max(0, Math.trunc(Number.isFinite(openCount) ? openCount : 0));
  if (open === 0) {
    return {
      mark: "met",
      reading: "No objection is standing. This carries once enough of the village has spoken",
    };
  }
  return {
    mark: "short",
    reading:
      open === 1
        ? "One objection is standing, and it holds this until somebody rules on it"
        : `${open} objections are standing, and they hold this until somebody rules on them`,
  };
}

// ── The clock ────────────────────────────────────────────────────────────────

export interface Countdown {
  /** Milliseconds remaining, floored at zero. */
  remainingMs: number;
  ended: boolean;
  /** "2 days 03:14:09", or "1 day 00:00:31". Stable width after the days. */
  text: string;
  /** The same span in words, for the accessible name: no ticking colons. */
  reading: string;
}

/**
 * The countdown, computed rather than animated (harvest section 2 ticks a
 * 1-second interval and force-updates; the component here re-renders on a
 * timer it owns, and this function stays pure so it can be tested at a fixed
 * instant instead of at whatever second the suite happened to run).
 *
 * Past the close it says so in one word, because a negative countdown reads
 * as a bug and "the voting period ended" is the actual state: the ballot is
 * waiting for a human, not for the clock.
 */
export function countdown(closesAtIso: string, nowMs: number): Countdown {
  const closes = Date.parse(closesAtIso);
  if (!Number.isFinite(closes)) {
    return { remainingMs: 0, ended: true, text: "Closed", reading: "The voting period has ended" };
  }
  const remainingMs = Math.max(0, closes - nowMs);
  if (remainingMs === 0) {
    return { remainingMs: 0, ended: true, text: "Voting has ended", reading: "The voting period has ended" };
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const dayPart = days > 0 ? `${days} ${days === 1 ? "day" : "days"} ` : "";
  const readingParts: string[] = [];
  if (days > 0) readingParts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) readingParts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (days === 0 && minutes > 0) readingParts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (readingParts.length === 0) readingParts.push("less than a minute");
  return {
    remainingMs,
    ended: false,
    text: `${dayPart}${clock}`,
    reading: `${readingParts.join(" ")} left to vote`,
  };
}

/**
 * How often the countdown needs to re-render to stay honest.
 *
 * A ticking seconds column on a vote closing in nine days is motion for its
 * own sake, and this platform respects a member's request for less of it. So
 * the clock ticks per second only inside the last hour, per minute inside the
 * last day, and every five minutes beyond that.
 */
export function tickMsFor(remainingMs: number): number {
  if (remainingMs <= 0) return 60_000;
  if (remainingMs < 3_600_000) return 1_000;
  if (remainingMs < 86_400_000) return 60_000;
  return 300_000;
}
