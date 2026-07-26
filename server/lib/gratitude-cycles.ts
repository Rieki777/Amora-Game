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
  createdAt: string;
}

/**
 * The cycle id used on every acknowledgment. Lunation-based, formatted so it is
 * readable in a JSON file and sorts correctly: "lunar-000328".
 *
 * The previous scheme was `YYYY-MM` (calendar month). Existing rows keep their
 * old ids and are simply never matched by the new ones, which is the correct
 * outcome: a member's budget resets once at changeover rather than double
 * counting a partially-spent month.
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
export function settleCycle(
  entries: readonly GratitudeEntryLike[],
  cycleId: string,
): Array<{ userId: string; received: number; distinctSenders: number }> {
  const inCycle = entries.filter((e) => e.cycleId === cycleId);
  const byRecipient = new Map<string, { received: number; senders: Set<string> }>();
  for (const e of inCycle) {
    if (!e.toId) continue;
    const row = byRecipient.get(e.toId) ?? { received: 0, senders: new Set<string>() };
    row.received += Number(e.amount) || 0;
    row.senders.add(e.fromId);
    byRecipient.set(e.toId, row);
  }
  return Array.from(byRecipient.entries())
    .map(([userId, r]) => ({ userId, received: r.received, distinctSenders: r.senders.size }))
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
  const currentNumber = cycleBoundsFor(now).cycleNumber;
  const closed = new Set(existing.filter((c) => c.status === "closed").map((c) => c.cycleNumber));

  // Any lunation with activity, or already tracked, that has ended and is unclosed.
  const candidates = new Set<number>();
  for (const c of existing) candidates.add(c.cycleNumber);
  for (const e of entries) {
    const n = parseCycleId(e.cycleId);
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
