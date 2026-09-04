/**
 * THE FORMATTING RULE, pinned as numbers rather than as a description.
 *
 * The rule is one sentence: a whole amount renders whole, a fractional one
 * renders to its significant digits and no further. It is easy to agree with
 * and easy to spell three different ways, which is what happened. Before this
 * file existed the same rule was written out separately in ProfileSheet.tsx
 * and in PublicProfile.tsx, with different regexes, and a third surface (the
 * wallet) had no copy of it at all and printed the raw row.
 *
 * The headline case is first, because it is the one a member reported:
 * ten Village Voice is 10000 in the ledger and has to read as 10.
 */
import { describe, expect, it } from "vitest";
import { decimalsOf, formatTokenAmount, smallestUnit, toMinorUnits } from "./tokenAmount";

describe("formatTokenAmount", () => {
  it("shows ten Village Voice as ten, not ten thousand", () => {
    // decimals 3 is Village Voice's registry row today, and the only non-zero
    // one in the build.
    expect(formatTokenAmount(10_000, 3)).toBe("10");
    // The control, and the defect in one line: the same balance with no scale
    // is what every wallet surface printed.
    expect(formatTokenAmount(10_000, 0)).toBe("10000");
  });

  it("leaves a token with no decimals exactly as it was", () => {
    // Gratitude, stay credits and library credits all carry decimals 0, and
    // every surface that renders them has to be untouched by this change.
    expect(formatTokenAmount(25, 0)).toBe("25");
    expect(formatTokenAmount(0, 0)).toBe("0");
    expect(formatTokenAmount(-4, 0)).toBe("-4");
  });

  it("renders a whole amount whole and a fractional one to its digits", () => {
    // "10.000 Voice" and "10 Voice" are the same number and not the same
    // sentence. A trailing-zero tail reads like a price on a thing that is
    // not for sale.
    expect(formatTokenAmount(10_000, 3)).toBe("10");
    expect(formatTokenAmount(1_000, 3)).toBe("1");
    expect(formatTokenAmount(100, 3)).toBe("0.1");
    expect(formatTokenAmount(120, 3)).toBe("0.12");
    expect(formatTokenAmount(125, 3)).toBe("0.125");
    expect(formatTokenAmount(10_500, 3)).toBe("10.5");
    expect(formatTokenAmount(20_000, 3)).toBe("20");
    // A zero balance is a zero, never a bare "." or an empty chip.
    expect(formatTokenAmount(0, 3)).toBe("0");
  });

  it("never invents precision the ledger does not hold", () => {
    // The row is an INT, so the last digit is the smallest thing that exists.
    // Nothing here rounds a member's balance up or down.
    expect(formatTokenAmount(1, 3)).toBe("0.001");
    expect(formatTokenAmount(1_229, 3)).toBe("1.229");
    expect(formatTokenAmount(999_999, 3)).toBe("999.999");
  });

  it("survives the ruling that moves every token to 4 decimals", () => {
    // The reason this landed before that sweep and not inside it: after it,
    // an undivided surface is wrong by 10,000x on every token at once.
    expect(formatTokenAmount(100_000, 4)).toBe("10");
    expect(formatTokenAmount(100_000, 0)).toBe("100000");
    expect(formatTokenAmount(12_345, 4)).toBe("1.2345");
  });

  it("keeps a negative readable", () => {
    // A suspended account runs negative by design, and the minus belongs in
    // front of the whole number.
    expect(formatTokenAmount(-10_000, 3)).toBe("-10");
    expect(formatTokenAmount(-500, 3)).toBe("-0.5");
  });
});

describe("decimalsOf", () => {
  it("reads one token's scale out of a payload map", () => {
    expect(decimalsOf({ "village-voice": 3, gratitude: 0 }, "village-voice")).toBe(3);
    expect(decimalsOf({ "village-voice": 3, gratitude: 0 }, "gratitude")).toBe(0);
  });

  it("treats an absent or missing map as whole units, never as a guess", () => {
    // Every token carried 0 before Voice, and an unregistered slug honestly
    // means nobody has said otherwise. It must not infer a scale from a name.
    expect(decimalsOf(undefined, "village-voice")).toBe(0);
    expect(decimalsOf({}, "village-voice")).toBe(0);
    expect(decimalsOf(null, "anything")).toBe(0);
  });
});

/**
 * THE TWO HALVES OF THE CARD HAVE TO AGREE.
 *
 * A member sees a balance and types a number into a box beside it. If the
 * display divides and the box does not, the card lies to them in the most
 * expensive way available: quietly, about money, in a direction they will not
 * question.
 *
 * That is not hypothetical. The decimals sweep taught the send card to SHOW a
 * balance in human units and left its input posting MINOR units to an endpoint
 * that truncates and moves exactly that many. A member holding 10000 Village
 * Voice saw "You hold 10", typed 1, and moved 0.001. Before the sweep the card
 * said 10000 and the box took 10000: both raw, and agreeing, which is
 * survivable in a way that disagreeing is not.
 *
 * So these are round trips rather than assertions about either half alone.
 */
describe("what a member sees, typed straight back, is what the ledger held", () => {
  const cases: Array<[number, number]> = [
    [10000, 3], // 10 Village Voice, the only token with decimals today
    [10000, 4], // the same row after the 4-decimals ruling
    [25, 0],    // Village Credits as they ship now
    [1229, 4],  // deliberately not a round number of minor units
    [1, 0],
    [500, 3],
    [0, 3],
  ];
  for (const [units, d] of cases) {
    it(`${units} at ${d}dp survives the round trip`, () => {
      expect(toMinorUnits(formatTokenAmount(units, d), d)).toBe(units);
    });
  }
});

describe("the send card's actual bug", () => {
  it("typing the whole balance back moves the whole balance", () => {
    expect(toMinorUnits(formatTokenAmount(10000, 3), 3)).toBe(10000);
  });

  it("typing 1 moves one whole token, not one minor unit", () => {
    expect(toMinorUnits("1", 3)).toBe(1000);
    expect(toMinorUnits("1", 0)).toBe(1);
  });

  it("refuses to invent a number from something that is not one", () => {
    expect(Number.isNaN(toMinorUnits("", 3))).toBe(true);
    expect(Number.isNaN(toMinorUnits("abc", 3))).toBe(true);
  });
});

describe("smallestUnit", () => {
  it("gives an input a step a member can actually reach", () => {
    expect(smallestUnit(0)).toBe(1);
    expect(smallestUnit(3)).toBe(0.001);
    expect(smallestUnit(4)).toBe(0.0001);
  });
});
