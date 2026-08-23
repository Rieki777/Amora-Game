/**
 * The pool arithmetic. Pure, no database, no clock.
 *
 * The centrepiece is the closure property: over a few thousand random weight
 * vectors and pool sizes, what goes out plus what comes back is exactly what
 * the pool held. A pool that loses a fraction to rounding is the defect that
 * surfaces a year later as a trust problem, so it is tested as a law and not as
 * three convenient examples.
 */
import { describe, expect, it } from "vitest";
import {
  assertPoolCloses,
  computeModulePoolShares,
  nextCyclePool,
  type PoolShareInput,
} from "./modulePoolShares";

const paid = (moduleId: string, weight: number, hasPayoutAccount = true): PoolShareInput =>
  ({ moduleId, weight, disposition: "paid", hasPayoutAccount });
const recycled = (moduleId: string, weight: number): PoolShareInput =>
  ({ moduleId, weight, disposition: "recycled" });

/** A tiny deterministic generator, so a failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("computeModulePoolShares closure", () => {
  it("gives out plus recycles exactly the pool, over random inputs", () => {
    const rand = rng(20260823);
    for (let trial = 0; trial < 4000; trial += 1) {
      const n = 1 + Math.floor(rand() * 12);
      const pool = Math.floor(rand() * 100000);
      const inputs: PoolShareInput[] = [];
      for (let i = 0; i < n; i += 1) {
        // Weights land on awkward fractions on purpose: reach is a ratio of
        // members and almost never divides a pool evenly.
        const weight = rand() < 0.15 ? 0 : rand() * 3;
        inputs.push(
          rand() < 0.5
            ? paid(`m${i}`, weight, rand() < 0.5)
            : recycled(`m${i}`, weight),
        );
      }
      const split = computeModulePoolShares(inputs, pool);
      expect(split.payable + split.accrued + split.recycled).toBe(pool);
      expect(split.distributed + split.recycled).toBe(pool);
      // Every share is a whole non-negative number of $ReGen.
      for (const s of split.shares) {
        expect(Number.isInteger(s.share)).toBe(true);
        expect(s.share).toBeGreaterThanOrEqual(0);
      }
      if (split.totalWeight > 0) {
        expect(split.shares.reduce((t, s) => t + s.share, 0)).toBe(pool);
      }
      expect(() => assertPoolCloses(split)).not.toThrow();
    }
  });

  it("loses nothing on a pool that does not divide evenly", () => {
    // 10000 across three equal modules is 3333.33 each. A floor implementation
    // distributes 9999 and silently keeps one.
    const split = computeModulePoolShares([paid("a", 1), paid("b", 1), paid("c", 1)], 10000);
    expect(split.shares.reduce((t, s) => t + s.share, 0)).toBe(10000);
    expect(split.shares.map((s) => s.share).sort((x, y) => y - x)).toEqual([3334, 3333, 3333]);
    expect(split.recycled).toBe(0);
  });

  it("is deterministic when fractions tie", () => {
    const once = computeModulePoolShares([paid("b", 1), paid("a", 1), paid("c", 1)], 100);
    const again = computeModulePoolShares([paid("c", 1), paid("b", 1), paid("a", 1)], 100);
    const byId = (s: { moduleId: string; share: number }[]) =>
      [...s].sort((x, y) => (x.moduleId < y.moduleId ? -1 : 1)).map((x) => `${x.moduleId}:${x.share}`);
    expect(byId(once.shares)).toEqual(byId(again.shares));
  });

  it("never pays a module nobody opened", () => {
    const split = computeModulePoolShares([paid("used", 1), paid("unused", 0)], 7);
    expect(split.shares.find((s) => s.moduleId === "unused")!.share).toBe(0);
    expect(split.shares.find((s) => s.moduleId === "used")!.share).toBe(7);
  });
});

describe("R59: the platform's share returns to the pool", () => {
  it("recycles a platform module's share instead of paying it", () => {
    const split = computeModulePoolShares([paid("guest", 1), recycled("ours", 3)], 1000);
    expect(split.shares.find((s) => s.moduleId === "ours")!.share).toBe(750);
    expect(split.shares.find((s) => s.moduleId === "ours")!.settlement).toBe("recycled");
    expect(split.payable).toBe(250);
    expect(split.recycled).toBe(750);
    expect(split.payable + split.recycled).toBe(1000);
  });

  it("hands the recycled amount to the next cycle", () => {
    const split = computeModulePoolShares([paid("guest", 1), recycled("ours", 3)], 1000);
    expect(nextCyclePool(1000, split)).toBe(1750);
  });

  it("recycles the whole pool when every module is platform-built", () => {
    // The state the platform ships in: no registry entry carries a builtBy
    // credit, so every module recycles and the pool rolls forward whole.
    const split = computeModulePoolShares([recycled("a", 2), recycled("b", 1)], 10000);
    expect(split.recycled).toBe(10000);
    expect(split.distributed).toBe(0);
    expect(nextCyclePool(10000, split)).toBe(20000);
  });

  it("holds a third-party share with no handle instead of recycling it", () => {
    const split = computeModulePoolShares([paid("nohandle", 1, false), recycled("ours", 1)], 1000);
    expect(split.accrued).toBe(500);
    expect(split.payable).toBe(0);
    expect(split.recycled).toBe(500);
    expect(split.shares.find((s) => s.moduleId === "nohandle")!.settlement).toBe("accrued");
  });
});

describe("computeModulePoolShares refusals and edges", () => {
  it("recycles everything when nothing was used", () => {
    const split = computeModulePoolShares([paid("a", 0), recycled("b", 0)], 500);
    expect(split.totalWeight).toBe(0);
    expect(split.recycled).toBe(500);
    expect(split.distributed).toBe(0);
  });

  it("closes on an empty registry", () => {
    const split = computeModulePoolShares([], 500);
    expect(split.recycled).toBe(500);
    expect(split.shares).toEqual([]);
  });

  it("closes on a pool of zero", () => {
    const split = computeModulePoolShares([paid("a", 1)], 0);
    expect(split.recycled).toBe(0);
    expect(split.distributed).toBe(0);
  });

  it("refuses a fractional or negative pool", () => {
    expect(() => computeModulePoolShares([paid("a", 1)], 10.5)).toThrow(/whole non-negative/);
    expect(() => computeModulePoolShares([paid("a", 1)], -1)).toThrow(/whole non-negative/);
  });

  it("refuses a pool too large to add up exactly", () => {
    // Above 2^53 the sums stop being exact, so every closure check in the file
    // would pass on a split that had quietly lost units.
    expect(() => computeModulePoolShares([paid("a", 1)], 2 ** 53 + 2)).toThrow(/whole non-negative/);
  });

  it("refuses weights that overflow between them", () => {
    // Each weight is finite and the total is not. Left alone, every share
    // becomes NaN and the failure names none of this.
    expect(() => computeModulePoolShares([paid("a", 1e308), paid("b", 1e308)], 100)).toThrow(/no share can be computed/);
  });

  it("refuses a negative weight", () => {
    expect(() => computeModulePoolShares([paid("a", -1)], 10)).toThrow(/not a usable weight/);
  });

  it("refuses to give a share to a module that is not eligible", () => {
    expect(() =>
      computeModulePoolShares([{ moduleId: "withdrawn", weight: 1, disposition: "none" }], 10),
    ).toThrow(/not eligible/);
  });

  it("catches a split that has been tampered with in transit", () => {
    const split = computeModulePoolShares([paid("a", 1), recycled("b", 1)], 1000);
    expect(() => assertPoolCloses({ ...split, payable: split.payable + 1 })).toThrow(/does not close/);
    expect(() => assertPoolCloses({ ...split, recycled: split.recycled - 5 })).toThrow(/does not close/);
  });
});
