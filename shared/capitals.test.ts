/**
 * The capitals vocabulary holds its shape: two maps (resources, land) read
 * this one list, so a hole here is a disagreement between pages.
 */
import { describe, expect, it } from "vitest";
import { CAPITALS, CAPITALS_BY_ID, MEDIA_KEYS, MEDIUM_TO_CAPITAL } from "./capitals";

describe("the nine capitals", () => {
  it("carries nine entries with unique ids", () => {
    expect(CAPITALS.length).toBe(9);
    const ids = CAPITALS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every capital a label, a formal name and a hue", () => {
    for (const c of CAPITALS) {
      expect(c.label.trim().length, `${c.id} label`).toBeGreaterThan(0);
      expect(c.formal.trim().length, `${c.id} formal`).toBeGreaterThan(0);
      expect(c.hue, `${c.id} hue`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("keeps hues distinct: colour is shared vocabulary, and a collision is two capitals wearing one coat", () => {
    const hues = CAPITALS.map((c) => c.hue.toUpperCase());
    expect(new Set(hues).size).toBe(hues.length);
  });

  it("maps every medium to a capital that exists", () => {
    expect(MEDIA_KEYS.length).toBe(9);
    for (const key of MEDIA_KEYS) {
      const capital = MEDIUM_TO_CAPITAL[key];
      expect(capital, `${key} has a default capital`).toBeTruthy();
      expect(CAPITALS_BY_ID[capital], `${key} maps to a real capital`).toBeTruthy();
    }
  });

  it("indexes by id faithfully", () => {
    for (const c of CAPITALS) expect(CAPITALS_BY_ID[c.id]).toBe(c);
  });
});
