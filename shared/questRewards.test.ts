import { describe, it, expect } from "vitest";
import { parseRewardRange, rewardCeiling, describeRange } from "./questRewards";

/*
 * THE MONEY QUESTION THIS FILE ASKS: can a quest go on the board advertising a
 * reward that pays nothing, with nothing refusing anywhere?
 *
 * It could. `parseRewardRange` stripped the non-digits out of a label and
 * converted second, so "some hearts" became `Number("")`, which is 0, which is
 * finite, which passed the check that was supposed to catch it. The function
 * returned `{ min: 0, max: 0, valid: true }`: a VALID reward of nothing. Under
 * the shipped `quest.consent_cap_mode = 'posted'` that made the quest
 * unconsentable at any amount, and the refusal blamed the number the admin had
 * typed instead of the label on the board.
 *
 * The parser's own header had promised the opposite behaviour since it was
 * written. These tests are the promise, made checkable.
 */

describe("parseRewardRange: a label has to name a number", () => {
  // The class the parser got wrong. Every one of these has no digit anywhere,
  // and every one of them used to come back valid with a max of 0.
  const wordy = [
    "some hearts",
    "a few",
    "many blessings",
    "gratitude",
    "five",
    "TBD",
    "n/a",
    "lots",
    // Both sides wordy: the split path with nothing to find on either side.
    "some-many",
    // These two reach the split path because `Number.isFinite` rejects them,
    // and then used to come back as zero like the rest.
    "NaN",
    "Infinity",
  ];

  for (const label of wordy) {
    it(`refuses ${JSON.stringify(label)}, which names no number`, () => {
      const parsed = parseRewardRange(label);
      expect(parsed.valid).toBe(false);
      expect(parsed.min).toBe(0);
      expect(parsed.max).toBe(0);
      // The label survives for display, so the admin can see what was written.
      expect(parsed.label).toBe(label);
    });
  }

  it("says so in words, so a refusal names the real problem", () => {
    expect(describeRange(parseRewardRange("some hearts"))).toBe("an unreadable amount");
  });

  it("still refuses an empty or whitespace label", () => {
    expect(parseRewardRange("").valid).toBe(false);
    expect(parseRewardRange("   ").valid).toBe(false);
    expect(parseRewardRange(null).valid).toBe(false);
    expect(parseRewardRange(undefined).valid).toBe(false);
  });

  it("refuses a label that is only separators", () => {
    expect(parseRewardRange("-").valid).toBe(false);
    expect(parseRewardRange("to").valid).toBe(false);
  });
});

describe("parseRewardRange: a deliberate zero is a real answer", () => {
  /*
   * Caps fail closed in this platform: 0 means zero, never unlimited. A quest
   * may also pay in stay credits alone and advertise no gratitude at all. So
   * "0" has to stay VALID even though the fix above is about zeros: the
   * difference is that "0" NAMES zero and "some hearts" names nothing.
   */
  it("keeps a written 0 valid", () => {
    expect(parseRewardRange("0")).toEqual({ min: 0, max: 0, label: "0", valid: true });
  });

  it("keeps a written 0-0 valid", () => {
    expect(parseRewardRange("0-0")).toEqual({ min: 0, max: 0, label: "0-0", valid: true });
  });

  it("keeps a numeric 0 valid", () => {
    expect(parseRewardRange(0)).toEqual({ min: 0, max: 0, label: "0", valid: true });
  });

  it("keeps a range with a zero floor valid", () => {
    const parsed = parseRewardRange("0 to 5");
    expect(parsed.valid).toBe(true);
    expect(parsed.min).toBe(0);
    expect(parsed.max).toBe(5);
  });
});

describe("parseRewardRange: the formats that already worked still work", () => {
  const cases: Array<[unknown, number, number]> = [
    ["50-100", 50, 100],
    ["50 to 100", 50, 100],
    ["50 TO 100", 50, 100],
    // En dash and em dash, the two the client used to split on by hand.
    ["50–100", 50, 100],
    ["50—100", 50, 100],
    // Spaces around the separator.
    ["50 - 100", 50, 100],
    // A bare number is a fixed reward.
    ["100", 100, 100],
    [100, 100, 100],
    ["1.5", 1, 1],
    // A number with a unit attached still names its number.
    ["50 hearts", 50, 50],
  ];

  for (const [raw, min, max] of cases) {
    it(`reads ${JSON.stringify(raw)} as ${min} to ${max}`, () => {
      const parsed = parseRewardRange(raw);
      expect(parsed.valid).toBe(true);
      expect(parsed.min).toBe(min);
      expect(parsed.max).toBe(max);
    });
  }

  it("describes a range with both ends", () => {
    expect(describeRange(parseRewardRange("50-100"))).toBe("50 to 100");
  });

  it("describes a fixed reward as one number", () => {
    expect(describeRange(parseRewardRange("100"))).toBe("100");
  });
});

describe("parseRewardRange: one readable side of a range", () => {
  /*
   * A digit-free fragment used to contribute a 0 to the numbers, so half a
   * range read as a floor of free work. The same digit check that fixes the
   * whole-label case fixes this one, and it is the only place the FIX MOVES A
   * NUMBER rather than only the flag.
   */
  it("reads a half-written range as the number it does name", () => {
    const parsed = parseRewardRange("50 to a lot");
    expect(parsed.valid).toBe(true);
    expect(parsed.min).toBe(50);
    expect(parsed.max).toBe(50);
  });
});

describe("rewardCeiling", () => {
  it("is the top of the range", () => {
    expect(rewardCeiling("50-100")).toBe(100);
    expect(rewardCeiling("100")).toBe(100);
  });

  it("is 0 for a label naming no number, the same as before the fix", () => {
    // The client sums this across the board for "up to N available". An
    // unreadable label contributed 0 to that sum before the fix and still
    // does, so the fix moves no number on the quests page.
    expect(rewardCeiling("some hearts")).toBe(0);
    expect(rewardCeiling("")).toBe(0);
  });
});

describe("the derived columns the repo writes are unchanged", () => {
  /*
   * `server/repos/quests.ts` writes `range.min` and `range.max` into
   * gratitude_min / gratitude_max and never reads `valid`, and
   * `scripts/import-json-to-mysql.ts` re-derives the same two columns to check
   * for drift. Both would silently rewrite every row if the fix moved these
   * numbers, so this pins the pairs those two callers depend on.
   */
  const derived: Array<[unknown, number, number]> = [
    ["some hearts", 0, 0],
    ["", 0, 0],
    ["0", 0, 0],
    ["50-100", 50, 100],
    ["50 to 100", 50, 100],
    ["100", 100, 100],
  ];

  for (const [raw, min, max] of derived) {
    it(`${JSON.stringify(raw)} still derives ${min} / ${max}`, () => {
      const parsed = parseRewardRange(raw);
      expect(parsed.min).toBe(min);
      expect(parsed.max).toBe(max);
    });
  }
});
