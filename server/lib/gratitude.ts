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
import { isExampleUser } from "./examples";
import { memberAccount, postTransfer, RECOGNITION_FAUCET } from "./ledger";
import type { GratitudeLogRepo, GratitudeEntry } from "../repos/gratitude";
import type { UsersRepo } from "../repos/users";

export interface GratitudeDeps {
  pool: Pool;
  log: GratitudeLogRepo;
  members: UsersRepo;
  /** stage.gratitudeMultiplier for this member — stage rules stay in the host.
   *  Async since S10: the stage's quest rule reads a MySQL count. */
  stageMultiplierFor(user: any): Promise<number>;
}

export interface GratitudeBudget {
  total: number;
  spent: number;
  remaining: number;
  cycleId: string;
}

/**
 * The most one member may put on ONE other member this cycle (R73).
 *
 * A share of the giver's own allowance, so it means the same thing at 100 and
 * at 500 and a village that doubles `gratitude.base_budget` does not silently
 * double how much of one person's standing can come from one relationship. A
 * cap of 1/N is the sentence "at least N people" written as one number.
 *
 * The floor of 1 is a bound, never a guess: 1% of an allowance of 50 rounds to
 * zero, and a zero here would refuse every send in the village while both
 * dials still read as sane numbers. It is stated on the dial itself.
 *
 * Exported because the economy engine's give path applies the identical rule
 * (server/lib/economy.ts, checkGive). Two channels, one ceiling, computed in
 * one place so they cannot drift apart the way the caps they replaced did.
 */
export function shareCapFor(allowanceTotal: number): number {
  if (allowanceTotal <= 0) return 0;
  const share = numberVar("gratitude.max_share_per_recipient");
  return Math.max(1, Math.floor((allowanceTotal * share) / 100));
}

/** Budget = base variable × stage multiplier, minus what this cycle already spent. */
export async function budgetFor(deps: GratitudeDeps, user: any): Promise<GratitudeBudget> {
  const total = Math.round(
    numberVar("gratitude.base_budget") * (await deps.stageMultiplierFor(user)),
  );
  const cycleId = cycleIdFor(new Date());
  // One indexed SUM, not a full-table read. This loaded EVERY gratitude row
  // ever written — into memory, on every heart tap, budget check and send —
  // and the wall/journal/export routes still use all() because they genuinely
  // want the rows. Semantics preserved exactly: all kinds, no kind filter
  // (feed.heart_amount can be > 0, and there is only one budget).
  const spent = await deps.log.spentInCycle(user.id, cycleId);
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
 * no budget → over budget → heart tap count → per-recipient share. Then: log
 * row (the heart index may refuse a duplicate), ledger post (recognition
 * issues from the faucet — the sender spends BUDGET, not balance), recipient
 * cache update.
 */
export async function sendGratitude(deps: GratitudeDeps, input: SendInput): Promise<SendOutcome> {
  const user = input.fromUser;
  const kind = input.kind ?? "gratitude";
  const amt = Math.floor(Number(input.amount) || 0);
  if ((!input.toEmail && !input.toId) || amt <= 0) {
    return { ok: false, status: 400, error: "Recipient and a positive amount are required" };
  }
  if (kind === "gratitude" && boolVar("gratitude.require_message") && !String(input.message ?? "").trim()) {
    return { ok: false, status: 400, error: "A few words of appreciation are required" };
  }

  const recipient = input.toId
    ? await deps.members.byId(input.toId)
    : await deps.members.byEmail(String(input.toEmail));
  if (!recipient) return { ok: false, status: 404, error: "No member found with that email" };
  if (recipient.id === user.id) return { ok: false, status: 400, error: "Gratitude flows to others" };
  // The example identities have fixed, public @examples.invalid addresses, so
  // without this any member can send to one: the sender's real budget is spent
  // and recognition is issued from the faucet into an account belonging to
  // nobody, which the cycle close would then pay a real pool share to. One
  // check here covers hearts too, since both channels come through this door.
  if (isExampleUser(recipient)) {
    return { ok: false, status: 409, error: "That is a standing example, not a member. Appreciation flows to real people." };
  }

  const budget = await budgetFor(deps, user);
  if (budget.total <= 0) {
    return { ok: false, status: 403, error: "Your sending budget unlocks as you progress on the path" };
  }
  if (amt > budget.remaining) {
    return { ok: false, status: 400, error: `Only ${budget.remaining} left in your budget this cycle` };
  }

  // One count cap, then one share (R73). The refusal NAMES which one fired,
  // because a silent 409 teaches nothing.
  //
  // The heart cap counts TAPS and is the last count cap in the village: a
  // heart is a gesture whose size is already fixed by `feed.heart_amount`, so
  // how many of them is the meaningful question. Indexed COUNT, kind-filtered
  // on purpose (see the repo interface).
  if (kind === "heart") {
    const heartCap = numberVar("feed.max_hearts_per_recipient_per_cycle");
    const taps = await deps.log.countPair(user.id, recipient.id, budget.cycleId, kind);
    if (taps >= heartCap) {
      return {
        ok: false,
        status: 409,
        error: `Hearts to one person are capped at ${heartCap} per cycle (feed.max_hearts_per_recipient_per_cycle)`,
      };
    }
  }

  // The share, and it counts GRATITUDE across BOTH channels. The cap it
  // replaced counted SENDS and defaulted to 1, which bounded how OFTEN one
  // member could acknowledge another and never how MUCH: a member at the top
  // of the ladder could hand one person 500 in a single send and break no
  // rule. Gratitude is the voting-weight token by default, so that was a
  // limit on concentrated voice that did not exist.
  const cap = shareCapFor(budget.total);
  const alreadyGiven = await deps.log.sumPair(user.id, recipient.id, budget.cycleId);
  if (alreadyGiven + amt > cap) {
    const left = Math.max(0, cap - alreadyGiven);
    return {
      ok: false,
      status: 409,
      error:
        `${cap} is the most you can give one person this cycle, and you have given them ${alreadyGiven}. ` +
        `That leaves ${left} for them (gratitude.max_share_per_recipient)`,
    };
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
