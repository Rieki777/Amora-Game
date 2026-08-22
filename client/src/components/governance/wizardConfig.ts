/**
 * THE PROPOSAL WIZARD, AS ONE DECLARATIVE CONFIG.
 *
 * Ported from Hypha 2.0's `src/pages/proposals/create/config.js` (dho-web-client,
 * Apache 2.0, founder-owned; harvest section 1, verdict COPY). Their crown jewel
 * is that the whole wizard is data: five canonical steps in a fixed order, a
 * table of proposal types, and per-type overrides saying which steps to skip and
 * which fields render inside the ones that remain. Adding a proposal type is an
 * entry in this file. It is never a new component and never a new route.
 *
 * The three moving parts:
 *
 *   STEPS      The canonical walk, in order, for every type. A type prunes it
 *              with `skip`, and the walker (wizardWalk.ts) steps over the gaps
 *              in both directions, so nobody hand-maintains an index.
 *   FIELDS     Per type, per step, a list of FieldSpecs. One generic renderer
 *              serves all of them, exactly as Hypha's StepPayout serves payout,
 *              assignment, archetype and badge flavours from `fields.X`.
 *   PUBLISH    What the finished payload becomes. `body` maps the wizard's flat
 *              answers onto the subject route's own shape, so the wizard never
 *              constrains the API it feeds.
 *
 * WHAT THIS FILE IS NOT ALLOWED TO DECIDE: whether a type can be published.
 * That comes from the server (`GET /api/governance/wizard`), because the
 * executors land lane by lane and a config that guessed would be a wizard
 * walking members toward a route nobody mounted.
 *
 * VALIDATION lives beside the fields as `problem(value, answers)`, returning a
 * sentence or null. The review step collects every problem across every visible
 * step, so nothing is discovered on submit that could have been said on the
 * step it belongs to.
 */
import {
  Award,
  Coins,
  FileText,
  Scale,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/**
 * The proposal types (GOV_DESIGN section 4).
 *
 * The SERVER holds the same ids in `server/lib/proposalDrafts.ts` for draft
 * validation, and `wizardConfig.test.ts` fails if the two lists drift. Two
 * files because that module must not import React, and this one does.
 */
export const WIZARD_TYPES = [
  "role_application",
  "mechanics",
  "agreement",
  "badge_grant",
  "quest_payout",
] as const;
export type WizardType = (typeof WIZARD_TYPES)[number];

/**
 * The canonical steps, in order, shared by every type.
 *
 * Five rather than Hypha's six: their `icon` step picks proposal artwork,
 * which this platform does not have, and their `date` step is folded into
 * `terms` because every date this wizard asks for is a term of the thing being
 * proposed rather than a schedule for the vote (the vote's own clock is a
 * village dial, not an author's choice).
 */
export const WIZARD_STEPS = [
  { key: "type", label: "Kind" },
  { key: "subject", label: "Subject" },
  { key: "details", label: "In your words" },
  { key: "terms", label: "Terms" },
  { key: "review", label: "Review" },
] as const;
export type StepKey = (typeof WIZARD_STEPS)[number]["key"];

/** How a field renders. One vocabulary, one generic renderer. */
export type FieldKind =
  | "text"
  | "textarea"
  | "percent"
  | "number"
  | "date"
  | "choice"
  | "pick"
  | "changeSet";

/** Where a `pick` field's options come from, fetched by the renderer. */
export type PickSource = "seats" | "badges" | "members" | "quests" | "circles" | "tokens";

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  label: string;
  /** The plain mechanics, shown through InfoTip. One or two sentences. */
  tip?: string;
  placeholder?: string;
  /** Under the input, always visible. Use for the thing a member must know. */
  help?: string;
  required?: boolean;
  min?: number;
  max?: number;
  rows?: number;
  maxLength?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  source?: PickSource;
  /** A sentence naming what is wrong, or null. Runs on every keystroke. */
  problem?: (value: unknown, answers: Record<string, unknown>) => string | null;
}

export interface TypeStepOverride {
  /** Prune this step from this type's walk. */
  skip?: boolean;
  /** Replaces the canonical label in the stepper for this type. */
  label?: string;
  /** One sentence at the top of the step, in the member's register. */
  intro?: string;
  fields?: readonly FieldSpec[];
}

export interface WizardTypeConfig {
  id: WizardType;
  /** The heading its card sits under on the type step. */
  group: "Rules" | "People" | "Recurring" | "One-time";
  icon: LucideIcon;
  title: string;
  description: string;
  /** The sentence the review step ends on: what publishing actually does. */
  consequence: string;
  /** Where a finished proposal goes, and in what shape. */
  publish: {
    path: string;
    body: (answers: Record<string, any>) => Record<string, unknown>;
  };
  steps: Partial<Record<StepKey, TypeStepOverride>>;
}

// ── Shared validators ────────────────────────────────────────────────────────

const required = (what: string) => (v: unknown) =>
  String(v ?? "").trim() ? null : `${what} is the part only you can write. It cannot be blank`;

const atLeast = (n: number, what: string) => (v: unknown) =>
  String(v ?? "").trim().length >= n ? null : `${what} needs at least ${n} characters so the village can weigh it`;

const pct = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "That needs to be a number between 0 and 100";
  if (n < 0 || n > 100) return "A percentage runs from 0 to 100";
  return null;
};

const positive = (what: string) => (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return `${what} has to be more than zero`;
  return null;
};

const changesPresent = (v: unknown) =>
  Array.isArray(v) && v.length > 0 ? null : "Pick at least one dial to change, and say what it becomes";

// ── The types ────────────────────────────────────────────────────────────────

export const WIZARD_TYPE_CONFIGS: readonly WizardTypeConfig[] = [
  {
    id: "role_application",
    group: "Recurring",
    icon: UserPlus,
    title: "Apply for a seat",
    description: "Raise your hand for a role, with what you will have done by the end of the season.",
    consequence:
      "Publishing sends this to the seat's circle. They see your deliverables, your terms and your fit statement before anyone votes.",
    publish: {
      path: "/api/governance/role-applications",
      body: (a) => ({
        orgRoleId: a.seatId,
        deliverables: a.deliverables,
        fitStatement: a.fitStatement,
        commitmentPct: Number(a.commitmentPct ?? 100),
        deferredPct: Number(a.deferredPct ?? 0),
        tokenSlug: a.tokenSlug || null,
        tokenPerCycle: a.tokenPerCycle ? Number(a.tokenPerCycle) : null,
        cashNote: a.cashNote || null,
      }),
    },
    steps: {
      subject: {
        label: "The seat",
        intro: "Which seat you are raising your hand for.",
        fields: [
          {
            key: "seatId",
            kind: "pick",
            source: "seats",
            label: "Seat",
            required: true,
            problem: required("A seat"),
            tip: "Seats come from the village's org chart. A seat that is recruiting shows first.",
          },
        ],
      },
      details: {
        label: "Your season",
        intro: "What you will have done by the end of the season, and why you.",
        fields: [
          {
            key: "deliverables",
            kind: "textarea",
            rows: 6,
            maxLength: 2000,
            label: "Deliverables for the season",
            placeholder: "By the end of the season, the spring runs clear and two people besides me know how to keep it that way.",
            help: "Write what will be TRUE at season's end, so anyone can check it without asking you.",
            required: true,
            problem: atLeast(40, "Your deliverables"),
          },
          {
            key: "fitStatement",
            kind: "textarea",
            rows: 4,
            maxLength: 1500,
            label: "Why you",
            placeholder: "I have kept the north line running for two seasons and I already know where it silts up.",
            required: true,
            problem: atLeast(30, "Your fit statement"),
          },
        ],
      },
      terms: {
        label: "Your terms",
        intro: "What you are taking on and what the village owes you for it.",
        fields: [
          {
            key: "commitmentPct",
            kind: "percent",
            label: "Commitment",
            help: "A partial seat is a real seat. 40% means you hold two fifths of the role and are paid for two fifths.",
            tip: "Commitment scales both the pay and the voice this seat carries. You can lower it later without a vote; raising it takes a new one.",
            problem: pct,
          },
          {
            key: "deferredPct",
            kind: "percent",
            label: "Deferred",
            help: "The share you let the village hold back and owe you. Deferring changes your pay. It never changes your voice.",
            tip: "Voice accrues on the full amount whatever you defer, so choosing to wait for value never costs you a say.",
            problem: pct,
          },
          {
            key: "tokenSlug",
            kind: "pick",
            source: "tokens",
            label: "Paid in",
          },
          {
            key: "tokenPerCycle",
            kind: "number",
            min: 0,
            label: "Per cycle, at full commitment",
            help: "The whole-seat figure. What you actually receive is this times your commitment, less what you defer.",
          },
          {
            key: "cashNote",
            kind: "text",
            maxLength: 500,
            label: "Cash expectation",
            help: "Recorded here and settled off the platform. Money never flows out of this village through this software.",
          },
        ],
      },
    },
  },
  {
    id: "mechanics",
    group: "Rules",
    icon: Scale,
    title: "Change a rule",
    description: "Move one of the village's dials, with the reasoning that goes with it.",
    consequence:
      "Publishing puts this in front of the village for sensing. Once enough members support it, it can go to a vote, and a passed vote changes the dial through the one amendment ledger.",
    publish: {
      path: "/api/game/mechanics/proposals",
      body: (a) => ({
        title: a.title,
        rationale: a.rationale,
        changes: (a.changes ?? []).map((c: any) => ({ key: c.key, to: c.to })),
      }),
    },
    steps: {
      subject: {
        label: "The dials",
        intro: "Which rules move, and what they become.",
        fields: [
          {
            key: "changes",
            kind: "changeSet",
            label: "Changes",
            required: true,
            problem: changesPresent,
            tip: "Only dials the village governs appear here. Founder-held dials and the constitution are not on this list.",
          },
        ],
      },
      details: {
        label: "In your words",
        intro: "What you are asking for, and why it is worth the village's attention.",
        fields: [
          {
            key: "title",
            kind: "text",
            maxLength: 200,
            label: "Title",
            placeholder: "More time to weigh in before a vote",
            required: true,
            problem: atLeast(8, "A title"),
          },
          {
            key: "rationale",
            kind: "textarea",
            rows: 7,
            maxLength: 4000,
            label: "Reasoning",
            placeholder: "Three proposals in a row closed before the people they affected had read them.",
            help: "Say what you have seen, not what you fear. Evidence carries a vote further than warning does.",
            required: true,
            problem: atLeast(40, "Your reasoning"),
          },
        ],
      },
      terms: { skip: true },
    },
  },
  {
    id: "agreement",
    group: "Rules",
    icon: FileText,
    title: "Write an agreement",
    description: "Put a shared understanding into words the village can adopt, review and amend.",
    consequence:
      "Publishing enters this into sensing. Adopted by consent, it becomes an active agreement with its own review date.",
    publish: {
      path: "/api/governance/agreements",
      body: (a) => ({
        title: a.title,
        body: a.body,
        domain: a.domain || null,
        circleId: a.circleId || null,
        reviewAt: a.reviewAt || null,
      }),
    },
    steps: {
      // An agreement is its own subject: there is nothing to pick before you
      // write it, so this type starts on the words.
      subject: { skip: true },
      details: {
        label: "The agreement",
        intro: "The words themselves. This is what the village adopts, exactly as written.",
        fields: [
          {
            key: "title",
            kind: "text",
            maxLength: 200,
            label: "Title",
            placeholder: "Quiet hours in the common house",
            required: true,
            problem: atLeast(8, "A title"),
          },
          {
            key: "body",
            kind: "textarea",
            rows: 12,
            maxLength: 20000,
            label: "The agreement",
            placeholder: "Between 10pm and 7am the common house is quiet. Anyone can name a night as an exception at the weekly circle.",
            help: "Write it as the rule it will be. What is adopted is what is on this page.",
            required: true,
            problem: atLeast(60, "An agreement"),
          },
        ],
      },
      terms: {
        label: "Scope and review",
        intro: "Who it binds, and when the village looks at it again.",
        fields: [
          {
            key: "domain",
            kind: "choice",
            label: "Domain",
            options: [
              { value: "", label: "Not tied to one domain" },
              { value: "money", label: "Money" },
              { value: "people", label: "People" },
              { value: "space_land", label: "Space and land" },
              { value: "rules", label: "Rules" },
            ],
            tip: "The domain decides where this agreement shows up on the power map.",
          },
          { key: "circleId", kind: "pick", source: "circles", label: "Circle" },
          {
            key: "reviewAt",
            kind: "date",
            label: "Review on",
            help: "Good enough for now, safe enough to try, until this date. Leaving it blank makes it open-ended.",
            tip: "A review date is how an agreement stays a living decision instead of becoming furniture.",
          },
        ],
      },
    },
  },
  {
    id: "badge_grant",
    group: "People",
    icon: Award,
    title: "Grant a badge",
    description: "Ask the village to recognise someone with a badge, on the record and with a term.",
    consequence: "Publishing puts the grant to the village. A passed vote awards the badge and the award carries this vote's id.",
    publish: {
      path: "/api/governance/badge-grants",
      body: (a) => ({
        badgeId: a.badgeId,
        userId: a.granteeId,
        reason: a.reason,
        seasons: a.seasons ? Number(a.seasons) : null,
      }),
    },
    steps: {
      subject: {
        label: "Badge and holder",
        intro: "Which badge, and who would wear it.",
        fields: [
          { key: "badgeId", kind: "pick", source: "badges", label: "Badge", required: true, problem: required("A badge") },
          { key: "granteeId", kind: "pick", source: "members", label: "Member", required: true, problem: required("A member") },
        ],
      },
      details: {
        label: "The case",
        intro: "Why this badge, for this person, now.",
        fields: [
          {
            key: "reason",
            kind: "textarea",
            rows: 6,
            maxLength: 2000,
            label: "Why",
            placeholder: "She has run the repair bench every week since spring and taught four people to use it.",
            required: true,
            problem: atLeast(40, "The case"),
          },
        ],
      },
      terms: {
        label: "For how long",
        intro: "A badge with a term is a badge the village revisits.",
        fields: [
          {
            key: "seasons",
            kind: "number",
            min: 0,
            max: 40,
            label: "Seasons",
            help: "Leave blank for no end date.",
            tip: "A badge can carry capabilities, so a term is how a grant stays a decision. Without one it becomes permanent by default.",
          },
        ],
      },
    },
  },
  {
    id: "quest_payout",
    group: "One-time",
    icon: Coins,
    title: "Pay out a quest",
    description: "Put a finished quest's payout to the village, so releasing it is the village's act.",
    consequence: "Publishing puts the payout to the village. A passed vote releases it through the settlement the quest already uses.",
    publish: {
      path: "/api/governance/quest-payouts",
      body: (a) => ({
        questId: a.questId,
        amount: Number(a.amount),
        tokenSlug: a.tokenSlug || null,
        reason: a.reason,
      }),
    },
    steps: {
      subject: {
        label: "The quest",
        intro: "Which finished quest this pays for.",
        fields: [
          { key: "questId", kind: "pick", source: "quests", label: "Quest", required: true, problem: required("A quest") },
        ],
      },
      details: {
        label: "What was done",
        intro: "What the village got, in the words of someone who saw it.",
        fields: [
          {
            key: "reason",
            kind: "textarea",
            rows: 5,
            maxLength: 2000,
            label: "What was done",
            required: true,
            problem: atLeast(30, "The account"),
          },
        ],
      },
      terms: {
        label: "The amount",
        intro: "What is released, and from which token.",
        fields: [
          {
            key: "amount",
            kind: "number",
            min: 0,
            label: "Amount",
            required: true,
            problem: positive("An amount"),
          },
          { key: "tokenSlug", kind: "pick", source: "tokens", label: "Token" },
        ],
      },
    },
  },
];

/** By id, for the walker and the renderer. */
export const typeConfig = (id: string): WizardTypeConfig | null =>
  WIZARD_TYPE_CONFIGS.find((t) => t.id === id) ?? null;

/** The type groups in the order they render on the first step. */
export const TYPE_GROUPS = ["Rules", "People", "Recurring", "One-time"] as const;

/**
 * What a decision ON this subject is called, as a noun.
 *
 * The wizard cards are verbs, because there a member is choosing an action
 * ("Change a rule"). A decision card is a thing the village is looking at, so
 * it takes the noun. `ballots.subject_type` uses these same ids, which is why
 * one map serves both sides.
 */
export const SUBJECT_NOUN: Record<string, string> = {
  mechanics: "Rule change",
  role_application: "Seat application",
  agreement: "Agreement",
  badge_grant: "Badge grant",
  quest_payout: "Quest payout",
};

export const subjectNoun = (subjectType: string): string => SUBJECT_NOUN[subjectType] ?? "Decision";
