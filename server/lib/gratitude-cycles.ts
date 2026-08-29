/**
 * Gratitude lunar-cycle engine for Amora.
 *
 * Revision 2, step 5. This is the heartbeat. Before it, Gratitude accumulated
 * and nothing ever happened: a scoreboard, not an economy. Cycle close is the
 * moment a lunation is settled and the village can see what the month actually
 * was.
 *
 * HOW THIS DIFFERS FROM REGEN-CIVICS, deliberately. regen-civics settles a fixed
 * $ReGen pool, splitting it pro-rata by weighted gratitude received, because
 * there $ReGen is the compensation token being released. Amora's equity token
 * (Amora) lives on Base and is governed by Hypha, so the platform must NOT mint
 * or move it. Amora's Gratitude is instead a directly spendable in-site balance
 * credited at send time.
 *
 * So close does NOT distribute value here. It:
 *   1. settles the lunation, recording per-recipient totals for the cycle,
 *   2. resets sending budgets by rolling the cycle over,
 *   3. leaves an auditable record the profile and command centre read.
 *
 * That keeps exactly one source of truth for real value (Hypha) while still
 * giving the village a rhythm. If a compensation token is ever issued inside the
 * platform, the pro-rata release from regen's `computePoolShares` is the shape to
 * copy, and it belongs here.
 *
 * Cycle boundaries come from shared/lunar.ts, a verbatim port, so Amora and
 * regen-civics never disagree about which lunation an acknowledgment fell in.
 */
import { cycleBoundsFor, cycleBoundsByNumber } from "../../shared/lunar";

export interface GratitudeEntryLike {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  cycleId: string;
  /** 'gratitude' (a written acknowledgment) or 'heart' (a tap on content). */
  kind?: string;
  at?: string;
}

export interface CycleRecord {
  id: string;
  cycleNumber: number;
  startsAt: string;
  endsAt: string;
  status: "open" | "distributing" | "closed";
  closedAt?: string | null;
}

export interface DistributionRecord {
  id: string;
  cycleId: string;
  userId: string;
  received: number;
  distinctSenders: number;
  /**
   * The ReGen pool model (Rye, 2026-07-26): how much of the cycle's value pool
   * this member was credited, and in which token. Recognition is the signal;
   * this is the value it released. Absent/0 on cycles closed before the pool
   * existed or when the pool is off.
   */
  credited?: number;
  poolToken?: string | null;
  /** Channel split (S27): hearts vs written acknowledgments, never blended. */
  receivedHearts?: number;
  receivedAcks?: number;
  createdAt: string;
}

/**
 * THE ONE CYCLE ID. Every `cycle_id` column in this build carries this string
 * and no other, and this is the only function allowed to make one.
 *
 * It has not always been. `server/lib/economy.ts` grew a second formatter that
 * wrote `moon-329` for the same lunation this one calls `lunar-000329`, into
 * the same column, and the two never learned about each other. A member's
 * spending was then counted twice, once against each half of the table, so
 * they moved 130 in a lunation whose two allowances were 100 and 30. The
 * settlement, which only matches `lunar-`, read 100 of those 130 and reported
 * the other 30 to nobody. `economy.ts` now imports this function, and
 * `cycleId.test.ts` fails if a second spelling ever appears.
 *
 * Lunation-based, and zero-padded so a plain string sort is a chronological
 * sort: "lunar-000328" then "lunar-000329".
 *
 * The scheme before this one was `YYYY-MM` (calendar month). Old rows keep
 * their old ids, and `unreadableCycleIds` below now REFUSES them out loud
 * rather than dropping them quietly, because a settlement that skips rows it
 * cannot read prices a village wrong and says nothing.
 */
export function cycleIdFor(date: Date = new Date()): string {
  return formatCycleId(cycleBoundsFor(date).cycleNumber);
}

export function formatCycleId(cycleNumber: number): string {
  return `lunar-${String(cycleNumber).padStart(6, "0")}`;
}

/** Parse a lunar cycle id back to its number, or null if it is not one. */
export function parseCycleId(cycleId: string): number | null {
  const m = /^lunar-(\d{1,9})$/.exec(cycleId);
  return m ? Number(m[1]) : null;
}

/**
 * Every cycle id in `entries` that this build cannot read, once each.
 *
 * A row whose id nothing can parse is not a row that belongs to some other
 * lunation. It is a row nobody knows the lunation of, and the honest answer is
 * to stop and say so. The alternative shipped: `settleCycle` filtered on
 * equality and `dueCycles` dropped anything `parseCycleId` returned null for,
 * so 30 of 130 units vanished from a settlement, every total under them was
 * wrong, and no surface anywhere said a number was missing.
 *
 * Two readers, one list, so the preview an admin reads before pressing close
 * and the close itself can never disagree about what is unreadable.
 */
export function unreadableCycleIds(entries: readonly GratitudeEntryLike[]): string[] {
  const bad = new Set<string>();
  for (const e of entries) {
    const id = String(e.cycleId ?? "");
    if (parseCycleId(id) === null) bad.add(id);
  }
  return Array.from(bad).sort();
}

/**
 * The sentence an admin reads instead of a settlement that quietly lost rows.
 * Plain words and the ids themselves, because the fix is a migration somebody
 * has to write and they need to know what they are looking at.
 */
export function unreadableCycleProblem(entries: readonly GratitudeEntryLike[]): string | null {
  const bad = unreadableCycleIds(entries);
  if (bad.length === 0) return null;
  const shown = bad.slice(0, 5).map((id) => (id === "" ? "(empty)" : id));
  const more = bad.length > shown.length ? `, and ${bad.length - shown.length} more` : "";
  const rows = entries.filter((e) => parseCycleId(String(e.cycleId ?? "")) === null).length;
  return (
    `${rows} recognition row(s) carry a cycle id this build cannot read: ` +
    `${shown.join(", ")}${more}. The settlement stops here. A total that leaves ` +
    `rows out quietly is wrong in a way nobody can see afterwards. Give these rows ` +
    `a lunar-NNNNNN id, then run the close again.`
  );
}

/** Throw on anything unreadable. The last door before a total gets made. */
function refuseUnreadable(entries: readonly GratitudeEntryLike[]): void {
  const problem = unreadableCycleProblem(entries);
  if (problem) throw new Error(problem);
}

/** Cycle metadata for the current lunation, for display and settlement. */
export function currentCycle(date: Date = new Date()): CycleRecord {
  const b = cycleBoundsFor(date);
  return {
    id: formatCycleId(b.cycleNumber),
    cycleNumber: b.cycleNumber,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: "open",
  };
}

/**
 * Settle one cycle from its acknowledgments: per-recipient totals and how many
 * distinct people acknowledged them.
 *
 * Pure, so it is unit-testable with no database and no clock. `distinctSenders`
 * is the interesting number socially: ten acknowledgments from one person is a
 * friendship, ten from ten people is a reputation.
 */
export interface SettleTotals {
  userId: string;
  received: number;
  /** The channel split (S27): a tap and a written appreciation are different
   *  signals, and the founders carry this report to Hypha — never blend them. */
  receivedHearts: number;
  receivedAcks: number;
  /**
   * Breadth, Sybil-filtered (economy invariant 2.2 #9): when an eligibility
   * set is provided, only those senders count toward distinctSenders. Free
   * guest accounts have real budgets, so alt farms could inflate breadth
   * metrics — and badges later escalate breadth into capabilities.
   */
  distinctSenders: number;
  /**
   * Recognition received FROM ELIGIBLE SENDERS ONLY — the number the value
   * pool is split by.
   *
   * `received` above is the honest total of what people sent, and the founders
   * carry that figure and its channel split to Hypha, so it stays whole. But
   * splitting real value pro-rata by it meant the Sybil filter guarded
   * breadth and not money: an alt farm's recognition was refused a place in
   * `distinctSenders` one line later while still enlarging its owner's share
   * of the pool. Filtering the metric and not the payout protects the
   * leaderboard and leaves the treasury open.
   */
  receivedEligible: number;
}

export function settleCycle(
  entries: readonly GratitudeEntryLike[],
  cycleId: string,
  eligibleSenders?: ReadonlySet<string>,
): SettleTotals[] {
  // Before any arithmetic. Everything below produces numbers a member reads as
  // facts about their moon, so a row this build cannot place must stop the
  // total rather than be quietly absent from it.
  refuseUnreadable(entries);
  const inCycle = entries.filter((e) => e.cycleId === cycleId);
  const byRecipient = new Map<
    string,
    { received: number; eligible: number; hearts: number; acks: number; senders: Set<string> }
  >();
  for (const e of inCycle) {
    if (!e.toId) continue;
    const row = byRecipient.get(e.toId) ?? { received: 0, eligible: 0, hearts: 0, acks: 0, senders: new Set<string>() };
    const amount = Number(e.amount) || 0;
    row.received += amount;
    if (e.kind === "heart") row.hearts += amount;
    else row.acks += amount;
    // One eligibility test, applied to BOTH the breadth metric and the
    // amount that will decide a share of real value.
    if (!eligibleSenders || eligibleSenders.has(e.fromId)) {
      row.senders.add(e.fromId);
      row.eligible += amount;
    }
    byRecipient.set(e.toId, row);
  }
  return Array.from(byRecipient.entries())
    .map(([userId, r]) => ({
      userId,
      received: r.received,
      receivedEligible: r.eligible,
      receivedHearts: r.hearts,
      receivedAcks: r.acks,
      distinctSenders: r.senders.size,
    }))
    .sort((a, b) => b.received - a.received || a.userId.localeCompare(b.userId));
}

/**
 * Which lunations are finished but not yet recorded as closed.
 * Returns oldest first so a long gap settles in order rather than skipping.
 */
export function dueCycles(
  existing: readonly CycleRecord[],
  entries: readonly GratitudeEntryLike[],
  now: Date = new Date(),
): CycleRecord[] {
  // A lunation this cannot read is a lunation it would never list as due, so a
  // cycle whose whole activity came through the unreadable door would never be
  // offered for closing and nothing would say why. Refuse instead.
  refuseUnreadable(entries);
  const currentNumber = cycleBoundsFor(now).cycleNumber;
  const closed = new Set(existing.filter((c) => c.status === "closed").map((c) => c.cycleNumber));

  // Any lunation with activity, or already tracked, that has ended and is unclosed.
  const candidates = new Set<number>();
  for (const c of existing) candidates.add(c.cycleNumber);
  for (const e of entries) {
    const n = parseCycleId(e.cycleId);
    // Never null here: refuseUnreadable above threw on anything that parses to
    // null. The check stays so a future edit that moves the refusal cannot
    // silently reopen the hole this whole file exists to close.
    if (n !== null) candidates.add(n);
  }

  return Array.from(candidates)
    .filter((n) => n < currentNumber && !closed.has(n))
    .sort((a, b) => a - b)
    .map((n) => {
      const b = cycleBoundsByNumber(n);
      return {
        id: formatCycleId(n),
        cycleNumber: n,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: "open" as const,
      };
    });
}
