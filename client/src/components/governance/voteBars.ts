/**
 * THE TWO-BAR TRUTH.
 *
 * This module exists to make one defect unbuildable: a single bar that shows
 * agreement and participation at the same time. That bar is a lie in both
 * directions. Nine people out of a hundred, all voting yes, fills it; so does
 * a hundred out of a hundred split down the middle. Hypha draws two bars for
 * exactly this reason (harvest section 2, `voting-result.vue` renders two
 * `progress-percentage` bars), and this file makes them two FUNCTIONS with
 * two return types, so no caller can accidentally merge them.
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
 * `none` is its own state rather than a shade of `short`.
 *
 * At zero nobody has disagreed with anything, and painting that red tells a
 * member the village has rejected a proposal it has not yet read.
 */
function markFor(valuePct: number, thresholdPct: number): BarMark {
  if (valuePct <= 0) return "none";
  return valuePct >= thresholdPct ? "met" : "short";
}

/**
 * THE AGREEMENT BAR. Among those who took a side, how many took this one.
 *
 * `method` changes only the sentence, never the arithmetic: consensus and
 * majority are the same fraction read against a different notch, and the
 * notch is the ballot's own frozen `unityPct`.
 */
export function unityBar(
  tallies: BallotTallies,
  unityThresholdPct: number,
  method: BallotMethod,
): BarReading {
  const value = clamp(unityPctOf(tallies));
  const threshold = clamp(unityThresholdPct);
  const decided = tallies.yesW + tallies.noW;
  const mark = decided > 0 ? markFor(value, threshold) : "none";
  const reading =
    decided <= 0
      ? "Nobody has taken a side yet"
      : method === "consensus"
        ? mark === "met"
          ? "Everyone who took a side agrees"
          : "Not everyone who took a side agrees"
        : mark === "met"
          ? `Agreement is at or above the ${pctText(threshold)} this vote needs`
          : `Agreement is below the ${pctText(threshold)} this vote needs`;
  return { valuePct: value, thresholdPct: threshold, mark, reading };
}

/**
 * THE PARTICIPATION BAR. How much of the frozen electorate has spoken.
 *
 * Deliberately a different return path from unityBar even though the shape
 * matches: the two are never computed in one call, so there is no function in
 * this codebase that could return "the bar".
 */
export function quorumBar(
  tallies: BallotTallies,
  totalWeight: number,
  quorumThresholdPct: number,
): BarReading {
  const value = clamp(quorumPctOf(tallies, totalWeight));
  const threshold = clamp(quorumThresholdPct);
  const mark = markFor(value, threshold);
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
