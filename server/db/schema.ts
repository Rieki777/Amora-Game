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
  boolean,
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
  /** Legacy field name, kept: the client reads it as gratitude.balance. */
  heartsBalance: int("hearts_balance").default(0).notNull(),
  contributions: json("contributions"),
  quests: json("quests"),
  bio: text("bio"),
  avatar: varchar("avatar", { length: 500 }),
  /** Manual admin override of the computed stage. */
  stageGranted: varchar("stage_granted", { length: 64 }),
  trainingComplete: boolean("training_complete").default(false).notNull(),
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
  description: text("description"),
  impact: text("impact"),
  gratitude: int("gratitude").default(0).notNull(),
  duration: varchar("duration", { length: 64 }),
  difficulty: varchar("difficulty", { length: 32 }),
  circle: varchar("circle", { length: 64 }),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  icon: varchar("icon", { length: 64 }),
  roleRequired: varchar("role_required", { length: 64 }),
  tags: json("tags"),
  sortOrder: int("sort_order").default(0).notNull(),
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
  /** Calendar month, e.g. "2026-07". Caps one acknowledgement per pair, per cycle. */
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
  /** Doc vault gating, if the record carries it. */
  requiresRequest: boolean("requires_request").default(false).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
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
export const roles = mysqlTable("roles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  /** Permission keys this role grants. */
  capabilities: json("capabilities"),
  /** Minimum computed stage before a member may be assigned this role. */
  minStage: varchar("min_stage", { length: 64 }),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
