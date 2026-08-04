/**
 * Header navigation config: the group tree and the account menu.
 *
 * One source for BOTH the desktop bar and the mobile drawer. Those were two
 * hand-written copies of the same seventeen links, and they had already drifted:
 * the drawer was missing the Launch Plan entry and rendered its preview badges
 * with different markup. A fork changes its menu by editing THIS file only.
 *
 * Shape rules that the Layout depends on:
 *  - A group renders nothing at all when every child is filtered out, so a fork
 *    with its optional modules off never gets an empty dropdown.
 *  - `module` hides a link unless that module is on for the viewer. Ids match
 *    shared/modules.ts, which is why they do not always match the label or the
 *    route (stays -> /stay, health -> /village-health, exchange -> /tokens).
 *  - `roles` hides a link unless the signed-in member holds one of them.
 */
import {
  TrendingUp,
  Users,
  Home as HomeIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  /** Second line in the dropdown. Only the join paths use one. */
  subtitle?: string;
  icon?: LucideIcon;
  /** Module id from shared/modules.ts. Absent means always visible. */
  module?: string;
  /** Signed-in roles allowed to see this. Absent means everyone. */
  roles?: readonly string[];
  /** Amber treatment, for the one team-only entry. */
  accent?: boolean;
};

export type NavGroup = {
  label: string;
  items: readonly NavLink[];
};

export type NavEntry = NavLink | NavGroup;

export const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

/**
 * The bar, left to right. Six entries plus the account menu, down from
 * seventeen. The count is the point: at seventeen the bar measured ~1250px and
 * could only render from `xl`, which left every viewport between 768px and
 * ~1310px with no desktop navigation at all.
 */
export const NAV: readonly NavEntry[] = [
  { href: "/", label: "Home" },
  { href: "/quests", label: "Quests" },
  {
    label: "Community",
    items: [
      { href: "/feed", label: "Feed", module: "feed" },
      { href: "/forum", label: "Forum", module: "forum" },
      { href: "/circles", label: "Circles" },
      { href: "/roles", label: "Roles" },
    ],
  },
  {
    label: "Village",
    items: [
      { href: "/map", label: "Map", module: "map" },
      { href: "/stay", label: "Stay", module: "stays" },
      { href: "/library", label: "Library", module: "library" },
      { href: "/tools", label: "Tools", module: "tools" },
      { href: "/village-health", label: "Health", module: "health" },
      { href: "/tokens", label: "Tokens", module: "exchange" },
    ],
  },
  {
    label: "Join",
    items: [
      { href: "/investor", label: "Investor", subtitle: "Capital Contributor", icon: TrendingUp },
      { href: "/steward", label: "Village Steward", subtitle: "Co-Creator", icon: Users },
      { href: "/resident", label: "Resident", subtitle: "Co-Creator", icon: HomeIcon },
      { href: "/prosperity", label: "Prosperity Creator", subtitle: "Business Builder", icon: Sparkles },
      { href: "/work-with-us", label: "Work With Us" },
    ],
  },
  {
    label: "About",
    items: [
      { href: "/how-we-create", label: "How We Create" },
      { href: "/governance", label: "Governance" },
      { href: "/master-plan", label: "Master Plan" },
      { href: "/team", label: "Our Team" },
      { href: "/game-mechanics", label: "Game Mechanics" },
      {
        href: "/journey-to-launch",
        label: "🌳 Launch Plan",
        roles: ["admin", "founder"],
        accent: true,
      },
    ],
  },
];

/**
 * The signed-in avatar menu. Sign out is NOT here: it is rendered separately at
 * the foot of the dropdown, below a divider, because it is the one entry that
 * ends the session on every device and it used to sit twelve pixels from the
 * profile link in the open bar.
 *
 * Wallet points into the profile page, which is where a member's own balances
 * live. The village exchange keeps its own page under Village.
 */
export const ACCOUNT_MENU: readonly NavLink[] = [
  { href: "/profile", label: "My Profile" },
  { href: "/profile#wallet", label: "Wallet", module: "exchange" },
  { href: "/badges", label: "Badges", module: "badges" },
  { href: "/admin", label: "Village Settings", roles: ["admin", "founder"] },
];
