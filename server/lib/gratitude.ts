/**
 * The gratitude service (S8): budget math and the send path, extracted from
 * the route so future modules can acknowledge people without re-implementing
 * the rules. D5's forum hearts call sendGratitude() with kind:'heart' and a
 * context; the /api/game/gratitude/send route calls it with the defaults.
 * One set of guards, whoever the caller is.
 *
 * The host injects its dependencies (pool, repos, the variables file, the
 * stage multiplier) rather than this module importing server/index.ts —
 * the service must never need the whole server to exist before it can move
 * one token.
 */
import type { Pool } from "mysql2/promise";
import { boolVar, numberVar } from "./variables";
import { cycleIdFor, parseCycleId } from "./gratitude-cycles";
import { memberAccount, postTransfer, RECOGNITION_FAUCET } from "./ledger";
import type { GratitudeLogRepo, GratitudeEntry } from "../repos/gratitude";
import type { UsersRepo } from "../repos/users";

export interface GratitudeDeps {
  pool: Pool;
  variablesFile: string;
  log: GratitudeLogRepo;
  members: UsersRepo;
  /** stage.gratitudeMultiplier for this member — stage rules stay in the host. */
  stageMultiplierFor(user: any): number;
}

export interface GratitudeBudget {
  total: number;
  spent: number;
  remaining: number;
  cycleId: string;
}

/** Budget = base variable × stage multiplier, minus what this cycle already spent. */
export async function budgetFor(deps: GratitudeDeps, user: any): Promise<GratitudeBudget> {
  const total = Math.round(
    numberVar(deps.variablesFile, "gratitude.base_budget") * deps.stageMultiplierFor(user),
  );
  const cycleId = cycleIdFor(new Date());
  const log = await deps.log.all();
  const spent = log
    .filter((g) => g.fromId === user.id && g.cycleId === cycleId)
    .reduce((acc, g) => acc + (g.amount ?? 0), 0);
  return { total, spent, remaining: Math.max(0, total - spent), cycleId };
}

export interface SendInput {
  fromUser: any;
  toEmail?: string;
  toId?: string;
  amount: number;
  message?: string;
  /** 'gratitude' (default) = budgeted send. 'heart' (D5) = content acknowledgment. */
  kind?: string;
  contextType?: string;
  contextRef?: string;
}

export type SendOutcome =
  | { ok: true; entry: GratitudeEntry; recipient: any; budget: GratitudeBudget }
  | { ok: false; status: number; error: string };

/**
 * The one send path. Order of refusals is part of the contract (the loop test
 * asserts the guard messages): bad input → unknown recipient → self-send →
 * no budget → over budget → per-recipient cap. Then: log row (the heart
 * index may refuse a duplicate), ledger post (recognition issues from the
 * faucet — the sender spends BUDGET, not balance), recipient cache update.
 */
export async function sendGratitude(deps: GratitudeDeps, input: SendInput): Promise<SendOutcome> {
  const user = input.fromUser;
  const kind = input.kind ?? "gratitude";
  const amt = Math.floor(Number(input.amount) || 0);
  if ((!input.toEmail && !input.toId) || amt <= 0) {
    return { ok: false, status: 400, error: "Recipient and a positive amount are required" };
  }
  if (kind === "gratitude" && boolVar(deps.variablesFile, "gratitude.require_message") && !String(input.message ?? "").trim()) {
    return { ok: false, status: 400, error: "A few words of appreciation are required" };
  }

  const recipient = input.toId
    ? await deps.members.byId(input.toId)
    : await deps.members.byEmail(String(input.toEmail));
  if (!recipient) return { ok: false, status: 404, error: "No member found with that email" };
  if (recipient.id === user.id) return { ok: false, status: 400, error: "Gratitude flows to others" };

  const budget = await budgetFor(deps, user);
  if (budget.total <= 0) {
    return { ok: false, status: 403, error: "Your sending budget unlocks as you progress on the path" };
  }
  if (amt > budget.remaining) {
    return { ok: false, status: 400, error: `Only ${budget.remaining} left in your budget this cycle` };
  }

  const log = await deps.log.all();
  const already = log.filter(
    (g) => g.fromId === user.id && g.toId === recipient.id && g.cycleId === budget.cycleId && g.kind === kind,
  ).length;
  if (already >= numberVar(deps.variablesFile, "gratitude.max_per_recipient_per_cycle")) {
    return { ok: false, status: 409, error: "You have already acknowledged them this cycle" };
  }

  const entry: GratitudeEntry = {
    id: `grat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    fromId: user.id,
    fromName: user.name,
    toId: recipient.id,
    toName: recipient.name,
    amount: amt,
    message: String(input.message ?? "").trim(),
    contextType: input.contextType ?? null,
    contextRef: input.contextRef ?? null,
    cycleId: budget.cycleId,
    cycleNumber: parseCycleId(budget.cycleId),
    at: new Date().toISOString(),
  };
  const wrote = await deps.log.add(entry);
  if (wrote.duplicate) {
    // The unique heart index spoke: this sender already acknowledged this
    // content. One heart per person per thing is the rule, not an error state.
    return { ok: false, status: 409, error: "You have already acknowledged this" };
  }

  // Recognition ISSUES at send. Keyed on the acknowledgment id, so a retry
  // credits once; the balance column is a recomputed cache of the ledger.
  const credit = await postTransfer(deps.pool, {
    from: RECOGNITION_FAUCET,
    to: memberAccount(recipient.id),
    amount: amt,
    source: kind === "heart" ? "heart_received" : "gratitude_received",
    sourceRef: entry.id,
    description: `Gratitude from ${String(user.name ?? "").split(" ")[0]}`,
    idempotencyKey: `gratitude_received:${entry.id}`,
  });
  if (!credit.ok) {
    return { ok: false, status: 500, error: credit.error ?? "ledger refused the credit" };
  }
  await deps.members.update(recipient.id, (u: any) => {
    u.recognitionBalance = credit.toBalance;
  });

  return { ok: true, entry, recipient, budget: await budgetFor(deps, user) };
}
