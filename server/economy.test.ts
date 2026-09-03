/**
 * Tests for the village economy engine.
 *
 * Every case here was a live exploit in one of the two adversarial passes over
 * the build spec. They are written against the engine rather than over HTTP on
 * purpose: a route can refuse a retry on a status check and never reach the
 * guard, which proves the route and says nothing about the rule. These call the
 * rule.
 *
 * Runs against the S5 harness: a scratch schema with every real migration
 * applied, unique per provision. No TEST_DATABASE_URL and the suite skips
 * loudly rather than passing hollowly.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import {
  allowanceFor,
  canConfirm,
  canSettleClaim,
  checkGive,
  ceilingOutcome,
  clampToCeiling,
  claimRefunds,
  CREDITS,
  economyEpoch,
  faucetFor,
  publicSupply,
  ruleCannotPay,
  economyReady,
  ensureVoiceToken,
  forgetEpoch,
  fromLedgerUnits,
  give,
  HEARTS,
  isReversed,
  keys,
  MAX_KEY,
  mint,
  mintForConfirmedClaim,
  mintView,
  queueRuleChange,
  applyPendingRules,
  rulesFor,
  reverse,
  runSettlement,
  VILLAGE_VOICE,
  VOICE_MINT,
  villageId,
  type MintRule,
} from "./lib/economy";
import { balanceOf, checkLedgerInvariants, CYCLE_POOL_FAUCET, loadTokenRegistry, memberAccount, registerToken, RECOGNITION_FAUCET } from "./lib/ledger";
import { loadVariables } from "./lib/variables";
import { cycleBoundsFor } from "../shared/lunar";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

/**
 * The stage multiplier `give` now takes (R73: one allowance, so the engine
 * reads `gratitude.base_budget` times the giver's stage the same way the
 * acknowledgement flow does). These members exist as bare rows with no
 * training, membership or quests, and the real resolver lives in the host, so
 * the tests state the multiplier they mean: 1, which is Guest, which is what
 * every registered member is at minimum.
 */
const AT_GUEST = async () => 1;

/**
 * The Hypha-governed voice mirror seeded by 0006, used here as the stand-in
 * for "a token this platform is forbidden to issue". The equity token is the
 * other one and would say the same thing, but it is a brand name and platform
 * code may not carry one (scripts/check-brand-refs.mjs).
 */
const HYPHA_MIRROR = "voice";

/** A member with a ledger account, which `give` needs to lock. */
async function makeMember(id: string): Promise<string> {
  await pool.query(
    "INSERT INTO `users` (`id`, `name`, `email`, `password_hash`) VALUES (?,?,?,'x') " +
      "ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)",
    [id, id, `${id}@examples.invalid`],
  );
  await pool.query(
    "INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES (?,?,?,?,0)",
    [memberAccount(id), "member", id, id],
  );
  return id;
}

const rule = (over: Partial<MintRule> = {}): MintRule => ({
  id: "r1",
  trigger: "quest.completed",
  tokenSlug: HEARTS,
  amount: null,
  ceiling: 100,
  recipient: "claimant",
  enabled: true,
  effectiveFromCycle: 0,
  ...over,
});

describe.skipIf(!configured)("the village economy engine", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 10 });
    await loadTokenRegistry(pool);
    await loadVariables(pool);
    await ensureVoiceToken(pool, "Village Voice");
    await loadTokenRegistry(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  // ── Keys ─────────────────────────────────────────────────────────────────

  it("names an occurrence, so a repeatable thing repeats", () => {
    // The bug this prevents: a key of `quest.completed:<quest>` pays a weekly
    // quest once for all time, and gives eight people on a build day one
    // shared payout between them.
    const weekOne = keys.questCompleted("local", "q-swale", "claim-1", "u1");
    const weekTwo = keys.questCompleted("local", "q-swale", "claim-2", "u1");
    const otherHand = keys.questCompleted("local", "q-swale", "claim-3", "u2");
    expect(weekOne).not.toBe(weekTwo);
    expect(weekOne).not.toBe(otherHand);
  });

  it("keeps the same key in two villages apart", () => {
    // Two villages running the same seeded quest must not collide on a UNIQUE
    // index, and without the scope segment they would.
    expect(keys.questCompleted("alder", "q1", "c1", "u1")).not.toBe(
      keys.questCompleted("birch", "q1", "c1", "u1"),
    );
  });

  it("refuses a key too long for the ledger's unique index rather than truncating", async () => {
    const huge = "x".repeat(MAX_KEY + 1);
    const res = await mint(pool, {
      toUserId: "u1",
      tokenSlug: HEARTS,
      amount: 1,
      from: RECOGNITION_FAUCET,
      source: "test",
      idempotencyKey: huge,
    });
    // Truncation is the dangerous outcome: two occurrences would collapse to
    // one string, the second would read as already-paid, and somebody simply
    // would not be paid.
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/characters/);
  });

  // ── Minting ──────────────────────────────────────────────────────────────

  it("mints once for the same occurrence key, twice over", async () => {
    const u = await makeMember("econ-mint-1");
    const key = keys.questCompleted(villageId(), "q1", "c1", u);
    const first = await mint(pool, {
      toUserId: u, tokenSlug: HEARTS, amount: 10,
      from: RECOGNITION_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    const second = await mint(pool, {
      toUserId: u, tokenSlug: HEARTS, amount: 10,
      from: RECOGNITION_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    expect(first.ok && first.duplicate).toBe(false);
    // A duplicate is SUCCESS: it means this occurrence already paid, which is
    // what the caller wanted to be true. Reporting failure teaches retries to
    // do something worse.
    expect(second.ok && second.duplicate).toBe(true);
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(10);
  });

  it("refuses zero and negative amounts", async () => {
    const u = await makeMember("econ-mint-2");
    for (const amount of [0, -5]) {
      const res = await mint(pool, {
        toUserId: u, tokenSlug: HEARTS, amount,
        from: RECOGNITION_FAUCET, source: "test",
        idempotencyKey: `neg:${amount}:${u}`,
      });
      // A negative gift debits the person being thanked. That is an attack.
      expect(res.ok).toBe(false);
    }
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(0);
  });

  it("refuses to mint a token governed on Hypha", async () => {
    const u = await makeMember("econ-mint-3");
    // A registered hypha token rather than the deployment's real equity slug:
    // the brand guard counts a village's name anywhere in platform code, and
    // it is right to. The rule under test is about GOVERNANCE, not about which
    // village happens to have named a token after itself.
    await registerToken(pool, {
      slug: "test-equity", name: "Test Equity", kind: "equity",
      governance: "hypha", transferable: false,
    });
    await loadTokenRegistry(pool);
    const res = await mint(pool, {
      toUserId: u, tokenSlug: "test-equity", amount: 1,
      from: RECOGNITION_FAUCET, source: "test", idempotencyKey: `hypha:${u}`,
    });
    // Hearts are recognition and equity is equity. If this platform ever
    // posted an equity token it would quietly become the source of truth for
    // the cap table, which is the one thing it must never be.
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/Hypha/);
  });

  it("clamps a from_source amount to the rule's ceiling", () => {
    expect(clampToCeiling(40, rule({ ceiling: 100 }))).toBe(40);
    expect(clampToCeiling(4000, rule({ ceiling: 100 }))).toBe(100);
    // A fixed amount ignores what the source posted entirely.
    expect(clampToCeiling(4000, rule({ amount: 20, ceiling: 100 }))).toBe(20);
    // Fail closed: 0 means zero, never unlimited.
    expect(clampToCeiling(50, rule({ ceiling: 0 }))).toBe(0);
  });

  // ── Gratitude ────────────────────────────────────────────────────────────

  /**
   * R73, the arithmetic, held away from the database.
   *
   * The share replaced a flat `economy.hearts_per_recipient_per_moon` of 10,
   * which meant one thing against an allowance of 30 and something entirely
   * different against 500. A share means the same thing at every stage, and
   * the two edges below are the ones worth pinning: it rounds DOWN, and it
   * never rounds down to zero.
   */
  it("caps one recipient at a share of the allowance, floored at 1", () => {
    const at = (total: number) => ({ total, spent: 0, remaining: total, cycleKey: "lunar-000001" });
    const send = (amount: number, total: number, already: number) =>
      checkGive({ fromUserId: "a", toUserId: "b", amount }, at(total), already);

    // 25% of 100 is 25, and the 26th unit to the same person is refused.
    expect(send(25, 100, 0).ok).toBe(true);
    expect(send(26, 100, 0).ok).toBe(false);
    // It is a RUNNING total for the pair, so a second small send is measured
    // against what the first one already used.
    expect(send(5, 100, 20).ok).toBe(true);
    expect(send(6, 100, 20).ok).toBe(false);
    // It rounds down: 25% of 50 is 12.5, and the ceiling is 12.
    expect(send(12, 50, 0).ok).toBe(true);
    expect(send(13, 50, 0).ok).toBe(false);
    // And it never rounds down to zero. 25% of 3 is 0.75, and a ceiling of 0
    // would refuse every gift in the village while both dials still read as
    // sane numbers.
    expect(send(1, 3, 0).ok).toBe(true);
    expect(send(2, 3, 0).ok).toBe(false);
  });

  it("blocks self-gratitude", async () => {
    const u = await makeMember("econ-self");
    const res = await give(pool, { fromUserId: u, toUserId: u, amount: 3 }, AT_GUEST);
    // Thanking yourself mints standing out of nothing, which is the cheapest
    // possible attack on a reputation number.
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/others/);
  });

  it("refuses a give from a member who does not exist", async () => {
    const to = await makeMember("econ-ghost-to");
    // A row that does not exist cannot be locked, so this must refuse rather
    // than run every guard below against an unlocked world.
    const res = await give(pool, { fromUserId: "nobody-at-all", toUserId: to, amount: 1 }, AT_GUEST);
    expect(res.ok).toBe(false);
  });

  it("holds the allowance against five simultaneous gives", async () => {
    const from = await makeMember("econ-race-from");
    const recipients = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => makeMember(`econ-race-to-${n}`)),
    );
    const before = await allowanceFor(pool, from, 1);
    // A quarter of the allowance, which at the stock dials is also exactly the
    // per-recipient share (R73): any larger and the share would refuse these
    // rather than the lock, and the test would prove nothing about the lock.
    const each = Math.max(1, Math.floor(before.total / 4));

    // Four of these fit in the allowance and the fifth does not. Fired
    // together, so the only thing that can refuse the last one is the lock.
    const results = await Promise.all(
      recipients.map((to) => give(pool, { fromUserId: from, toUserId: to, amount: each }, AT_GUEST)),
    );

    const after = await allowanceFor(pool, from, 1);
    expect(after.spent).toBeLessThanOrEqual(before.total);
    const accepted = results.filter((r) => r.ok).length;
    expect(accepted * each).toBeLessThanOrEqual(before.total);
    expect(accepted).toBeGreaterThan(0);
  });

  it("computes the allowance from the ledger rather than a counter", async () => {
    const from = await makeMember("econ-allow-from");
    const to = await makeMember("econ-allow-to");
    const before = await allowanceFor(pool, from, 1);
    const res = await give(pool, { fromUserId: from, toUserId: to, amount: 2 }, AT_GUEST);
    expect(res.ok).toBe(true);
    const after = await allowanceFor(pool, from, 1);
    // Spent is a SUM, so it cannot drift from what was actually given.
    expect(after.spent).toBe(before.spent + 2);
    expect(after.remaining).toBe(before.remaining - 2);
  });

  it("treats one tap arriving twice as one gift", async () => {
    const from = await makeMember("econ-nonce-from");
    const to = await makeMember("econ-nonce-to");
    const nonce = "tap-once-please";
    const a = await give(pool, { fromUserId: from, toUserId: to, amount: 1, clientNonce: nonce }, AT_GUEST);
    const b = await give(pool, { fromUserId: from, toUserId: to, amount: 1, clientNonce: nonce }, AT_GUEST);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });

  // ── Reversal ─────────────────────────────────────────────────────────────

  it("writes one mirror however many times it is reversed", async () => {
    const u = await makeMember("econ-rev-1");
    const key = keys.questCompleted(villageId(), "q-rev", "c-rev", u);
    await mint(pool, {
      toUserId: u, tokenSlug: HEARTS, amount: 7,
      from: RECOGNITION_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    const opts = {
      from: memberAccount(u), to: RECOGNITION_FAUCET,
      tokenSlug: HEARTS, amount: 7, note: "withdrawn",
    };
    const first = await reverse(pool, key, opts);
    const second = await reverse(pool, key, opts);
    expect(first.ok && first.duplicate).toBe(false);
    // The mirror carries its own key, so the second call is a duplicate and
    // not a second refund.
    expect(second.ok && second.duplicate).toBe(true);
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(0);
    expect(await isReversed(pool, key)).toBe(true);
  });

  it("refuses to reverse a reversal", async () => {
    const res = await reverse(pool, `reversal:${villageId()}:anything`, {
      from: RECOGNITION_FAUCET, to: RECOGNITION_FAUCET, tokenSlug: HEARTS, amount: 1,
    });
    // Otherwise two calls alternate forever and each one looks locally fine.
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/cannot itself be reversed/);
  });

  it("refuses to reverse a posting that never happened", async () => {
    const res = await reverse(pool, "quest.completed:local:ghost:ghost:ghost", {
      from: RECOGNITION_FAUCET, to: RECOGNITION_FAUCET, tokenSlug: HEARTS, amount: 1,
    });
    expect(res.ok).toBe(false);
  });

  it("mints cleanly as a new occurrence after a wrong reversal", async () => {
    const u = await makeMember("econ-redo");
    const wrong = keys.questCompleted(villageId(), "q-redo", "claim-a", u);
    await mint(pool, {
      toUserId: u, tokenSlug: HEARTS, amount: 5,
      from: RECOGNITION_FAUCET, source: "quest_consent", idempotencyKey: wrong,
    });
    await reverse(pool, wrong, {
      from: memberAccount(u), to: RECOGNITION_FAUCET, tokenSlug: HEARTS, amount: 5,
    });
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(0);

    // The honest re-do is a NEW claim row, so it is a new occurrence and the
    // spent key does not stand in its way.
    const redo = keys.questCompleted(villageId(), "q-redo", "claim-b", u);
    const res = await mint(pool, {
      toUserId: u, tokenSlug: HEARTS, amount: 5,
      from: RECOGNITION_FAUCET, source: "quest_consent", idempotencyKey: redo,
    });
    expect(res.ok && res.duplicate).toBe(false);
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(5);
  });

  /**
   * Rows read straight out of the database, because a return value is the one
   * witness that cannot contradict the code under test.
   */
  async function readRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [out] = await pool.query(sql, params);
    return out as unknown as T[];
  }

  /** Every account and every faucet, one token. Double entry says zero. */
  async function conserved(token: string): Promise<number> {
    const [row] = await readRows<{ s: string | number }>(
      "SELECT COALESCE(SUM(`balance`), 0) AS s FROM `token_balances` WHERE `token_type` = ?",
      [token],
    );
    return Number(row?.s ?? 0);
  }

  interface LedgerRow {
    from_account: string;
    to_account: string;
    token_type: string;
    amount: number;
  }

  const ledgerRow = async (key: string): Promise<LedgerRow | undefined> =>
    (
      await readRows<LedgerRow>(
        "SELECT `from_account`, `to_account`, `token_type`, `amount` FROM `token_ledger` WHERE `idempotency_key` = ?",
        [key],
      )
    )[0];

  it("refuses a reversal for an amount the posting never moved", async () => {
    // THE ATTACK THIS FUNCTION WAS REWRITTEN FOR. An audit reversed a 25
    // credit posting into a 1,000,000 credit payment to the same member and
    // every invariant stayed green, because a mirror that invents its own
    // numbers still balances. The numbers come off the row now, and a caller
    // value that disagrees refuses the whole reversal before any write.
    const u = await makeMember("econ-rev-attack");
    const key = keys.questCompleted(villageId(), "q-attack", "c-attack", u);
    await mint(pool, {
      toUserId: u, tokenSlug: CREDITS, amount: 25,
      from: CYCLE_POOL_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);

    const inflated = await reverse(pool, key, {
      from: memberAccount(u), to: CYCLE_POOL_FAUCET, tokenSlug: CREDITS, amount: 1_000_000,
    });
    expect(inflated.ok).toBe(false);
    expect(inflated.ok === false && inflated.error).toMatch(/amount 1000000/);
    // Refused BEFORE the write, which is the only refusal worth having.
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);

    // The same attack pointed the other way: a "reversal" that pays the member
    // a second time instead of taking the first payment back.
    const paidAgain = await reverse(pool, key, {
      from: CYCLE_POOL_FAUCET, to: memberAccount(u), tokenSlug: CREDITS, amount: 25,
    });
    expect(paidAgain.ok).toBe(false);
    expect(paidAgain.ok === false && paidAgain.error).toMatch(/from/);
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);

    // A wrong token is refused on the same footing.
    const wrongToken = await reverse(pool, key, { tokenSlug: HEARTS });
    expect(wrongToken.ok).toBe(false);
    expect(wrongToken.ok === false && wrongToken.error).toMatch(/tokenSlug/);

    // Zero is a claim, not an absence: a caller that computed nothing is asking
    // for a refund it cannot describe, and gets a refusal rather than a mirror
    // derived behind its back.
    const zero = await reverse(pool, key, { amount: 0 });
    expect(zero.ok).toBe(false);
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);

    // And the true reversal, which is now the only reversal there is.
    const honest = await reverse(pool, key, { note: "withdrawn" });
    expect(honest.ok).toBe(true);
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(0);

    const mirrors = await readRows(
      "SELECT `id` FROM `token_ledger` WHERE `source` = 'reversal' AND `source_ref` = ?",
      [key],
    );
    expect(mirrors.length).toBe(1);
    expect(await conserved(CREDITS)).toBe(0);
  });

  it("derives the mirror from the row when the caller says only a note", async () => {
    const u = await makeMember("econ-rev-derive");
    const key = keys.questCompleted(villageId(), "q-derive", "c-derive", u);
    await mint(pool, {
      toUserId: u, tokenSlug: CREDITS, amount: 25,
      from: CYCLE_POOL_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);

    const out = await reverse(pool, key, { note: "nothing else supplied" });
    expect(out.ok).toBe(true);
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(0);

    // Read both rows. The mirror is the original with its two accounts swapped,
    // the same token, and the same number of minor units: no conversion, no
    // caller, no rounding.
    const original = await ledgerRow(key);
    const mirror = await ledgerRow(keys.reversal(villageId(), key));
    expect(original).toBeTruthy();
    expect(mirror).toBeTruthy();
    expect(mirror!.from_account).toBe(original!.to_account);
    expect(mirror!.to_account).toBe(original!.from_account);
    expect(mirror!.token_type).toBe(original!.token_type);
    expect(Number(mirror!.amount)).toBe(Number(original!.amount));
    expect(Number(mirror!.amount)).toBe(25);
    expect(await conserved(CREDITS)).toBe(0);
  });

  it("claws back value the member already spent, and says so with a negative balance", async () => {
    // The refusal this replaces was the dishonest one: the member spent the 25,
    // so taking it back cannot leave them at zero, and refusing the clawback
    // would leave the ledger insisting a withdrawn payment still stands.
    const spender = await makeMember("econ-rev-spent");
    const other = await makeMember("econ-rev-spent-to");
    const key = keys.questCompleted(villageId(), "q-spent", "c-spent", spender);
    await mint(pool, {
      toUserId: spender, tokenSlug: CREDITS, amount: 25,
      from: CYCLE_POOL_FAUCET, source: "quest_consent", idempotencyKey: key,
    });
    // Onward, member to member, through the same guarded post every other
    // movement uses. The credits are gone from the first member's hands.
    const spent = await mint(pool, {
      toUserId: other, tokenSlug: CREDITS, amount: 25,
      from: memberAccount(spender), source: "test_spend",
      idempotencyKey: `test.spend:${villageId()}:${spender}`,
    });
    expect(spent.ok).toBe(true);
    expect(await balanceOf(pool, memberAccount(spender), CREDITS)).toBe(0);
    expect(await balanceOf(pool, memberAccount(other), CREDITS)).toBe(25);

    const back = await reverse(pool, key, { note: "quest withdrawn after the spend" });
    expect(back.ok).toBe(true);
    // The truthful state: the member owes the village 25.
    expect(await balanceOf(pool, memberAccount(spender), CREDITS)).toBe(-25);

    // Lawful, not merely permitted: the boot invariant exempts an account that
    // holds a debit from an ALLOW_NEGATIVE_SOURCES source, and `reversal` is
    // one, so this village still comes up.
    const report = await checkLedgerInvariants(pool);
    expect(report.problems.filter((p) => p.includes(memberAccount(spender)))).toEqual([]);
    expect(report.problems.filter((p) => p.includes("is negative"))).toEqual([]);
    expect(await conserved(CREDITS)).toBe(0);
  });

  // ── Two-party consent ────────────────────────────────────────────────────

  it("refuses a steward witnessing their own work", () => {
    // Confirming releases value, so doing it for yourself has to be
    // structurally impossible, admin included.
    expect(canConfirm("u1", "u1").ok).toBe(false);
    expect(canConfirm("u1", "u2").ok).toBe(true);
    // A confirmation with nobody behind it is not a confirmation.
    expect(canConfirm("u1", "").ok).toBe(false);
  });

  // ── Voice claims ─────────────────────────────────────────────────────────

  it("will not cancel or refund a confirmed claim", () => {
    // The one that costs real value: a cancel arriving after a confirm refunds
    // voice the member has also already received on Hypha.
    expect(canSettleClaim("confirmed", "canceled").ok).toBe(false);
    expect(canSettleClaim("confirmed", "stale").ok).toBe(false);
    expect(canSettleClaim("confirmed", "rejected").ok).toBe(false);
  });

  it("refunds a cancelled claim exactly once", () => {
    expect(canSettleClaim("requested", "canceled").ok).toBe(true);
    // The second cancel finds the claim already settled and does nothing.
    expect(canSettleClaim("canceled", "canceled").ok).toBe(false);
  });

  it("refunds a rejection, because nothing is confiscated for losing a vote", () => {
    expect(canSettleClaim("requested", "rejected").ok).toBe(true);
    expect(claimRefunds("rejected")).toBe(true);
    expect(claimRefunds("canceled")).toBe(true);
    expect(claimRefunds("stale")).toBe(true);
    expect(claimRefunds("confirmed")).toBe(false);
  });

  it("never lets a settled claim go back to requested", () => {
    expect(canSettleClaim("requested", "requested").ok).toBe(false);
  });

  it("registers the village voice as a platform token it can actually accrue", async () => {
    const u = await makeMember("econ-voice");
    const res = await mint(pool, {
      toUserId: u, tokenSlug: VILLAGE_VOICE, amount: 1,
      from: VOICE_MINT, source: "quest_consent",
      idempotencyKey: keys.questCompleted(villageId(), "q-v", "c-v", u),
    });
    // The `voice` row seeded in 0006 is governance:'hypha', which validateLeg
    // refuses to move and a boot invariant requires to hold zero rows. Voice
    // has to accrue somewhere before it can be claimed, so the village's own
    // voice token is a separate, platform-governed slug.
    expect(res.ok).toBe(true);
    expect(await balanceOf(pool, memberAccount(u), VILLAGE_VOICE)).toBe(1);
  });

  // ── The epoch and the flag ───────────────────────────────────────────────

  it("stamps an epoch on first read and keeps it", async () => {
    forgetEpoch();
    const first = await economyEpoch(pool);
    forgetEpoch();
    const second = await economyEpoch(pool);
    // Without a stored epoch, every quest ever consented becomes an unpaid
    // mint the moment the engine reads the table, and the first settlement
    // pays out years of backlog nobody chose.
    expect(second.getTime()).toBe(first.getTime());
  });

  // ── What a confirmed claim mints ─────────────────────────────────────────

  describe("a confirmed claim", () => {
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES ('rule-voice', ?, 'quest.completed', ?, 0.1000, 1, 'claimant', 1) " +
          "ON DUPLICATE KEY UPDATE `enabled` = 1",
        [villageId(), VILLAGE_VOICE],
      );
    });

    it("mints the village voice the rule describes", async () => {
      const u = await makeMember("econ-src-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-src-1", questId: "q-src", userId: u, confirmedAt: new Date(),
      });
      expect(out.skipped).toBeUndefined();
      expect(out.minted.map((m) => m.token)).toContain(VILLAGE_VOICE);
    });

    it("does not mint Hearts again, because consent already did", async () => {
      const u = await makeMember("econ-src-2");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-src-2", questId: "q-src", userId: u, confirmedAt: new Date(),
      });
      // The consent route has minted recognition since S7 with the range, the
      // cap and the standing multiplier. A rule minting it again pays twice
      // for one piece of work.
      expect(out.minted.map((m) => m.token)).not.toContain(HEARTS);
      expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(0);
    });

    it("pays one occurrence once, however many times it is confirmed", async () => {
      const u = await makeMember("econ-src-3");
      const claim = { id: "claim-src-3", questId: "q-src", userId: u, confirmedAt: new Date() };
      await mintForConfirmedClaim(pool, claim);
      const again = await mintForConfirmedClaim(pool, claim);
      expect(again.minted).toHaveLength(0);
      // Thousandths in the ledger, 0.1 on the chip. The ledger's amount is an
      // INT and postTransfer truncates, so a rule of 0.1 posted directly would
      // post nothing and leave a member unpaid with no error anywhere.
      expect(await balanceOf(pool, memberAccount(u), VILLAGE_VOICE)).toBe(100);
      expect(fromLedgerUnits(VILLAGE_VOICE, 100)).toBeCloseTo(0.1);
    });

    it("treats a confirmation older than the epoch as history", async () => {
      const u = await makeMember("econ-src-4");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-src-4", questId: "q-src", userId: u,
        confirmedAt: new Date("2020-01-01T00:00:00Z"),
      });
      // The day the flag flips, every quest ever consented would otherwise
      // become a payable backlog and the first settlement would pay out years
      // of it at once. Nobody decided that; it is just what the query returns.
      expect(out.skipped).toMatch(/epoch/);
      expect(out.minted).toHaveLength(0);
      expect(await balanceOf(pool, memberAccount(u), VILLAGE_VOICE)).toBe(0);
    });
  });

  // ── A rule that cannot pay says so ───────────────────────────────────────
  //
  // Measured on this build before the fix: a `quest.completed` rule on
  // `credits`, enabled, in force, after the epoch, returned `{ minted: [] }`
  // with no `skipped` reason and left the member's balance at 0. Nothing threw
  // and nothing logged. The Mint panel went on listing the rule as enabled and
  // `publicRules` went on publishing it as "25 Village Credits when a steward
  // confirms finished work". `faucetFor` returned null for `credits` and both
  // mint paths did `if (!faucet) continue`.
  //
  // Two separate defects, so two separate groups of tests: the engine could not
  // mint the token, and the engine did not say that it could not.

  describe("paying in village credits", () => {
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES ('rule-credits-test', ?, 'quest.completed', ?, 25, 250, 'claimant', 1) " +
          "ON DUPLICATE KEY UPDATE `enabled` = 1, `amount` = 25",
        [villageId(), CREDITS],
      );
    });

    it("issues credits from the cycle pool, which is where credits come from", () => {
      // Not sys:mint. That faucet's negative balance is each MODULE voucher's
      // outstanding supply; the cycle pool's is credits released to date, and
      // a quest releasing credits is a release. One counter, one answer to
      // "how many credits exist".
      expect(faucetFor(CREDITS)).toBe(CYCLE_POOL_FAUCET);
    });

    it("actually pays a member the credits the rule promises", async () => {
      const u = await makeMember("econ-credits-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-credits-1", questId: "q-credits", userId: u, confirmedAt: new Date(),
      });
      expect(out.minted.map((m) => m.token)).toContain(CREDITS);
      // The assertion that would have caught the original defect. Whole units:
      // `credits` carries decimals 0, so 25 in the rule is 25 in the ledger.
      expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25);
    });

    it("counts what it issued against the cycle pool, not against nothing", async () => {
      // Conservation is the invariant every other surface is built on. A mint
      // that credited a member without debiting a faucet would still balance
      // only if it never happened at all, which is exactly the bug.
      const issued = await balanceOf(pool, CYCLE_POOL_FAUCET, CREDITS);
      expect(issued).toBeLessThan(0);
    });

    it("shows the credits it issued on the public supply feed", async () => {
      // `sys:cycle-pool` was missing from this feed's faucet list, so a village
      // publishing its books showed every token except the one members spend.
      const supply = await publicSupply(pool);
      expect(supply.tokens.map((t) => t.token)).toContain("Village Credits");
    });
  });

  describe("a rule the engine cannot honour", () => {
    it("names the reason rather than skipping in silence", async () => {
      // `voice` is the read-only Hypha mirror seeded by 0006. A village that
      // points a rule at a Hypha-governed token is asking this platform to
      // become the source of truth for something that lives on Base, which it
      // must refuse. Refusing is correct; refusing without saying so is the
      // defect. (The equity token is the other one of these, and is not named
      // here because it is a brand name and platform code may not carry one.)
      const problem = ruleCannotPay(HYPHA_MIRROR);
      expect(problem).toBeTruthy();
      expect(problem).toMatch(/Hypha/);
      // And a token that is not in the registry at all.
      expect(ruleCannotPay("no-such-token")).toMatch(/no token called/);
      // The tokens a village actually pays in are all payable.
      expect(ruleCannotPay(CREDITS)).toBeNull();
      expect(ruleCannotPay(VILLAGE_VOICE)).toBeNull();
      expect(ruleCannotPay(HEARTS)).toBeNull();
    });

    it("reports an unpayable quest rule to the caller", async () => {
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES ('rule-unpayable-test', ?, 'quest.completed', ?, 5, 50, 'claimant', 1) " +
          "ON DUPLICATE KEY UPDATE `enabled` = 1",
        [villageId(), HYPHA_MIRROR],
      );
      const u = await makeMember("econ-unpayable-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-unpayable-1", questId: "q-unpayable", userId: u, confirmedAt: new Date(),
      });
      // The whole point: the caller now HAS something to log. Before this the
      // consent route had no way to know one of the village's rules had just
      // paid nobody.
      expect(out.unpayable.map((x) => x.token)).toContain(HYPHA_MIRROR);
      expect(await balanceOf(pool, memberAccount(u), HYPHA_MIRROR)).toBe(0);
      // And the rules that CAN pay are unaffected: one bad rule must not stop
      // a member being paid what the others promise.
      expect(out.minted.map((m) => m.token)).toContain(VILLAGE_VOICE);
    });

    it("names a quest rule that reads its amount from work that posts none", async () => {
      // `amount: null` means "read it from whatever posted the work", and
      // `queueRuleChange` accepts it on any rule. The only amount a quest
      // posts is its Gratitude range, which the consent route already spends,
      // so a from_source rule on a second token can never resolve an amount on
      // any quest, ever. It used to fall through `if (human <= 0) continue`.
      // A token of its own. `mint_rules` is UNIQUE on
      // (village_id, trigger, token_slug), so reusing `credits` here would not
      // add a rule at all: it would silently rewrite the credits rule the
      // block above proved, and this test would then pass by mutating its
      // neighbour rather than by testing anything.
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES ('rule-fromsource-test', ?, 'quest.completed', 'stay-credit', NULL, 50, 'claimant', 1) " +
          "ON DUPLICATE KEY UPDATE `enabled` = 1, `amount` = NULL",
        [villageId()],
      );
      const u = await makeMember("econ-fromsource-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-fromsource-1", questId: "q-fromsource", userId: u, confirmedAt: new Date(),
      });
      const said = out.unpayable.find((x) => x.token === "stay-credit");
      expect(said?.reason).toMatch(/reads its amount/);
      // The credits rule beside it is untouched and still pays.
      expect(out.minted.map((m) => m.token)).toContain(CREDITS);
      // Clear it again: the rules table is shared by the tests below.
      await pool.query("DELETE FROM `mint_rules` WHERE `id` = 'rule-fromsource-test'");
    });

    it("stays quiet about a rule a village deliberately set to zero", async () => {
      // Zero is a decision, and shouting about it on every consent would bury
      // the rules that are genuinely broken.
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES ('rule-zero-test', ?, 'quest.completed', 'library-credit', 0, 50, 'claimant', 1) " +
          "ON DUPLICATE KEY UPDATE `enabled` = 1, `amount` = 0",
        [villageId()],
      );
      const u = await makeMember("econ-zero-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-zero-1", questId: "q-zero", userId: u, confirmedAt: new Date(),
      });
      expect(out.unpayable.map((x) => x.token)).not.toContain("library-credit");
      await pool.query("DELETE FROM `mint_rules` WHERE `id` = 'rule-zero-test'");
    });

    it("keeps an unpayable rule out of the settlement forecast", async () => {
      // This used to multiply every enabled rule by the seat count, unpayable
      // ones included, and print the total as what next moon would pay.
      const view = await mintView(pool);
      const bad = view.rules.find((r) => r.id === "rule-unpayable-test");
      expect(bad?.problem).toMatch(/Hypha/);
      expect(view.settlementPreview.mints.map((m) => m.token)).not.toContain(HYPHA_MIRROR);
      // A rule that works carries no problem, so the panel can tell them apart.
      const good = view.rules.find((r) => r.id === "rule-credits-test");
      expect(good?.problem).toBeNull();
    });
  });

  // ── A dial change waits for the moon ─────────────────────────────────────

  describe("a queued rule change", () => {
    // Self-contained: this suite never runs seedEconomy, so the block makes
    // the row it measures rather than assuming one a seeder would have left.
    const RULE = "rule-deferral-test";
    beforeAll(async () => {
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
          "VALUES (?,?,'quest.completed',?,0.1000,1,'claimant',1) ON DUPLICATE KEY UPDATE `amount` = 0.1000, " +
          "`ceiling` = 1, `enabled` = 1, `pending_from_cycle` = NULL",
        [RULE, villageId(), HEARTS],
      );
    });

    it("does not touch the live numbers", async () => {
      const before = (await rulesFor(pool, "quest.completed")).find((r) => r.id === RULE);
      expect(before).toBeTruthy();
      const out = await queueRuleChange(pool, RULE, { amount: 0.9 }, "admin-1");
      expect(out.ok).toBe(true);
      // The whole point of the deferral. A rule cannot be raised, paid against
      // and lowered again around a settlement, and nobody's owed amount changes
      // under them mid-cycle.
      const after = (await rulesFor(pool, "quest.completed")).find((r) => r.id === RULE);
      expect(after?.amount).toBe(before?.amount);
    });

    it("lands at the NEXT cycle, never this one", async () => {
      const out = await queueRuleChange(pool, RULE, { amount: 0.7 }, "admin-1");
      expect(out.ok && out.fromCycle).toBe(cycleBoundsFor(new Date()).cycleNumber + 1);
    });

    it("replaces a queued change rather than stacking on it", async () => {
      await queueRuleChange(pool, RULE, { amount: 0.7 }, "admin-1");
      await queueRuleChange(pool, RULE, { amount: 0.3 }, "admin-2");
      const view = await mintView(pool);
      const r = view.rules.find((x) => x.id === RULE);
      // Two pending amounts for one rule have no defined meaning, and somebody
      // would have to invent one.
      expect(r?.pending?.amount).toBe(0.3);
    });

    it("refuses a fixed amount above its own ceiling", async () => {
      const out = await queueRuleChange(pool, RULE, { amount: 99 }, "admin-1");
      expect(out.ok).toBe(false);
    });

    it("refuses a negative ceiling, and zero is a real answer", async () => {
      expect((await queueRuleChange(pool, RULE, { ceiling: -1 }, "a")).ok).toBe(false);
      expect((await queueRuleChange(pool, RULE, { ceiling: 0 }, "a")).ok).toBe(true);
    });

    it("promotes only when the moon has come, and clears the queue with it", async () => {
      await queueRuleChange(pool, RULE, { amount: 0.4, ceiling: 1 }, "admin-1");
      // A cycle that has not arrived promotes nothing.
      expect(await applyPendingRules(pool, new Date())).toBe(0);

      // One lunation on, it lands.
      const nextMoon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(await applyPendingRules(pool, nextMoon)).toBeGreaterThan(0);

      const view = await mintView(pool);
      const r = view.rules.find((x) => x.id === RULE);
      expect(r?.amount).toBe(0.4);
      // Applied and cleared in one write, so no rule ever carries both a new
      // value and a stale pending copy of it.
      expect(r?.pending).toBeNull();
      // And a second run has nothing left to do.
      expect(await applyPendingRules(pool, nextMoon)).toBe(0);
    });
  });

  // ── The ceiling binds where the payment happens ──────────────────────────
  //
  // Measured on this build before the fix, against a rule left at
  // `amount 25, ceiling 5`: `mintForConfirmedClaim` posted 25 and the member's
  // balance read 25. `clampToCeiling` existed, was exported, was documented as
  // the rule, and had NO CALLER anywhere under `server/`: the only reference to
  // it in the repository was the unit test three hundred lines above this one.
  // A function nobody calls is a comment with a type signature.
  //
  // WHAT THE COLUMN BOUNDS, because the answer decides every test below.
  // ONE OCCURRENCE, in the rule's own human units, and not a cycle's total.
  // Four citations say so and none says otherwise:
  //
  //   drizzle/0071_economy_core.sql:52  "The hard cap on any from_source amount"
  //   server/lib/economy.ts             `clampToCeiling`, per posted amount
  //   economy.ts `publicRules` and client/src/pages/Mint.tsx:365, which both
  //     print it as "up to N, as much as the work was posted for"
  //   economy.ts `queueRuleChange`      refuses ONE amount above it as
  //     "a rule that contradicts itself", which is a per-occurrence sentence
  //
  // So the last test in this block is the one that pins the reading down: the
  // shipped default of `amount 25, ceiling 250` pays eleven confirmed quests
  // 275, and that is the rule working rather than a cap being missed.
  describe("a rule's ceiling", () => {
    // `stay-credit` because the natural key is (village, trigger, token) and
    // every other token this file uses on `quest.completed` already carries a
    // rule from a block above. Registered here rather than assumed: the stays
    // module registers it at boot and this suite never boots one, so a rule
    // pointing at an unregistered token would report "no token called" and the
    // ceiling would never be reached at all.
    const TOKEN = "stay-credit";
    const RULE = "rule-ceiling-test";

    /** The rule's live numbers, written straight, in force from cycle zero. */
    async function setRule(amount: number | null, ceiling: number): Promise<void> {
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`, `effective_from_cycle`) " +
          "VALUES (?,?,'quest.completed',?,?,?,'claimant',1,0) " +
          "ON DUPLICATE KEY UPDATE `amount` = VALUES(`amount`), `ceiling` = VALUES(`ceiling`), " +
          "`enabled` = 1, `effective_from_cycle` = 0, `pending_from_cycle` = NULL",
        [RULE, villageId(), TOKEN, amount, ceiling],
      );
    }

    /** What the ledger actually holds for this token, from the rows themselves. */
    async function posted(account: string): Promise<{ rows: number; units: number }> {
      const [rows] = await pool.query<any[]>(
        "SELECT COUNT(*) AS n, COALESCE(SUM(`amount`), 0) AS units FROM `token_ledger` " +
          "WHERE `to_account` = ? AND `token_type` = ?",
        [account, TOKEN],
      );
      return { rows: Number(rows[0]?.n ?? 0), units: Number(rows[0]?.units ?? 0) };
    }

    beforeAll(async () => {
      await registerToken(pool, {
        slug: TOKEN, name: "Stay Credit", kind: "credit",
        governance: "platform", transferable: false, decimals: 0,
      });
      await loadTokenRegistry(pool);
    });

    afterAll(async () => {
      // The block below deletes every rule in the village and counts what is
      // left, so this one takes its own row out rather than leaving a rule the
      // next reader has to account for.
      await pool.query("DELETE FROM `mint_rules` WHERE `id` = ?", [RULE]);
    });

    it("pays the ceiling, not the amount, when a rule was left above its own ceiling", async () => {
      await setRule(25, 5);
      const u = await makeMember("econ-ceil-1");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-ceil-1", questId: "q-ceil", userId: u, confirmedAt: new Date(),
      });
      // Read on the balance and on the row, never on the return value: a mint
      // that reported 5 and posted 25 would pass an assertion on `minted`.
      expect(await balanceOf(pool, memberAccount(u), TOKEN)).toBe(5);
      expect(await posted(memberAccount(u))).toEqual({ rows: 1, units: 5 });
      // And the caller is told what it actually paid, so a route logging the
      // result does not tell the member 25.
      expect(out.minted.find((m) => m.token === TOKEN)?.amount).toBe(5);
      expect((await checkLedgerInvariants(pool)).problems).toEqual([]);
    });

    it("reaches that state through the governed path, with nobody typing the row", async () => {
      // GREEN EITHER WAY, on purpose, and it is the only test here that is.
      // It measures `queueRuleChange` and `applyPendingRules`, which this
      // change does not touch: its job is to prove the row the tests around
      // it measure is reachable without an admin typing it, not to prove the
      // clamp. Removing the clamp leaves this one passing.
      //
      // THE HOLE THIS CLOSES. `queueRuleChange` refuses an amount above the
      // ceiling, and skips that check entirely when the change carries a
      // ceiling and no amount. A village voting "the most it can pay" down
      // therefore lands the rule at 25 over a ceiling of 5, which is exactly
      // the row the test above measures, and no admin ever typed it.
      await setRule(25, 250);
      const queued = await queueRuleChange(pool, RULE, { ceiling: 5 }, "admin-ceiling");
      expect(queued.ok).toBe(true);

      const nextMoon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(await applyPendingRules(pool, nextMoon)).toBeGreaterThan(0);

      const [rows] = await pool.query<any[]>(
        "SELECT `amount`, `ceiling` FROM `mint_rules` WHERE `id` = ?",
        [RULE],
      );
      expect(Number(rows[0].amount)).toBe(25);
      expect(Number(rows[0].ceiling)).toBe(5);
    });

    it("mints nothing on a ceiling of zero, and says which number stopped it", async () => {
      // An empty state and a real zero are different facts. `mint_rules.ceiling`
      // is NOT NULL DEFAULT 0 and `mintRuleValueProblem` tells a village in as
      // many words that "a ceiling is zero or more, and zero means zero", so
      // this is fail-closed by the same reading the swap caps use.
      await setRule(25, 0);
      const u = await makeMember("econ-ceil-zero");
      const out = await mintForConfirmedClaim(pool, {
        id: "claim-ceil-zero", questId: "q-ceil", userId: u, confirmedAt: new Date(),
      });
      expect(await balanceOf(pool, memberAccount(u), TOKEN)).toBe(0);
      expect(await posted(memberAccount(u))).toEqual({ rows: 0, units: 0 });
      // A refusal a person can read, naming the number to change. An amount of
      // zero stays quiet because it is a village saying "not this one, not
      // now"; a ceiling of zero under a positive amount is a row at war with
      // itself and somebody has to be told.
      const said = out.unpayable.find((x) => x.token === TOKEN);
      expect(said?.reason).toMatch(/ceiling is 0/);
      expect(said?.reason).toMatch(/Raise the ceiling or pause the rule/);
    });

    it("still pays once for one occurrence, whatever the clamp did", async () => {
      await setRule(25, 5);
      const u = await makeMember("econ-ceil-idem");
      const claim = { id: "claim-ceil-idem", questId: "q-ceil", userId: u, confirmedAt: new Date() };
      await mintForConfirmedClaim(pool, claim);
      const again = await mintForConfirmedClaim(pool, claim);
      // The key shape is untouched by this change, so a re-confirm is still a
      // duplicate and still pays nothing a second time.
      expect(again.minted.find((m) => m.token === TOKEN)).toBeUndefined();
      expect(await posted(memberAccount(u))).toEqual({ rows: 1, units: 5 });
    });

    it("holds the ceiling on two claims confirmed in the same instant", async () => {
      await setRule(25, 5);
      const a = await makeMember("econ-ceil-race-a");
      const b = await makeMember("econ-ceil-race-b");
      /*
       * A per-occurrence bound has NO RUNNING TOTAL TO RACE ON, so there is no
       * check-then-act window here for a `TransferGuard` to close: the clamp
       * is a pure function of the rule row and the amount, decided before the
       * post. What this measures is that contention cannot get more than the
       * ceiling past the clamp, and that the books still balance afterwards.
       *
       * `allSettled` AND NOT `all`, and the difference is not cosmetic. `all`
       * rejects the moment one side does and leaves the OTHER mint still
       * posting, which then deadlocks the next test in this block against a
       * transaction the previous test walked away from. That cost a flaky run
       * before it was understood.
       *
       * A REJECTION IS AN ACCEPTED OUTCOME HERE, and it is a defect this lane
       * found and did not fix, because it lives in `postTransfer` and not in
       * the mint path. `postTransferPair` retries `ER_LOCK_DEADLOCK` three
       * times and says in its own comment that "InnoDB may still pick a
       * deadlock victim under real contention even with perfect lock
       * ordering". `postTransfer`, which every single mint goes through, rolls
       * back and rethrows, and neither `mint` nor `mintForConfirmedClaim`
       * catches it. So `mintForConfirmedClaim`'s promise that "it never throws
       * into the consent route" is not true under contention. Measured at
       * 2026-09-03: one run in three of exactly this pair of calls.
       */
      const settled = await Promise.allSettled([
        mintForConfirmedClaim(pool, { id: "claim-race-a", questId: "q-ceil", userId: a, confirmedAt: new Date() }),
        mintForConfirmedClaim(pool, { id: "claim-race-b", questId: "q-ceil", userId: b, confirmedAt: new Date() }),
      ]);
      for (const s of settled) {
        // Narrow, so a NEW kind of failure still turns this red rather than
        // being absorbed by a tolerant assertion.
        if (s.status === "rejected") {
          expect(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]).toContain(s.reason?.code);
        }
      }
      // The rule holds whatever the ledger did. A call that came back paid
      // exactly the ceiling; a call that was the deadlock victim posted
      // nothing at all, because `postTransfer` rolls back before it rethrows.
      const who = [a, b];
      for (let i = 0; i < settled.length; i += 1) {
        const rows = await posted(memberAccount(who[i]));
        expect(rows).toEqual(settled[i].status === "fulfilled" ? { rows: 1, units: 5 } : { rows: 0, units: 0 });
      }
      expect((await checkLedgerInvariants(pool)).problems).toEqual([]);
    });

    it("clamps a seat payout at settlement too, which is the other mint path", async () => {
      // The twin. `runSettlement` read `r.amount ?? 0` and posted it, so a
      // fix to the quest path alone would have left every seat in the village
      // paid over the ceiling once a moon.
      // No `org_roles` row: the seat query reads `org_role_assignments` alone
      // and this schema carries no foreign keys, so inventing a seat title
      // here would only be scenery.
      const u = await makeMember("econ-ceil-seat");
      await pool.query(
        "INSERT INTO `org_role_assignments` (`id`, `org_role_id`, `holder_kind`, `user_id`, `holder_key`, `is_example`) " +
          "VALUES ('seat-ceiling-test','role-ceiling-test','member',?,?,0) " +
          "ON DUPLICATE KEY UPDATE `user_id` = VALUES(`user_id`)",
        [u, u],
      );
      await pool.query(
        "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`, `effective_from_cycle`) " +
          "VALUES ('rule-ceiling-seat',?,'role.cycle',?,25,5,'holder',1,0) " +
          "ON DUPLICATE KEY UPDATE `amount` = 25, `ceiling` = 5, `enabled` = 1, `effective_from_cycle` = 0",
        [villageId(), TOKEN],
      );
      const out = await runSettlement(pool);
      expect(out.stewardsThanked).toBe(1);
      expect(await balanceOf(pool, memberAccount(u), TOKEN)).toBe(5);
      expect(await posted(memberAccount(u))).toEqual({ rows: 1, units: 5 });
      await pool.query("DELETE FROM `mint_rules` WHERE `id` = 'rule-ceiling-seat'");
      await pool.query("DELETE FROM `org_role_assignments` WHERE `id` = 'seat-ceiling-test'");
    });

    it("leaves the shipped default alone: eleven quests at 25 under a ceiling of 250 issue 275", async () => {
      // GREEN EITHER WAY, and that is the point: a regression guard on the
      // reading rather than a proof of the clamp. If somebody later reads the
      // column as a per-cycle budget, this is the test that goes red and says
      // which village it would have stopped paying.
      //
      // THE READING, pinned. This is `rule-quest.completed-credits` as
      // `economySeed.ts` ships it, and 275 is what "25 Village Credits when a
      // steward confirms finished work" promises for eleven confirmed quests.
      //
      // Reading the column as a per-cycle budget would make this 250 and would
      // ALSO stop the shipped `role.cycle credits, amount 25, ceiling 250`
      // after the tenth seat in every village with more than ten seats, which
      // nobody has decided. That is a founder's call and it needs its own
      // column, not a new reading of this one.
      await setRule(25, 250);
      const u = await makeMember("econ-ceil-eleven");
      for (let i = 1; i <= 11; i += 1) {
        await mintForConfirmedClaim(pool, {
          id: `claim-ceil-11-${i}`, questId: "q-ceil", userId: u, confirmedAt: new Date(),
        });
      }
      expect(await posted(memberAccount(u))).toEqual({ rows: 11, units: 275 });
      expect(await balanceOf(pool, memberAccount(u), TOKEN)).toBe(275);
      expect((await checkLedgerInvariants(pool)).problems).toEqual([]);
    });

    it("clamps a from_source amount the way it always said it did", () => {
      // Held on the function rather than on a balance, and this is a real
      // limit on what this suite proves: NEITHER mint path can reach the
      // from_source branch. `mintForConfirmedClaim` refuses `amount === null`
      // as "a quest posts no amount in this token" before any amount exists,
      // and `runSettlement` reads `r.amount ?? 0` and skips. So the branch the
      // column was written for has no live caller to measure, and the two
      // paths above are where the column now actually binds.
      expect(clampToCeiling(40, rule({ ceiling: 100 }))).toBe(40);
      expect(clampToCeiling(4000, rule({ ceiling: 100 }))).toBe(100);
      // And the branch this change added: a fixed amount is bounded too.
      expect(clampToCeiling(0, rule({ amount: 25, ceiling: 5 }))).toBe(5);
      expect(clampToCeiling(0, rule({ amount: 25, ceiling: 250 }))).toBe(25);
      expect(clampToCeiling(0, rule({ amount: 25, ceiling: 0 }))).toBe(0);
    });

    it("answers the whole ceiling decision in one pure call, every case", () => {
      // THE TABLE THE DRY-RUN MODEL MIRRORS. `shared/dryRun/economicsModel.ts`
      // may not import anything under `server/` and its own test walks the
      // import graph to enforce that, so it copies this arithmetic the way it
      // copies the faucet map. This is the table to copy, and there is
      // deliberately no "issued so far this cycle" column in it: the ceiling
      // bounds an occurrence, so a running total is not an input.
      const cases: Array<[Partial<MintRule>, number, number, boolean]> = [
        // rule                          posted  paid  refused
        [{ amount: 25, ceiling: 250 },        0,   25,  false],
        [{ amount: 25, ceiling: 5 },          0,    5,  false],
        [{ amount: 25, ceiling: 25 },         0,   25,  false], // exactly at it pays
        [{ amount: 25, ceiling: 0 },          0,    0,   true],
        [{ amount: 0, ceiling: 250 },         0,    0,  false], // the village's own off switch
        [{ amount: null, ceiling: 100 },     40,   40,  false],
        [{ amount: null, ceiling: 100 },   4000,  100,  false],
        [{ amount: null, ceiling: 0 },       40,    0,   true],
      ];
      for (const [over, posted, paid, refused] of cases) {
        const out = ceilingOutcome(rule(over), posted, "Village Credits");
        expect({ paid: out.paid, refused: out.refusal !== null }).toEqual({ paid, refused });
      }
      // The sentence itself, once, because a founder reads it and a route logs
      // it. It names the number that stopped the payment and what to do.
      expect(ceilingOutcome(rule({ amount: 25, ceiling: 0 }), 0, "Village Credits").refusal).toBe(
        "this rule's ceiling is 0, so it can pay no Village Credits at all. Raise the ceiling or pause the rule",
      );
    });
  });

  it("keeps the write paths shut when the rules were never seeded", async () => {
    await pool.query("DELETE FROM `mint_rules` WHERE `village_id` = ?", [villageId()]);
    const shut = await economyReady(pool);
    // The flag alone is not enough. A village with the flag on and no rules
    // mints nothing while believing it is running, and that failure only ever
    // shows up as an absence.
    expect(shut.ready).toBe(false);
    expect(shut.reason).toMatch(/mint rules/);

    await pool.query(
      "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
        "VALUES ('seed-1', ?, 'gratitude.given', ?, NULL, 30, 'receiver', 1)",
      [villageId(), HEARTS],
    );
    expect((await economyReady(pool)).ready).toBe(true);
  });
});
