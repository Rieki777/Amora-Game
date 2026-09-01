/**
 * The checklist has to read the record, and this is the test that says so.
 *
 * The first case below is the outage in miniature: a brand document with every
 * box ticked and every field empty. That is the state a live village was
 * actually in, and the old checklist scored it six of six on the one screen a
 * founder opens to ask whether the village is set up. If that case ever goes
 * green again, the checklist has gone back to reading the founder's memory.
 */
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "@shared/gameConfig";
import { SETUP_STEPS, measureSetup, setupIsComplete, type BrandLike } from "./setupProgress";

const ALL_TICKED = { identity: true, images: true, numbers: true, content: true, map: true, technical: true };

/** The shape `GET /api/admin/brand` returns for a village that has saved nothing. */
function emptyBrand(): BrandLike {
  return {
    project: { name: "", tagline: "", memberName: "", location: "", footerBlurb: "", siteUrl: "", eventsUrl: "", contactEmail: "" },
    images: Object.fromEntries(Object.keys(GAME_CONFIG.images).map((k) => [k, ""])),
    setup: { ...ALL_TICKED },
  };
}

/** Every measured field filled, built from the step list so a field added there
 *  is filled here too rather than quietly leaving this fixture incomplete. */
function filledBrand(): BrandLike {
  const brand = emptyBrand();
  for (const step of SETUP_STEPS) {
    for (const field of step.fields) {
      (brand[field.group] as Record<string, unknown>)[field.key] = `a ${field.label}`;
    }
  }
  return brand;
}

const row = (brand: BrandLike | null | undefined, key: string) =>
  measureSetup(brand).find((r) => r.key === key)!;

describe("measureSetup", () => {
  it("does not let a ticked box stand in for an empty field", () => {
    const brand = emptyBrand();
    expect(row(brand, "identity").done).toBe(false);
    expect(row(brand, "identity").filled).toBe(0);
    expect(row(brand, "images").done).toBe(false);
    expect(row(brand, "images").filled).toBe(0);
    expect(setupIsComplete(brand)).toBe(false);
  });

  it("counts a measured row up as fields are saved", () => {
    // The positive control for the case above: the same reader, the same
    // record shape, reporting done on a village that really did fill it in.
    const brand = filledBrand();
    expect(row(brand, "identity")).toMatchObject({ done: true, filled: 5, total: 5, blank: [] });
    expect(row(brand, "images")).toMatchObject({ done: true, filled: 9, total: 9, blank: [] });
    expect(setupIsComplete(brand)).toBe(true);
  });

  it("names the fields still empty, and goes back to unfinished when one is cleared", () => {
    const brand = filledBrand();
    (brand.images as Record<string, unknown>).hero = "";
    (brand.images as Record<string, unknown>).favicon = "";
    expect(row(brand, "images").done).toBe(false);
    expect(row(brand, "images").filled).toBe(7);
    expect(row(brand, "images").blank).toEqual(["Homepage hero", "Browser tab icon"]);
    expect(setupIsComplete(brand)).toBe(false);
  });

  it("does not accept whitespace as a village name", () => {
    const brand = filledBrand();
    (brand.project as Record<string, unknown>).name = "   ";
    expect(row(brand, "identity").done).toBe(false);
    expect(row(brand, "identity").blank).toEqual(["Project name"]);
  });

  it("leaves the optional identity fields out of the count", () => {
    // siteUrl, eventsUrl and contactEmail each say in their own label that
    // blank is a real answer, so a village that wants no outside links still
    // finishes this step.
    const brand = filledBrand();
    expect((brand.project as Record<string, string>).siteUrl).toBe("");
    expect((brand.project as Record<string, string>).contactEmail).toBe("");
    expect(row(brand, "identity").done).toBe(true);
  });

  it("still reports the four self-reported rows from their boxes", () => {
    const brand = emptyBrand();
    for (const key of ["numbers", "content", "map", "technical"]) {
      expect(row(brand, key)).toMatchObject({ measured: false, done: true, total: 0 });
    }
    brand.setup = { ...ALL_TICKED, map: false };
    expect(row(brand, "map").done).toBe(false);
  });

  it("reads a missing record as nothing seen rather than throwing", () => {
    for (const brand of [null, undefined, {}]) {
      expect(row(brand, "identity")).toMatchObject({ done: false, filled: 0, total: 5 });
      expect(row(brand, "numbers").done).toBe(false);
      expect(setupIsComplete(brand)).toBe(false);
    }
  });
});

describe("the step list", () => {
  it("keeps the six steps in the order a founder works", () => {
    expect(SETUP_STEPS.map((s) => s.key)).toEqual(["identity", "images", "numbers", "content", "map", "technical"]);
  });

  it("measures every picture the platform has a slot for", () => {
    // A tenth image added to the platform would otherwise sit uncounted, which
    // is the same silence the empty nine lived in.
    const platform = Object.keys(GAME_CONFIG.images).filter((k) => !k.endsWith("Alt"));
    const measured = SETUP_STEPS.find((s) => s.key === "images")!.fields.map((f) => f.key);
    expect(platform).toHaveLength(9);
    expect(platform).toContain("hero");
    expect([...measured].sort()).toEqual([...platform].sort());
  });

  it("names identity fields the config actually carries", () => {
    const known = { project: Object.keys(GAME_CONFIG.project) };
    expect(known.project).toContain("tagline");
    for (const field of SETUP_STEPS.find((s) => s.key === "identity")!.fields) {
      expect(known[field.group as "project"]).toContain(field.key);
    }
  });

  it("measures no currency field, because no box here sets one", () => {
    // The wizard's "Recognition currency name" and "Currency, lowercase" boxes
    // were dead: mergedConfig() reads that name from the token registry ahead
    // of the brand document, so nothing typed there ever showed anywhere. Both
    // boxes are gone and so is their count. A token is named under Admin then
    // Tokens, which is not part of the brand record.
    for (const step of SETUP_STEPS) {
      for (const field of step.fields) {
        expect(field.group, `${step.key}.${field.key}`).not.toBe("currency");
      }
    }
  });
});
