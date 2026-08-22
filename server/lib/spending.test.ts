/**
 * The token policy that makes three new sinks safe.
 *
 * Two things are proved here and neither is a formality.
 *
 * THE RECOGNITION FIREWALL. Gratitude shipped with `transferable = 1` in the
 * 0006 seed and nothing ever read the column, so the wrong value was harmless
 * for eighty-five migrations. The send surface reads it. These tests assert the
 * refusal from every direction the surface can be reached: by kind, by the
 * flag, at the send, and at the admin toggle. A test that only checked the flag
 * would have gone green against the seeded data and shipped the leak.
 *
 * THE VOUCHER LIST DOES NOT DRIFT. `MODULE_VOUCHERS` spells its two slugs as
 * literals because importing them from ./stays and ./library would close a
 * module cycle (stays imports spendSinkFor from here) and leave the Set holding
 * undefined whichever file loaded second. The import would have prevented
 * drift; this test does it instead, and it fails loudly rather than opening a
 * firewall quietly.
 *
 * No database: the registry is an in-memory map filled from the tokens table,
 * and these are decisions about its contents.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MINT_FAUCET, TREASURY, registerToken, tokenDef, type TokenDef } from "./ledger";
import { LIBRARY_CREDIT } from "./library";
import { STAY_CREDIT } from "./stays";
import {
  MODULE_VOUCHERS,
  SENDABLE_KINDS,
  mayToggleTransferable,
  priceRefusal,
  sendRefusal,
  sendableTokens,
  spendSinkFor,
} from "./spending";

/**
 * `registerToken` writes to a pool and then reloads. The registry is what the
 * decisions read, so the tests fill it directly through a tiny fake pool: one
 * INSERT that goes nowhere and one SELECT that returns the rows under test.
 */
function loadRegistry(rows: Array<Partial<TokenDef> & { slug: string }>): Promise<void> {
  const full = rows.map((r) => ({
    slug: r.slug,
    name: r.name ?? r.slug,
    kind: r.kind ?? "credit",
    governance: r.governance ?? "platform",
    transferable: r.transferable ? 1 : 0,
    decimals: r.decimals ?? 0,
    active: r.active === false ? 0 : 1,
    is_example: r.isExample ? 1 : 0,
  }));
  const pool: any = { query: async () => [full, []] };
  // loadTokenRegistry is not exported for direct use here; registerToken's
  // reload is. The INSERT is swallowed by the same fake, so only the SELECT
  // matters and the registry ends up holding exactly `rows`.
  return registerToken(pool, { slug: "ignored", name: "ignored", kind: "credit", governance: "platform", transferable: false });
}

const CREDITS = { slug: "credits", name: "Village Credits", kind: "credit", transferable: true };
const GRATITUDE = { slug: "gratitude", name: "Gratitude", kind: "recognition", transferable: true };
/**
 * A Hypha-governed equity mirror. Named generically ON PURPOSE: the real
 * deployment's equity slug is one village's brand, and the platform's own
 * tests are inside the brand ratchet. What is under test is the GOVERNANCE,
 * which is what refuses the send.
 */
const MIRROR = { slug: "equity-mirror", name: "Equity Mirror", kind: "equity", governance: "hypha" as const, transferable: true };
const VOICE = { slug: "village-voice", name: "Village Voice", kind: "voice", transferable: true };

describe("who may be sent", () => {
  beforeEach(async () => {
    await loadRegistry([
      CREDITS,
      GRATITUDE,
      MIRROR,
      VOICE,
      { slug: STAY_CREDIT, name: "Stay Credits", kind: "credit", transferable: true },
      { slug: LIBRARY_CREDIT, name: "Library Credits", kind: "credit", transferable: true },
      { slug: "ex-credits", name: "Example Credits", kind: "credit", transferable: true, isExample: true },
      { slug: "shut", name: "Closed Credits", kind: "credit", transferable: false },
      { slug: "retired", name: "Retired Credits", kind: "credit", transferable: true, active: false },
    ]);
  });

  it("sends the village's own credits", () => {
    expect(sendRefusal("credits")).toBeNull();
    expect(sendableTokens().map((t) => t.slug)).toEqual(["credits"]);
  });

  it("REFUSES recognition even while its row says transferable", () => {
    // The exact state 0006 seeded and 0092 corrects. The flag says yes and the
    // answer is still no, because the KIND test runs first and independently.
    expect(tokenDef("gratitude")?.transferable).toBe(true);
    expect(sendRefusal("gratitude")).toMatch(/recognition/i);
    expect(sendableTokens().map((t) => t.slug)).not.toContain("gratitude");
  });

  it("refuses equity, voice and anything governed on Hypha", () => {
    expect(sendRefusal("equity-mirror")).toMatch(/Base/);
    expect(sendRefusal("village-voice")).toMatch(/not a token members send/);
  });

  it("refuses the two module vouchers by name", () => {
    expect(sendRefusal(STAY_CREDIT)).toMatch(/buys one thing/);
    expect(sendRefusal(LIBRARY_CREDIT)).toMatch(/buys one thing/);
  });

  it("refuses an example, a hidden token and a token a village closed", () => {
    expect(sendRefusal("ex-credits")).toMatch(/standing example/);
    expect(sendRefusal("retired")).toMatch(/not in circulation/);
    expect(sendRefusal("shut")).toMatch(/stay put/);
  });

  it("refuses a slug that is not a token at all", () => {
    expect(sendRefusal("not-a-token")).toMatch(/not a token this village issues/);
  });

  it("holds `credit` as the only sendable kind", () => {
    // Stated as its own assertion because widening this set is the one edit
    // that silently reopens every refusal above.
    expect(Array.from(SENDABLE_KINDS)).toEqual(["credit"]);
  });

  it("keeps the voucher list equal to the modules' own constants", () => {
    // The drift guard the import would have been. See the file header.
    expect(Array.from(MODULE_VOUCHERS).sort()).toEqual([LIBRARY_CREDIT, STAY_CREDIT].sort());
  });
});

describe("who an admin may open sending on", () => {
  beforeEach(async () => {
    await loadRegistry([
      CREDITS,
      GRATITUDE,
      MIRROR,
      VOICE,
      { slug: STAY_CREDIT, name: "Stay Credits", kind: "credit" },
    ]);
  });

  it("lets an admin open or close the village's own credits", () => {
    expect(mayToggleTransferable(tokenDef("credits")!)).toBeNull();
  });

  it("REFUSES to open recognition, in the admin's own words", () => {
    expect(mayToggleTransferable(tokenDef("gratitude")!)).toMatch(/never sent between members/i);
  });

  it("refuses a Hypha mirror and a voice token", () => {
    expect(mayToggleTransferable(tokenDef("equity-mirror")!)).toMatch(/decided there/);
    expect(mayToggleTransferable(tokenDef("village-voice")!)).toMatch(/Only credit tokens/);
  });

  it("refuses a module's own voucher", () => {
    expect(mayToggleTransferable(tokenDef(STAY_CREDIT)!)).toMatch(/issues it against its own service/);
  });
});

describe("what a price may be posted in", () => {
  beforeEach(async () => {
    await loadRegistry([CREDITS, GRATITUDE, MIRROR, { slug: STAY_CREDIT, name: "Stay Credits", kind: "credit" }]);
  });

  it("accepts a credit token, including a module's voucher", () => {
    // A voucher cannot be SENT and can absolutely be CHARGED: buying a night
    // with stay credits is the loop that already worked.
    expect(priceRefusal("credits")).toBeNull();
    expect(priceRefusal(STAY_CREDIT)).toBeNull();
  });

  it("refuses recognition as a price, in both directions of the separation", () => {
    expect(priceRefusal("gratitude")).toMatch(/can never be a price/);
  });

  it("refuses a token issued on Base", () => {
    expect(priceRefusal("equity-mirror")).toMatch(/cannot be charged here/);
  });
});

describe("where a spent token lands", () => {
  it("retires a stay credit to the faucet that issued it", () => {
    // The faucet's negative balance IS the outstanding stay-credit supply, so
    // spending one has to make that number smaller.
    expect(spendSinkFor(STAY_CREDIT)).toBe(MINT_FAUCET);
  });

  it("pays every other token to the treasury", () => {
    // Never back to sys:cycle-pool: that faucet's negative balance means
    // "released to date", and paying spends into it would redefine it as
    // "outstanding" under every surface that reads it.
    expect(spendSinkFor("credits")).toBe(TREASURY);
    expect(spendSinkFor(LIBRARY_CREDIT)).toBe(TREASURY);
  });
});
