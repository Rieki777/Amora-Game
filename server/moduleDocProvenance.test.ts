import path from "path";
import { describe, expect, it } from "vitest";
import { MODULE_DOCS } from "./lib/knowledge";
import {
  moduleDocProvenanceProblems,
  provenanceSuffix,
  readProvenance,
} from "./lib/moduleDocProvenance";

/**
 * This file is the enforcement, and it is why the marker is a mechanism rather
 * than a convention somebody writes down. A document cannot reach Maia's module
 * shelf without saying whose words it is, so the day a listing's own contract
 * is added the requirement is already there and already red.
 */
describe("every document on the module shelf", () => {
  it("declares who wrote it", () => {
    const problems = moduleDocProvenanceProblems(path.resolve(process.cwd(), "docs", "modules"), MODULE_DOCS);
    expect(problems).toEqual([]);
  });
});

describe("reading the marker", () => {
  it("reads a platform document", () => {
    expect(readProvenance("# A doc\n\nProvenance: platform\n\nBody.")).toEqual({ source: "platform" });
  });

  it("reads a vendor document and keeps the legal name", () => {
    expect(readProvenance("# A doc\n\nProvenance: vendor (Example Systems Ltd)\n")).toEqual({
      source: "vendor",
      author: "Example Systems Ltd",
    });
  });

  it("returns nothing for a document that declares nothing", () => {
    expect(readProvenance("# A doc\n\nBody with no marker at all.\n")).toBeNull();
  });

  it("returns nothing for a vendor claim with no name on it", () => {
    // "vendor" alone would let an anonymous service onto the shelf under a
    // citation that reads as the platform's own. No name, no listing, and no
    // document either.
    expect(readProvenance("# A doc\n\nProvenance: vendor ()\n")).toBeNull();
  });

  it("ignores the word appearing later in prose", () => {
    const body = "# A doc\n\nReal text.\n" + "filler\n".repeat(20) + "Provenance: vendor (Sneaky Ltd)\n";
    expect(readProvenance(body)).toBeNull();
  });
});

describe("what a citation appends", () => {
  it("appends nothing for the platform's own words, so today's shelf is unchanged", () => {
    expect(provenanceSuffix({ source: "platform" })).toBe("");
    expect(provenanceSuffix(null)).toBe("");
  });

  it("names the author of anything else", () => {
    expect(provenanceSuffix({ source: "vendor", author: "Example Systems Ltd" })).toBe(" (written by Example Systems Ltd)");
  });
});
