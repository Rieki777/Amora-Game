/**
 * The address plane's one rule: a creator is never overwritten by a guess.
 *
 * These tests are the enforcement. The rule is easy to state and easy to lose
 * in a resolver written six months from now, so the predicate it has to call
 * is pinned here rather than left as a comment in a migration.
 */
import { describe, expect, it } from "vitest";
import {
  ADDRESS_SOURCES,
  ADDRESS_SOURCE_MAX,
  DEFAULT_MAP_VOCABULARY,
  isAddressSource,
  isCreatorAuthored,
  mayOverwriteAddress,
  normaliseAddressSource,
  sanitiseMapVocabulary,
} from "./mapAddress";

describe("the vocabulary", () => {
  it("is exactly the three values the plane recognises", () => {
    expect([...ADDRESS_SOURCES]).toEqual(["creator", "resolver-guess", "creator-board"]);
    for (const v of ADDRESS_SOURCES) expect(isAddressSource(v)).toBe(true);
    expect(isAddressSource("pool")).toBe(false);
    expect(isAddressSource("")).toBe(false);
    expect(isAddressSource(null)).toBe(false);
  });

  it("fits the column the migration declares", () => {
    // varchar(24) in 0060. A value longer than the column would be truncated
    // on write and then fail every check that reads it back.
    for (const v of ADDRESS_SOURCES) expect(v.length).toBeLessThanOrEqual(ADDRESS_SOURCE_MAX);
  });
});

describe("normaliseAddressSource", () => {
  it("passes through what it recognises", () => {
    expect(normaliseAddressSource("creator")).toBe("creator");
    expect(normaliseAddressSource("creator-board")).toBe("creator-board");
    expect(normaliseAddressSource("resolver-guess")).toBe("resolver-guess");
  });

  it("reads the artifact's 'pool' as silence, NOT as a board decision", () => {
    /*
     * The scene writes `pool` as its derived default when no structure was
     * set. Mapping it to creator-board would invent a decision nobody made,
     * and would then make that invented decision immovable by a resolver.
     */
    expect(normaliseAddressSource("pool")).toBeNull();
    expect(mayOverwriteAddress(normaliseAddressSource("pool"), "resolver-guess")).toBe(true);
  });

  it("drops anything it does not recognise rather than storing it raw", () => {
    expect(normaliseAddressSource("vibes")).toBeNull();
    expect(normaliseAddressSource(42)).toBeNull();
    expect(normaliseAddressSource(undefined)).toBeNull();
  });
});

describe("isCreatorAuthored", () => {
  it("counts both creator spellings", () => {
    expect(isCreatorAuthored("creator")).toBe(true);
    // A person choosing the Board is still a person choosing.
    expect(isCreatorAuthored("creator-board")).toBe(true);
    expect(isCreatorAuthored("resolver-guess")).toBe(false);
    expect(isCreatorAuthored(null)).toBe(false);
  });
});

describe("mayOverwriteAddress: the doctrine", () => {
  it("refuses to move anything a person placed", () => {
    expect(mayOverwriteAddress("creator", "resolver-guess")).toBe(false);
    expect(mayOverwriteAddress("creator", "creator")).toBe(false);
    // Even an incoming creator claim does not overwrite automatically: a
    // person changes it through the surface that owns it, not by re-import.
    expect(mayOverwriteAddress("creator-board", "creator")).toBe(false);
    expect(mayOverwriteAddress("creator-board", "resolver-guess")).toBe(false);
  });

  it("fills silence and replaces a stale guess", () => {
    expect(mayOverwriteAddress(null, "creator")).toBe(true);
    expect(mayOverwriteAddress(null, "resolver-guess")).toBe(true);
    expect(mayOverwriteAddress("resolver-guess", "creator")).toBe(true);
    expect(mayOverwriteAddress("resolver-guess", "resolver-guess")).toBe(true);
  });

  it("treats an unrecognised stored value as replaceable, not as authority", () => {
    // A junk value must not become immovable simply by being unreadable.
    expect(mayOverwriteAddress("pool", "creator")).toBe(true);
    expect(mayOverwriteAddress("nonsense", "creator")).toBe(true);
  });

  it("refuses an incoming value it does not recognise", () => {
    expect(mayOverwriteAddress(null, "pool")).toBe(false);
    expect(mayOverwriteAddress("resolver-guess", "vibes")).toBe(false);
  });
});

describe("sanitiseMapVocabulary", () => {
  it("returns empty lists for junk", () => {
    expect(sanitiseMapVocabulary(undefined)).toEqual(DEFAULT_MAP_VOCABULARY);
    expect(sanitiseMapVocabulary("lane")).toEqual(DEFAULT_MAP_VOCABULARY);
    expect(sanitiseMapVocabulary({ road: "lane" })).toEqual(DEFAULT_MAP_VOCABULARY);
  });

  it("trims, drops blanks, and dedupes", () => {
    expect(sanitiseMapVocabulary({ road: ["  lane ", "lane", "", "  ", "track"] }).road)
      .toEqual(["lane", "track"]);
  });

  it("keeps the three named lists and ignores anything else", () => {
    const v = sanitiseMapVocabulary({ road: ["lane"], water: ["swale"], zone: ["grove"], sky: ["x"] });
    expect(v).toEqual({ road: ["lane"], water: ["swale"], zone: ["grove"] });
  });

  it("caps a word and a list rather than storing an essay", () => {
    expect(sanitiseMapVocabulary({ road: ["x".repeat(200)] }).road[0]).toHaveLength(48);
    const many = Array.from({ length: 200 }, (_, i) => `road-${i}`);
    expect(sanitiseMapVocabulary({ road: many }).road).toHaveLength(60);
  });
});
