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
  clampToCeiling,
  claimRefunds,
  economyEpoch,
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
  VILLAGE_VOICE,
  VOICE_MINT,
  villageId,
  type MintRule,
} from "./lib/economy";
import { balanceOf, loadTokenRegistry, memberAccount, registerToken, RECOGNITION_FAUCET } from "./lib/ledger";
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
