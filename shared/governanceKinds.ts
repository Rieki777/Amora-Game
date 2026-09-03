/**
 * TWO KINDS OF DECISION, TWO CLOCKS, AND THE ONE TABLE THAT SAYS WHICH.
 *
 * ── THE RULING ─────────────────────────────────────────────────────────────
 *
 * 2026-09-03: "whenever a decision is approved it passes and executes (if it's
 * sending tokens) if it's changing the Game then it starts at the next new moon
 * or automatically if a steward doesn't block it".
 *
 * 2026-09-03: "The veto window is 72 hours from the close."
 *
 * 2026-09-03: "proposals can each carry - execute at accept or start with the
 * new moon and to default to starting with the new moon to carry a pattern of
 * new activities starting then."
 *
 * ── WHY THE TABLE IS HERE AND NOT BESIDE THE THRESHOLDS ────────────────────
 *
 * `shared/ballotSubjects.ts` prices a decision: what share of the village has
 * to show up and agree. This file times a decision: when what the village
 * decided actually happens. They are different questions with different owners
 * and they move independently, so they are two tables in two files rather than
 * two columns of one table that a lane would have to edit to change either.
 *
 * The client renders the timing control and the countdown off this file, so it
 * is `shared/` and touches no database and no variable registry. Everything
 * here is arithmetic over instants.
 *
 * ── WHAT SEPARATES THE TWO KINDS ───────────────────────────────────────────
 *
 * A TOKEN_SEND moves balances. A payout, a distribution, a founding allocation,
 * a power transfer that moves what a member weighs. It is irreversible: this
 * platform has no un-mint, `village-voice` is not transferable, and nothing may
 * take earned voice away. So the brake on a token send happens while the ballot
 * is OPEN, where a seated steward's no fails it outright, and never after.
 *
 * A GAME_CHANGE changes the rules everybody plays by. A setting, a threshold, a
 * role, a seat, a module, the brand, the vote mode, the structure. It is
 * reversible by another vote, so it can afford to wait, and it waits: it never
 * executes at close, it is stamped with an instant, and a seated steward may
 * stop it until that instant arrives.
 *
 * ── THE CARVE-OUT THE SEAT CANNOT VETO ─────────────────────────────────────
 *
 * `role_seat` and `role_unseat` are Game changes in every ordinary sense, and
 * they execute AT PASS with no window anyway. The reason is the failure they
 * would otherwise cause: a steward whose removal is a vetoable Game change
 * vetoes their own removal, then vetoes the edit to the veto map that would
 * exempt it, and the village has no door out that does not run through the
 * person it is trying to remove. `NO_WINDOW_SUBJECTS` is that door.
 */

/** How the two clocks are named everywhere. */
export const GOVERNANCE_KINDS = ["token_send", "game_change"] as const;
export type GovernanceKind = (typeof GOVERNANCE_KINDS)[number];

/** The proposer's choice of when their decision starts. */
export const PROPOSAL_TIMINGS = ["at_acceptance", "next_moon"] as const;
export type ProposalTiming = (typeof PROPOSAL_TIMINGS)[number];

/**
 * The default, and the founder's reason for it: "to carry a pattern of new
 * activities starting then". A proposal that says nothing starts with the moon.
 */
export const DEFAULT_TIMING: ProposalTiming = "next_moon";

/** Read a stored or posted timing, total over every input. Unknown means the default. */
export function timingOf(raw: unknown): ProposalTiming {
  const text = String(raw ?? "").trim().toLowerCase();
  return (PROPOSAL_TIMINGS as readonly string[]).includes(text) ? (text as ProposalTiming) : DEFAULT_TIMING;
}

/** The two words a member reads for the two timings. */
export function timingLabel(timing: ProposalTiming): string {
  return timing === "at_acceptance" ? "as soon as it is accepted" : "with the next new moon";
}

/**
 * WHICH SUBJECT TYPES SEND TOKENS.
 *
 * Listed by exception, and the list is short on purpose. A subject type absent
 * from this map is a GAME_CHANGE, which is the fail-safe direction: a new
 * subject added by a later lane waits inside a veto window rather than
 * executing the instant it carries. Getting a Game change wrongly classified as
 * a token send costs the village its window; getting a token send wrongly
 * classified as a Game change costs it three days. Only one of those is
 * irreversible.
 *
 * `power_transfer`, `power_grant` and `power_return` move a CAPABILITY and not
 * a balance, so they are Game changes despite the word power. Nothing in them
 * touches the ledger.
 */
export const KIND_FOR_SUBJECT: Readonly<Record<string, GovernanceKind>> = {
  token_send: "token_send",
  quest_payout: "token_send",
  founding_allocation: "token_send",
};

/**
 * WHICH CHANGE-SET ITEM KINDS SEND TOKENS.
 *
 * `weight_allocation` is the interesting one and it is a GAME change. It writes
 * the custom allocation table, which is a number and never a token: no ledger
 * row, no balance, nothing minted. What it changes is how much every future
 * vote weighs, which is as constitutional as a decision gets, so it waits.
 *
 * `mint_rule` is also a Game change. It does not send tokens; it changes what
 * the village will mint from a future cycle, and it already lands on a moon of
 * its own.
 */
export const KIND_FOR_ITEM_KIND: Readonly<Record<string, GovernanceKind>> = {
  dial: "game_change",
  mint_rule: "game_change",
  weight_allocation: "game_change",
  mode_switch: "game_change",
  module_lifecycle: "game_change",
  brand_field: "game_change",
  role: "game_change",
  token_send: "token_send",
};

/** What kind of decision this subject type is. Absent means a Game change. */
export function kindOfSubject(subjectType: string): GovernanceKind {
  return KIND_FOR_SUBJECT[String(subjectType).toLowerCase()] ?? "game_change";
}

/** What kind of decision this change-set element is. Absent means a Game change. */
export function kindOfItem(itemKind: string): GovernanceKind {
  return KIND_FOR_ITEM_KIND[String(itemKind).toLowerCase()] ?? "game_change";
}

/**
 * A BUNDLE MIXING THE TWO WAITS AS A WHOLE (19F).
 *
 * "who bundle waits!" is the founder's whole sentence on it. A change set with
 * any Game-change element is wholly a Game change, under one `lands_at`, token
 * sends included. The alternative was splitting the bundle across two clocks,
 * which lets the token half execute at pass and be un-vetoable while the steward
 * blocks the half that was supposed to keep it honest.
 *
 * An EMPTY set is a Game change, because a set with nothing in it changes
 * nothing and there is no reason to hurry.
 */
export function kindOfSet(itemKinds: readonly string[]): GovernanceKind {
  if (itemKinds.length === 0) return "game_change";
  return itemKinds.every((k) => kindOfItem(k) === "token_send") ? "token_send" : "game_change";
}

/**
 * SUBJECTS THAT EXECUTE AT PASS WITH NO WINDOW, whatever their kind.
 *
 * Read the header for why. These are the acts the seat itself is subject to,
 * and a window on them is a seat nobody can remove.
 */
export const NO_WINDOW_SUBJECTS: ReadonlySet<string> = new Set([
  "role_seat",
  "role_unseat",
  /*
   * The Birthing, and it is here for a different reason from the two above.
   *
   * A window is a door for a seated steward, and before the Birthing there is
   * no seat: the catalysts are seated as stewards BY the launch, at the moment
   * it carries. A window on the Birthing would be 72 hours nobody can use,
   * during which the village that voted unanimously to start cannot start. It
   * also carries the strictest bar the platform has (every seat votes, every
   * seat says yes), so the protection a window would add is already spent.
   */
  "village_launch",
]);

/**
 * SETTINGS THAT EXECUTE AT PASS WITH NO WINDOW, for the same reason.
 *
 * The veto map decides what a steward may stop. A steward who can stop an edit
 * to it holds the map, and the village's own vote about its own training wheels
 * runs through the person wearing them.
 */
export const NO_WINDOW_KEYS: ReadonlySet<string> = new Set([
  "governance.steward_subjects",
  "governance.auto_execute_subjects",
  "governance.steward_council",
]);

/** Does this subject skip the window entirely and execute the moment it carries? */
export function executesAtPassWithNoWindow(subjectType: string): boolean {
  return NO_WINDOW_SUBJECTS.has(String(subjectType).toLowerCase());
}

/** The floor the founder set, in hours, and the setting's own floor. */
export const VETO_HOURS_FLOOR = 72;

/** Read a village's veto window, never below the floor. */
export function vetoHoursFrom(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return VETO_HOURS_FLOOR;
  return Math.max(VETO_HOURS_FLOOR, Math.floor(n));
}

export interface LandingInput {
  /** The ballot's FROZEN close instant. Never the moment a human pressed close. */
  closesAt: Date;
  kind: GovernanceKind;
  timing: ProposalTiming;
  /** The village's window, already floored. */
  vetoHours: number;
  /** The next new moon strictly after a given instant, from the cycle clock. */
  nextNewMoonAfter: (after: Date) => Date;
  /** True for a subject that executes at pass with no window at all. */
  noWindow?: boolean;
}

export interface Landing {
  /** When the decision takes effect, or null when it takes effect at close. */
  landsAt: Date | null;
  /** When the steward's door shuts. Always equal to `landsAt`, or null with it. */
  vetoClosesAt: Date | null;
  /** True when the close itself executes it and there is no window. */
  executesAtClose: boolean;
  /** The sentence a member reads on the decision page. */
  because: string;
}

/**
 * THE ONE PLACE THAT DECIDES WHEN A CARRIED DECISION HAPPENS.
 *
 * Four rules, and every one of them is the founder's sentence read literally:
 *
 *  1. A subject with no window executes at close, always. (The seat carve-out.)
 *  2. A TOKEN_SEND chosen `at_acceptance` executes at close. The steward's brake
 *     on it was their no vote while the ballot was open.
 *  3. A GAME_CHANGE chosen `at_acceptance` still cannot land before its window
 *     closes, so it lands at `closesAt + vetoHours`. "At acceptance" buys the
 *     proposer the earliest instant the ruling allows and never an instant the
 *     ruling forbids.
 *  4. Anything chosen `next_moon` lands at the LATER of the next new moon after
 *     the close and `closesAt + vetoHours`. That is the late-carry rule: a vote
 *     that carries with more than three days of the lunation left lands on the
 *     moon; a vote that carries on the last day lands three days into the new
 *     one, because a steward is owed 72 hours whatever the sky is doing.
 *
 * A TOKEN_SEND chosen `next_moon` is rule 4 like everything else, and a steward
 * may veto it inside its window, because the founder's later ruling ("stewards
 * can also block payouts") plus the timing choice means a payout that waits is
 * a payout that can be stopped.
 */
export function landingFor(input: LandingInput): Landing {
  const windowMs = Math.max(0, input.vetoHours) * 60 * 60 * 1000;
  const windowClose = new Date(input.closesAt.getTime() + windowMs);

  if (input.noWindow) {
    return {
      landsAt: null,
      vetoClosesAt: null,
      executesAtClose: true,
      because: "This one takes effect the moment it carries. A seat is not something the seat can hold on to.",
    };
  }

  if (input.kind === "token_send" && input.timing === "at_acceptance") {
    return {
      landsAt: null,
      vetoClosesAt: null,
      executesAtClose: true,
      because: "This decision sends tokens as soon as it is accepted, so it takes effect the moment the vote closes.",
    };
  }

  if (input.timing === "at_acceptance") {
    return {
      landsAt: windowClose,
      vetoClosesAt: windowClose,
      executesAtClose: false,
      because: `This changes the Game, so it lands ${input.vetoHours} hours after the vote closes. A steward can stop it until then.`,
    };
  }

  const moon = input.nextNewMoonAfter(input.closesAt);
  const landsAt = moon.getTime() > windowClose.getTime() ? moon : windowClose;
  return {
    landsAt,
    vetoClosesAt: landsAt,
    executesAtClose: false,
    because:
      moon.getTime() > windowClose.getTime()
        ? "This starts with the next new moon. A steward can stop it until then."
        : `The new moon is less than ${input.vetoHours} hours away, so this lands ${input.vetoHours} hours after the vote closes instead. A steward is owed the whole window.`,
  };
}

/**
 * Is a veto still allowed at this instant?
 *
 * The window is CLOSED-OPEN on the landing instant: a veto AT `landsAt` is too
 * late, because the same instant is when the apply job may claim the row, and a
 * rule that let both happen at once would decide by tick phase.
 */
export function vetoIsInTime(landsAt: Date | null, at: Date): boolean {
  if (!landsAt) return false;
  return at.getTime() < landsAt.getTime();
}

/** The refusal a late veto reads, naming the instant it missed. */
export function lateVetoRefusal(landsAt: Date): string {
  return `This one landed at ${landsAt.toISOString()} and the window shut with it. It can be brought back as a new proposal, which is the door a landed decision has.`;
}
