/**
 * Member exit (S52, F12 — "exit from the get-go"): openStateCheck semantics
 * applied to a PERSON. Blocks 5-7 created state that makes leaving painful
 * (loans, escrows, stays, orders, debts); this file makes departure a
 * first-class process before the community is big enough to need it.
 *
 * The shape mirrors module lifecycle exactly:
 *   - ENUMERATE: every domain reports the member's open state, with a
 *     blocking flag. Enumeration reads tables directly, regardless of
 *     module lifecycle — open state can predate a module being toggled.
 *   - SETTLE: each blocking domain resolves through ITS OWN terminal paths
 *     (settleLoan stays the single loan terminal; stays end by human act;
 *     orders resolve through the trio). Exit adds exactly ONE settlement
 *     move of its own: sweeping POSITIVE balances to sys:exit-settlement,
 *     idempotent per token.
 *   - RESOLVE: refuses with the named blocking domains until clean, then
 *     the existing anonymize tombstone runs. Value rows are never deleted;
 *     conservation holds through every departure.
 *
 * The F12 hard rule, held as structure: a person is never the subject of a
 * consent decision in a general forum. Restorative content flows ONLY to
 * its recipients (notifications to the intake role); the exits row carries
 * a pointer (agreement_ref) and a status — never the content.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { balancesFor, memberAccount, postTransfer } from "./ledger";

export const EXIT_SETTLEMENT = "sys:exit-settlement";

export interface ExitDomainState {
  domain: string;
  count: number;
  description: string;
  /** True = resolve() refuses while this stands. */
  blocking: boolean;
}

export interface ExitRow {
  id: string;
  userId: string;
  kind: "voluntary" | "involuntary";
  status: "open" | "settling" | "resolved" | "cancelled";
  openedBy: string;
  noticeEndsAt: string | null;
  agreementRef: string | null;
  resolution: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

function rowToExit(r: RowDataPacket): ExitRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    kind: r.kind,
    status: r.status,
    openedBy: String(r.opened_by),
    noticeEndsAt: r.notice_ends_at ? new Date(r.notice_ends_at).toISOString() : null,
    agreementRef: r.agreement_ref ?? null,
    resolution: r.resolution ?? null,
    openedAt: new Date(r.opened_at).toISOString(),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
  };
}

export async function exitById(pool: Pool, id: string): Promise<ExitRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM exits WHERE id = ?", [id]);
  return rows[0] ? rowToExit(rows[0]) : null;
}

export async function allExits(pool: Pool): Promise<ExitRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM exits ORDER BY opened_at DESC LIMIT 200");
  return rows.map(rowToExit);
}

export async function openExitFor(pool: Pool, userId: string): Promise<ExitRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM exits WHERE user_id = ? AND status IN ('open','settling') LIMIT 1",
    [userId],
  );
  return rows[0] ? rowToExit(rows[0]) : null;
}

/**
 * One non-terminal exit per member: leaving is one conversation, not a
 * stack of tickets.
 */
export async function createExit(
  pool: Pool,
  input: { userId: string; kind: "voluntary" | "involuntary"; openedBy: string; noticeDays: number; note?: string | null },
): Promise<{ ok: true; exit: ExitRow } | { ok: false; error: string }> {
  const existing = await openExitFor(pool, input.userId);
  if (existing) return { ok: false, error: `An exit is already ${existing.status} for this member` };
  const id = `exit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const noticeEnds = input.noticeDays > 0 ? new Date(Date.now() + input.noticeDays * 24 * 3600 * 1000) : null;
  await pool.query(
    "INSERT INTO exits (id, user_id, kind, status, opened_by, notice_ends_at, resolution) VALUES (?,?,?,?,?,?,?)",
    [id, input.userId, input.kind, "open", input.openedBy, noticeEnds, input.note?.slice(0, 2000) ?? null],
  );
  return { ok: true, exit: (await exitById(pool, id))! };
}

/**
 * The per-member open-state enumeration. roleIds are passed in (the caller
 * owns role storage); everything else reads its domain's table directly.
 */
export async function exitOpenState(pool: Pool, userId: string, roleIds: string[]): Promise<ExitDomainState[]> {
  const states: ExitDomainState[] = [];

  const [[loans]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM library_loans WHERE user_id = ? AND settled_at IS NULL",
    [userId],
  );
  states.push({
    domain: "loans",
    count: Number(loans.n),
    description: `${loans.n} unsettled library loan(s). Settle each through its own terminal (return, cancel, expire, dispute)`,
    blocking: true,
  });

  const [[stays]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM stays WHERE user_id = ? AND status IN ('requested','active')",
    [userId],
  );
  const [[purchases]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM stay_purchases WHERE user_id = ? AND status IN ('pending','disputed')",
    [userId],
  );
  states.push({
    domain: "stays",
    count: Number(stays.n) + Number(purchases.n),
    description: `${stays.n} requested/active stay(s), ${purchases.n} pending/disputed purchase(s)`,
    blocking: true,
  });

  const [[orders]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM exchange_orders WHERE user_id = ? AND status IN ('pending','disputed')",
    [userId],
  );
  states.push({
    domain: "exchange",
    count: Number(orders.n),
    description: `${orders.n} pending/disputed exchange order(s)`,
    blocking: true,
  });

  const balances = await balancesFor(pool, memberAccount(userId));
  const negative = Object.entries(balances).filter(([, v]) => v < 0);
  const positive = Object.entries(balances).filter(([, v]) => v > 0);
  states.push({
    domain: "debts",
    count: negative.length,
    description: negative.length
      ? `owes ${negative.map(([t, v]) => `${-v} ${t}`).join(", ")}. Resolve through the owning domain before leaving`
      : "no negative balances",
    blocking: true,
  });
  states.push({
    domain: "balances",
    count: positive.length,
    description: positive.length
      ? `holds ${positive.map(([t, v]) => `${v} ${t}`).join(", ")}. Swept to exit settlement by an explicit admin act`
      : "nothing held",
    blocking: false,
  });

  states.push({
    domain: "roles",
    count: roleIds.length,
    description: roleIds.length
      ? `holds ${roleIds.join(", ")}. Seats vacate at resolution; hand off the work first`
      : "no seats held",
    blocking: false,
  });

  const [[warnings]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM badge_awards a JOIN badges b ON b.id = a.badge_id " +
      "WHERE a.user_id = ? AND b.kind = 'warning' AND b.active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW())",
    [userId],
  );
  states.push({
    domain: "warnings",
    count: Number(warnings.n),
    description: Number(warnings.n) ? `${warnings.n} active warning badge(s): context for the conversation, not a gate` : "none",
    blocking: false,
  });

  return states;
}

export function blockingStates(states: ExitDomainState[]): ExitDomainState[] {
  return states.filter((s) => s.blocking && s.count > 0);
}

/**
 * The ONE settlement move exit owns: sweep every POSITIVE balance to
 * sys:exit-settlement. Idempotent per (exit, token) — a double click or a
 * crash-retry sweeps nothing twice. Negative balances are never touched
 * here: a debt resolves through the domain that created it.
 */
export async function sweepBalances(
  pool: Pool,
  input: { exitId: string; userId: string },
): Promise<{ swept: Record<string, number>; errors: string[] }> {
  const balances = await balancesFor(pool, memberAccount(input.userId));
  const swept: Record<string, number> = {};
  const errors: string[] = [];
  for (const [token, amount] of Object.entries(balances)) {
    if (amount <= 0) continue;
    const r = await postTransfer(pool, {
      from: memberAccount(input.userId),
      to: EXIT_SETTLEMENT,
      tokenType: token,
      amount,
      source: "exit_settlement",
      sourceRef: input.exitId,
      description: "Balance settled at departure",
      idempotencyKey: `exit:${input.exitId}:sweep:${token}`,
    });
    if (r.ok) swept[token] = amount;
    else errors.push(`${token}: ${r.error}`);
  }
  return { swept, errors };
}
