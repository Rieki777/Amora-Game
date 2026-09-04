/**
 * Every sentence the needs ceremony says, and the shapes it says them about.
 *
 * WHY THE COPY IS A FILE OF ITS OWN. Two callers print the same sentences (the
 * panel's screen 4 and its screen 6 both print the totality line, and the Setup
 * Wizard's step prints the scope line), and a test that wants to pin the exact
 * words a founder reads should be able to ask for them without rendering a
 * tree. A sentence built inline in JSX can only be asserted through markup, and
 * then a layout change breaks a copy test.
 *
 * The types are named against `server/lib/needs.ts`'s own, so a change there is
 * a compile error here and never a blank space on screen.
 *
 * NO CLASS NAMES IN THIS FILE. `scripts/check-theme-literals.mjs` and
 * `scripts/check-tailwind-gray.mjs` walk `.tsx` only, so a className parked in
 * a `.ts` file is a colour nobody checks. Every one of them lives in
 * `NeedsPieces.tsx`.
 */
import {
  HUMAN_NEEDS,
  NEED_DEPTHS,
  NEED_DEPTH_LABELS,
  type NeedDepth,
  type NeedSubject,
} from "@shared/needs";

/* -------------------------------------------------------------------------- *
 * What the server sends. Named against server/lib/needs.ts's own types so a
 * change there is a compile error here and never a blank space on screen.
 * -------------------------------------------------------------------------- */

export interface ScopeRow {
  id: string;
  needKey: string;
  label: string;
  isCustom: boolean;
  depthTarget: NeedDepth;
  breadthTargetPct: number;
  note: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ScopeSummary {
  answered: boolean;
  adopted: number;
  platformAdopted: number;
  customAdopted: number;
  retired: number;
  deepestTarget: NeedDepth | null;
}

export interface CoverageRow {
  needKey: string;
  label: string;
  depthTarget: NeedDepth;
  breadthTargetPct: number;
  counts: Record<NeedSubject, number>;
  total: number;
  primaryCount: number;
  uncovered: boolean;
}

export interface SeatingRow {
  needKey: string;
  label: string;
  seatsNeeded: number;
  seatsFilled: number;
  rolesWithNobodyInThem: Array<{ roleId: string; name: string; seats: number; held: number }>;
}

export interface CoverageReport {
  answered: boolean;
  summary: ScopeSummary;
  coverage: CoverageRow[];
  seatings: SeatingRow[];
  uncovered: string[];
}

/** One tag this sitting added, kept so its Remove button has an id to send. */
export interface FreshLink {
  id: string;
  needKey: string;
  subjectType: NeedSubject;
  subjectRef: string;
  subjectName: string;
}

/** What a founder is choosing for one need, before any of it is saved. */
export interface NeedDraft {
  key: string;
  label: string;
  isCustom: boolean;
  on: boolean;
  depth: NeedDepth;
  breadth: string;
  note: string;
}

export type Drafts = Record<string, NeedDraft>;

/* -------------------------------------------------------------------------- *
 * Pure copy. Every sentence a founder reads is built here, so a test can
 * assert the sentence and not a fragment of markup.
 * -------------------------------------------------------------------------- */

/** The five screens before the summary, in the order the ceremony asks them. */
export const SCREENS = [
  { n: 1, title: "What this village is for" },
  { n: 2, title: "How far, on each" },
  { n: 3, title: "For how many" },
  { n: 4, title: "How much of each person's needs" },
  { n: 5, title: "What meets them" },
  { n: 6, title: "The whole of it" },
] as const;

/**
 * What one rung means for one need, as a sentence.
 *
 * THE FIVE WORDS ARE THE DECK'S AND THESE SENTENCES ARE NOT. The deck prints
 * the ladder against an axis labelled "Depth of Needs to Meet" and gives no
 * definition of any rung: what it gives beside them is a scatter of example
 * organisations positioned against BOTH axes at once, so reading one of those
 * examples as the meaning of a rung would be inventing a claim the slide does
 * not make. Screen 2 says on the page that the five words are the deck's and
 * the sentences are this platform's reading of them.
 */
export function rungMeaning(depth: NeedDepth, label: string): string {
  if (depth === "deprived") return `${label} goes unmet here, and this village is not taking that on.`;
  if (depth === "unmet") return `This village sees that ${label} is short and has not built for it yet.`;
  if (depth === "alive") return `${label} is alive here, and no member can count on it.`;
  if (depth === "satisfied") return `A member can count on this village for ${label}.`;
  return `People come here for ${label}, and it is one of the reasons this village exists.`;
}

/** The depth half of the summary sentence. */
export function depthPhrase(rows: ScopeRow[]): string {
  const live = rows.filter((r) => r.active);
  if (live.length === 0) return "";
  const indexes = live.map((r) => NEED_DEPTHS.indexOf(r.depthTarget));
  const low = Math.min(...indexes);
  const high = Math.max(...indexes);
  if (low === high) return `at ${NEED_DEPTH_LABELS[NEED_DEPTHS[low]]} or better`;
  return `at targets from ${NEED_DEPTH_LABELS[NEED_DEPTHS[low]]} to ${NEED_DEPTH_LABELS[NEED_DEPTHS[high]]}`;
}

/** The breadth half of the summary sentence. */
export function breadthPhrase(rows: ScopeRow[]): string {
  const live = rows.filter((r) => r.active);
  if (live.length === 0) return "";
  const pcts = live.map((r) => r.breadthTargetPct);
  const low = Math.min(...pcts);
  const high = Math.max(...pcts);
  if (low === high) return low === 100 ? "for all of its members" : `for ${low} percent of its members`;
  return `for between ${low} and ${high} percent of its members, need by need`;
}

/**
 * The sentence screens 4 and 6 both print, and the one a founder reads aloud.
 *
 * FOUR OF THE TEN AT SATISFIED FOR EVERYONE READS EXACTLY:
 *
 *   This village aims to meet 4 of the 10 needs, at Satisfied or better, for
 *   all of its members.
 *
 * The denominator is the ten plus whatever custom needs this village wrote,
 * because that is the list it chose from. An empty scope and a scope of zero
 * are different facts and get different sentences: `answered` is false only
 * for a village with no rows at all.
 */
export function totalitySentence(rows: ScopeRow[], answered: boolean): string {
  const live = rows.filter((r) => r.active);
  if (live.length === 0) {
    return answered
      ? "This village has taken on none of the needs on its list. Everything it named has been retired."
      : "This village has not said which needs it is taking on.";
  }
  const total = HUMAN_NEEDS.length + rows.filter((r) => r.isCustom).length;
  return `This village aims to meet ${live.length} of the ${total} needs, ${depthPhrase(rows)}, ${breadthPhrase(rows)}.`;
}

/** One line per need in scope, for the summary a founder reads aloud. */
export function needSentence(row: ScopeRow): string {
  const depth = NEED_DEPTH_LABELS[row.depthTarget];
  const who = row.breadthTargetPct === 100 ? "every member" : `${row.breadthTargetPct} percent of members`;
  return `${row.label}, at ${depth} or better, for ${who}.`;
}

/** What screen 5 says about a need with nothing tagged to it. */
export function uncoveredSentence(label: string): string {
  return `Nothing in this village meets ${label} yet. A quest or a seat tagged to it will show here.`;
}

/** R18 in one line: roles needed, of roles filled, for one need. */
export function seatSentence(row: SeatingRow): string {
  if (row.seatsNeeded === 0) {
    return `No seat is tagged to ${row.label}, so there is no seat count to give for it.`;
  }
  return `${row.seatsFilled} of the ${row.seatsNeeded} seats tagged to ${row.label} are held.`;
}

/**
 * The one line the Setup Wizard step shows above its button.
 *
 * A NULL SUMMARY IS NOT A ZERO. The read has not landed, or it refused, and
 * that is a different fact from a village that took on nothing. The step's own
 * row says the same thing through `needsObservation`, and these two must agree.
 */
export function stepSummaryLine(summary: ScopeSummary | null): string {
  if (summary === null) {
    return "The needs scope has not been read back yet, so this step says nothing about it either way.";
  }
  if (summary.adopted === 0) {
    return summary.answered
      ? "Everything this village took on has since been retired, so nothing is in scope."
      : "Nothing is in scope yet. The first screen is where a village says what it is for.";
  }
  const needs = `${summary.adopted} need${summary.adopted === 1 ? "" : "s"} in scope`;
  return summary.retired > 0 ? `${needs}, and ${summary.retired} retired.` : `${needs}.`;
}

/* -------------------------------------------------------------------------- *
 * The panel.
 * -------------------------------------------------------------------------- */

export function draftsFrom(scope: ScopeRow[]): { drafts: Drafts; order: string[] } {
  const drafts: Drafts = {};
  const order: string[] = [];
  for (const need of HUMAN_NEEDS) {
    order.push(need.id);
    drafts[need.id] = {
      key: need.id,
      label: need.label,
      isCustom: false,
      on: false,
      depth: "satisfied",
      breadth: "100",
      note: "",
    };
  }
  for (const row of scope) {
    if (!drafts[row.needKey]) order.push(row.needKey);
    drafts[row.needKey] = {
      key: row.needKey,
      label: row.label,
      isCustom: row.isCustom,
      on: row.active,
      depth: row.depthTarget,
      breadth: String(row.breadthTargetPct),
      note: row.note ?? "",
    };
  }
  return { drafts, order };
}
