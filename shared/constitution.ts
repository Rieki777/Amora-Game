/**
 * RING 0 — THE CONSTITUTION.
 *
 * The rules of the game that no vote, no admin, and no founder can change:
 * they are enforced in code, re-proven at boot where provable, and published
 * at the TOP of the public Game Mechanics page in plain language. Publishing
 * them is what makes the tunable list below them trustworthy — a governance
 * system that could vote away conservation would not be a governance system.
 *
 * This file is COPY, not enforcement. Every law here points at the code that
 * actually enforces it; changing this file changes what is displayed, never
 * what is true. Keep the language for a villager, not a developer.
 */

export interface ConstitutionLaw {
  /** Short name, e.g. "Money flows in, never out". */
  title: string;
  /** One paragraph a non-technical member can understand. */
  plain: string;
  /** Where the code enforces it — for the curious and the auditors. */
  enforcedBy: string;
}

export const CONSTITUTION: ConstitutionLaw[] = [
  {
    title: "Every token is accounted for, always",
    plain:
      "All value in the village lives on one ledger where every movement has a source and a destination, and the books must balance to zero at every boot. If they ever don't, the village refuses to open until a human looks. Balances are recomputed from the record, never adjusted by hand.",
    enforcedBy: "server/lib/ledger.ts: conservation invariant, checked at every boot",
  },
  {
    title: "Money flows in, never out",
    plain:
      "Real money can buy the village's credit tokens, but no token can ever be sold back for money. There is no cash-out path, and adding one is not a setting: it is what keeps village credits from becoming securities.",
    enforcedBy: "No such code path exists; exchange is buy-only (server/lib/exchange.ts)",
  },
  {
    title: "Recognition cannot be bought",
    plain:
      "The recognition token exists only as a record of appreciation between people. It is never for sale, never tradeable, and never granted by anything except a human act. Appreciation with a price would just be a price.",
    enforcedBy: "server/lib/exchange.ts: recognition is refused from every listing and swap",
  },
  {
    title: "What the village can conjure can never claim what people paid for",
    plain:
      "Tokens the village issues freely (rewards, comps) can never be swapped into tokens that people bought with real money. The test is structural: it is about where tokens came from, and no privilege level overrides it.",
    enforcedBy: "server/lib/exchange.ts: faucet-issued tokens are permanently unswappable",
  },
  // Amended for the on-site governance engine (R44, GOV_DESIGN section 7):
  // the law's scope narrowed from all governance to hypha-governed TOKENS,
  // because the village can now conduct binding decisions here. The final
  // sentence is flagged for the founder's reading.
  {
    title: "What Hypha governs, this game only displays",
    plain:
      "Tokens governed on the village's Hypha DAO, equity and voice among them, live on Base. This platform reads and displays them and links you there; it never mints, moves, or prices them. A decision the village conducts here binds here, on the record; what the village keeps on Hypha binds on Hypha.",
    enforcedBy: "server/lib/ledger.ts: hypha-governed tokens are refused from the ledger entirely",
  },
  {
    title: "A vote is counted against the day it opened",
    plain:
      "When a ballot opens, its thresholds, its electorate and every voter's weight freeze inside it. No later change to any setting, allocation or balance rewrites a vote, open or closed. What you were asked, and what your voice weighed, is permanent from the moment the asking began.",
    enforcedBy: "the ballots snapshot columns (drizzle/0089) + server/lib/ballots.test.ts",
  },
  {
    title: "Voting weight is on the record",
    plain:
      "Whatever weight mode the village runs, every member can see how voting weight is assigned, and every change to an assigned weight is a permanent record carrying who changed it and why. Weight is power, and this game holds no hidden power.",
    enforcedBy: "governance_weight_changes (drizzle/0089), append-only, member-readable",
  },
  {
    title: "One gate decides every permission",
    plain:
      "Whether you can do something is decided by exactly one rule, in one place, in a fixed order: admins can always act; a standing warning overrides roles and stages; then roles, then badges, then your stage on the ladder. No feature may invent its own side-door.",
    enforcedBy: "shared/capabilities.ts: hasCapability(), the one gate",
  },
  {
    title: "Value is released by human consent, never by a timer",
    plain:
      "Recognition lands when a person consents to someone's work, and cycles close when a human closes them. No scheduled job ever releases value or closes a cycle on its own.",
    enforcedBy: "server/lib/scheduler.ts: the scheduler's charter, in code and comments",
  },
  {
    title: "Nobody witnesses their own work (once the village is grown)",
    plain:
      "You cannot consent to your own claim: someone else must witness the work. A founder building alone is exempt only while the village is smaller than the solo-founder window, and every such use is recorded.",
    enforcedBy: "server/index.ts: the consent route's self-consent guard",
  },
  {
    title: "The record of value is never deleted",
    plain:
      "Ledger rows, settlements and measured facts are never erased. Leaving the village anonymizes who you were; it does not rewrite what happened, because the books must stay explicable forever.",
    enforcedBy: "anonymizeMember and the retract-don't-delete contract (drizzle/0040)",
  },
  {
    title: "Every mechanic is bounded",
    plain:
      "Every tunable dial has a floor and a ceiling set by the platform. Governance can move a dial anywhere within its bounds; nothing can move the bounds themselves. The bounds are the safety envelope this constitution draws around the game.",
    enforcedBy: "shared/gameVariables.ts: min/max on every def, validated before every write",
  },
  {
    title: "Every change to the rules is on the record",
    plain:
      "Any change to any mechanic, by an admin or by a passed proposal, is written to a permanent amendment ledger: what changed, from what to what, by whom, under which decision. The history is public.",
    enforcedBy: "mechanics_changes table (drizzle/0042) + the variables write path",
  },
  {
    title: "Caps fail closed",
    plain:
      "Where a limit protects members' value (swap caps above all), an unset or zero limit means ZERO, never unlimited. A missing rule is a closed tap, not an open one.",
    enforcedBy: "server/lib/exchange.ts: fail-closed swap caps",
  },
  {
    title: "Trading requires an informed, versioned yes",
    plain:
      "Token trading is off until this village's founder reads and accepts the current legal terms, and it closes again automatically if the terms change. A village run on a shared password cannot enable it at all: money needs accountable humans.",
    enforcedBy: "server/lib/exchange.ts + shared/modules.ts: the version-stamped legal card",
  },
  {
    title: "Leaving well is guaranteed",
    plain:
      "Any member can see everything the village holds about them, take a copy, settle what is open, and leave. Their name is scrubbed everywhere while the village's shared record keeps its numbers. Departure is a supported path, not an escape.",
    enforcedBy: "server/lib/exit.ts + /api/profile/export + anonymizeMember",
  },
];
