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
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { boolVar, numberVar } from "./variables";
import { cycleIdFor, parseCycleId } from "./gratitude-cycles";
import { isExampleUser } from "./examples";
import { issuanceRefusal } from "./gameStart";
import { memberAccount, postTransfer, RECOGNITION_FAUCET } from "./ledger";
import { writeGratitudeRow, shareCapFor } from "./economy";
import type { GratitudeLogRepo, GratitudeEntry } from "../repos/gratitude";
import type { UsersRepo } from "../repos/users";

// Re-exported so nothing importing `shareCapFor` from this module (it used to
// be DEFINED here) had to change when the concurrency fix below moved its
// definition to server/lib/economy.ts, the module that now owns every
// gratitude write's lock. server/lib/dryRun.ts is the other reader.
export { shareCapFor };

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
 * no budget → over budget → heart tap count → per-recipient share → whether
 * this village may issue at all (R67, and see the block above that check for
 * why it is last of the reads and first of everything else). Then: log
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

  // `total` is a stage fact (base variable times the giver's stage
  // multiplier): nothing but a stage change moves it, and nothing here races
  // that, so it is safe to read before any lock. What it is NOT safe to read
  // unlocked is REMAINING, because that depends on what this cycle has
  // already spent, and that is exactly what concurrent sends race over. See
  // `writeGratitudeRow` in server/lib/economy.ts for the rest of this story.
  const multiplier = await deps.stageMultiplierFor(user);
  const total = Math.round(numberVar("gratitude.base_budget") * multiplier);
  if (total <= 0) {
    return { ok: false, status: 403, error: "Your sending budget unlocks as you progress on the path" };
  }

  /*
   * THE LOCK. Everything that used to be three unlocked statements here (the
   * remaining-budget read, the per-recipient running total, and the
   * `gratitude_log` write) is now one call into the SAME SERIALIZABLE
   * transaction, `FOR UPDATE` on the giver's row, that `server/lib/economy.ts`
   * `give()` has always used. Before this, five acknowledgments (or five
   * hearts, or five of each) arriving together could each read the same
   * "nothing spent yet" snapshot from `budgetFor`/`sumPair`/`countPair` and
   * each commit, moving more Gratitude than the cycle's allowance ever
   * promised and letting one recipient take more than the concentration cap
   * allows. The guard below runs INSIDE that lock, so what it reads cannot
   * move between the read and the write that follows it.
   *
   * The guard also reproduces the documented order of refusals exactly: over
   * budget, then heart tap count (kind 'heart' only), then per-recipient
   * share, then whether this village may issue at all (R67), LAST, so a
   * member who is over budget or over the share hears about THAT and not the
   * launch gate. `issuanceRefusal` now reads the SAME transaction connection
   * rather than the bare pool, which costs nothing and cannot see a stale
   * answer the write does not.
   */
  const result = await writeGratitudeRow(
    deps.pool,
    {
      fromUserId: user.id,
      toUserId: recipient.id,
      amount: amt,
      kind,
      message: String(input.message ?? "").trim(),
      fromName: user.name ?? null,
      toName: recipient.name ?? null,
      contextType: input.contextType ?? null,
      contextRef: input.contextRef ?? null,
    },
    multiplier,
    async (conn, allowance, alreadyGiven) => {
      if (amt > allowance.remaining) {
        return { ok: false, error: `Only ${allowance.remaining} left in your budget this cycle`, status: 400 };
      }

      // One count cap, then one share (R73). The refusal NAMES which one
      // fired, because a silent 409 teaches nothing.
      //
      // The heart cap counts TAPS and is the last count cap in the village: a
      // heart is a gesture whose size is already fixed by `feed.heart_amount`,
      // so how many of them is the meaningful question. Read under this same
      // lock, on the same connection, so it cannot race the write below it
      // any more than the allowance can.
      if (kind === "heart") {
        const heartCap = numberVar("feed.max_hearts_per_recipient_per_cycle");
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM `gratitude_log` WHERE `from_id` = ? AND `to_id` = ? AND `cycle_id` = ? AND `kind` = ?",
          [user.id, recipient.id, allowance.cycleKey, kind],
        );
        const taps = Number(rows[0]?.n ?? 0);
        if (taps >= heartCap) {
          return {
            ok: false,
            status: 409,
            error: `Hearts to one person are capped at ${heartCap} per cycle (feed.max_hearts_per_recipient_per_cycle)`,
          };
        }
      }

      // The share, and it counts GRATITUDE across BOTH channels. The cap it
      // replaced counted SENDS and defaulted to 1, which bounded how OFTEN
      // one member could acknowledge another and never how MUCH: a member at
      // the top of the ladder could hand one person 500 in a single send and
      // break no rule. Gratitude is the voting-weight token by default, so
      // that was a limit on concentrated voice that did not exist.
      const cap = shareCapFor(allowance.total);
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

      /*
       * ── CAN THIS VILLAGE ISSUE AT ALL? ASKED BEFORE THE NOTE IS TAKEN (R67) ─
       *
       * This row IS the spend: the allowance above is computed by summing
       * `gratitude_log`, so writing it charges the cycle. The ledger post
       * that follows (outside this lock, after commit) is what puts anything
       * in the recipient's hands, and `postTransfer` refuses every faucet
       * posting until the village's launch vote carries.
       *
       * Asked in that order, the refusal used to arrive too late to matter:
       * the note committed, the allowance was spent, and the recipient
       * received nothing. A retry does not heal it either, because a retry
       * mints a new entry id and is a second charge. For a village setting
       * itself up, which under R67 is every village until its launch ballot
       * carries, that fired on every heart and every acknowledgement anybody
       * sent. Found by Lane TESTRUN, fixed on the economy engine's `give`
       * path by Lane RULES, and this is the same shape on both doors.
       *
       * It runs last so the documented order of refusals still holds: a
       * member who is over budget or over the share hears about THAT.
       * Nothing above this line writes anything, and the answer only ever
       * moves one way, from closed to open, so a village that launches
       * between this check and the write below costs somebody one refused
       * send and never a lost note.
       */
      const closed = await issuanceRefusal(conn);
      if (closed) return { ok: false, status: 409, error: closed };

      return { ok: true };
    },
  );

  if (!result.ok) {
    if (result.duplicate) {
      // The unique heart index spoke: this sender already acknowledged this
      // content. One heart per person per thing is the rule, not an error
      // state. (Plain 'gratitude' sends carry no client-side dedupe key and
      // cannot land here; the nonce index that give()'s door uses is never
      // written by this one.)
      return { ok: false, status: 409, error: "You have already acknowledged this" };
    }
    if (result.error === "no such member") {
      return { ok: false, status: 404, error: "No such member" };
    }
    return { ok: false, status: result.status ?? 400, error: result.error };
  }

  const cycleId = result.allowance.cycleKey;
  const entry: GratitudeEntry = {
    id: result.noteId,
    kind,
    fromId: user.id,
    fromName: user.name,
    toId: recipient.id,
    toName: recipient.name,
    amount: amt,
    message: String(input.message ?? "").trim(),
    contextType: input.contextType ?? null,
    contextRef: input.contextRef ?? null,
    cycleId,
    cycleNumber: parseCycleId(cycleId),
    at: new Date().toISOString(),
  };

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
