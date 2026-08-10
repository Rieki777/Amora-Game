/**
 * The village economy: one guarded write path, and the rules that guard it.
 *
 * Every mint, refund and claim in this build goes through `mint()`,
 * `reverse()` and `requestVoiceClaim()` here, and every one of them ends up in
 * `postTransfer` (server/lib/ledger.ts). This module adds no ledger of its own.
 * That is deliberate and it is the load-bearing decision of the whole build:
 * `token_ledger` is double-entry with conservation re-proven at every boot, and
 * a second append-only table minting from NULL would sit outside
 * `checkLedgerInvariants` and give one deployment two sets of books. The
 * doctrine this file enforces says one ledger, every token, so the doctrine
 * lands ON the ledger that already exists.
 *
 * What this module is, then: the rules between an event in the village and a
 * ledger post. Which trigger mints which token. How much, and up to what
 * ceiling. Who is allowed to witness whose work. What a giving allowance is
 * when nobody is allowed to store it. Which confirmations are history and
 * which are owed.
 *
 * Every rule below was a live exploit in review. None of them is polish.
 *
 * THE TOKENS, and the one confusion worth spelling out.
 *
 *   Hearts        the `gratitude` token. Recognition. Given, never paid, and
 *                 never spent: standing is held. Mints from the recognition
 *                 faucet at the moment of giving.
 *   Stay credits  `stay-credit`. A real thing you spend on a real night.
 *   Library       `library-credit`. Spendable, backed by shelves.
 *   Voice         `village-voice`. Earned only from confirmed contribution,
 *                 accrued here, claimed to Hypha.
 *
 * `amora` is NONE of these. It is the village's equity token, it is governed by
 * Hypha, it lives on Base, and this platform is forbidden from minting or
 * moving it (`governance: 'hypha'`, refused by `validateLeg`). Hearts are
 * gratitude and Amora is equity. Nothing here may ever quietly turn one into
 * the other, and no surface should let a member read one number as the other.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { cycleBoundsFor } from "../../shared/lunar";
import { numberVar } from "./variables";
import {
  memberAccount,
  postTransfer,
  registerToken,
  tokenDef,
  RECOGNITION_FAUCET,
  type TransferResult,
} from "./ledger";

// ── The tokens this build knows ─────────────────────────────────────────────

/** Hearts. The recognition token that has existed since 0006, under its name. */
export const HEARTS = "gratitude";
/** The village's own voice token. Accrues here, settles on Hypha. */
export const VILLAGE_VOICE = "village-voice";

/** Faucets. A faucet's negative balance is that token's issued supply. */
export const VOICE_MINT = "sys:voice-mint";
/** Not a faucet: voice held against an open claim came from a member. */
export const VOICE_BRIDGE = "sys:voice-bridge";

/**
 * The village voice token, registered at boot the way stays and library
 * register theirs. `governance: 'platform'` is required and is the whole
 * reason this is a separate token from the `voice` row seeded in 0006: that
 * one is `governance: 'hypha'`, which `validateLeg` refuses to move and which
 * a boot invariant requires to have zero ledger rows. Voice has to ACCRUE
 * somewhere before it can be claimed, and a Hypha-governed mirror is by
 * definition not that place.
 */
export async function ensureVoiceToken(pool: Pool, displayName?: string): Promise<void> {
  const existing = tokenDef(VILLAGE_VOICE);
  if (existing) return;
  await registerToken(pool, {
    slug: VILLAGE_VOICE,
    // The founder's word for it. Village data, so the seed supplies it and a
    // fork that never chose one still gets something honest on the chip.
    name: displayName || "Village Voice",
    kind: "voice",
    governance: "platform",
    transferable: false,
  });
}

// ── Village scope ───────────────────────────────────────────────────────────

/**
 * This deployment is one village. The constant exists so every idempotency key
 * and every economy query carries the scope from the first day: adding it later
 * means rewriting keys that have already minted value, which is the migration
 * nobody wants to write. `villageId()` is the ONE reader, so a real multi-
 * village build changes this file and not eighty call sites.
 */
export const LOCAL_VILLAGE = "local";
export function villageId(): string {
  return LOCAL_VILLAGE;
}

// ── Occurrence-scoped idempotency keys ──────────────────────────────────────

/**
 * A key names an OCCURRENCE, never a thing.
 *
 * `quest.completed:<quest>` would mint once per quest for all time: a weekly
 * quest pays its first week and nothing after, and eight people on a build day
 * share one payout. The claim row is the occurrence, so the claim id is in the
 * key, and the profile is in it too because two claimants are two mints.
 *
 * Every key carries the village. Two villages running the same seeded quest
 * must not collide on a UNIQUE index, and they would.
 */
/**
 * `token_ledger.idempotency_key` is varchar(191), and 191 is not a style
 * choice: it is what keeps the UNIQUE index inside utf8mb4's 767-byte prefix
 * limit (0009). An occurrence key built from three varchar(64) ids can exceed
 * that, and MySQL outside strict mode would TRUNCATE it, which is the worst
 * possible failure here: two different occurrences would truncate to the same
 * string, the second would read as a duplicate, and somebody would simply not
 * be paid. Real ids run 20 to 30 characters so this never fires in practice,
 * which is exactly why it has to be checked rather than assumed.
 */
export const MAX_KEY = 191;
/** `source_ref` is varchar(120). Prefix, so a LIKE on a key prefix still matches. */
export const MAX_SOURCE_REF = 120;

function keyTooLong(key: string): string | null {
  return key.length > MAX_KEY
    ? `occurrence key is ${key.length} characters and the ledger allows ${MAX_KEY}: ${key.slice(0, 60)}...`
    : null;
}

export const keys = {
  questCompleted: (v: string, questId: string, claimId: string, userId: string) =>
    `quest.completed:${v}:${questId}:${claimId}:${userId}`,
  gratitudeGiven: (v: string, noteId: string) => `gratitude.given:${v}:${noteId}`,
  roleCycle: (v: string, cycleKey: string, seatId: string, userId: string) =>
    `role.cycle:${v}:${cycleKey}:${seatId}:${userId}`,
  journeyStage: (v: string, journeyId: string, stage: string, userId: string) =>
    `journey.stage_reached:${v}:${journeyId}:${stage}:${userId}`,
  welcomeAboard: (v: string, questNo: number | string, userId: string) =>
    `welcome_aboard.quest:${v}:${questNo}:${userId}`,
  transfer: (v: string, transferRowId: string) => `transfer:${v}:${transferRowId}`,
  reversal: (v: string, eventKey: string) => `reversal:${v}:${eventKey}`,
  voiceClaim: (v: string, claimRowId: string) => `voice-claim:${v}:${claimRowId}`,
};

// ── The cycle ───────────────────────────────────────────────────────────────

/** The lunation a moment falls in. The site owns this, and the map reads it. */
export function cycleKeyFor(at: Date = new Date()): string {
  return `moon-${cycleBoundsFor(at).cycleNumber}`;
}

export function cycleWindow(at: Date = new Date()): { startsAt: Date; endsAt: Date; key: string } {
  const b = cycleBoundsFor(at);
  return { startsAt: b.startsAt, endsAt: b.endsAt, key: `moon-${b.cycleNumber}` };
}

// ── The epoch ───────────────────────────────────────────────────────────────

/**
 * Confirmations recorded before the engine was switched on are HISTORY.
 *
 * Without this, the day the `economy` flag flips, every quest ever consented in
 * this village becomes an unpaid mint sitting in a source query, and the first
 * settlement pays out years of backlog at once. Nobody decided that; it would
 * simply be what the query returned.
 *
 * So every source query filters `confirmedAt >= economyEpoch`, and honouring
 * pre-epoch work is a deliberate, audited, keyed one-shot backfill an admin
 * runs on purpose. The default is the moment the epoch is first read and
 * written, which means "from now", which is the only safe default.
 */
let epochCache: Date | null = null;

export async function economyEpoch(pool: Pool): Promise<Date> {
  if (epochCache) return epochCache;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT `value` FROM `app_config` WHERE `config_key` = 'economy-state' LIMIT 1",
  );
  // `app_config.value` is a JSON column, so mysql2 has already parsed it and
  // hands back an object. `JSON.parse(String(obj))` parses "[object Object]",
  // throws, and lands in the catch, which re-stamps the epoch on EVERY read:
  // the one value that must never move would move every time it was asked for,
  // and pre-epoch work would drift back into scope moment by moment.
  let doc: any = {};
  const raw = rows[0]?.value;
  if (raw && typeof raw === "object") {
    doc = raw;
  } else if (typeof raw === "string" && raw) {
    try {
      doc = JSON.parse(raw);
    } catch {
      doc = {};
    }
  }
  if (doc.economyEpoch) {
    epochCache = new Date(doc.economyEpoch);
    return epochCache;
  }
  const now = new Date();
  doc.economyEpoch = now.toISOString();
  await pool.query(
    "INSERT INTO `app_config` (`config_key`, `value`) VALUES ('economy-state', ?) " +
      "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    [JSON.stringify(doc)],
  );
  epochCache = now;
  return now;
}

/** Tests and the admin backfill reset the cache after writing the document. */
export function forgetEpoch(): void {
  epochCache = null;
}

// ── The flag, and why a boolean is not enough ───────────────────────────────

/**
 * The `economy` flag being on is NOT sufficient to mint.
 *
 * A village whose flag is on but whose token types and mint rules were never
 * seeded has an engine that reads every rule as absent. Every trigger then
 * silently mints nothing, the village believes the economy is running, and the
 * failure only surfaces as an absence, which is the hardest kind to notice.
 * So the write paths ask for BOTH: the flag, and the seeds it needs.
 */
export async function economyReady(pool: Pool): Promise<{ ready: boolean; reason?: string }> {
  const [rules] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM `mint_rules` WHERE `village_id` = ? AND `enabled` = 1",
    [villageId()],
  );
  if (Number(rules[0]?.n ?? 0) === 0) {
    return { ready: false, reason: "no enabled mint rules are seeded for this village" };
  }
  if (!tokenDef(HEARTS)) {
    return { ready: false, reason: "the recognition token is not registered" };
  }
  return { ready: true };
}

// ── Rules ───────────────────────────────────────────────────────────────────

export interface MintRule {
  id: string;
  trigger: string;
  tokenSlug: string;
  /** null means "read it from the source", clamped to `ceiling`. */
  amount: number | null;
  ceiling: number;
  recipient: string;
  enabled: boolean;
  effectiveFromCycle: number;
}

function rowToRule(r: RowDataPacket): MintRule {
  return {
    id: String(r.id),
    trigger: String(r.trigger),
    tokenSlug: String(r.token_slug),
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    ceiling: Number(r.ceiling ?? 0),
    recipient: String(r.recipient ?? "claimant"),
    enabled: !!r.enabled,
    effectiveFromCycle: Number(r.effective_from_cycle ?? 0),
  };
}

/**
 * The rules for one trigger, as of a cycle.
 *
 * `effective_from_cycle` is what stops a rule being raised, paid against, and
 * lowered again around a settlement. A settlement closing cycle N reads the
 * rules that were already in force at N, so an edit made during N applies to
 * N+1 and the closing cycle settles under the rules it ran under.
 */
export async function rulesFor(pool: Pool, trigger: string, atCycle?: number): Promise<MintRule[]> {
  const cycle = atCycle ?? cycleBoundsFor(new Date()).cycleNumber;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM `mint_rules` WHERE `village_id` = ? AND `trigger` = ? AND `enabled` = 1 " +
      "AND `effective_from_cycle` <= ?",
    [villageId(), trigger, cycle],
  );
  return rows.map(rowToRule);
}

// ── The one guarded write ───────────────────────────────────────────────────

export interface MintInput {
  /** Who receives it. */
  toUserId: string;
  tokenSlug: string;
  amount: number;
  /** The faucet this token issues from. */
  from: string;
  /** Machine-readable origin, e.g. "quest_consent". */
  source: string;
  sourceRef?: string;
  description?: string;
  /** Occurrence-scoped, from `keys`. */
  idempotencyKey: string;
}

export type MintOutcome =
  | { ok: true; duplicate: boolean; balance: number }
  | { ok: false; error: string };

/**
 * Mint, once, with every guard applied.
 *
 * A duplicate key is SUCCESS, not an error: it means this occurrence already
 * paid, which is exactly what the caller wanted to be true. Reporting it as a
 * failure teaches retries to do something worse.
 */
export async function mint(pool: Pool, input: MintInput): Promise<MintOutcome> {
  const amount = Number(input.amount);

  // Amount > 0 for every non-reversal. A negative "gift" is an attack: it
  // would debit the person being thanked. Zero is a no-op wearing a ledger row.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be greater than zero" };
  }
  const def = tokenDef(input.tokenSlug);
  if (!def) {
    return { ok: false, error: `unknown token "${input.tokenSlug}"` };
  }
  if (def.governance !== "platform") {
    return { ok: false, error: `${input.tokenSlug} is governed on Hypha and is only mirrored here` };
  }
  if (!input.idempotencyKey) {
    return { ok: false, error: "an occurrence key is required" };
  }
  const tooLong = keyTooLong(input.idempotencyKey);
  if (tooLong) return { ok: false, error: tooLong };

  const res: TransferResult = await postTransfer(pool, {
    from: input.from,
    to: memberAccount(input.toUserId),
    tokenType: input.tokenSlug,
    amount,
    source: input.source,
    sourceRef: input.sourceRef,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
  });
  if (!res.ok && !res.duplicate) return { ok: false, error: res.error ?? "the ledger refused the post" };
  return { ok: true, duplicate: res.duplicate, balance: res.toBalance };
}

/**
 * Clamp a from_source amount to its rule's ceiling.
 *
 * A rule that mints a number somebody else typed, with no ceiling, is an open
 * faucet with a form in front of it. The ceiling is not advisory and it is not
 * nullable-as-unlimited: 0 means zero, which is the same fail-closed reading
 * the swap caps use.
 */
export function clampToCeiling(posted: number, rule: MintRule): number {
  const asked = Number(posted);
  if (!Number.isFinite(asked) || asked <= 0) return 0;
  if (rule.amount !== null) return rule.amount;
  return Math.min(asked, rule.ceiling);
}

// ── Reversal ────────────────────────────────────────────────────────────────

/**
 * Undo one posting with a mirror that has its own key.
 *
 * Three rules, each of which is a way this goes wrong:
 *
 *  - a reversal carries its OWN idempotency key, so reversing twice writes one
 *    mirror and the second call is a duplicate rather than a second refund;
 *  - a reversal may not be reversed, or two calls alternate forever and each
 *    one looks locally reasonable;
 *  - an already-reversed posting may not be reversed again.
 *
 * Refunds are always reversals. Never a fresh mint: a mint would inherit none
 * of these guards and would be a way to make the token it claims to return.
 */
export async function reverse(
  pool: Pool,
  originalKey: string,
  opts: { from: string; to: string; tokenSlug: string; amount: number; note?: string },
): Promise<MintOutcome> {
  if (originalKey.startsWith("reversal:")) {
    return { ok: false, error: "a reversal cannot itself be reversed" };
  }
  const mirrorKey = keys.reversal(villageId(), originalKey);
  const tooLong = keyTooLong(mirrorKey);
  if (tooLong) return { ok: false, error: tooLong };

  const [orig] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM `token_ledger` WHERE `idempotency_key` = ? LIMIT 1",
    [originalKey],
  );
  if (!orig.length) {
    return { ok: false, error: "there is no such posting to reverse" };
  }

  // The mirror runs the opposite way: what the original credited, this debits.
  const res = await postTransfer(pool, {
    from: opts.from,
    to: opts.to,
    tokenType: opts.tokenSlug,
    amount: opts.amount,
    source: "reversal",
    // Prefix, because source_ref is varchar(120) and a quest occurrence key can
    // run past it. A prefix is enough for the allowance query, which matches on
    // `gratitude.given:<village>:%`, and the whole key rides in the note so a
    // human reading the row can still find what was undone.
    sourceRef: originalKey.slice(0, MAX_SOURCE_REF),
    description: opts.note ? `${opts.note} (${originalKey})` : originalKey,
    idempotencyKey: mirrorKey,
  });
  if (!res.ok && !res.duplicate) return { ok: false, error: res.error ?? "the ledger refused the reversal" };
  return { ok: true, duplicate: res.duplicate, balance: res.toBalance };
}

/** Has this posting already been mirrored? */
export async function isReversed(pool: Pool, originalKey: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM `token_ledger` WHERE `idempotency_key` = ? LIMIT 1",
    [keys.reversal(villageId(), originalKey)],
  );
  return rows.length > 0;
}

// ── Gratitude, and the allowance that is never stored ───────────────────────

export interface Allowance {
  total: number;
  spent: number;
  remaining: number;
  cycleKey: string;
}

/**
 * What a member may still give this moon, COMPUTED from what they have given.
 *
 * A stored counter is the bug. It drifts, it survives a reversal that should
 * have refunded it, and two concurrent gives both read the same stale number
 * and both pass. The sum of this cycle's gifts, minus this cycle's reversals of
 * those gifts, is the only figure that is true by construction: reversing a
 * gift refunds the allowance because the subtraction stops counting it, with
 * nothing to remember to do.
 *
 * `conn` is not optional in the write path. Read this OUTSIDE the mint's
 * transaction and five simultaneous gives all read the same remaining balance
 * and all commit. It has to be read under the same lock that writes.
 */
export async function allowanceFor(
  conn: Pool | PoolConnection,
  userId: string,
  at: Date = new Date(),
): Promise<Allowance> {
  const { startsAt, endsAt, key } = cycleWindow(at);
  // The engine's own dial, not `gratitude.base_budget`. That one is a
  // stage-scaled budget for the acknowledgement flow; this one is the flat
  // per-moon Hearts allowance the doctrine describes.
  const total = numberVar("economy.giving_allowance_per_moon");

  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(`amount`), 0) AS given FROM `gratitude_log` " +
      "WHERE `village_id` = ? AND `from_id` = ? AND `at` >= ? AND `at` < ?",
    [villageId(), userId, startsAt, endsAt],
  );
  const given = Number(rows[0]?.given ?? 0);

  // Reversals of THIS cycle's gifts hand the allowance back. Keyed on the
  // gratitude keys so a reversal of some other posting cannot inflate it.
  const [reversed] = await conn.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(t.`amount`), 0) AS back FROM `token_ledger` t " +
      "WHERE t.`source` = 'reversal' AND t.`at` >= ? AND t.`at` < ? " +
      "AND t.`source_ref` LIKE ?",
    [startsAt, endsAt, `gratitude.given:${villageId()}:%`],
  );
  const back = Number(reversed[0]?.back ?? 0);

  const spent = Math.max(0, given - back);
  return { total, spent, remaining: Math.max(0, total - spent), cycleKey: key };
}

export interface GiveInput {
  fromUserId: string;
  toUserId: string;
  amount: number;
  note?: string;
  tag?: string;
  structureKey?: string;
  /** A quiet gift shows publicly as "someone, quietly". */
  quiet?: boolean;
  /** The client's key for one tap of the give button. */
  clientNonce?: string;
}

/**
 * The refusals a gift can meet, in the order they are checked.
 *
 * Order is part of the contract: the most specific and most private reason
 * wins, so a member is told the useful thing rather than the first thing.
 */
export function checkGive(
  input: GiveInput,
  allowance: Allowance,
  alreadyToThisPerson: number,
): { ok: true } | { ok: false; error: string } {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Gratitude is given in whole positive hearts" };
  }
  // Self-gratitude is blocked, and it is blocked HERE rather than at the route,
  // so every future caller inherits it. Thanking yourself mints standing out of
  // nothing, which is the cheapest possible attack on a reputation number.
  if (input.fromUserId === input.toUserId) {
    return { ok: false, error: "Gratitude flows to others" };
  }
  if (amount > allowance.remaining) {
    return { ok: false, error: `You can still give ${allowance.remaining} this moon` };
  }
  // Hearts, not sends. `gratitude.max_per_recipient_per_cycle` counts
  // acknowledgements and defaults to 1, so reading it here would refuse every
  // gift of two Hearts or more and blame a dial that was working correctly.
  const perRecipient = numberVar("economy.hearts_per_recipient_per_moon");
  if (alreadyToThisPerson + amount > perRecipient) {
    return { ok: false, error: `You can give one person ${perRecipient} Hearts a moon` };
  }
  return { ok: true };
}

/**
 * Give, with the allowance read AND the note written under one lock.
 *
 * The note row is what the allowance is computed from, so writing it inside
 * the locked transaction is the whole mechanism. Five simultaneous gives
 * serialise on the giver's row: each one reads an allowance that already
 * counts the gifts committed before it, so the fifth is refused by arithmetic
 * rather than by luck. Reading the allowance and writing the note in separate
 * transactions would let all five read the same remaining balance and all five
 * commit, which is the bug this shape exists to make impossible.
 *
 * The ledger post happens AFTER the commit, on purpose, and the order is the
 * conservative one. The note row consumes the allowance, so a crash between
 * the two leaves an allowance spent and no hearts minted: visible, keyed, and
 * healed by a retry, because the mint is idempotent on the note id. The other
 * order would mint hearts that no allowance had paid for, which is the failure
 * that costs something.
 */
export async function give(
  pool: Pool,
  input: GiveInput,
): Promise<MintOutcome & { noteId?: string }> {
  const amount = Number(input.amount);
  const conn = await pool.getConnection();
  let noteId = "";
  try {
    await conn.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await conn.beginTransaction();

    // The lock. Everything after this reads a world nobody else can move.
    //
    // A row that does not exist cannot be locked, and `FOR UPDATE` over an
    // empty result takes nothing while looking exactly like success. That
    // would make every guard below advisory for an unknown giver, so the
    // absence is a refusal rather than a quiet pass.
    const [giver] = await conn.query<RowDataPacket[]>(
      "SELECT `id` FROM `users` WHERE `id` = ? FOR UPDATE",
      [input.fromUserId],
    );
    if (!giver.length) {
      await conn.rollback();
      return { ok: false, error: "no such member" };
    }

    const allowance = await allowanceFor(conn, input.fromUserId);
    const { startsAt, endsAt, key } = cycleWindow();
    const [pair] = await conn.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(`amount`), 0) AS n FROM `gratitude_log` " +
        "WHERE `village_id` = ? AND `from_id` = ? AND `to_id` = ? AND `at` >= ? AND `at` < ?",
      [villageId(), input.fromUserId, input.toUserId, startsAt, endsAt],
    );

    const verdict = checkGive(input, allowance, Number(pair[0]?.n ?? 0));
    if (!verdict.ok) {
      await conn.rollback();
      return { ok: false, error: verdict.error };
    }

    noteId = `grat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await conn.query(
        "INSERT INTO `gratitude_log` " +
          "(`id`, `village_id`, `from_id`, `to_id`, `amount`, `message`, `cycle_id`, " +
          " `tag`, `structure_key`, `quiet`, `client_nonce`) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
          noteId,
          villageId(),
          input.fromUserId,
          input.toUserId,
          amount,
          input.note ?? "",
          key,
          input.tag ?? null,
          input.structureKey ?? null,
          input.quiet ? 1 : 0,
          input.clientNonce ?? null,
        ],
      );
    } catch (err: any) {
      await conn.rollback();
      // The nonce index spoke: this is the same tap arriving twice.
      if (String(err?.code) === "ER_DUP_ENTRY") {
        return { ok: false, error: "That thanks is already sent" };
      }
      throw err;
    }

    await conn.commit();
  } catch (err: any) {
    try {
      await conn.rollback();
    } catch {
      /* the transaction is already gone */
    }
    return { ok: false, error: String(err?.message ?? err) };
  } finally {
    conn.release();
  }

  // Outside the lock: keyed on the note, so a retry credits once.
  const res = await postTransfer(pool, {
    from: RECOGNITION_FAUCET,
    to: memberAccount(input.toUserId),
    tokenType: HEARTS,
    amount,
    source: "gratitude_received",
    sourceRef: noteId,
    description: input.note,
    idempotencyKey: keys.gratitudeGiven(villageId(), noteId),
  });
  if (!res.ok && !res.duplicate) {
    return { ok: false, error: res.error ?? "the ledger refused the credit" };
  }
  return { ok: true, duplicate: res.duplicate, balance: res.toBalance, noteId };
}

// ── Two-party consent ───────────────────────────────────────────────────────

/**
 * A steward may not witness their own work.
 *
 * Confirming releases value, so it must be structurally impossible to do it for
 * yourself, admin included. This is the same posture `quest.consent` already
 * takes in the capability gate, restated where the mint happens so a new caller
 * cannot route around it.
 */
export function canConfirm(claimantUserId: string, confirmerUserId: string): { ok: boolean; error?: string } {
  if (!confirmerUserId) return { ok: false, error: "a confirmation needs a named steward" };
  if (claimantUserId === confirmerUserId) {
    return { ok: false, error: "Someone else witnesses your work. Ask another steward." };
  }
  return { ok: true };
}

/**
 * Pairs who confirmed each other this moon. Surfaced in the audit, never
 * blocked: two people who genuinely worked together will confirm each other,
 * and refusing that would break the honest case to inconvenience the dishonest
 * one. A village that can SEE it can ask about it.
 */
export async function reciprocalConfirms(pool: Pool, at: Date = new Date()) {
  const { startsAt, endsAt } = cycleWindow(at);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT a.`user_id` AS one, a.`consented_by` AS two, COUNT(*) AS n " +
      "FROM `quest_claims` a " +
      "JOIN `quest_claims` b ON b.`user_id` = a.`consented_by` AND b.`consented_by` = a.`user_id` " +
      "WHERE a.`village_id` = ? AND a.`status` = 'consented' " +
      "AND a.`consented_at` >= ? AND a.`consented_at` < ? " +
      "AND b.`consented_at` >= ? AND b.`consented_at` < ? " +
      "AND a.`user_id` < a.`consented_by` " +
      "GROUP BY a.`user_id`, a.`consented_by`",
    [villageId(), startsAt, endsAt, startsAt, endsAt],
  );
  return rows.map((r) => ({ one: String(r.one), two: String(r.two), count: Number(r.n) }));
}

// ── Voice claims ────────────────────────────────────────────────────────────

export type ClaimState = "requested" | "confirmed" | "canceled" | "stale" | "rejected";

/** Confirmed is terminal. So is rejected. Nothing reopens a settled claim. */
const TERMINAL: ReadonlySet<ClaimState> = new Set<ClaimState>([
  "confirmed",
  "canceled",
  "stale",
  "rejected",
]);

export function canSettleClaim(from: ClaimState, to: ClaimState): { ok: boolean; error?: string } {
  if (from === "confirmed") {
    // The one that would cost real value: a cancel arriving after a confirm
    // would refund voice the member has also already received on Hypha.
    return { ok: false, error: "this claim is confirmed and cannot be canceled or refunded" };
  }
  if (TERMINAL.has(from)) {
    return { ok: false, error: `this claim is already ${from}` };
  }
  if (to === "requested") {
    return { ok: false, error: "a claim cannot go back to requested" };
  }
  return { ok: true };
}

/** Refunds go back through `reverse`, so they inherit every guard the debit passed. */
export function claimRefunds(state: ClaimState): boolean {
  return state === "canceled" || state === "stale" || state === "rejected";
}
