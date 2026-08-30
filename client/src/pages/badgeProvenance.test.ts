/**
 * THE SENTENCE THAT SAYS WHERE A NOTE ON YOUR RECORD CAME FROM.
 *
 * A steward places a warning and has to write why. Until this line existed the
 * member read the why and nothing else: no name, no date. A record somebody
 * cannot read is not a record.
 *
 * Two properties are load-bearing and both are checked here rather than
 * described.
 *
 * IT NEVER INVENTS A PERSON. `awardedByName` is null in two real cases, the
 * earned engine and a steward who has left the village, and a stand-in like "a
 * steward" would be the product stating a fact about a person that nobody
 * knows. A fallback is a claim, and it is worse than saying less.
 *
 * IT NEVER ARGUES. R56: state what is true and get out of the way. A warning
 * that is visible is a fact the member can act on. A warning that scolds is an
 * argument, and this line carries none of the vocabulary an argument needs.
 */
import { describe, expect, it } from "vitest";
import { badgeProvenanceLine } from "./Badges";

const PLACED = "2026-08-29T10:00:00.000Z";
const RENEWED = "2026-09-20T10:00:00.000Z";

describe("who placed this, and when", () => {
  it("names the steward and the day for a warning", () => {
    const line = badgeProvenanceLine("warning", { awardedByName: "Ada", awardedAt: PLACED });
    expect(line).toContain("Ada");
    expect(line).toContain("placed this");
    expect(line).toContain("2026");
  });

  it("reads as a gift for every other kind", () => {
    const line = badgeProvenanceLine("granted", { awardedByName: "Ada", awardedAt: PLACED });
    expect(line).toContain("gave you this");
    expect(line).not.toContain("placed this");
  });

  it("says the date and invents nobody when the name is unknown", () => {
    for (const name of [null, undefined, ""]) {
      const line = badgeProvenanceLine("earned", { awardedByName: name, awardedAt: PLACED });
      expect(line, `a ${String(name)} name must still produce a line`).toContain("Recorded on");
      expect(line).toContain("2026");
      // The two stand-ins somebody would reach for first.
      expect(String(line).toLowerCase()).not.toContain("steward");
      expect(String(line).toLowerCase()).not.toContain("someone");
    }
  });

  it("says nothing at all when there is no date to say", () => {
    expect(badgeProvenanceLine("warning", { awardedByName: "Ada", awardedAt: null })).toBeNull();
    expect(badgeProvenanceLine("warning", {})).toBeNull();
  });

  it("counts a renewal, so an indefinitely renewed note leaves a trail", () => {
    const once = badgeProvenanceLine("warning", {
      awardedByName: "Ada", awardedAt: PLACED, lastChangedAt: RENEWED, reissueCount: 1,
    });
    expect(once).toContain("Renewed once");
    const twice = badgeProvenanceLine("warning", {
      awardedByName: "Ada", awardedAt: PLACED, lastChangedAt: RENEWED, reissueCount: 2,
    });
    expect(twice).toContain("Renewed 2 times");
  });

  it("stays quiet about a renewal it has no date for", () => {
    const line = badgeProvenanceLine("warning", {
      awardedByName: "Ada", awardedAt: PLACED, reissueCount: 3,
    });
    expect(line).not.toContain("Renewed");
  });

  it("carries no word that tells the member what to feel", () => {
    const scolding =
      /\b(should|must|failed|violation|misconduct|breach|penalty|punish|offence|offense|guilty|unacceptable|behave)\b/i;
    for (const kind of ["warning", "granted", "earned"]) {
      for (const award of [
        { awardedByName: "Ada", awardedAt: PLACED },
        { awardedByName: null, awardedAt: PLACED },
        { awardedByName: "Ada", awardedAt: PLACED, lastChangedAt: RENEWED, reissueCount: 4 },
      ]) {
        const line = String(badgeProvenanceLine(kind, award) ?? "");
        expect(scolding.test(line), `${kind}: "${line}" reads as an argument`).toBe(false);
      }
    }
  });
});
