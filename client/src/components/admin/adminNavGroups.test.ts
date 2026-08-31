import { describe, expect, it } from "vitest";
import { navGroups } from "./adminNavGroups";
import { TAB_MODULE, filterNavByModules } from "@/lib/adminNav";

/**
 * The tab registry, tested against the real thing for the first time.
 *
 * client/src/lib/adminNav.test.ts already covers `filterNavByModules`, but it
 * has to do it against a HAND-WRITTEN fixture list of groups, because
 * `navGroups` was locked inside an 11,000-line page component and nothing could
 * import it. So the filter was proven correct against a copy of the nav, and
 * nothing checked the copy still matched. That is the whole cost of a monolith
 * in one sentence.
 *
 * Now that navGroups is a module, these run against the registry a founder
 * actually sees. The invariants below are the ones that break quietly: a
 * duplicate key means two tabs fight over one panel and the loser is
 * unreachable, and a TAB_MODULE entry naming a tab that does not exist means a
 * module ships with a mapping to nowhere.
 */
const allKeys = (setupComplete: boolean) =>
  navGroups(setupComplete).flatMap((g) => g.items.map((i) => i.key));

describe("navGroups", () => {
  it("gives every tab a key of its own, so no two tabs fight over one panel", () => {
    for (const setupComplete of [true, false]) {
      const keys = allKeys(setupComplete);
      const seen = new Set<string>();
      const duplicates = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
      expect(duplicates, `setupComplete=${setupComplete}`).toEqual([]);
    }
  });

  it("gives every tab a label and an icon, so no row renders blank", () => {
    for (const group of navGroups(true)) {
      expect(group.title.trim()).not.toBe("");
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.label.trim(), item.key).not.toBe("");
        expect(item.icon, item.key).toBeTruthy();
      }
    }
  });

  it("every module-to-tab mapping names a tab that exists", () => {
    const keys = new Set(allKeys(true));
    const danglers = Object.keys(TAB_MODULE).filter((k) => !keys.has(k));
    expect(danglers).toEqual([]);
  });

  it("moves the setup tab from a front door to an ordinary settings row", () => {
    const before = navGroups(false);
    expect(before[0].title).toBe("Start here");
    expect(before[0].items.map((i) => i.key)).toEqual(["setup"]);

    const after = navGroups(true);
    expect(after.map((g) => g.title)).not.toContain("Start here");
    const settings = after.find((g) => g.title === "Settings");
    expect(settings?.items.map((i) => i.key)).toEqual(["setup"]);
    // The key does not change with the group, so a deep link to /admin?tab=setup
    // keeps working either side of setup being finished.
    expect(allKeys(true).filter((k) => k === "setup")).toEqual(["setup"]);
  });

  it("survives the real filter with a catalog that has never loaded", () => {
    // The delta-off rule from adminNav.ts, now exercised on the real registry
    // rather than on a fixture that resembles it.
    expect(filterNavByModules(navGroups(true), null)).toEqual(navGroups(true));
  });

  it("keeps the platform tabs when every module is off", () => {
    const off = Object.fromEntries(
      Object.values(TAB_MODULE).map((m) => [m, "off" as const]),
    );
    const kept = new Set(
      filterNavByModules(navGroups(true), off).flatMap((g) => g.items.map((i) => i.key)),
    );
    // Nothing that is mapped survives, and the unmapped ones all do.
    for (const key of Object.keys(TAB_MODULE)) expect(kept.has(key), key).toBe(false);
    for (const key of allKeys(true)) {
      if (!TAB_MODULE[key]) expect(kept.has(key), key).toBe(true);
    }
  });
});
