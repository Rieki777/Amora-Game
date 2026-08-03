/**
 * The concierge's deterministic matcher, which had no unit test and cost a
 * twelve-minute end-to-end run to catch a regression in.
 *
 * The rule that actually matters here is about BUCKETS, not weights:
 *
 *   extra   (+2, name-equivalent) holds a circle's ALIASES — curated identity
 *           strings, deliberately as strong as the circle's own name.
 *   purpose (+1, prose)           holds everything somebody wrote in a
 *           sentence: aims, domains, accountabilities, descriptions.
 *
 * Put prose in the name-equivalent bucket and length starts winning: a seat
 * with six accountabilities outranks the circle it sits in, because it simply
 * contains more words. That is exactly what happened when org seats joined
 * the candidate set (0049) carrying their accountabilities as `extra`, and
 * "help with permaculture and gardens" started answering with the
 * Regenerative Agriculture SEAT instead of the Permaculture Council.
 */
import { describe, expect, it } from "vitest";
import { deterministicWinner, scoreCandidates, type Candidate } from "./map";

const circle = (id: string, name: string, aliases: string[] = [], purpose = ""): Candidate => ({
  kind: "circle", id, name, purpose, extra: aliases,
});

/** A seat as the concierge now builds one: all its prose in `purpose`. */
const seat = (id: string, name: string, aim: string, domain: string, accountabilities: string[] = []): Candidate => ({
  kind: "role", id, name, purpose: [aim, domain, ...accountabilities].filter(Boolean).join(" "),
});

describe("the concierge's deterministic matcher", () => {
  it("answers a question about a circle with the CIRCLE, not a seat inside it", () => {
    // The regression, in one case. The seat mentions permaculture repeatedly
    // across its accountabilities; the circle simply IS Permaculture.
    const scored = scoreCandidates("I want to help with permaculture and gardens", [
      circle("permaculture-council", "Permaculture Council", ["Regenerative Agriculture"]),
      seat(
        "regen-ag-lead",
        "Regenerative Agriculture Lead",
        "Grow food and tend the gardens with permaculture principles.",
        "Permaculture design, gardens, soil and the growing year.",
        ["Plans the permaculture gardens", "Runs the garden work parties", "Holds the permaculture curriculum"],
      ),
    ]);
    expect(scored[0].id).toBe("permaculture-council");
  });

  it("gives a long prose field no free points for containing 'and' and 'with'", () => {
    // The real mechanism behind the regression, isolated. Scoring is per
    // distinct QUERY WORD, so repetition buys nothing; what a long field does
    // buy is a hit on every function word in the question. Filtering those
    // out is what stops length deciding.
    const wordy = seat(
      "wordy",
      "Some Other Seat",
      "We work with the land and the water and the people.",
      "Everything that we do here, and how we do it, and with whom.",
    );
    const scored = scoreCandidates("I want to help with the gardens", [
      circle("gardens-circle", "Gardens Circle"),
      wordy,
    ]);
    // The seat matches nothing but stopwords, so it scores nothing at all.
    expect(scored.some((c) => c.id === "wordy")).toBe(false);
    expect(scored[0].id).toBe("gardens-circle");
  });

  it("matches on exact substrings, so a plural does not find its singular", () => {
    // Recorded rather than fixed. There is no stemming here: "gardens" does
    // not find "Garden Circle", and a village that names a circle in the
    // singular will see questions asked in the plural fall through to the
    // unmatched log. That log is the demand signal, so the failure is at
    // least visible, and stemming is a change with its own false positives.
    expect(scoreCandidates("gardens", [circle("c", "Garden Circle")])).toEqual([]);
    expect(scoreCandidates("garden", [circle("c", "Garden Circle")]).length).toBe(1);
  });

  it("keeps words a village would really ask about", () => {
    // The risk of a stopword list is stripping signal. These must survive.
    for (const w of ["care", "land", "water", "food", "build", "hold", "events"]) {
      const scored = scoreCandidates(`who does the ${w}`, [circle("c", `${w} circle`)]);
      expect(scored.length, `"${w}" was filtered out as a stopword`).toBe(1);
    }
  });

  it("still lets an alias speak for its circle as loudly as the name", () => {
    // Aliases exist so a legacy quest name resolves; they must keep their
    // weight, which is the reason `extra` scores what it does.
    const scored = scoreCandidates("regenerative agriculture", [
      circle("permaculture-council", "Permaculture Council", ["Regenerative Agriculture"]),
      circle("education-council", "Education Council"),
    ]);
    expect(scored[0].id).toBe("permaculture-council");
  });

  it("finds a seat when the question is about what the seat does", () => {
    // The other direction: nothing above should stop "who handles the water"
    // reaching the seat whose domain is water.
    const scored = scoreCandidates("who handles the water", [
      circle("community-circle", "Community Circle", [], "Events and hospitality."),
      seat("water-steward", "Water Steward", "Keep the water running.", "Springs, tanks and irrigation water."),
    ]);
    expect(scored[0].id).toBe("water-steward");
  });

  it("resolves nothing when nothing matches, which is the demand signal", () => {
    const scored = scoreCandidates("underwater basket weaving championships", [
      circle("permaculture-council", "Permaculture Council"),
      seat("water-steward", "Water Steward", "Keep the water running.", "Springs and tanks."),
    ]);
    // "underwater" contains "water", so a hit is possible; what must NOT
    // happen is a confident deterministic answer to a question nobody on the
    // map can take. An unmatched ask is the signal a seat is missing.
    expect(deterministicWinner(scored)).toBeNull();
  });

  it("needs a clear leader before it answers without the assistant", () => {
    const scored = scoreCandidates("garden", [
      circle("a", "Garden Circle"),
      circle("b", "Garden Council"),
    ]);
    // Two equally good answers is exactly when a human-sounding guess is
    // worst, so the deterministic path declines and lets the tie-break run.
    expect(deterministicWinner(scored)).toBeNull();
  });
});
