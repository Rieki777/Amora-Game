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
 * Parse "50-100", "50 to 100", "100", or 100 into a range. En dash and em dash
 * separate a range too; see SEPARATORS.
 *
 * A LABEL HAS TO NAME A NUMBER. Anything carrying no digit at all comes back
 * `valid: false` with zeros, so callers can refuse instead of silently
 * treating a typo as free work. That is what the flag is for: on the shipped
 * default of `quest.consent_cap_mode = 'posted'` the advertised label IS the
 * payout contract, so a label nobody can read has no contract inside it and
 * the consent route says so by name.
 *
 * This promise was written here before the code kept it. `Number("")` is 0 and
 * 0 is finite, so every wordy label ("some hearts", "a few", "TBD") used to
 * parse as a VALID reward of zero, and a quest could sit on the board
 * advertising words that no admin could ever consent. The digit check below is
 * the fix; `shared/questRewards.test.ts` holds the line.
 *
 * A deliberate "0" stays VALID, and so does "0-0". Caps fail closed in this
 * platform: zero means zero, and a quest may pay in stay credits alone.
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
  // A FRAGMENT WITH NO DIGIT IN IT IS NOT A NUMBER, and the order of these two
  // steps is the whole defect. Stripping the non-digits first and converting
  // second handed `Number("")` to the finite check, `Number("")` is 0, and 0 is
  // finite: so "some hearts" came back as a VALID reward of zero, which is the
  // exact opposite of what the header above promises. Requiring a digit makes
  // the strip and the conversion agree.
  //
  // The same line also stops ONE wordy side of a range reading as a floor of
  // zero: "50 to a lot" was min 0 / max 50 and is now 50 / 50, because a side
  // nobody can read is a side that names nothing, not a side that names free.
  const numbers = parts
    .map((p) => p.replace(/[^0-9.]/g, ""))
    .filter((digits) => /[0-9]/.test(digits))
    .map((digits) => Number(digits))
    .filter((n) => Number.isFinite(n));
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
