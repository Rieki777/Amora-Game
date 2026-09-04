/**
 * The PUBLISHED exit policy (S52, F12) and the one rule that makes publishing
 * it honest.
 *
 * The flow is platform structure; the TERMS are a community decision. The
 * document therefore ships with `placeholder: true` and `/exit-policy` prints
 * a caution card above the terms while that flag stands.
 *
 * The hole this file closes: the admin editor offered a checkbox that clears
 * the caution card, and it offered no field for three of the five things the
 * page actually prints (`voluntary.valuationMethod`, `voluntary.unwindSteps`,
 * `restorative.steps`). A village could therefore tick "the community decided
 * these" and publish the platform's boilerplate as its own settled exit terms,
 * which is the highest-stakes copy on the site saying something false about
 * where it came from.
 *
 * So the acknowledgement is now a claim the server checks. `platformDefaultTerms`
 * compares each rendered term against the platform default and returns the
 * labels of the ones that still match; the route refuses to clear the flag
 * while that list is non-empty, and names every field. Adopting the platform's
 * wording is still available: write it in the village's own words, which is
 * the act the flag is claiming happened.
 *
 * `DEFAULT_EXIT_POLICY` lives here rather than in the server file so this
 * comparison is unit-testable without booting a server.
 */
import { faucetFor } from "./economy";
import { isListedForTrade } from "./exchange";
import { allTokens } from "./ledger";

export interface ExitPolicyVoluntary {
  noticePeriodDays: number;
  valuationMethod: string;
  unwindSteps: string[];
}

export interface ExitPolicyInvoluntary {
  /** The circle that decides an involuntary exit. Empty means unstated. */
  decidingDomainId: string;
  /** The circle that hears an appeal. Empty means unstated. */
  appealDomainId: string;
  process: string;
}

export interface ExitPolicyRestorative {
  intakeContactRole: string;
  steps: string[];
}

export interface ExitPolicy {
  placeholder: boolean;
  voluntary: ExitPolicyVoluntary;
  involuntary: ExitPolicyInvoluntary;
  restorative: ExitPolicyRestorative;
}

/**
 * S52 (F12): ships as an explicit PLACEHOLDER. The two prose fields say so in
 * plain language, and the two step lists are procedure a village is expected
 * to rewrite in its own words before claiming them.
 */
export const DEFAULT_EXIT_POLICY: ExitPolicy = {
  placeholder: true,
  voluntary: {
    noticePeriodDays: 30,
    valuationMethod:
      "To be decided by the community: how contributed value is honored when someone leaves. Until then, settled balances are held in exit settlement and recorded on the exit.",
    unwindSteps: [
      "Return borrowed items and settle library loans",
      "Complete or hand off any active stay; resolve open purchases",
      "Hand off roles and open work",
      "Balances are settled and recorded",
      "The account becomes a tombstone; contributions stay part of the village record",
    ],
  },
  involuntary: {
    decidingDomainId: "",
    appealDomainId: "",
    process:
      "To be decided by the community. Until then: a private conversation with the stewards precedes any formal step, always.",
  },
  restorative: {
    intakeContactRole: "",
    steps: [
      "Private intake with the contact role, never a public thread",
      "A facilitated repair conversation",
      "A written agreement with a review date; only the agreement and its status enter the record",
    ],
  },
};

/**
 * Every term `/exit-policy` prints as prose, with the label a founder reads in
 * the editor and in a refusal. The notice period is deliberately absent: 30
 * days is a number a community can genuinely land on unchanged, and a rule
 * that forced it to differ would teach founders to type 31.
 */
export const EXIT_POLICY_TERMS = [
  { key: "valuationMethod", label: "How contributed value is honored" },
  { key: "unwindSteps", label: "The steps of a voluntary departure" },
  { key: "involuntaryProcess", label: "If the village asks someone to leave" },
  { key: "restorativeSteps", label: "The restorative path" },
] as const;

export type ExitPolicyTermKey = (typeof EXIT_POLICY_TERMS)[number]["key"];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const steps = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => text(s)).filter((s) => s.length > 0) : [];

/** Whitespace and case are formatting, so they never count as new words. */
const same = (a: string, b: string): boolean =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

const sameSteps = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((s, i) => same(s, b[i]));

/**
 * Coerce an admin body into a whole policy document.
 *
 * Section-wise merge on purpose. The old route spread the body over the
 * defaults at the TOP level only, so a client that sent `voluntary` without
 * `unwindSteps` replaced the whole section and silently dropped published
 * terms. Merging per section means a partial body can only add.
 */
export function normalizeExitPolicy(body: any): ExitPolicy {
  const v = body?.voluntary ?? {};
  const i = body?.involuntary ?? {};
  const r = body?.restorative ?? {};
  const notice = Number(v.noticePeriodDays);
  return {
    placeholder: body?.placeholder === true,
    voluntary: {
      noticePeriodDays: Number.isFinite(notice) && notice >= 0 ? Math.floor(notice) : DEFAULT_EXIT_POLICY.voluntary.noticePeriodDays,
      valuationMethod: text(v.valuationMethod) || DEFAULT_EXIT_POLICY.voluntary.valuationMethod,
      unwindSteps: steps(v.unwindSteps).length ? steps(v.unwindSteps) : [...DEFAULT_EXIT_POLICY.voluntary.unwindSteps],
    },
    involuntary: {
      decidingDomainId: text(i.decidingDomainId),
      appealDomainId: text(i.appealDomainId),
      process: text(i.process) || DEFAULT_EXIT_POLICY.involuntary.process,
    },
    restorative: {
      intakeContactRole: text(r.intakeContactRole),
      steps: steps(r.steps).length ? steps(r.steps) : [...DEFAULT_EXIT_POLICY.restorative.steps],
    },
  };
}

/**
 * The labels of every rendered term whose text is still the platform's.
 *
 * An empty array is the only state in which a village may record that its
 * community decided these terms.
 */
export function platformDefaultTerms(policy: ExitPolicy): string[] {
  const d = DEFAULT_EXIT_POLICY;
  const stale: string[] = [];
  const label = (key: ExitPolicyTermKey) => EXIT_POLICY_TERMS.find((t) => t.key === key)!.label;
  if (same(policy.voluntary.valuationMethod, d.voluntary.valuationMethod)) stale.push(label("valuationMethod"));
  if (sameSteps(policy.voluntary.unwindSteps, d.voluntary.unwindSteps)) stale.push(label("unwindSteps"));
  if (same(policy.involuntary.process, d.involuntary.process)) stale.push(label("involuntaryProcess"));
  if (sameSteps(policy.restorative.steps, d.restorative.steps)) stale.push(label("restorativeSteps"));
  return stale;
}

/** The labels of every rendered term a founder emptied. A blank policy is not a policy. */
export function blankTerms(policy: ExitPolicy): string[] {
  const blank: string[] = [];
  const label = (key: ExitPolicyTermKey) => EXIT_POLICY_TERMS.find((t) => t.key === key)!.label;
  if (!policy.voluntary.valuationMethod) blank.push(label("valuationMethod"));
  if (!policy.voluntary.unwindSteps.length) blank.push(label("unwindSteps"));
  if (!policy.involuntary.process) blank.push(label("involuntaryProcess"));
  if (!policy.restorative.steps.length) blank.push(label("restorativeSteps"));
  return blank;
}

/*
 * ── THE EXIT LEVERS, AND THE COMBINATIONS THAT ARE REFUSED (R4) ────────────
 *
 * R4, in the founder's words: "This exit policy can be many things, I think we
 * build some levers so that each village can create the policy that matters
 * for them." Ten of those levers are game variables in the `Exit` category of
 * `shared/gameVariables.ts`. Six combinations of them describe a policy the
 * engine cannot honour, and a village that saves one has been told something
 * false about its own departure terms on the highest-stakes page on the site.
 *
 * WHY THE GUARD LIVES HERE. Same reason `DEFAULT_EXIT_POLICY` does, stated at
 * the top of this file: the comparison has to be unit-testable without booting
 * a server. `exitLeverFindings` and `exitLeverProblem` are PURE. Every fact
 * they need about the world arrives in the `reading` they are handed: the
 * effective value of each dial, the notice period the village publishes, and
 * the token registry reduced to the four facts a lever asks about. That is
 * what lets `exitPolicy.test.ts` drive all six refusals and the warning with
 * no database, no registry load and no Express.
 *
 * `exitLeverRefusal` is the one impure function, and it is a four-line
 * adapter: it reads the live registry and hands the pure pair a reading. The
 * variables write route calls that, so `server/index.ts` keeps one line.
 *
 * A REFUSAL AND A WARNING ARE DIFFERENT ANSWERS, and the difference is whose
 * decision it is. A refusal says the engine cannot do what the dials describe.
 * A warning says the village may genuinely mean this and somebody should see
 * it said out loud; the seventh finding is the only one of those, and it saves
 * every time.
 *
 * WHAT THIS GUARD CANNOT SEE, stated the way the other guards in this
 * repository state their own blind spots:
 *
 *   1. It runs at the variables WRITE ROUTE and nowhere else. The governance
 *      apply path (`server/index.ts`, the mechanics change-set loop) calls
 *      `setVariable` directly, and every Exit dial is Ring 2, so a passed
 *      proposal can still land a combination this refuses. Closing that means
 *      moving the call into `setVariable` itself, which is a different file
 *      and a different lane.
 *   2. It reads the published notice period at the moment a DIAL is written.
 *      Editing the published policy down to a shorter notice through the exit
 *      policy route does not come back through here, so an already-saved
 *      cooling period can outlive the term it was checked against.
 *   3. It says nothing about whether the settlement HONOURS the dials. On this
 *      ref nothing reads them at all, which each dial's own description says.
 */

/** The four facts a lever asks about one token. */
export interface ExitLeverToken {
  slug: string;
  /** The display name a refusal prints. */
  name: string;
  /** Levers-spec taxonomy: recognition | equity | voice | credit. */
  kind: string;
  /** 'platform' = this ledger moves it; 'hypha' = read-only mirror. */
  governance: "platform" | "hypha";
  active: boolean;
  /** `faucetFor(slug) !== null`: whether there is anywhere to burn it back to. */
  hasFaucet: boolean;
  /** `isListedForTrade(slug)`: purchasable or swappable on the exchange right now. */
  listedForTrade: boolean;
}

/** Everything the levers are judged against, with nothing read from the world. */
export interface ExitLeverReading {
  /** The effective raw value of one dial: the village's override, or the default. */
  value: (key: string) => string;
  /** `voluntary.noticePeriodDays` off the PUBLISHED policy, in whole days. */
  noticePeriodDays: number;
  /** The token registry, reduced. */
  tokens: ReadonlyArray<ExitLeverToken>;
}

export interface ExitLeverFinding {
  /** The dials this is about. A route refusal prefers the one being written. */
  keys: string[];
  severity: "refusal" | "warning";
  message: string;
}

const pct = (reading: ExitLeverReading, key: string): number => {
  const n = Number(reading.value(key));
  return Number.isFinite(n) ? n : 0;
};

/** "A", "A and B", "A, B and C"   the shape `platformDefaultTerms` names fields in. */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Every incoherent thing this reading describes, refusals and warnings alike.
 *
 * The order is C.3's order, which is the order a founder meets them: the two
 * kinds that can never be kept, then the account, then the Voice pair, then
 * the published term, then the one warning.
 */
export function exitLeverFindings(reading: ExitLeverReading): ExitLeverFinding[] {
  const out: ExitLeverFinding[] = [];

  // 1. Recognition. `sendRefusal` already says why in a member's words:
  // recognition "is given, never handed over". A leaver "keeping" a share of
  // it means it sits in an account that becomes a tombstone at resolve, where
  // nobody can read it. A policy that does nothing, dressed as one that does.
  if (pct(reading, "exit.keep_pct.recognition") > 0) {
    out.push({
      keys: ["exit.keep_pct.recognition"],
      severity: "refusal",
      message:
        "Recognition is a record of what happened, not a holding. It stays on the village's books either way, so a share of it is not a thing a leaver can keep.",
    });
  }

  // 2. Equity. `validateLeg` refuses to move a hypha-governed token and a boot
  // invariant requires zero equity rows in this ledger, so any share here is a
  // promise about a book this platform does not write.
  if (pct(reading, "exit.keep_pct.equity") > 0) {
    out.push({
      keys: ["exit.keep_pct.equity"],
      severity: "refusal",
      message:
        "Equity is governed on Base under Hypha and this platform never moves it. What happens to it on departure is decided there.",
    });
  }

  // 3. Burn, where something a member can hold has no faucet to go back to.
  // `faucetFor` returns null for anything outside the slugs it knows, and this
  // borrows the wording `ruleCannotPay` already uses for the same fact.
  if (reading.value("exit.remainder_account") === "burn") {
    const stranded = reading.tokens
      .filter((t) => t.governance === "platform" && t.active && !t.hasFaucet)
      .map((t) => t.name);
    if (stranded.length) {
      const one = stranded.length === 1;
      out.push({
        keys: ["exit.remainder_account"],
        severity: "refusal",
        message: `${nameList(stranded)} ${one ? "has" : "have"} no faucet, so there is nowhere to burn ${one ? "it" : "them"} back to.`,
      });
    }
  }

  // 4. A conversion that pays nothing. It would read to a departing member as
  // a conversion, and settle as a forfeit.
  if (reading.value("exit.voice_on_exit") === "convert" && pct(reading, "exit.voice_convert_rate") <= 0) {
    out.push({
      keys: ["exit.voice_on_exit", "exit.voice_convert_rate"],
      severity: "refusal",
      message: "A conversion at zero is a forfeit. Say forfeit, or set a rate.",
    });
  }

  // 5. Keeping Voice, while resolve anonymizes. `anonymizeMember` runs at
  // resolve and a tombstone is not a person who can hold voting weight. The
  // refusal names the condition that would make it available, because a
  // village reading "no" deserves to know what "yes" would take.
  if (reading.value("exit.voice_on_exit") === "keep") {
    out.push({
      keys: ["exit.voice_on_exit"],
      severity: "refusal",
      message:
        "Keeping Voice needs an account that still exists after the departure, and a resolved exit makes the account a tombstone. This becomes available when a village can record a departure without one.",
    });
  }

  // 6. A cooling period longer than the notice the village PUBLISHES. The page
  // would tell a member one number while the engine held their balance for
  // another, which is the same class of dishonesty `platformDefaultTerms`
  // already guards. Both numbers go in the sentence, because a refusal that
  // names one of them sends the founder looking for the other.
  const cooling = pct(reading, "exit.cooling_days");
  if (cooling > reading.noticePeriodDays) {
    out.push({
      keys: ["exit.cooling_days"],
      severity: "refusal",
      message: `Your published policy says ${reading.noticePeriodDays} days of notice and this would hold balances for ${cooling}. Change the published term first.`,
    });
  }

  // 7. THE WARNING, and the one finding that is never a refusal. Full credit
  // keep, no vote at any amount, on a credit token somebody can buy today: a
  // member can buy in, leave, and take everything back out with nobody asked.
  // A village may genuinely mean that, so it saves and the test run says it.
  if (pct(reading, "exit.keep_pct.credit") >= 100 && pct(reading, "exit.vote_over") === 0) {
    const buyable = reading.tokens
      .filter((t) => t.governance === "platform" && t.active && t.kind === "credit" && t.listedForTrade)
      .map((t) => t.name);
    if (buyable.length) {
      out.push({
        keys: ["exit.keep_pct.credit", "exit.vote_over"],
        severity: "warning",
        message: `Somebody can buy ${nameList(buyable)}, open an exit, and take all of it back out with nobody asked. That is a withdrawal window wearing an exit. A village may mean exactly this, so it saves; the test run flags it every time.`,
      });
    }
  }

  return out;
}

/**
 * The one sentence a save is refused with, or null when the reading is
 * coherent. Warnings never come back through here.
 *
 * `aboutKey` NARROWS the answer to the dial being written, and that narrowing
 * is load-bearing rather than cosmetic. Judging a write against every finding
 * in the reading DEADLOCKS a village holding two bad values at once: fixing
 * either one is refused because the other still stands, and neither can go
 * first. That state is reachable, because the governance apply path writes
 * through `setVariable` without passing this guard at all. So a write is
 * judged on ITSELF: a refusal comes back only when the dial being written is
 * one the finding names, and every other finding in the reading belongs to
 * the test run to report. Called with no key, which is what a whole-reading
 * check does, the first refusal in C.3's order comes back.
 */
export function exitLeverProblem(reading: ExitLeverReading, aboutKey?: string): string | null {
  const refusals = exitLeverFindings(reading).filter((f) => f.severity === "refusal");
  if (!refusals.length) return null;
  if (!aboutKey) return refusals[0].message;
  return refusals.find((f) => f.keys.includes(aboutKey))?.message ?? null;
}

/**
 * The live adapter the variables write route calls, and the only impure thing
 * in this file.
 *
 * It exists so `server/index.ts` costs one statement and no new imports beyond
 * this name: the file is under a ratchet that only turns down, and the three
 * registry reads below would otherwise be three more lines in the monolith.
 *
 * Keys outside `exit.` return null without reading anything, because no other
 * dial can move a lever and the write route runs this on every save.
 */
export function exitLeverRefusal(
  key: string,
  proposed: string,
  policy: ExitPolicy,
  rawValue: (key: string) => string,
): string | null {
  if (!key.startsWith("exit.")) return null;
  const value = String(proposed).trim();
  return exitLeverProblem(
    {
      value: (k) => (k === key ? value : rawValue(k)),
      noticePeriodDays: Number(policy?.voluntary?.noticePeriodDays ?? DEFAULT_EXIT_POLICY.voluntary.noticePeriodDays),
      tokens: allTokens().map((t) => ({
        slug: t.slug,
        name: t.name,
        kind: t.kind,
        governance: t.governance,
        active: t.active,
        hasFaucet: faucetFor(t.slug) !== null,
        listedForTrade: isListedForTrade(t.slug),
      })),
    },
    key,
  );
}
