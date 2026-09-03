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
import {
  SETUP_STEPS,
  measureSetup,
  setupCounts,
  setupIsComplete,
  type BrandLike,
} from "./setupProgress";

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

  it("carries a ticked box, and says it was a founder who said so", () => {
    const brand = emptyBrand();
    for (const key of ["numbers", "content", "map", "technical"]) {
      expect(row(brand, key)).toMatchObject({
        measured: false,
        source: "declared",
        state: "done",
        done: true,
        declaredDone: true,
        // Nothing was counted, so nothing is reported as counted. A zero here
        // would read as "none of them are set".
        filled: null,
        total: null,
      });
    }
  });

  it("reads an untouched box as nobody having looked, not as unfinished", () => {
    // The two are different facts. An empty box means the founder has not made
    // a note; it never means this screen went and checked.
    const brand = emptyBrand();
    brand.setup = { ...ALL_TICKED, map: false };
    expect(row(brand, "map")).toMatchObject({
      state: "unknown",
      done: false,
      declaredDone: false,
      filled: null,
      total: null,
    });
  });

  it("reads a record that never arrived as unknown, and counts nothing", () => {
    // THE SILENT ZERO. Before this, `measureSetup(null)` answered
    // "0 of 9 filled in" for the pictures row, which is what a village with
    // nine empty slots is told. A document nobody has read says nothing.
    for (const brand of [null, undefined]) {
      expect(row(brand, "identity")).toMatchObject({
        state: "unknown",
        done: false,
        filled: null,
        total: null,
      });
      expect(row(brand, "images")).toMatchObject({ state: "unknown", filled: null, total: null });
      expect(row(brand, "numbers")).toMatchObject({ state: "unknown", declaredDone: false });
      expect(setupIsComplete(brand)).toBe(false);
      expect(setupCounts(brand)).toMatchObject({ done: 0, todo: 0, unknown: 6 });
    }
  });

  it("reads an empty record as counted and empty, which is a different fact", () => {
    // `{}` is a document that arrived carrying nothing. That IS the outage
    // state and it must still count to zero out loud.
    expect(row({}, "identity")).toMatchObject({ state: "todo", filled: 0, total: 5 });
    expect(row({}, "images")).toMatchObject({ state: "todo", filled: 0, total: 9 });
    expect(setupIsComplete({})).toBe(false);
  });
});

describe("observations, for the steps whose values live elsewhere", () => {
  it("takes the reading over the box when the reading says done", () => {
    const brand = emptyBrand();
    brand.setup = { ...ALL_TICKED, numbers: false };
    const rows = measureSetup(brand, {
      numbers: { state: "done", filled: 3, total: 3, detail: "3 figures stated" },
    });
    expect(rows.find((r) => r.key === "numbers")).toMatchObject({
      source: "measured",
      state: "done",
      done: true,
      declaredDone: false,
      filled: 3,
      total: 3,
      detail: "3 figures stated",
    });
  });

  it("lets a founder carry a step the reading calls unfinished, visibly", () => {
    // A blank is sometimes the real answer: a village states its own land
    // figures or states none. The tick still carries the step, and the row says
    // whose word carried it.
    const brand = emptyBrand();
    const rows = measureSetup(brand, { numbers: { state: "todo", filled: 0, total: 7 } });
    expect(rows.find((r) => r.key === "numbers")).toMatchObject({
      source: "declared",
      state: "done",
      done: true,
      declaredDone: true,
      measured: false,
    });
  });

  it("reports the reading when the founder has not ticked", () => {
    const brand = emptyBrand();
    brand.setup = { ...ALL_TICKED, numbers: false };
    const rows = measureSetup(brand, { numbers: { state: "todo", filled: 1, total: 7 } });
    expect(rows.find((r) => r.key === "numbers")).toMatchObject({
      source: "measured",
      state: "todo",
      done: false,
      declaredDone: false,
      filled: 1,
      total: 7,
    });
  });

  it("ignores an observation for a record that never arrived", () => {
    // Nothing was read, so a reading of one step cannot make the screen
    // knowledgeable about it.
    const rows = measureSetup(null, { numbers: { state: "done" } });
    expect(rows.every((r) => r.state === "unknown")).toBe(true);
  });
});

describe("setupCounts", () => {
  it("tells still-to-do apart from nobody-has-looked", () => {
    const counts = setupCounts(emptyBrand());
    // Two counted rows sit empty; the four boxes are all ticked.
    expect(counts).toEqual({ done: 4, todo: 2, unknown: 0, declared: 4, total: 6 });
  });

  it("counts a finished village as finished", () => {
    expect(setupCounts(filledBrand())).toMatchObject({ done: 6, todo: 0, unknown: 0 });
    expect(setupIsComplete(filledBrand())).toBe(true);
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
