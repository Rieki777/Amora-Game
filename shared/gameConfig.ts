/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  GAME CONFIG — THE WHITE-LABEL SWAP POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *  This file is the single source of truth for everything project-specific in
 *  the Village Coordination Game platform. Amora is the first project built on
 *  this foundation; to stand up a new project, you should only need to:
 *
 *    1. Replace the values in this file (names, stages, paths, actions)
 *    2. Swap the CSS theme tokens (client/src/index.css)
 *    3. Replace the content seeds (data/*-seed.json, server DEFAULT_* constants)
 *
 *  Nothing in server logic or client components should hardcode the project
 *  name, the currency name, the member name, or the stage ladder — they all
 *  read from here. If you find a hardcoded "Amora" or "Gratitude" outside this
 *  file (except in content seeds), that's a bug in the platform.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types (platform-level, do not edit per project) ──────────────────────────

export interface GamePath {
  id: string;
  label: string;
  /** Short noun for what this persona contributes */
  role: string;
  route: string;
}

export type StageRule =
  | { type: "default" }                       // everyone starts here
  | { type: "account" }                       // has created an account
  | { type: "training-complete" }             // finished all training modules
  | { type: "membership" }                    // signed the membership covenant
  | { type: "quests"; min: number }           // N consented quest completions
  | { type: "granted" };                      // manually granted by the team

export interface GameStage {
  id: string;
  name: string;
  description: string;
  /** How this stage is earned. "granted" stages are set by the team in Admin. */
  rule: StageRule;
  /** Multiplier applied to the monthly gratitude sending budget. */
  gratitudeMultiplier: number;
}

export interface NextActionRule {
  id: string;
  /** Condition evaluated server-side against the player's game state. */
  when:
    | "no-training"
    | "no-membership"
    | "no-quest-claimed"
    | "quest-in-progress"
    | "gratitude-unspent"
    | "always";
  label: string;
  href: string;
}

export interface GameConfig {
  project: {
    name: string;
    tagline: string;
    /** What a committed member is called (e.g. Amoracita, Citizen, Villager). */
    memberName: string;
    location: string;
    adminPath: string;
  };
  currency: {
    /** The community recognition currency (e.g. Gratitude, Seeds, Thanks). */
    name: string;
    /** Sentence-position variant, e.g. "gratitude" in "send gratitude". */
    nameLower: string;
  };
  /** Hero images rendered by React pages. Runtime-swappable via the brand overlay
   * (the Setup Wizard). og:image and favicon are build-time in index.html, not here. */
  images: {
    hero: string;
    investorHero: string;
    residentHero: string;
    stewardHero: string;
    prosperityHero: string;
    masterPlanHero: string;
  };
  paths: GamePath[];
  /** The progression ladder, in order. First stage is the default. */
  stages: GameStage[];
  gratitude: {
    /** Base sending budget per calendar-month cycle (before stage multiplier). */
    monthlyBudget: number;
    /** Max sends to the same recipient per cycle. */
    maxPerRecipientPerCycle: number;
    /** A message is required with every acknowledgment. */
    requireMessage: boolean;
  };
  /** Ordered: the first matching rule becomes the player's next-best-action. */
  nextActions: NextActionRule[];
  season: {
    /** Seed values for data/season.json — editable in Admin after first boot. */
    name: string;
    theme: string;
    focus: string;
    startsOn: string; // ISO date
    endsOn: string;   // ISO date
  };
}

// ── AMORA CONFIGURATION (edit below for a new project) ───────────────────────

export const GAME_CONFIG: GameConfig = {
  project: {
    name: "Amora",
    tagline: "Co-Become the Most Beautiful Village",
    memberName: "Amoracita",
    location: "Dominicalito, Costa Rica",
    adminPath: "/admin",
  },

  currency: {
    name: "Gratitude",
    nameLower: "gratitude",
  },

  images: {
    hero: "https://amora.cr/wp-content/uploads/2025/11/4.jpg",
    investorHero: "https://amora.cr/wp-content/uploads/2025/11/Shared-Governance-1024x683.jpg",
    residentHero: "https://amora.cr/wp-content/uploads/2026/02/Land-Tour-3-1024x724.jpg",
    stewardHero: "https://amora.cr/wp-content/uploads/2025/11/Planting-Trees.jpg",
    prosperityHero: "https://amora.cr/wp-content/uploads/2026/02/Holistic-Wellbeing-1024x1024.jpg",
    masterPlanHero: "https://amora.cr/wp-content/uploads/2025/11/4.jpg",
  },

  paths: [
    { id: "investor", label: "Investor", role: "Capital Contributor", route: "/investor" },
    { id: "steward", label: "Village Steward", role: "Co-Creator", route: "/steward" },
    { id: "resident", label: "Resident", role: "Co-Creator", route: "/resident" },
    { id: "prosperity-creator", label: "Prosperity Creator", role: "Business Builder", route: "/prosperity" },
  ],

  // Amora's Path of Growth (from the Game Guide). Stages are earned by real
  // acts, never abstract points. "granted" stages are recognized by the team.
  stages: [
    { id: "visitor", name: "Visitor", description: "Discovering what this village is.", rule: { type: "default" }, gratitudeMultiplier: 0 },
    { id: "guest", name: "Guest", description: "Created a profile and stepped inside.", rule: { type: "account" }, gratitudeMultiplier: 1 },
    { id: "immersant", name: "Immersant", description: "Spent immersive time with the community.", rule: { type: "granted" }, gratitudeMultiplier: 1 },
    { id: "participant", name: "Participant", description: "Completed community training.", rule: { type: "training-complete" }, gratitudeMultiplier: 1 },
    { id: "member", name: "Member", description: "Signed the Love Letter and became an Amoracita.", rule: { type: "membership" }, gratitudeMultiplier: 2 },
    { id: "contributor", name: "Contributor", description: "Completed a first quest for the village.", rule: { type: "quests", min: 1 }, gratitudeMultiplier: 2 },
    { id: "quest-seeker", name: "Quest Seeker", description: "Contributing steadily through quests.", rule: { type: "quests", min: 3 }, gratitudeMultiplier: 2 },
    { id: "initiate", name: "Initiate", description: "Walking the Co-Creator Right of Passage.", rule: { type: "granted" }, gratitudeMultiplier: 2 },
    { id: "co-creator", name: "Co-Creator", description: "Consented by the Co-Creators circle.", rule: { type: "granted" }, gratitudeMultiplier: 3 },
    { id: "role-holder", name: "Role Holder", description: "Holding a seasonal role for the village.", rule: { type: "granted" }, gratitudeMultiplier: 3 },
    { id: "guide", name: "Guide", description: "Seven or more years of stewardship.", rule: { type: "granted" }, gratitudeMultiplier: 4 },
    { id: "sage", name: "Sage", description: "Twenty-one or more years of stewardship.", rule: { type: "granted" }, gratitudeMultiplier: 5 },
  ],

  gratitude: {
    monthlyBudget: 100,
    maxPerRecipientPerCycle: 1,
    requireMessage: true,
  },

  nextActions: [
    { id: "training", when: "no-training", label: "Continue your community training", href: "/training" },
    { id: "membership", when: "no-membership", label: "Sign the Love Letter", href: "/love-letter" },
    { id: "first-quest", when: "no-quest-claimed", label: "Claim your first quest", href: "/quests" },
    { id: "finish-quest", when: "quest-in-progress", label: "Finish your active quest", href: "/quests" },
    { id: "send-gratitude", when: "gratitude-unspent", label: "Send gratitude to someone this month", href: "/gratitude" },
    { id: "explore", when: "always", label: "Explore open quests", href: "/quests" },
  ],

  season: {
    name: "Season of Foundations",
    theme: "Building and Preparing",
    focus: "Site planning, first structures, and growing the founding community.",
    startsOn: "2026-06-21",
    endsOn: "2026-09-21",
  },
};

/** Convenience: look up a stage by id, with the default stage as fallback. */
export function getStage(id: string | null | undefined): GameStage {
  return GAME_CONFIG.stages.find((s) => s.id === id) ?? GAME_CONFIG.stages[0];
}

/** Stage index for ordering comparisons (later stages have higher index). */
export function stageIndex(id: string): number {
  return GAME_CONFIG.stages.findIndex((s) => s.id === id);
}
