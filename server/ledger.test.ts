/**
 * Unit tests for the token ledger.
 *
 * These exist because the end-to-end test could not prove the property that
 * matters. Retrying a quest consent over HTTP is refused by the status guard
 * (a consented claim is no longer "submitted"), so the request never reaches the
 * ledger and a passing e2e assertion would have proved the guard, not the
 * idempotency. Idempotency is a property of `creditTokens`, so it is tested here,
 * against the function, with the same key used twice.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { backfillOpeningBalances, balanceOf, creditTokens, entriesFor, registerToken } from "./lib/ledger";

let file: string;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "amora-ledger-"));
  file = path.join(dir, "token-ledger.json");
  fs.writeFileSync(file, "[]");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("creditTokens", () => {
  it("credits once and returns the recomputed balance", () => {
    const r = creditTokens(file, {
      userId: "usr-1",
      amount: 40,
      source: "quest_consent",
      idempotencyKey: "quest_consent:claim-1",
    });
    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(false);
    expect(r.balance).toBe(40);
    expect(balanceOf(file, "usr-1")).toBe(40);
  });

  it("THE property: the same idempotency key credits exactly once", () => {
    const input = {
      userId: "usr-1",
      amount: 40,
      source: "quest_consent",
      idempotencyKey: "quest_consent:claim-1",
    };
    const first = creditTokens(file, input);
    const second = creditTokens(file, input);
    const third = creditTokens(file, input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);
    // One entry, one credit, whatever the caller does.
    expect(entriesFor(file, "usr-1").length).toBe(1);
    expect(balanceOf(file, "usr-1")).toBe(40);
    expect(second.balance).toBe(40);
  });

  it("keeps different keys separate, so real repeat awards still land", () => {
    creditTokens(file, { userId: "usr-1", amount: 40, source: "quest_consent", idempotencyKey: "quest_consent:claim-1" });
    creditTokens(file, { userId: "usr-1", amount: 25, source: "quest_consent", idempotencyKey: "quest_consent:claim-2" });
    expect(balanceOf(file, "usr-1")).toBe(65);
    expect(entriesFor(file, "usr-1").length).toBe(2);
  });

  it("recomputes rather than increments, so the balance survives a wrong cache", () => {
    creditTokens(file, { userId: "usr-1", amount: 10, source: "a", idempotencyKey: "k1" });
    creditTokens(file, { userId: "usr-1", amount: 10, source: "b", idempotencyKey: "k2" });
    // Whatever anyone believed the balance was, the answer is the sum of entries.
    expect(balanceOf(file, "usr-1")).toBe(20);
  });

  it("accepts negative entries, so a correction never needs a destructive edit", () => {
    creditTokens(file, { userId: "usr-1", amount: 50, source: "quest_consent", idempotencyKey: "k1" });
    const fix = creditTokens(file, {
      userId: "usr-1",
      amount: -20,
      source: "correction",
      description: "Awarded above the advertised range",
      idempotencyKey: "correction:k1",
    });
    expect(fix.ok).toBe(true);
    expect(balanceOf(file, "usr-1")).toBe(30);
    // And the mistake is still on the record rather than erased.
    expect(entriesFor(file, "usr-1").length).toBe(2);
  });

  it("keeps members' balances independent", () => {
    creditTokens(file, { userId: "usr-1", amount: 10, source: "a", idempotencyKey: "k1" });
    creditTokens(file, { userId: "usr-2", amount: 99, source: "a", idempotencyKey: "k2" });
    expect(balanceOf(file, "usr-1")).toBe(10);
    expect(balanceOf(file, "usr-2")).toBe(99);
  });

  it("refuses to mint amora or voice: those are Hypha's to issue", () => {
    for (const tokenType of ["amora", "voice"] as const) {
      const r = creditTokens(file, {
        userId: "usr-1",
        tokenType,
        amount: 1000,
        source: "should_not_happen",
        idempotencyKey: `bad:${tokenType}`,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("Hypha");
      expect(balanceOf(file, "usr-1", tokenType)).toBe(0);
    }
    // If the platform could credit equity it would have quietly become the source
    // of truth for the cap table, which decision 5 says it must never be.
  });

  it("fails LOUD on an unknown token, never coercing it to gratitude", () => {
    // A typo that silently became 'gratitude' would be a mint bug wearing a
    // coercion costume. The registry is fail-loud like game variables.
    const r = creditTokens(file, {
      userId: "usr-1",
      tokenType: "libary-credits", // sic — the typo is the test
      amount: 500,
      source: "library_intake",
      idempotencyKey: "intake:item-1",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("unknown token");
    expect(balanceOf(file, "usr-1")).toBe(0); // and gratitude untouched
    expect(entriesFor(file, "usr-1").length).toBe(0);
  });

  it("credits a runtime-registered platform token, in its own balance", () => {
    // The module layer's whole case: tokens created at runtime (0006), no DDL.
    registerToken({
      slug: "library-credits",
      name: "Library Credits",
      kind: "credit",
      governance: "platform",
      transferable: false,
    });
    const r = creditTokens(file, {
      userId: "usr-1",
      tokenType: "library-credits",
      amount: 1000,
      source: "library_intake",
      idempotencyKey: "intake:item-1",
    });
    expect(r.ok).toBe(true);
    expect(r.balance).toBe(1000);
    // Balances are per-token: the new token never bleeds into gratitude.
    expect(balanceOf(file, "usr-1", "library-credits")).toBe(1000);
    expect(balanceOf(file, "usr-1")).toBe(0);
  });

  it("still refuses a runtime-registered token that is hypha-governed", () => {
    registerToken({
      slug: "village-equity",
      name: "Village Equity",
      kind: "equity",
      governance: "hypha",
      transferable: false,
    });
    const r = creditTokens(file, {
      userId: "usr-1",
      tokenType: "village-equity",
      amount: 10,
      source: "should_not_happen",
      idempotencyKey: "bad:village-equity",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Hypha");
  });

  it("requires an idempotency key at all", () => {
    const r = creditTokens(file, { userId: "usr-1", amount: 10, source: "a", idempotencyKey: "" });
    expect(r.ok).toBe(false);
    expect(entriesFor(file, "usr-1").length).toBe(0);
  });

  it("survives a missing or corrupt ledger file rather than throwing", () => {
    fs.writeFileSync(file, "{not json");
    expect(balanceOf(file, "usr-1")).toBe(0);
    const r = creditTokens(file, { userId: "usr-1", amount: 5, source: "a", idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    expect(balanceOf(file, "usr-1")).toBe(5);
  });
});

describe("backfillOpeningBalances", () => {
  it("explains pre-ledger balances once, and is safe to re-run on every boot", () => {
    const members = [
      { id: "usr-1", balance: 120 },
      { id: "usr-2", balance: 0 },
      { id: "usr-3", balance: 7 },
    ];
    const first = backfillOpeningBalances(file, members);
    // usr-2 has nothing to explain, so gets no entry.
    expect(first.created).toBe(2);
    expect(balanceOf(file, "usr-1")).toBe(120);
    expect(balanceOf(file, "usr-2")).toBe(0);

    const second = backfillOpeningBalances(file, members);
    expect(second.created).toBe(0);
    expect(balanceOf(file, "usr-1")).toBe(120);
    expect(entriesFor(file, "usr-1").length).toBe(1);
  });

  it("does not double-count when a credit already landed after the opening row", () => {
    backfillOpeningBalances(file, [{ id: "usr-1", balance: 100 }]);
    creditTokens(file, { userId: "usr-1", amount: 30, source: "quest_consent", idempotencyKey: "quest_consent:c1" });
    expect(balanceOf(file, "usr-1")).toBe(130);
    backfillOpeningBalances(file, [{ id: "usr-1", balance: 130 }]);
    expect(balanceOf(file, "usr-1")).toBe(130);
  });
});
