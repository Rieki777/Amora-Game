import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_GROUPS, BUILD_A_MODULE_URL, BUILDER_GUIDE_URL } from "./moduleCatalog";
import { MODULES, MODULES_BY_ID } from "./modules";

/**
 * The registry and the catalog move together, and this file is what makes
 * that a build fact instead of a habit. Everything iterates over MODULES
 * itself, never over a copied list of ids, so a later lane that adds a module
 * to BOTH `MODULES` and `MODULE_CATALOG` passes untouched, and one that adds
 * to only one of the two fails with the module named.
 */
describe("moduleCatalog", () => {
  const groupIds = new Set(MODULE_GROUPS.map((g) => g.id));

  it("every registry entry has a catalog entry, a group and a setup", () => {
    for (const m of MODULES) {
      expect(MODULE_CATALOG[m.id], `module "${m.id}" has no MODULE_CATALOG entry`).toBeTruthy();
      expect(m.group, `module "${m.id}" declares no group`).toBeTruthy();
      expect(groupIds.has(m.group!), `module "${m.id}" group "${m.group}" is not a shelf`).toBe(true);
      expect(m.setup, `module "${m.id}" declares no setup`).toBeTruthy();
      expect(["none", "optional", "required"]).toContain(m.setup);
    }
  });

  it("no catalog entry points at a module that does not exist", () => {
    const known = new Set(MODULES.map((m) => m.id));
    for (const id of Object.keys(MODULE_CATALOG)) {
      expect(known.has(id), `MODULE_CATALOG["${id}"] names no registry module`).toBe(true);
    }
  });

  it("every entry carries the full card: promise, 3..5 benefits, forWhom, summaries, hue, emblem", () => {
    for (const m of MODULES) {
      const e = MODULE_CATALOG[m.id];
      expect(e.promise.trim().length, `"${m.id}" promise is empty`).toBeGreaterThan(0);
      expect(e.benefits.length, `"${m.id}" needs 3 to 5 benefits`).toBeGreaterThanOrEqual(3);
      expect(e.benefits.length, `"${m.id}" needs 3 to 5 benefits`).toBeLessThanOrEqual(5);
      for (const b of e.benefits) expect(b.trim().length).toBeGreaterThan(0);
      expect(e.forWhom.trim().length, `"${m.id}" forWhom is empty`).toBeGreaterThan(0);
      expect(e.setupSummary.trim().length, `"${m.id}" setupSummary is empty`).toBeGreaterThan(0);
      expect(e.dataSummary.trim().length, `"${m.id}" dataSummary is empty`).toBeGreaterThan(0);
      expect(Number.isInteger(e.hue) && e.hue >= 0 && e.hue < 360, `"${m.id}" hue must be 0..359`).toBe(true);
      expect(e.emblem.trim().length, `"${m.id}" emblem is empty`).toBeGreaterThan(0);
    }
  });

  it("the shelves are exactly five, ordered, unique, and none stands empty", () => {
    expect(MODULE_GROUPS.length).toBe(5);
    expect(new Set(MODULE_GROUPS.map((g) => g.id)).size).toBe(5);
    for (const g of MODULE_GROUPS) {
      expect(g.label.trim().length).toBeGreaterThan(0);
      expect(g.gloss.trim().length).toBeGreaterThan(0);
      const members = MODULES.filter((m) => m.group === g.id);
      expect(members.length, `shelf "${g.id}" holds no modules`).toBeGreaterThan(0);
    }
  });

  it("the two renamed cards read as ruled: How Power Is Held, Village Calendar", () => {
    expect(MODULES_BY_ID.map.name).toBe("How Power Is Held");
    expect(MODULE_CATALOG.map.promise).toContain("Living Map of the land");
    expect(MODULES_BY_ID.events.name).toBe("Village Calendar");
  });

  it("the calendar knobs ride the events module's variable list", () => {
    for (const key of ["calendar.year_anchor", "calendar.hemisphere", "calendar.cross_quarters"]) {
      expect(MODULES_BY_ID.events.variableKeys).toContain(key);
    }
  });

  it("the builder links point into the upstream repository's module docs", () => {
    expect(BUILD_A_MODULE_URL.startsWith("https://")).toBe(true);
    expect(BUILD_A_MODULE_URL.endsWith("/BUILDING_A_MODULE.md")).toBe(true);
    // Same repository, same directory: only the final file name differs.
    expect(BUILD_A_MODULE_URL.replace(/[^/]+$/, "")).toBe(BUILDER_GUIDE_URL.replace(/[^/]+$/, ""));
  });
});
