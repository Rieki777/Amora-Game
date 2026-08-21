/**
 * The honest Admin nav (L1): which admin tabs exist follows which modules are
 * on, and this file is the single owner of the tab-to-module mapping.
 *
 * Pure on purpose: `navGroups()` in Admin.tsx stays a literal list of
 * everything the panel CAN show, and `filterNavByModules` decides what this
 * village's Admin DOES show, so the two concerns never tangle and the filter
 * is testable without rendering anything.
 */
import type { ModuleLifecycle } from "@shared/modules";

/**
 * Admin tab key -> module id. A tab named here renders only while its module
 * is not off, and carries the module's lifecycle as a badge. Every tab NOT
 * named here is a platform tab and always renders.
 *
 * `resources-admin` and `intents-admin` are mapped ahead of their modules
 * (L3's `resources`, L7's `introductions`): an id the registry does not know
 * reads as off, so those tabs stay hidden until their lanes land, and neither
 * lane has to edit this map to get the hiding right.
 *
 * Measured, not assumed: `org-chart` and `seasons-patterns` stay platform
 * tabs because `/api/org` and `/api/admin/seasons/patterns` mount behind no
 * requireModule and both surfaces work with `map` off.
 */
export const TAB_MODULE: Record<string, string> = {
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
};

/** The badge an admin tab wears: where its module stands right now. */
export type TabBadge = "preview" | "members" | "everyone";

export function tabBadge(lifecycle: ModuleLifecycle | undefined): TabBadge | undefined {
  if (lifecycle === "preview") return "preview";
  if (lifecycle === "members") return "members";
  if (lifecycle === "public") return "everyone";
  return undefined;
}

interface FilterableItem {
  key: string;
  badge?: TabBadge;
}

interface FilterableGroup<I extends FilterableItem> {
  title: string;
  items: I[];
}

/**
 * Drop every tab whose module is off, badge the rest with where their module
 * stands, and drop a group that ends up empty (a bare title is not a menu).
 *
 * `lifecycles` null or undefined means the admin modules payload has not
 * arrived yet: filter NOTHING, so a slow link shows the full rail instead of
 * flashing an empty one. An id missing from the record reads as off, which is
 * exactly the delta-off rule the server lives by.
 */
export function filterNavByModules<I extends FilterableItem, G extends FilterableGroup<I>>(
  groups: G[],
  lifecycles: Record<string, ModuleLifecycle> | null | undefined,
): G[] {
  if (!lifecycles) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((item) => {
          const moduleId = TAB_MODULE[item.key];
          if (!moduleId) return true;
          return (lifecycles[moduleId] ?? "off") !== "off";
        })
        .map((item) => {
          const moduleId = TAB_MODULE[item.key];
          const badge = moduleId ? tabBadge(lifecycles[moduleId]) : undefined;
          return badge ? { ...item, badge } : item;
        }),
    }))
    .filter((g) => g.items.length > 0);
}
