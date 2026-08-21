import { describe, expect, it } from "vitest";
import type { ModuleLifecycle } from "@shared/modules";
import { filterNavByModules, TAB_MODULE, tabBadge } from "./adminNav";

/**
 * The Admin nav's honesty, as arithmetic: a fresh village shows platform tabs
 * only, a turned-on module shows its tab wearing its lifecycle, and an
 * unloaded catalog filters nothing. These run without rendering a thing,
 * which is the reason the filter lives in a lib.
 */

type Item = { key: string; label: string; badge?: "preview" | "members" | "everyone" };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Submissions",
    items: [
      { key: "submissions", label: "All Forms" },
      { key: "products", label: "Payments" },
      { key: "forum-moderation", label: "Moderation" },
    ],
  },
  {
    title: "The Game",
    items: [
      { key: "modules", label: "Module Library" },
      { key: "tools-admin", label: "Tools" },
      { key: "stays-admin", label: "Stays & Payments" },
      { key: "events-admin", label: "Calendar" },
      { key: "resources-admin", label: "Resources" },
      { key: "intents-admin", label: "Introductions" },
      { key: "tokens", label: "Tokens" },
    ],
  },
  { title: "Only Modules", items: [{ key: "badges-admin", label: "Badges" }] },
];

const off: Record<string, ModuleLifecycle> = {};

describe("adminNav", () => {
  it("filters nothing while the catalog is unloaded", () => {
    expect(filterNavByModules(groups, null)).toEqual(groups);
    expect(filterNavByModules(groups, undefined)).toEqual(groups);
  });

  it("a fresh village keeps platform tabs and Module Library only", () => {
    const out = filterNavByModules(groups, off);
    const keys = out.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toEqual(["submissions", "modules", "tokens"]);
    // A group whose every tab was module-gated does not render a bare title.
    expect(out.map((g) => g.title)).toEqual(["Submissions", "The Game"]);
  });

  it("a module that is on shows its tab wearing where it stands", () => {
    const out = filterNavByModules(groups, {
      tools: "preview",
      stays: "members",
      commerce: "public",
    } as Record<string, ModuleLifecycle>);
    const byKey = Object.fromEntries(out.flatMap((g) => g.items.map((i) => [i.key, i])));
    expect(byKey["tools-admin"].badge).toBe("preview");
    expect(byKey["stays-admin"].badge).toBe("members");
    expect(byKey["products"].badge).toBe("everyone");
    // events stayed off, so Calendar is gone; platform tabs carry no badge.
    expect(byKey["events-admin"]).toBeUndefined();
    expect(byKey["modules"].badge).toBeUndefined();
    expect(byKey["tokens"].badge).toBeUndefined();
  });

  it("tabs mapped ahead of their modules stay hidden until the module exists and is on", () => {
    // resources (L3) and introductions (L7) are not in the registry yet: an
    // unknown id reads as off, so both tabs hide today and appear the day
    // their module serves.
    const out = filterNavByModules(groups, { tools: "public" } as Record<string, ModuleLifecycle>);
    const keys = out.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).not.toContain("resources-admin");
    expect(keys).not.toContain("intents-admin");
    expect(TAB_MODULE["resources-admin"]).toBe("resources");
    expect(TAB_MODULE["intents-admin"]).toBe("introductions");
  });

  it("the mapping is exactly the ruled thirteen", () => {
    expect(TAB_MODULE).toEqual({
      "circles-map": "map",
      "events-admin": "events",
      "tools-admin": "tools",
      "stays-admin": "stays",
      "exchange-admin": "exchange",
      "badges-admin": "badges",
      "library-admin": "library",
      "health-admin": "health",
      "calls-admin": "automation",
      products: "commerce",
      "forum-moderation": "forum",
      "resources-admin": "resources",
      "intents-admin": "introductions",
    });
  });

  it("tabBadge maps the lifecycle words a founder reads", () => {
    expect(tabBadge("preview")).toBe("preview");
    expect(tabBadge("members")).toBe("members");
    expect(tabBadge("public")).toBe("everyone");
    expect(tabBadge("off")).toBeUndefined();
    expect(tabBadge(undefined)).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(groups);
    filterNavByModules(groups, { tools: "public" } as Record<string, ModuleLifecycle>);
    expect(JSON.stringify(groups)).toBe(before);
  });
});
