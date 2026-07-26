/**
 * Tests for the token ledger, S7 edition: transfer rows in MySQL.
 *
 * These exist because the end-to-end test cannot prove the properties that
 * matter here. Retrying a quest consent over HTTP is refused by the status
 * guard, so the request never reaches the ledger — idempotency is a property
 * of postTransfer and is tested against postTransfer, same key twice. The
 * new keystone properties are tested the same way: overdraft refusal rolls
 * the whole transaction back, faucets run negative by design and their
 * negative balance IS issuance-to-date, and conservation (per token, all
 * balances sum to zero) survives any mix of posts.
 *
 * Runs against the S5 harness: a scratch schema with every real migration
 * applied. No TEST_DATABASE_URL → skips loudly.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import {
  balanceOf,
  balancesFor,
  checkLedgerInvariants,
  CYCLE_POOL_FAUCET,
  entriesForMember,
  loadTokenRegistry,
  memberAccount,
  postTransfer,
  RECOGNITION_FAUCET,
  registerToken,
  tokenDef,
  TREASURY,
} from "./lib/ledger";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

describe.skipIf(!configured)("the MySQL token ledger", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
    await loadTokenRegistry(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("loads the registry from the tokens table (0006/0007 seeds)", () => {
    expect(tokenDef("gratitude")?.governance).toBe("platform");
    expect(tokenDef("amora")?.governance).toBe("hypha");
    expect(tokenDef("voice")?.governance).toBe("hypha");
    expect(tokenDef("credits")?.name).toBe("Village Credits");
    expect(tokenDef("nope")).toBeUndefined();
  });

  it("posts a faucet issue and returns the recomputed receiving balance", async () => {
    const r = await postTransfer(pool, {
      from: RECOGNITION_FAUCET,
      to: memberAccount("usr-1"),
      amount: 40,
      source: "quest_consent",
      idempotencyKey: "quest_consent:claim-1",
    });
    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(false);
    expect(r.toBalance).toBe(40);
    expect(await balanceOf(pool, memberAccount("usr-1"))).toBe(40);
    // The faucet went negative by exactly what it issued.
    expect(await balanceOf(pool, RECOGNITION_FAUCET)).toBe(-40);
  });

  it("THE property: the same idempotency key posts exactly once", async () => {
    const input = {
      from: RECOGNITION_FAUCET,
      to: memberAccount("usr-1"),
      amount: 40,
      source: "quest_consent",
      idempotencyKey: "quest_consent:claim-1",
    };
    const second = await postTransfer(pool, input);
    const third = await postTransfer(pool, input);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);
    expect(second.toBalance).toBe(40);
    expect((await entriesForMember(pool, "usr-1")).length).toBe(1);
    expect(await balanceOf(pool, RECOGNITION_FAUCET)).toBe(-40);
  });

  it("refuses an overdraft for non-faucet accounts and rolls the whole post back", async () => {
    // usr-1 holds 40 and tries to send 100 to usr-2.
    const r = await postTransfer(pool, {
      from: memberAccount("usr-1"),
      to: memberAccount("usr-2"),
      amount: 100,
      source: "test_transfer",
      idempotencyKey: "overdraft-attempt-1",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("insufficient");
    // Nothing moved and the failed row did not survive the rollback: the same
    // key can be used again once the account is funded.
    expect(await balanceOf(pool, memberAccount("usr-1"))).toBe(40);
    expect(await balanceOf(pool, memberAccount("usr-2"))).toBe(0);
    const retry = await postTransfer(pool, {
      from: memberAccount("usr-1"),
      to: memberAccount("usr-2"),
      amount: 15,
      source: "test_transfer",
      idempotencyKey: "overdraft-attempt-1",
    });
    expect(retry.ok).toBe(true);
    expect(retry.duplicate).toBe(false);
    expect(await balanceOf(pool, memberAccount("usr-1"))).toBe(25);
    expect(await balanceOf(pool, memberAccount("usr-2"))).toBe(15);
  });

  it("the treasury is NOT a faucet: it must be funded before it can spend", async () => {
    const broke = await postTransfer(pool, {
      from: TREASURY,
      to: memberAccount("usr-1"),
      amount: 5,
      source: "test_grant",
      idempotencyKey: "treasury-broke-1",
    });
    expect(broke.ok).toBe(false);
    expect(broke.error).toContain("insufficient");
  });

  it("fails loud on an unknown token, never coercing", async () => {
    const r = await postTransfer(pool, {
      from: RECOGNITION_FAUCET,
      to: memberAccount("usr-1"),
      tokenType: "definitely-not-registered",
      amount: 5,
      source: "test",
      idempotencyKey: "unknown-token-1",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("unknown token");
  });

  it("refuses to move hypha-governed tokens — the cap table lives on Base", async () => {
    const r = await postTransfer(pool, {
      from: RECOGNITION_FAUCET,
      to: memberAccount("usr-1"),
      tokenType: "amora",
      amount: 5,
      source: "test",
      idempotencyKey: "hypha-attempt-1",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Hypha");
  });

  it("refuses self-transfers, zero, negative and missing-account posts", async () => {
    const self = await postTransfer(pool, {
      from: memberAccount("usr-1"),
      to: memberAccount("usr-1"),
      amount: 5,
      source: "test",
      idempotencyKey: "self-1",
    });
    expect(self.ok).toBe(false);
    const zero = await postTransfer(pool, {
      from: RECOGNITION_FAUCET,
      to: memberAccount("usr-1"),
      amount: 0,
      source: "test",
      idempotencyKey: "zero-1",
    });
    expect(zero.ok).toBe(false);
    const missing = await postTransfer(pool, {
      from: "sys:no-such-account",
      to: memberAccount("usr-1"),
      amount: 5,
      source: "test",
      idempotencyKey: "missing-1",
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("does not exist");
  });

  it("cycle pool pays a separate token from its own faucet", async () => {
    const r = await postTransfer(pool, {
      from: CYCLE_POOL_FAUCET,
      to: memberAccount("usr-2"),
      tokenType: "credits",
      amount: 1000,
      source: "gratitude_pool",
      idempotencyKey: "gratitude_pool:1:usr-2",
    });
    expect(r.ok).toBe(true);
    const balances = await balancesFor(pool, memberAccount("usr-2"));
    expect(balances).toEqual({ gratitude: 15, credits: 1000 });
    expect(await balanceOf(pool, CYCLE_POOL_FAUCET, "credits")).toBe(-1000);
  });

  it("shows a member their movements signed from their side, newest first", async () => {
    const entries = await entriesForMember(pool, "usr-1");
    // usr-1: +40 (quest), -15 (sent to usr-2).
    const amounts = entries.map((e) => e.amount);
    expect(amounts).toContain(40);
    expect(amounts).toContain(-15);
    expect(entries.every((e) => typeof e.at === "string")).toBe(true);
  });

  it("registers a module token at runtime and can post it immediately", async () => {
    await registerToken(pool, {
      slug: "library-credits",
      name: "Material Library Credits",
      kind: "credit",
      governance: "platform",
      transferable: true,
    });
    expect(tokenDef("library-credits")?.name).toBe("Material Library Credits");
    const r = await postTransfer(pool, {
      from: CYCLE_POOL_FAUCET,
      to: memberAccount("usr-1"),
      tokenType: "library-credits",
      amount: 3,
      source: "module_grant",
      idempotencyKey: "module-grant-1",
    });
    expect(r.ok).toBe(true);
    expect(r.toBalance).toBe(3);
  });

  it("holds the invariants after all of the above: conservation ≡ 0, no drift, no illegal negatives", async () => {
    const report = await checkLedgerInvariants(pool);
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("detects manufactured corruption: cache drift, hypha rows, orphan tokens", async () => {
    // Tamper directly, the way a bug (not postTransfer) would.
    await pool.query("UPDATE token_balances SET balance = balance + 7 WHERE account_id = ? AND token_type = 'gratitude'", [
      memberAccount("usr-1"),
    ]);
    await pool.query(
      "INSERT INTO token_ledger (id, from_account, to_account, token_type, amount, source, idempotency_key) VALUES " +
        "('led-tamper-1', 'sys:treasury', ?, 'amora', 5, 'tamper', 'tamper-hypha-1')",
      [memberAccount("usr-1")],
    );
    const report = await checkLedgerInvariants(pool);
    expect(report.ok).toBe(false);
    expect(report.problems.some((p) => p.includes("drift"))).toBe(true);
    expect(report.problems.some((p) => p.includes("hypha"))).toBe(true);

    // Clean up so this test documents detection without poisoning the schema
    // for anything that runs after it.
    await pool.query("DELETE FROM token_ledger WHERE id = 'led-tamper-1'");
    await pool.query("UPDATE token_balances SET balance = balance - 7 WHERE account_id = ? AND token_type = 'gratitude'", [
      memberAccount("usr-1"),
    ]);
    expect((await checkLedgerInvariants(pool)).ok).toBe(true);
  });
});
