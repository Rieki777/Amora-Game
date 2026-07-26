/**
 * The single parser for a quest's advertised reward.
 *
 * Quests do not carry a number. They carry a RANGE the village advertises, like
 * "50–100", because the same quest done thoroughly is worth more than the same
 * quest done adequately, and the consenting admin decides where in the range the
 * work actually landed. That is a good model, and it was undocumented.
 *
 * It was also parsed by hand in two places in the client
 * (`q.gratitude.split("–")[1]`), splitting on an EN DASH specifically, so a
 * quest written with a plain hyphen or a single number produced NaN in the UI.
 * Worse, the server had no parser at all: it did `Number(quest.gratitude)`,
 * which is NaN for every range, so the consent cap silently computed a ceiling
 * of zero. This module is the one place that knows the format.
 */

export interface RewardRange {
  /** Lowest amount the board advertises. */
  min: number;
  /** Highest amount the board advertises. Equals min for a single number. */
  max: number;
  /** The original string, for display. */
  label: string;
  /** False when the value could not be understood at all. */
  valid: boolean;
}

/** En dash, em dash, hyphen, and the word "to" all read as a range separator. */
const SEPARATORS = /\s*(?:–|—|-|to)\s*/i;

/**
 * Parse "50–100", "50-100", "50 to 100", "100", or 100 into a range.
 * Anything unparseable comes back `valid: false` with zeros, so callers can
 * refuse rather than silently treating a typo as free work.
 */
export function parseRewardRange(raw: unknown): RewardRange {
  const label = raw === null || raw === undefined ? "" : String(raw).trim();
  if (label === "") return { min: 0, max: 0, label, valid: false };

  // A bare number is a fixed reward.
  const single = Number(label);
  if (Number.isFinite(single)) {
    const n = Math.max(0, Math.trunc(single));
    return { min: n, max: n, label, valid: true };
  }

  const parts = label.split(SEPARATORS).map((p) => p.trim()).filter((p) => p !== "");
  const numbers = parts.map((p) => Number(p.replace(/[^0-9.]/g, ""))).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return { min: 0, max: 0, label, valid: false };

  const lo = Math.max(0, Math.trunc(Math.min(...numbers)));
  const hi = Math.max(0, Math.trunc(Math.max(...numbers)));
  return { min: lo, max: hi, label, valid: true };
}

/** The top of the advertised range, which is what "how much is this worth" means. */
export function rewardCeiling(raw: unknown): number {
  return parseRewardRange(raw).max;
}

/** Human sentence for a refusal, so the admin sees the actual numbers. */
export function describeRange(range: RewardRange): string {
  if (!range.valid) return "an unreadable amount";
  return range.min === range.max ? `${range.max}` : `${range.min} to ${range.max}`;
}
