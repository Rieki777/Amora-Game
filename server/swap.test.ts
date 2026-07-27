/**
 * The swap engine's pure surface (S59): the quote math and the property the
 * whole feature rests on.
 *
 * A→B→A MUST NEVER PROFIT. If a member can round-trip a token and come back
 * with more than they started, the exchange is a money pump pointed at the
 * treasury, and no amount of caps or halts fixes that. The ceiling on the
 * pay side is what closes it, at every spread INCLUDING ZERO — the spread is
 * a policy dial, never the safety mechanism. This file proves it over
 * thousands of randomized price pairs rather than asserting it in a comment.
 */
import { describe, expect, it } from "vitest";
import { quoteSwap } from "./lib/exchange";

const price = (id: string, priceMinor: number) => ({
  id,
  tokenSlug: id,
  priceMinor,
  note: "test",
  setBy: null,
  effectiveAt: new Date().toISOString(),
});

function quote(pA: number, pB: number, qB: number, spreadBps = 0) {
  const r = quoteSwap({
    payToken: "a",
    receiveToken: "b",
    receiveQuantity: qB,
    payPrice: price("a", pA),
    receivePrice: price("b", pB),
    spreadBps,
  });
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("quoteSwap — receive-driven, ceil toward the treasury", () => {
  it("prices an even trade exactly", () => {
    const q = quote(100, 100, 5);
    expect(q.payQuantity).toBe(5);
    expect(q.valueMinor).toBe(500);
    expect(q.netMinor).toBe(500);
    expect(q.takeMinor).toBe(0);
    expect(q.sentence).toContain("You hand over 5");
    expect(q.disclosure).toContain("keeps nothing");
  });

  it("rounds the PAY side up, never down", () => {
    // 3 of a ₡100 token costs 300; paying in a ₡700 token needs 0.43 units,
    // which must round UP to 1 — the member never gets a free fraction.
    const q = quote(700, 100, 3);
    expect(q.payQuantity).toBe(1);
    expect(q.valueMinor).toBe(700);
    expect(q.netMinor).toBe(300);
    expect(q.takeMinor).toBe(400);
    expect(q.disclosure).toContain("whole-unit rounding");
  });

  it("applies the spread on top of the ceiling and says so", () => {
    const free = quote(100, 100, 100, 0);
    const paid = quote(100, 100, 100, 500); // 5%
    expect(free.payQuantity).toBe(100);
    expect(paid.payQuantity).toBe(106); // ceil(100 · 10000 / 9500)
    expect(paid.disclosure).toContain("5.00% share");
  });

  it("refuses what it cannot price honestly", () => {
    expect(quoteSwap({ payToken: "a", receiveToken: "b", receiveQuantity: 0, payPrice: price("a", 100), receivePrice: price("b", 100), spreadBps: 0 }))
      .toHaveProperty("error");
    expect(quoteSwap({ payToken: "a", receiveToken: "b", receiveQuantity: 5, payPrice: price("a", 0), receivePrice: price("b", 100), spreadBps: 0 }))
      .toHaveProperty("error");
  });

  it("survives magnitudes that overflow double-precision integers", () => {
    // qB · pB · 10000 here is ~1e17 — past Number.MAX_SAFE_INTEGER, where a
    // float multiply could round UP and hand the member a cheaper trade.
    const q = quote(1, 1_000_000, 1_000_000, 0);
    expect(q.payQuantity).toBe(1_000_000_000_000);
    expect(Number.isSafeInteger(q.payQuantity)).toBe(true);
  });
});

describe("THE PROPERTY: A→B→A never profits, at any spread including zero", () => {
  it("holds over 2000 randomized price pairs, quantities and spreads", () => {
    // Deterministic PRNG (mulberry32) so a failure reproduces exactly.
    let s = 0x5ea11;
    const rand = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < 2000; i++) {
      const pA = 1 + Math.floor(rand() * 100000);
      const pB = 1 + Math.floor(rand() * 100000);
      const qB = 1 + Math.floor(rand() * 5000);
      const spread = [0, 0, 0, 25, 100, 500, 2000][Math.floor(rand() * 7)];

      // Outbound: pay qA of A to receive qB of B.
      const out = quote(pA, pB, qB, spread);
      const qA = out.payQuantity;

      // Return: what is the MOST A the member can get back for the qB they
      // now hold? Find the largest receive quantity whose cost ≤ qB.
      let best = 0;
      let lo = 1;
      let hi = qA + 1; // cannot need to search past what they started with + 1
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const back = quoteSwap({
          payToken: "b", receiveToken: "a", receiveQuantity: mid,
          payPrice: price("b", pB), receivePrice: price("a", pA), spreadBps: spread,
        });
        if ("error" in back) { hi = mid - 1; continue; }
        if (back.payQuantity <= qB) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
      }

      // The whole feature rests on this line.
      expect({ i, pA, pB, qB, spread, qA, best }).toEqual({ i, pA, pB, qB, spread, qA, best: Math.min(best, qA) });
      if (best > qA) throw new Error(`round trip profited: ${qA} A -> ${qB} B -> ${best} A (pA=${pA} pB=${pB} spread=${spread})`);
    }
  });

  it("never lets the member receive more fiat value than they hand over", () => {
    let s = 0xbeef;
    const rand = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 1000; i++) {
      const q = quote(1 + Math.floor(rand() * 50000), 1 + Math.floor(rand() * 50000), 1 + Math.floor(rand() * 1000), Math.floor(rand() * 2001));
      // takeMinor is the village's side of every trade: never negative.
      expect(q.takeMinor).toBeGreaterThanOrEqual(0);
      expect(q.valueMinor).toBeGreaterThanOrEqual(q.netMinor);
    }
  });
});
