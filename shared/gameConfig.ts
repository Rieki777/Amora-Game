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

/**
 * An on-chain token the platform DISPLAYS but does not control. The address and
 * chain identify it on Base; balances are read through a public RPC and shown on
 * profiles and the economics section. Hypha remains the source of truth for the
 * value itself. Empty `address` means "not deployed yet, show nothing".
 */
export interface TokenRef {
  /** Display symbol, e.g. "AMORA" or "VOICE". */
  symbol: string;
  /** Human name, e.g. "Amora Equity". */
  name: string;
  /** ERC-20 contract address on Base, or "" until deployed. */
  address: string;
  /** Chain id. Base mainnet is 8453. */
  chainId: number;
  /** Token decimals, for formatting balances. */
  decimals: number;
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
    /** What a committed member is called (e.g. Amora Family member, Citizen, Villager). */
    memberName: string;
    location: string;
    /** ISO 3166 alpha-2 country the project lives in (0083, P8). Blank means
     *  unsaid, and money display falls back to the universal CHF default. */
    country: string;
    /** ISO 4217 currency the project counts in (Amora: CRC). DISPLAY only:
     *  Stripe settlement and the ledger never read this. */
    fiatCurrency: string;
    adminPath: string;
    /** The project's OUTSIDE website. Blank hides every "Main Site" link —
     *  a fork with no external site shows no link rather than a dead one. */
    siteUrl: string;
    /** Optional events page. Blank hides the footer Events link. */
    eventsUrl: string;
    /** The one-sentence footer introduction under the logo. */
    footerBlurb: string;
  };
  currency: {
    /** The in-site recognition currency (e.g. Gratitude, Seeds, Thanks).
     *  Earned from consented quests, sent peer to peer, settled on lunar cycles.
     *  Platform-governed. This is NOT the equity token, even when a project
     *  wants to brand its equity "Gratitude" too: keep them separate here. */
    name: string;
    /** Sentence-position variant, e.g. "gratitude" in "send gratitude". */
    nameLower: string;
    /** The project's EQUITY token, on Base, governed by Hypha. The platform
     *  never mints, moves, or prices it: it reads balances and displays them. */
    equity: TokenRef;
    /** Governance-weight token, on Base, also Hypha-governed. Read-only here. */
    voice: TokenRef;
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
    /** Header logo (on the primary-colour nav). ~64px tall, width auto. */
    logo: string;
    /** Footer/secondary mark. ~90px tall, width auto. */
    heartLogo: string;
    /** Browser tab icon, swapped in client-side once config loads. */
    favicon: string;
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
  season: SeasonConfig;
}

/** One season. `endsOn` is the turn date: the day this season hands over to the
 *  next one (so it belongs to the next season, not this one). */
export interface SeasonEntry {
  id: string;
  name: string;
  theme: string;
  focus: string;
  startsOn: string; // ISO date, inclusive
  /** ISO date, exclusive, the day the season turns. EMPTY means open-ended:
   *  it runs until somebody starts the next one, which is what a founding
   *  season does. */
  endsOn: string;
  /**
   * The season PATTERN this season runs (0050): which circles, seats, badges
   * and quests are live while it is current. Empty means the season carries
   * no pattern, which is every village that has not opted in, and nothing
   * about their structure changes at a turn.
   */
  patternId?: string;
  /** What this season is actually trying to achieve. Shown on the banner//season. */
  goals: { text: string; done: boolean }[];
}

export interface SeasonConfig {
  /** Seed values for data/season.json — editable in Admin after first boot.
   *  Seasons are a LIST so the server can pick the current one by date. A single
   *  season with a passed end date is how a banner silently starts lying. */
  seasons: SeasonEntry[];
  /** How this project paces its seasons. Drives the "queue next season" helper;
   *  projects differ (quarters, solstices, lunar cycles). */
  cadence: "quarterly" | "solstice-equinox" | "lunar" | "custom";
  /** IANA zone the season turns in — a season turn is a ritual moment, and UTC
   *  midnight is not midnight where the village lives. */
  timezone: string;
}

// ── AMORA CONFIGURATION (edit below for a new project) ───────────────────────

export const GAME_CONFIG: GameConfig = {
  project: {
    name: "Amora",
    tagline: "Co-Become the Most Beautiful Village",
    memberName: "Amora Family member",
    location: "Dominicalito, Costa Rica",
    country: "CR",
    fiatCurrency: "CRC",
    adminPath: "/admin",
    siteUrl: "https://amora.cr",
    eventsUrl: "https://amora.cr/events/",
    footerBlurb: "A regenerative village in Costa Rica where all beings belong and thrive.",
  },

  currency: {
    name: "Gratitude",
    nameLower: "gratitude",
    // The equity token is also called "Amora" per the project's wish. It stays
    // distinct from Gratitude above: Gratitude is in-site recognition, Amora is
    // equity on Base under Hypha. Addresses are blank until the tokens deploy;
    // the economics section shows nothing rather than a fake balance meanwhile.
    equity: { symbol: "AMORA", name: "Amora Equity", address: "", chainId: 8453, decimals: 18 },
    voice: { symbol: "VOICE", name: "Amora Voice", address: "", chainId: 8453, decimals: 18 },
  },

  images: {
    hero: "https://amora.cr/wp-content/uploads/2025/11/4.jpg",
    investorHero: "https://amora.cr/wp-content/uploads/2025/11/Shared-Governance-1024x683.jpg",
    residentHero: "https://amora.cr/wp-content/uploads/2026/02/Land-Tour-3-1024x724.jpg",
    stewardHero: "https://amora.cr/wp-content/uploads/2025/11/Planting-Trees.jpg",
    prosperityHero: "https://amora.cr/wp-content/uploads/2026/02/Holistic-Wellbeing-1024x1024.jpg",
    masterPlanHero: "https://amora.cr/wp-content/uploads/2025/11/4.jpg",
    // WebP, and sized to what the markup actually draws: the header mark is
    // 64px tall and the footer mark 90px, so 320px on the long edge covers a
    // 3x screen with room over. The favicon stays PNG on purpose - it is also
    // the apple-touch-icon and the sole PWA manifest icon, and neither of
    // those has dependable WebP support.
    logo: "/assets/images/Amora-2-Beige.webp",
    heartLogo: "/assets/images/Amora-Beige.webp",
    favicon: "/assets/images/Amora-2-Green1.png",
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
    { id: "member", name: "Member", description: "Signed the Love Letter and joined the Amora Family.", rule: { type: "membership" }, gratitudeMultiplier: 2 },
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
    cadence: "solstice-equinox",
    timezone: "America/Costa_Rica",
    seasons: [
      {
        id: "foundations-2026",
        name: "Season of Foundations",
        theme: "Building and Preparing",
        focus: "Site planning, first structures, and growing the founding community.",
        startsOn: "2026-06-21",
        endsOn: "2026-09-22",
        goals: [
          { text: "Master plan reviewed and agreed", done: false },
          { text: "First homes designed and costed", done: false },
          { text: "Founding circle fully assembled", done: false },
        ],
      },
      {
        id: "rooting-2026",
        name: "Season of Rooting",
        theme: "Planting and Deepening",
        focus: "First builds underway, food forests planted, and the circles finding their rhythm.",
        startsOn: "2026-09-22",
        endsOn: "2026-12-21",
        goals: [
          { text: "Ground broken on the first structures", done: false },
          { text: "Food forest phase one planted", done: false },
        ],
      },
    ],
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
