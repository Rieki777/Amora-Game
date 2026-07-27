/**
 * THE module registry (S13). One list of everything the platform can be,
 * shared by server and client. This file is the single framework — the
 * per-module `<module>.enabled` game variables that older design docs
 * sketched are void; enablement lives in module_settings, read through
 * server/lib/modules.ts, and NOWHERE else.
 *
 * Names and descriptions here are founder-facing catalog copy for the Admin
 * Modules tab — platform language, never one village's brand.
 */
import type { Capability } from "./capabilities";

export type ModuleLifecycle = "off" | "preview" | "members" | "public";

/** Rank order for posture comparisons: off < preview < members < public. */
export const LIFECYCLE_RANK: Record<ModuleLifecycle, number> = {
  off: 0,
  preview: 1,
  members: 2,
  public: 3,
};

export interface ModuleDef {
  id: string;
  /** Founder-facing catalog name (platform copy, no village brand). */
  name: string;
  description: string;
  /** Core modules are listed for legibility but cannot be disabled in v1. */
  core?: boolean;
  /** Hard dependencies: block enabling this while one is off, and block
   *  disabling a dependency while this is non-off. */
  requires: string[];
  /** Soft dependencies: the admin panel warns, never blocks. */
  recommends: string[];
  /** Capability keys this module ADDS to the one gate — never a second
   *  permission mechanism. */
  capabilities: Capability[];
  /** Namespaced game-variable keys ('tools.*'); Admin hides the group while
   *  the module is off. */
  variableKeys: string[];
  /** API prefixes mounted behind requireModule(id). */
  apiPrefixes: string[];
  /** Named Hypha deep links this module's UI renders. */
  hyphaLinks?: string[];
  /** Show the legal caution card before enabling (funds-bearing modules).
   *  Enabling is REFUSED outright while ops/auth preconditions fail. */
  legalReview?: boolean;
  /** Share-like surface: deep-link display only, never a mint path. */
  hyphaOnly?: boolean;
  /** The ONE module allowed to sell this token slug for fiat (economy
   *  invariant #3: a token has at most one selling module — boot-asserted). */
  sellsToken?: string;
  /** Validate structural config before write; return a human message or null. */
  validateConfig?: (config: unknown) => string | null;
  /** Default structural config, seeded when the module first configures. */
  defaultConfig?: Record<string, any>;
  /** Open economic state that blocks disabling (invariant #13): count > 0
   *  refuses `off` with settle-first guidance. */
  openStateCheck?: () => Promise<{ count: number; description: string }> | { count: number; description: string };
}

export const MODULES: ModuleDef[] = [
  // ── Core: the game the platform is born playing. Listed so the catalog is
  //    honest about what exists; not disableable in v1. ──────────────────────
  {
    id: "quests",
    name: "Quests",
    description: "The contribution board: post work, claim it, submit it, consent to release recognition.",
    core: true,
    requires: [],
    recommends: [],
    capabilities: ["quest.propose", "quest.consent"],
    variableKeys: ["quest.consent_cap_mode", "quest.consent_cap_multiplier", "quest.require_submission_before_consent"],
    apiPrefixes: ["/api/quests", "/api/game/quests"],
  },
  {
    id: "gratitude",
    name: "Gratitude",
    description: "Recognition sends, lunar cycles, and the value pool distributed at each close.",
    core: true,
    requires: [],
    recommends: [],
    capabilities: [],
    variableKeys: [
      "gratitude.base_budget",
      "gratitude.require_message",
      "gratitude.max_per_recipient_per_cycle",
      "gratitude.pool_per_cycle",
      "gratitude.pool_token",
    ],
    apiPrefixes: ["/api/game/gratitude", "/api/game/cycle"],
  },
  {
    id: "progression",
    name: "Stages & Roles",
    description: "The path from guest to co-creator: stages, capabilities, and appointed roles.",
    core: true,
    requires: [],
    recommends: [],
    capabilities: ["proposal.open", "proposal.decide"],
    variableKeys: [],
    apiPrefixes: ["/api/game/progression", "/api/roles"],
  },
  {
    id: "profiles",
    name: "Profiles",
    description: "Member identity: handles, journeys, balances, and each member's own ledger.",
    core: true,
    requires: [],
    recommends: [],
    capabilities: [],
    variableKeys: [],
    apiPrefixes: ["/api/profile"],
  },

  // ── Optional modules. Everything ships OFF; enabling is a deliberate,
  //    per-deployment admin act. ──────────────────────────────────────────────
  {
    id: "map",
    name: "Village Map",
    description:
      "The living org chart: circles, the roles that orbit them, who holds each seat, which seats are open calls — plus a concierge that routes 'I want to help with X' to the right person.",
    requires: [],
    recommends: [],
    capabilities: ["map.viewPeople", "map.contact"],
    variableKeys: [
      "map.public_structure",
      "map.concierge_enabled",
      "map.contact_daily_cap",
      "map.contact_recipient_daily_cap",
      "map.show_quests",
      "map.vacant_highlight",
      "map.contact_retention_days",
    ],
    apiPrefixes: ["/api/map", "/api/circles"],
    defaultConfig: { circlesSource: "platform" },
  },
  {
    id: "forum",
    name: "Forum & Decisions",
    description:
      "Village conversations: threads by circle-of-life category, @mentions, thread follows, community moderation — and the decision primitive, where proposals are opened and outcomes recorded.",
    requires: [],
    recommends: ["map"],
    capabilities: ["forum.post", "forum.moderate"],
    variableKeys: ["forum.report_hide_threshold"],
    apiPrefixes: ["/api/forum"],
    defaultConfig: {
      categories: [
        { id: "village-life", label: "Village Life", sortOrder: 1 },
        { id: "projects", label: "Projects & Work", sortOrder: 2 },
        { id: "governance", label: "Governance", sortOrder: 3 },
        { id: "questions", label: "Questions & Help", sortOrder: 4 },
      ],
    },
    validateConfig: (c: any) => {
      if (!c || typeof c !== "object" || !Array.isArray(c.categories)) {
        return "config must be { categories: [{id, label, sortOrder}] }";
      }
      for (const cat of c.categories) {
        if (!cat?.id || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(cat.id))) {
          return `category id "${String(cat?.id)}" must be a lowercase slug`;
        }
        if (!cat?.label) return `category "${cat.id}" needs a label`;
      }
      const ids = c.categories.map((x: any) => x.id);
      if (new Set(ids).size !== ids.length) return "category ids must be unique";
      return null;
    },
  },
  {
    id: "feed",
    name: "Village Feed",
    description:
      "The everyday stream: microposts, events and announcements from one forum category, woven with the village's own milestones — where a tap of appreciation is a real gift from your cycle budget.",
    // A hard dependency, on purpose: the feed is a LENS over forum threads.
    requires: ["forum"],
    recommends: [],
    capabilities: ["feed.announce"],
    variableKeys: ["feed.category_slug", "feed.heart_amount", "feed.max_hearts_per_recipient_per_cycle"],
    apiPrefixes: ["/api/feed"],
  },
  {
    id: "stays",
    name: "Stays",
    description:
      "Accommodation on stay credits: rooms post credit (and optional USD) prices per audience, credits are bought or earned through work-exchange quests, and one credit hosts one night. Funds-bearing — read the legal card before enabling.",
    requires: [],
    recommends: ["quests"],
    capabilities: ["stay.member_rate"],
    variableKeys: [
      "stay.guest_booking_enabled",
      "stay.autopay_default",
      "stay.autopay_post_hour",
      "stay.low_balance_warn_nights",
      "stay.grace_nights",
      "stay.max_purchase_nights",
      "stay.credit_expiry_days",
      "stay.credits_transferable",
      "stay.work_exchange_tag",
      "payments.purchase_limit_per_order_usd",
      "payments.purchase_limit_30d_usd",
      "payments.purchase_limit_annual_usd",
    ],
    apiPrefixes: ["/api/stays"],
    legalReview: true,
    // Economy invariant #3: stays is the ONE module that may sell stay-credit
    // for fiat. Boot-asserted against every other module's claim.
    sellsToken: "stay-credit",
    // openStateCheck is attached by the server at boot (it needs the pool);
    // the shared registry stays import-clean for the client bundle.
  },
  {
    id: "health",
    name: "Village Health",
    description:
      "The village's vital signs: per-lunation snapshots frozen at each cycle close, the land's own regeneration ledger (trees, water, hectares — absolute counts, never leaderboards), and season goals. Snapshot COLLECTION runs from the day this ships; turn the dashboard on once a few lunations of history exist.",
    requires: [],
    recommends: ["gratitude", "quests"],
    capabilities: [],
    variableKeys: [],
    apiPrefixes: ["/api/health"],
  },
  {
    id: "library",
    name: "Material Library",
    description:
      "The village's shared tools and goods: donate an item and earn library credits (appraised, capped, dual-signed above a threshold), then borrow against an escrowed deposit. Credits are backed by the shelves and never trade.",
    requires: [],
    recommends: [],
    capabilities: [],
    variableKeys: [
      "library.intake_award_pct",
      "library.intake_member_cycle_cap",
      "library.intake_dual_signoff_over",
      "library.escrow_pct",
      "library.usage_fee_pct",
      "library.loan_days_default",
      "library.dispute_deadline_days",
    ],
    apiPrefixes: ["/api/library"],
    // openStateCheck attached by the server at boot: open loans block off.
  },
  {
    id: "badges",
    name: "Badges & Skills",
    description:
      "Recognition of who people are and what they can do: self-declared skills, badges earned from settled contribution, granted honors — and warning badges that suspend specific capabilities until resolved. Earned badges never ride applause metrics into permissions.",
    requires: [],
    recommends: ["quests"],
    capabilities: [],
    variableKeys: [],
    apiPrefixes: ["/api/badges"],
    // openStateCheck attached by the server at boot (needs the pool):
    // standing warnings are live governance and block a silent off.
  },
  {
    id: "exchange",
    name: "Exchange",
    description:
      "Buy the village's own platform tokens for fiat, out of a stocked treasury — buy-only in v1. Recognition and Hypha-governed tokens can never be listed; a token another module sells can't be listed twice. Funds-bearing — read the legal card before enabling.",
    requires: [],
    recommends: [],
    capabilities: ["exchange.buy", "exchange.manage"],
    variableKeys: [
      "exchange.price_change_max_pct",
      "payments.purchase_limit_per_order_usd",
      "payments.purchase_limit_30d_usd",
      "payments.purchase_limit_annual_usd",
    ],
    apiPrefixes: ["/api/exchange"],
    legalReview: true,
    // Swapping is a v2 engine; the CONTRACT ships now so forks configure
    // against a stable shape. true answers 501 until the engine exists.
    defaultConfig: { tradingEnabled: false },
    validateConfig: (c: any) => {
      if (!c || typeof c !== "object") return "config must be an object";
      if (typeof c.tradingEnabled !== "boolean") return "tradingEnabled must be true or false";
      return null;
    },
    // openStateCheck attached by the server at boot (needs the pool).
  },
  {
    id: "tools",
    name: "Tools Hub",
    description:
      "An audience-aware registry of the village's tools — one place to find the chat, the documents, the governance space — with a pinned card that deep-links to your Hypha DHO.",
    requires: [],
    recommends: [],
    capabilities: [],
    variableKeys: ["tools.click_tracking", "tools.link_check_days"],
    apiPrefixes: ["/api/tools"],
    hyphaLinks: ["governance", "proposals", "treasury", "members"],
    defaultConfig: {
      categories: [
        { id: "governance", label: "Governance", sortOrder: 1 },
        { id: "communication", label: "Communication", sortOrder: 2 },
        { id: "documents", label: "Documents", sortOrder: 3 },
        { id: "coordination", label: "Coordination", sortOrder: 4 },
      ],
    },
    validateConfig: (c: any) => {
      if (!c || typeof c !== "object" || !Array.isArray(c.categories)) {
        return "config must be { categories: [{id, label, sortOrder}] }";
      }
      for (const cat of c.categories) {
        if (!cat?.id || typeof cat.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(cat.id)) {
          return `category id "${String(cat?.id)}" must be a lowercase slug`;
        }
        if (!cat?.label || typeof cat.label !== "string") return `category "${cat.id}" needs a label`;
      }
      const ids = c.categories.map((x: any) => x.id);
      if (new Set(ids).size !== ids.length) return "category ids must be unique";
      return null;
    },
  },
];

export const MODULES_BY_ID: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
);
