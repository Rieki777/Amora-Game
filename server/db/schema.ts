/**
 * Drizzle schema for Amora (Phase 1 of AMORA_FOUNDATION_UPGRADE_PLAN.md).
 *
 * Mirrors the 20 JSON files in data/ exactly as they exist today. Nothing is
 * renamed and nothing is invented: this has to be a faithful shadow of the
 * current state before any route reads from it, or the cutover cannot be
 * verified.
 *
 * Two kinds of file, two kinds of table:
 *
 *  1. COLLECTIONS become real tables with real columns (users, submissions,
 *     quests, claims, gratitude, activity, docs, modules, milestones). These are
 *     records that get created, queried, and counted, and they are the ones the
 *     JSON model handles worst, since every append rewrites the whole array.
 *
 *  2. SINGLETON CONFIG DOCUMENTS stay documents, in one key-value table with a
 *     JSON column (brand, content, faqs, season, settings, and so on). The admin
 *     UI reads and writes each of these wholesale, their shapes are deeply
 *     nested and freely edited, and shredding them into columns would buy
 *     nothing while guaranteeing a migration every time Rye adds a field.
 *
 * MySQL, matching regen-civics so its code ports rather than gets rewritten.
 */
import {
  bigint,
  boolean,
  datetime,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * String ids, not autoincrement. Every existing record already carries an id
 * like `claim-1784...-a1b2` and those ids appear in other files, so renumbering
 * them at import would break the references silently.
 */

// ─── Collections ─────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  /** Self-selected journeys: investor / steward / resident / prosperity-creator. */
  paths: json("paths"),
  /**
   * A CACHE of SUM(token_ledger.amount) for this member's recognition currency,
   * never incremented. Named for the KIND of currency, not any village's brand:
   * "hearts" was Amora's early word for it, and a platform column must not carry
   * one project's naming. The display name lives in shared/gameConfig.ts.
   */
  recognitionBalance: int("recognition_balance").default(0).notNull(),
  contributions: json("contributions"),
  quests: json("quests"),
  /** Per-journey step progress: { journeyId: [stepId, ...] }. Training
   *  completion reads journeys.training and gates stage computation. */
  journeys: json("journeys"),
  /** Member preferences: notification cadence today, contact opt-outs later (0017). */
  prefs: json("prefs"),
  /**
   * The contact opt-out the relay enforces server-side (0018).
   *
   * THIS FILE IS A TYPE MIRROR, NOT A MIGRATION DRIVER. The runner applies
   * `drizzle/*.sql` by hand, so nothing ever fails when a column lands there
   * and not here, and this table drifted quietly for three columns: the
   * opt-out below, `is_example` (0046) and `membership_granted` (0058). If you
   * add a column, add it in both places. `server/repos/users.ts` COLUMNS is the
   * list that actually decides what a write persists.
   */
  contactable: boolean("contactable").default(true).notNull(),
  /** A standing-example identity: content that authors examples, never a person. */
  isExample: boolean("is_example").default(false).notNull(),
  /** An explicit steward grant of membership, as opposed to an attributed signing. */
  membershipGranted: boolean("membership_granted").default(false).notNull(),
  bio: text("bio"),
  avatar: varchar("avatar", { length: 500 }),
  /** Manual admin override of the computed stage. */
  stageGranted: varchar("stage_granted", { length: 64 }),
  trainingComplete: boolean("training_complete").default(false).notNull(),
  /** Admins are real users (decision 2), so audit rows have someone to name. */
  role: varchar("role", { length: 32 }).default("member").notNull(),
  /** Public identifier for @mentions; without it mentions leak email addresses. */
  handle: varchar("handle", { length: 40 }).unique(),
  /** S1 session revocation: tokens carry `v`; a mismatch kills old sessions. */
  tokenVersion: int("token_version").default(0).notNull(),
  /** On-chain identity. Only trusted once control is proven by signature. */
  walletAddress: varchar("wallet_address", { length: 42 }).unique(),
  walletVerifiedAt: timestamp("wallet_verified_at"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const submissions = mysqlTable("submissions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** Form type; routes the notification to a pathway inbox. */
  type: varchar("type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).default("new").notNull(),
  /** The whole submitted payload. Field sets differ per form and change often. */
  data: json("data"),
  /** Set once the accept reward has been granted, so it cannot double-pay. */
  rewarded: boolean("rewarded").default(false).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const quests = mysqlTable("quests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  /** One line under the title, the quest's own voice (0068). */
  subtitle: varchar("subtitle", { length: 160 }),
  description: text("description"),
  impact: text("impact"),
  /** The story layer (0068): why the quest matters, the first small step,
   *  the path through the work, what to share, and a poster. Every column is
   *  nullable, so a board written before 0068 keeps rendering unchanged. */
  story: text("story"),
  firstStep: varchar("first_step", { length: 400 }),
  steps: json("steps"),
  deliverable: varchar("deliverable", { length: 400 }),
  tips: json("tips"),
  imageUrl: varchar("image_url", { length: 500 }),
  /** The advertised range EXACTLY as the village wrote it, e.g. "50-100".
   *  0001 declared this an int because of the name; it never was one. */
  gratitude: varchar("gratitude", { length: 64 }).default("").notNull(),
  /** Parsed bounds, for validation and sums. See shared/questRewards.ts. */
  gratitudeMin: int("gratitude_min").default(0).notNull(),
  gratitudeMax: int("gratitude_max").default(0).notNull(),
  duration: varchar("duration", { length: 64 }),
  difficulty: varchar("difficulty", { length: 32 }),
  circle: varchar("circle", { length: 64 }),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  icon: varchar("icon", { length: 64 }),
  /** Display-only prose. The ENFORCED gates are the two structured columns. */
  roleRequired: varchar("role_required", { length: 64 }),
  /** Structured stage floor the claim gate enforces (0012). */
  minStage: varchar("min_stage", { length: 64 }),
  /** Structured role gate the claim gate enforces (0012). */
  requiresRole: varchar("requires_role", { length: 64 }),
  /** Second currency released in the same consent transaction, never blended
   *  with gratitude (0021). */
  stayCreditReward: int("stay_credit_reward"),
  tags: json("tags"),
  sortOrder: int("sort_order").default(0).notNull(),
  /** Standing-example row (0046). */
  isExample: boolean("is_example").default(false).notNull(),
  /** A window and a deadline (0085). All optional: a quest with none of them
   *  stays off the village calendar; one with any of them becomes a
   *  `quest-window` row there through the repo's own save path. datetime,
   *  not timestamp, for the same reason 0059 gave the events table. */
  startsAt: datetime("starts_at"),
  endsAt: datetime("ends_at"),
  dueAt: datetime("due_at"),
  /** When the quest first appeared (0088). Nullable: rows older than the
   *  column have no honest date, and the weekly brief must never call them
   *  new. New inserts stamp themselves through the column default. */
  createdAt: timestamp("created_at"),
});

export const questClaims = mysqlTable("quest_claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  questId: varchar("quest_id", { length: 64 }).notNull(),
  /** Denormalised on purpose: the JSON stores it, and a quest can be renamed. */
  questTitle: varchar("quest_title", { length: 255 }),
  userId: varchar("user_id", { length: 64 }).notNull(),
  userName: varchar("user_name", { length: 255 }),
  status: mysqlEnum("status", ["claimed", "submitted", "consented", "declined"])
    .default("claimed")
    .notNull(),
  artifactUrl: varchar("artifact_url", { length: 1000 }),
  note: text("note"),
  /** Amount released at consent. Null until someone consents. */
  amount: int("amount"),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  submittedAt: timestamp("submitted_at"),
  consentedAt: timestamp("consented_at"),
});

export const gratitudeLog = mysqlTable("gratitude_log", {
  id: varchar("id", { length: 64 }).primaryKey(),
  fromId: varchar("from_id", { length: 64 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  toId: varchar("to_id", { length: 64 }).notNull(),
  toName: varchar("to_name", { length: 255 }),
  amount: int("amount").notNull(),
  message: text("message"),
  /**
   * The lunation this acknowledgement fell in, e.g. "lunar-000329", made only
   * by `cycleIdFor` in server/lib/gratitude-cycles.ts. Caps one acknowledgement
   * per pair, per cycle.
   *
   * This comment said "Calendar month, e.g. 2026-07" until 2026-08-29, which
   * was the scheme before the lunar one and had been wrong here for months.
   * Rows written under it keep their old ids and are refused by name at
   * settlement rather than remapped, because a lunation cannot be computed
   * from a calendar month.
   */
  cycleId: varchar("cycle_id", { length: 16 }).notNull(),
  at: timestamp("at").defaultNow().notNull(),
});

export const activity = mysqlTable("activity", {
  id: varchar("id", { length: 64 }).primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  /** Free text today. Left as-is: giving this real actor and entity refs is its
   *  own change, and doing it here would stop this being a faithful shadow. */
  text: text("text").notNull(),
  at: timestamp("at").defaultNow().notNull(),
});

export const investorDocs = mysqlTable("investor_docs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  url: varchar("url", { length: 1000 }),
  /**
   * Written as a literal `false` by the upload route and READ BY NOTHING. It
   * has never gated anything. The comment here used to say "Doc vault gating,
   * if the record carries it", which described a gate that was never built.
   *
   * The packet choice lives on `in_packet` below rather than here, because
   * this name has two honest readings and a gate cannot afford either one:
   * `requires_request = false` reads equally well as "no request needed, so
   * send it freely" and as "never send it". Kept rather than dropped so a
   * rollback to the previous release can still insert a row, since
   * `dbCollection` names every spec'd column on every insert.
   */
  requiresRequest: boolean("requires_request").default(false).notNull(),
  /**
   * 0104. The explicit, per-document choice a human makes: is this document
   * part of the investor packet that `POST /api/investor-docs/request` emails?
   * Default false, so nothing is in the packet until somebody says so, and no
   * row that already existed was opted in.
   */
  inPacket: boolean("in_packet").default(false).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  /** 0099. The "view on site" link the admin form has always collected. */
  pageLink: varchar("page_link", { length: 1000 }),
  /** 0099. Null on rows imported by scripts/import-json-to-mysql.ts. */
  uploadedAt: timestamp("uploaded_at"),
});

export const trainingModules = mysqlTable("training_modules", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 64 }),
  url: varchar("url", { length: 1000 }),
  sortOrder: int("sort_order").default(0).notNull(),
});

export const milestones = mysqlTable("milestones", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  phase: varchar("phase", { length: 64 }),
  status: varchar("status", { length: 32 }),
  updateNote: text("update_note"),
  completedDate: varchar("completed_date", { length: 32 }),
  sortOrder: int("sort_order").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ─── Singleton config documents ──────────────────────────────────────────────

/**
 * One row per config document, keyed by the name the JSON file used minus the
 * extension: brand, content, email-config, faqs, investor-summary,
 * journey-state, season, settings, visit-config, work-with-us.
 *
 * Deliberately a document store. These are edited wholesale by the admin UI and
 * their shapes change whenever Rye adds a field; columns would mean a migration
 * per edit and would buy nothing, because nothing queries inside them.
 */
export const appConfig = mysqlTable("app_config", {
  key: varchar("config_key", { length: 64 }).primaryKey(),
  value: json("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ─── Migration bookkeeping ───────────────────────────────────────────────────

/**
 * Applied SQL migrations, same convention as regen-civics so the runner and the
 * habits transfer. Note this is NOT data/migrations.json, which tracks one-off
 * JSON data fixups and is a separate concern.
 */
export const migrationsApplied = mysqlTable("_migrations_applied", {
  filename: varchar("filename", { length: 255 }).primaryKey(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
});

// ─── Roles as data (revision 2, step 3) ──────────────────────────────────────

/**
 * A role a member can hold: stewards, treasurer, facilitator, whatever a
 * village defines. Roles are the keystone the whole revision leans on: they are
 * what capabilities gate on, and what role-targeted messaging addresses.
 *
 * `capabilities` is the list of permission keys this role grants (e.g.
 * "quest.consent", "forum.moderate", "proposal.decide"). Gating checks ask
 * whether any role a member holds includes the capability, so permissions are
 * data a founder edits, not code a developer ships.
 */
/**
 * The circles a village organises itself into (0018). Per-deployment data,
 * seeded from server/seeds/circles-seed.json, never from platform code.
 *
 * `aliases` holds legacy free-text `quests.circle` values that resolve to this
 * circle; one alias maps to exactly one circle and admin writes reject
 * collisions. `leadRoleId` is a display and contact convention, NOT a
 * governance object.
 */
export const circles = mysqlTable("circles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  purpose: text("purpose"),
  aliases: json("aliases"),
  parentCircleId: varchar("parent_circle_id", { length: 64 }),
  leadRoleId: varchar("lead_role_id", { length: 64 }),
  icon: varchar("icon", { length: 64 }),
  color: varchar("color", { length: 32 }),
  status: mysqlEnum("status", ["active", "forming", "dormant"]).default("active").notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Standing-example row (0046). */
  isExample: boolean("is_example").default(false).notNull(),
  /**
   * How this circle decides (0083, P2): an id from shared/power.ts
   * DECIDES_BY, validated in code rather than by an enum so an unknown word
   * refuses with a sentence. NULL inherits the village default in the map
   * module's config. The gloss is the village's own line for `other`.
   */
  decidesBy: varchar("decides_by", { length: 32 }),
  decidesByGloss: varchar("decides_by_gloss", { length: 160 }),
  /** {money?, people?, space_land?, rules?}, each {method, gloss?}: a lens
   *  over the one method above, never a replacement for it. */
  decidesByDomains: json("decides_by_domains"),
});

export const roles = mysqlTable("roles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  /** Permission keys this role grants. */
  capabilities: json("capabilities"),
  /** Minimum computed stage before a member may be assigned this role. */
  minStage: varchar("min_stage", { length: 64 }),
  /** Which circle this role orbits on the village map (0018). */
  circleId: varchar("circle_id", { length: 64 }),
  /** How many holders this role carries. Vacancy is DERIVED (holders < seats). */
  seats: int("seats").default(1).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Standing-example row, seeded by the platform and never a village's own (0046). */
  isExample: boolean("is_example").default(false).notNull(),
});

/** One row per (member, role). A member can hold several roles. */
export const roleHolders = mysqlTable("role_holders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roleId: varchar("role_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  /** Who granted it, for the audit trail. */
  grantedBy: varchar("granted_by", { length: 64 }),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
});

// ─── Gratitude lunar cycles (revision 2, step 5) ─────────────────────────────

/**
 * One row per lunation, keyed by the deterministic cycleNumber from
 * shared/lunar.ts so Amora and regen-civics agree on boundaries. Gratitude
 * sent during a cycle is settled when the cycle closes.
 *
 * status: open -> distributing -> closed. The distributing state is the guard
 * that lets exactly one runner settle a cycle even if the close is triggered
 * twice at once.
 */
export const gratitudeCycles = mysqlTable("gratitude_cycles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** Whole lunations since the reference new moon. Unique natural key. */
  cycleNumber: int("cycle_number").notNull().unique(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: mysqlEnum("status", ["open", "distributing", "closed"]).default("open").notNull(),
  closedAt: timestamp("closed_at"),
});

/**
 * A settlement record: at cycle close, one row per recipient, capturing what
 * they received that cycle. Amora's Gratitude is a spendable balance rather
 * than a pooled token (unlike regen's $ReGen distribution), so this is the
 * audit trail of the cycle, not a separate minting event. uniqueness on
 * (cycle, user) makes the close idempotent.
 */
export const gratitudeDistributions = mysqlTable("gratitude_distributions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  cycleId: varchar("cycle_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  /** Total Gratitude this member received during the cycle. */
  received: int("received").notNull(),
  /** Distinct senders who acknowledged them, a reach signal for the profile. */
  distinctSenders: int("distinct_senders").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * The customization foundation. Only values a village has CHANGED live here; an
 * absent row means "use the platform default", so upgrades are inherited rather
 * than frozen at launch. See shared/gameVariables.ts for the registry.
 */
export const gameVariables = mysqlTable("game_variables", {
  key: varchar("config_key", { length: 100 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  valueType: mysqlEnum("value_type", ["integer", "decimal", "percentage", "boolean", "choice", "text"]).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/** One row per stage crossing, with the capabilities it opened. */
export const stageEvents = mysqlTable("stage_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  fromStage: varchar("from_stage", { length: 64 }).notNull(),
  toStage: varchar("to_stage", { length: 64 }).notNull(),
  unlocked: json("unlocked"),
  reason: varchar("reason", { length: 255 }),
  at: timestamp("at").defaultNow().notNull(),
});

/**
 * The token registry: which tokens exist in THIS deployment, as data (0006).
 *
 * 0005 fixed `token_type` as a three-value enum so it would be "right on day
 * one". The village module layer inverted that reasoning: internal tokens are
 * created at runtime by admins (library credits, stay credits, access tokens),
 * so a closed enum guarantees the exact widening migration it was meant to
 * avoid. The registry keeps the day-one discipline one level up — the column
 * is a stable varchar reference forever, and "which tokens exist" lives here,
 * where modules add rows without DDL.
 *
 * `governance` is the load-bearing column: 'platform' tokens are minted and
 * moved by this database; 'hypha' tokens (equity, voice) live on Base under
 * Hypha and are read-only mirrors here. Brand names in rows are fine: this is
 * per-deployment data, like brand.json; a fork seeds its own token names.
 */
export const tokens = mysqlTable("tokens", {
  slug: varchar("slug", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  /** Levers-spec taxonomy: recognition | equity | voice | credit. */
  kind: varchar("kind", { length: 32 }).notNull(),
  /** 'platform' = this database mints and moves it; 'hypha' = read-only mirror of Base. */
  governance: varchar("governance", { length: 16 }).default("platform").notNull(),
  decimals: int("decimals").default(0).notNull(),
  /** May members send it peer-to-peer? */
  transferable: boolean("transferable").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Append-only record of every movement of value. The balance column on `users` is
 * a derived cache of SUM(amount); this is the truth. Only platform-governed
 * tokens are ever written by this platform: amora and voice live on Base under
 * Hypha and are read-only.
 */
export const tokenLedger = mysqlTable("token_ledger", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  /**
   * References tokens.slug. varchar, not enum: internal tokens are created at
   * runtime by the module layer, and widening a live MySQL enum is the
   * migration nobody wants (drizzle/0006). Validation happens at write time
   * against the registry, fail-loud, matching the game-variables philosophy.
   */
  tokenType: varchar("token_type", { length: 32 }).default("gratitude").notNull(),
  /** Signed: negative entries are legitimate corrections and reversals. */
  amount: int("amount").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  sourceRef: varchar("source_ref", { length: 120 }),
  description: varchar("description", { length: 500 }),
  /** 160, not 128: user ids are varchar strings here, so composite keys run long. */
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull().unique(),
  at: timestamp("at").defaultNow().notNull(),
});

// ─── How resources flow (0084, lane L3) ──────────────────────────────────────

/**
 * Declared spending rules: who may spend what, with whose approval, paid
 * from where. A map of rules, never a wallet; nothing here debits anything.
 * `unit` is uppercase ISO 4217 or `token:<slug>`, validated in code against
 * the token registry (0084's header says why it is not an enum).
 */
export const spendingRules = mysqlTable("spending_rules", {
  id: varchar("id", { length: 64 }).primaryKey(),
  scope: mysqlEnum("scope", ["circle", "role"]).notNull(),
  scopeId: varchar("scope_id", { length: 64 }).notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  approval: mysqlEnum("approval", ["none", "circle-consent", "lead", "founders", "treasury", "hypha", "other"]).notNull(),
  /** Required in code when approval is `other`: the village's own words. */
  approvalNote: varchar("approval_note", { length: 160 }),
  paidFrom: mysqlEnum("paid_from", ["treasury", "circle-budget", "member", "grant", "sponsor", "other"]).notNull(),
  visibility: mysqlEnum("visibility", ["village", "holders"]).default("village").notNull(),
  /** Free words; required in code when paid_from is `other`. */
  note: varchar("note", { length: 500 }),
  createdBy: varchar("created_by", { length: 64 }),
  isExample: boolean("is_example").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/** Declared inflows: where the money comes from, as the village tells it. */
export const fundingSources = mysqlTable("funding_sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: mysqlEnum("kind", ["donations", "memberships", "stays", "grants", "sales", "land-or-lease", "investors", "other"]).notNull(),
  sharePct: decimal("share_pct", { precision: 5, scale: 2 }),
  amountMinorPerYear: bigint("amount_minor_per_year", { mode: "number" }),
  unit: varchar("unit", { length: 32 }),
  /** Free words; required in code when kind is `other`. */
  note: varchar("note", { length: 500 }),
  sortOrder: int("sort_order").default(0).notNull(),
  isExample: boolean("is_example").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Per-season circle envelopes. A budget is declared, never decremented.
 * season_id NULL means "not tied to a dated season" (org_role_assignments'
 * shape); the app's upsert dedupes the NULL case because MySQL unique keys
 * treat NULLs as always distinct.
 */
export const circleBudgets = mysqlTable("circle_budgets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  circleId: varchar("circle_id", { length: 64 }).notNull(),
  seasonId: varchar("season_id", { length: 64 }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  note: varchar("note", { length: 500 }),
  isExample: boolean("is_example").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SpendingRule = typeof spendingRules.$inferSelect;
export type FundingSource = typeof fundingSources.$inferSelect;
export type CircleBudget = typeof circleBudgets.$inferSelect;

export type Token = typeof tokens.$inferSelect;
export type LedgerEntry = typeof tokenLedger.$inferSelect;
export type GameVariable = typeof gameVariables.$inferSelect;
export type StageEvent = typeof stageEvents.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type RoleHolder = typeof roleHolders.$inferSelect;
export type GratitudeCycle = typeof gratitudeCycles.$inferSelect;
export type GratitudeDistribution = typeof gratitudeDistributions.$inferSelect;

export type User = typeof users.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type QuestClaim = typeof questClaims.$inferSelect;
export type GratitudeEntry = typeof gratitudeLog.$inferSelect;
export type ActivityEntry = typeof activity.$inferSelect;
