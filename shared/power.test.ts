/**
 * The power vocabulary: closed ids, glossed words, and the one rule that
 * `other` always arrives with a line of the village's own.
 */
import { describe, expect, it } from "vitest";
import {
  DECIDES_BY,
  DOMAINS,
  GLOSS_MAX,
  HOW_CHOSEN,
  SHAPES,
  decidesByProblem,
  domainsProblem,
  howChosenProblem,
  shapeProblem,
} from "./power";

describe("the vocabularies", () => {
  it("carry a label and a one-line gloss on every entry", () => {
    for (const list of [SHAPES, DECIDES_BY, DOMAINS, HOW_CHOSEN] as const) {
      for (const entry of list) {
        expect(entry.label.trim().length, entry.id).toBeGreaterThan(0);
        expect(entry.gloss.trim().length, entry.id).toBeGreaterThan(0);
        expect(entry.gloss.length, entry.id).toBeLessThanOrEqual(GLOSS_MAX);
      }
    }
  });

  it("each carry exactly one `other`, so a village's own word always has a door", () => {
    expect(SHAPES.filter((s) => s.id === "other")).toHaveLength(1);
    expect(DECIDES_BY.filter((d) => d.id === "other")).toHaveLength(1);
    expect(HOW_CHOSEN.filter((h) => h.id === "other")).toHaveLength(1);
  });

  it("place every shape on the one-holds-it to all-hold-it strip", () => {
    for (const s of SHAPES) {
      expect(s.spectrum, s.id).toBeGreaterThanOrEqual(0);
      expect(s.spectrum, s.id).toBeLessThanOrEqual(1);
    }
    // The strip's promise: steward is the one-holds-it end, flat the other.
    const at = (id: string) => SHAPES.find((s) => s.id === id)!.spectrum;
    expect(at("steward")).toBe(0);
    expect(at("flat")).toBe(1);
    expect(at("pyramid")).toBeLessThan(at("circle"));
  });

  it("keep the four domains exactly four", () => {
    expect(DOMAINS.map((d) => d.id).sort()).toEqual(["money", "people", "rules", "space_land"]);
  });

  it("include hypha as a way of deciding (P7)", () => {
    expect(DECIDES_BY.some((d) => d.id === "hypha")).toBe(true);
  });
});

describe("the ids are closed", () => {
  it("refuses a shape the map cannot draw", () => {
    expect(shapeProblem("holacracy")).toContain("must be one of");
    expect(shapeProblem("")).toContain("must be one of");
    expect(shapeProblem(null)).toContain("must be one of");
    expect(shapeProblem("circle")).toBeNull();
  });

  it("refuses a way of deciding it does not know", () => {
    expect(decidesByProblem("feudalism")).toContain("must be one of");
    expect(decidesByProblem("consent")).toBeNull();
    expect(decidesByProblem("hypha")).toBeNull();
  });

  it("refuses a way of choosing it does not know", () => {
    expect(howChosenProblem("bloodline")).toContain("must be one of");
    expect(howChosenProblem("elected_by_circle")).toBeNull();
  });
});

describe("other requires a line of the village's own", () => {
  it("for shapes", () => {
    expect(shapeProblem("other")).toContain("one line");
    expect(shapeProblem("other", "  ")).toContain("one line");
    expect(shapeProblem("other", "Two stewards hold it together")).toBeNull();
  });

  it("for ways of deciding", () => {
    expect(decidesByProblem("other")).toContain("one line");
    expect(decidesByProblem("other", "The moon circle draws lots")).toBeNull();
  });

  it("for ways of choosing", () => {
    expect(howChosenProblem("other")).toContain("one line");
    expect(howChosenProblem("other", "Drawn by lot each season")).toBeNull();
  });

  it("caps any gloss at the room the legend has", () => {
    const long = "x".repeat(GLOSS_MAX + 1);
    expect(shapeProblem("circle", long)).toContain("too long");
    expect(shapeProblem("circle", "x".repeat(GLOSS_MAX))).toBeNull();
    expect(decidesByProblem("consent", long)).toContain("too long");
    expect(howChosenProblem("rotates", long)).toContain("too long");
  });
});

describe("domain overrides", () => {
  it("accept nothing at all", () => {
    expect(domainsProblem(null)).toBeNull();
    expect(domainsProblem(undefined)).toBeNull();
    expect(domainsProblem({})).toBeNull();
  });

  it("accept a lens over the four domains", () => {
    expect(
      domainsProblem({
        money: { method: "consent" },
        rules: { method: "hypha" },
        space_land: { method: "other", gloss: "The land trust holds this" },
      }),
    ).toBeNull();
  });

  it("refuses a domain the map does not know, by name", () => {
    expect(domainsProblem({ weather: { method: "consent" } })).toContain('"weather"');
  });

  it("refuses a method problem inside a domain", () => {
    expect(domainsProblem({ money: { method: "feudalism" } })).toContain("must be one of");
    expect(domainsProblem({ money: { method: "other" } })).toContain("one line");
    expect(domainsProblem({ money: "consent" })).toContain("needs a method");
  });

  it("refuses shapes that are lists or scalars", () => {
    expect(domainsProblem([])).toContain("object");
    expect(domainsProblem("money")).toContain("object");
  });
});
