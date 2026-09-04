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
 * ONE CARVE-OUT AND IT TAKES THE VETO ONLY. Section 20.11: seat and unseat of
 * a steward-capable role, and any edit to the veto map, "keep their timing and
 * window like any Game change but are NOT vetoable". That is `notVetoable` on
 * the landing, which keeps the instant, the countdown and the notice and takes
 * away only the door a steward would otherwise walk through.
 *
 * `NO_WINDOW_SUBJECTS` is a different and much narrower thing, and the audit
 * of 2026-09-04 is why it no longer holds the seat acts. It used to, on the
 * argument that a steward whose removal waits inside a window they hold is a
 * seat nobody can remove. `notVetoable` answers that argument already: the
 * window runs and the seat has no door into it. What the old reading actually
 * produced was a sentence the platform contradicted in the same breath: the
 * refusal a steward reads says the decision "waits out its window like any
 * other Game change", while the arithmetic gave it `executesAtClose` and a
 * null `lands_at`, so there was no window, no countdown and no notice, and the
 * veto route answered "This one took effect the moment it carried". It was
 * also wider than its own argument, because an ordinary seating for a role
 * carrying no `steward.veto` skipped the window too while the same refusal
 * called it vetoable. Both now wait, and only the steward-capable one is
 * beyond stopping.
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

/**
 * THE DEFAULT IS PER KIND, and the audit of 2026-09-03 is why.
 *
 * 19F gives one reason for the new-moon default: "to carry a pattern of new
 * activities starting then". A payout for work already finished is not a new
 * activity, and under a flat next_moon default a quest payout voted on day two
 * of a lunation waits twenty-seven days and then acquires a post-close steward
 * window that 19D says a token send cannot have. So a TOKEN_SEND that says
 * nothing means at acceptance, and a GAME_CHANGE that says nothing means the
 * next moon. A proposer who states a timing gets the one they stated.
 */
export function defaultTimingFor(kind: GovernanceKind): ProposalTiming {
  return kind === "token_send" ? "at_acceptance" : "next_moon";
}

/**
 * Read a stored or posted timing, total over every input.
 *
 * The `fallback` says what an unreadable or absent value means. Pass
 * `defaultTimingFor(kind)` at the moment a proposal is opened, where the kind
 * is known; the bare call keeps the Game-change default, which is the
 * fail-safe direction for a column read back off a row.
 */
export function timingOf(raw: unknown, fallback: ProposalTiming = DEFAULT_TIMING): ProposalTiming {
  const text = String(raw ?? "").trim().toLowerCase();
  return (PROPOSAL_TIMINGS as readonly string[]).includes(text) ? (text as ProposalTiming) : fallback;
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
 * ONE ENTRY, and the bar for a second one is that no seat exists yet to use
 * the window. A decision the seat merely must not be able to STOP is not on
 * this list; it takes `notVetoable`, which keeps the window and shuts the
 * door. Read the header for the seat acts that were wrongly here.
 */
export const NO_WINDOW_SUBJECTS: ReadonlySet<string> = new Set([
  /*
   * The Birthing.
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
  /**
   * The first cycle boundary strictly after an instant, under the village's
   * ACTIVE clock. Lunar by default, and a village on calendar months gets its
   * own boundary here, which is why the parameter is not called "new moon"
   * however often the rulings say moon.
   */
  nextBoundaryAfter: (after: Date) => Date;
  /** True for a subject that executes at pass with no window at all. */
  noWindow?: boolean;
  /**
   * TRUE WHEN NOBODY MAY STOP THIS ONE, and the window stays anyway.
   *
   * Section 20.11: "Seat and unseat of a steward-capable role, and edits to the
   * veto map, keep their timing and window like any Game change but are NOT
   * vetoable." Not vetoable is a different fact from no window: the village
   * still sees the instant, the countdown still runs, the digest still names
   * it, and the one thing that cannot happen is a steward stopping it. Folding
   * the two into one flag is what made a veto-map edit execute at close with no
   * notice to anybody, which is the harm the rule was written against.
   */
  notVetoable?: boolean;
  /**
   * TRUE WHEN THIS DECISION MAY ONLY LAND ON A BOUNDARY.
   *
   * A cycle-timed dial, a minting rule or a stage multiplier changes the basis
   * a running cycle is being settled against. Landing one mid-cycle moves a
   * ceiling under a member who is already spending against it, so the instant
   * snaps forward to the next boundary on EVERY path, at_acceptance included.
   */
  snapToBoundary?: boolean;
}

export interface Landing {
  /** When the decision takes effect, or null when it takes effect at close. */
  landsAt: Date | null;
  /** When the steward's door shuts. Always equal to `landsAt`, or null with it. */
  vetoClosesAt: Date | null;
  /** True when the close itself executes it and there is no window. */
  executesAtClose: boolean;
  /** False when no steward may stop this one, whatever the window says. */
  vetoable: boolean;
  /** The sentence a member reads on the decision page. */
  because: string;
}

/**
 * THE ONE PLACE THAT DECIDES WHEN A CARRIED DECISION HAPPENS.
 *
 * Five rules, and every one of them is the founder's sentence read literally:
 *
 *  1. A subject with no window executes at close, always. Only the Birthing,
 *     which happens before any seat exists to use a window.
 *  2. A TOKEN_SEND chosen `at_acceptance` executes at close. The steward's brake
 *     on it was their no vote while the ballot was open.
 *  3. A GAME_CHANGE chosen `at_acceptance` still cannot land before its window
 *     closes, so it lands at `closesAt + vetoHours`. "At acceptance" buys the
 *     proposer the earliest instant the ruling allows and never an instant the
 *     ruling forbids.
 *  4. Anything chosen `next_moon` lands at the LATER of the next boundary of the
 *     active clock and `closesAt + vetoHours`. That is the late-carry rule: a
 *     vote that carries with more than three days of the cycle left lands on the
 *     boundary; a vote that carries on the last day lands three days into the
 *     next one, because a steward is owed 72 hours whatever the sky is doing.
 *  5. A set that must land on a boundary snaps forward to the first boundary at
 *     or after whatever the four rules above produced, on every path.
 *
 * A TOKEN_SEND chosen `next_moon` is rule 4 like everything else, and a steward
 * may veto it inside its window, because the founder's later ruling ("stewards
 * can also block payouts") plus the timing choice means a payout that waits is
 * a payout that can be stopped.
 */
export function landingFor(input: LandingInput): Landing {
  const windowMs = Math.max(0, input.vetoHours) * 60 * 60 * 1000;
  const windowClose = new Date(input.closesAt.getTime() + windowMs);
  const vetoable = !input.notVetoable;

  if (input.noWindow) {
    return {
      landsAt: null,
      vetoClosesAt: null,
      executesAtClose: true,
      vetoable: false,
      because:
        "This one takes effect the moment it carries. It is the village's own beginning, and there is no seat yet that a waiting window could be a door for.",
    };
  }

  const snapped = (at: Date): Date => {
    if (!input.snapToBoundary) return at;
    /*
     * STRICTLY AFTER OR AT. `nextBoundaryAfter` is strict, so an instant that
     * already sits exactly on a boundary would otherwise be pushed a whole
     * cycle further out for no reason a member could read.
     */
    const boundary = input.nextBoundaryAfter(new Date(at.getTime() - 1));
    return boundary.getTime() >= at.getTime() ? boundary : at;
  };

  const stopper = vetoable
    ? "A steward can stop it until then."
    : "Nobody can stop this one: the village decided it about the seat itself, so the seat has no say in it.";

  if (input.kind === "token_send" && input.timing === "at_acceptance" && !input.snapToBoundary) {
    return {
      landsAt: null,
      vetoClosesAt: null,
      executesAtClose: true,
      vetoable: false,
      because: "This decision sends tokens as soon as it is accepted, so it takes effect the moment the vote closes.",
    };
  }

  if (input.timing === "at_acceptance") {
    const at = snapped(windowClose);
    return {
      landsAt: at,
      vetoClosesAt: at,
      executesAtClose: false,
      vetoable,
      because:
        at.getTime() > windowClose.getTime()
          ? `This one moves a number the running cycle is being settled against, so it waits for the cycle to turn. ${stopper}`
          : `This changes the Game, so it lands ${input.vetoHours} hours after the vote closes. ${stopper}`,
    };
  }

  const boundary = input.nextBoundaryAfter(input.closesAt);
  const later = boundary.getTime() > windowClose.getTime() ? boundary : windowClose;
  const landsAt = snapped(later);
  return {
    landsAt,
    vetoClosesAt: landsAt,
    executesAtClose: false,
    vetoable,
    because:
      boundary.getTime() > windowClose.getTime()
        ? `This starts with the next new moon. ${stopper}`
        : `The new moon is less than ${input.vetoHours} hours away, so this lands ${input.vetoHours} hours after the vote closes instead. A steward is owed the whole window.`,
  };
}

/** The subject a village votes on when it wants the vote and not the effect. */
export const ADVISORY_SUBJECT = "advisory";

/**
 * A BINDING BALLOT CANNOT BE OPENED ON A SUBJECT NOBODY CAN CLOSE.
 *
 * PLAN_TO_A item 3. The close dispatcher runs the closer registered for a
 * ballot's subject type and does nothing at all when there is none, and until
 * now nobody was told: the village voted, the vote carried, and the thing it
 * decided never happened. An advisory vote is the one honest shape of that,
 * and it is opened on the `advisory` subject on purpose, so every OTHER
 * subject with no closer is refused at the door with the advisory door named.
 *
 * Returns null when the ballot may open.
 */
export function noCloserRefusal(subjectType: string, hasCloser: boolean): string | null {
  const type = String(subjectType ?? "").trim().toLowerCase();
  if (hasCloser || type === ADVISORY_SUBJECT) return null;
  return (
    `Nothing in this build carries out a decision about ${type || "that"}, so a binding vote on it would carry and then ` +
    "change nothing, with nobody told. Hold it as a practice vote instead: an advisory ballot runs on the real engine, " +
    "counts the real roll and changes nothing on purpose."
  );
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
