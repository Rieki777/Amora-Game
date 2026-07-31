/**
 * The exchange. Members buy platform tokens for fiat through the trio, and
 * may trade one village token for another; the tokens come out of a stocked
 * treasury, never out of thin air, and fiat only ever flows IN — nothing here
 * ever sells a token back for money.
 *
 * v1 (S33-S35) was buy-only, and this header said swapping was "a shipped
 * CONTRACT with no engine until v2". The engine landed in S57-S61 — see
 * `swapProblem` and the swap-order normaliser below, and `postTransferPair`
 * in the ledger, which is what makes a two-legged trade atomic. Trading is
 * still OFF by default and opens only behind a version-stamped legal card.
 *
 * The firewalls, enforced at WRITE time and re-proven at BOOT:
 *   - recognition-kind tokens are never purchasable or swappable — gratitude
 *     is earned, full stop (economy invariant 2.2 #2).
 *   - hypha-governed tokens are never purchasable or swappable — nothing
 *     share-like trades on this platform, ever (Gate B).
 *   - one seller per token: a token a module sells (stays -> stay-credit)
 *     cannot ALSO be listed purchasable here. The boot check unions the
 *     static sellsToken claims with the dynamic purchasable flags.
 *
 * Stock: sys:mint -> sys:treasury (source exchange_stock, under the same
 * per-cycle mint cap as hand-mints). Sale: sys:treasury -> buyer. The
 * treasury is NOT a faucet, so selling more than was stocked FAILS the
 * settlement — out of stock is a fact the webhook retries surface to
 * admins, not a mint opportunity.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  ALLOW_NEGATIVE_SOURCES,
  TREASURY,
  allTokens,
  balanceOf,
  memberAccount,
  postTransfer,
  postTransferPair,
  tokenDef,
} from "./ledger";
import type { PairGuard } from "./ledger";
import { numberVar } from "./variables";
import { moduleConfig } from "./modules";
import { MODULES } from "../../shared/modules";

export interface ExchangeSettings {
  tokenSlug: string;
  purchasable: boolean;
  swappable: boolean;
  minStageToBuy: string | null;
  sortOrder: number;
  active: boolean;
  /** Fail-closed: 0 means ZERO swapped out per cycle, never "unlimited". */
  maxSwapOutPerCycle: number;
  maxSwapOutPerMemberPerCycle: number;
  swapHaltedAt: string | null;
  swapHaltedBy: string | null;
  swapHaltReason: string | null;
}

function rowToSettings(r: RowDataPacket): ExchangeSettings {
  return {
    tokenSlug: String(r.token_slug),
    purchasable: !!r.purchasable,
    swappable: !!r.swappable,
    minStageToBuy: r.min_stage_to_buy ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: !!r.active,
    maxSwapOutPerCycle: Number(r.max_swap_out_per_cycle ?? 0),
    maxSwapOutPerMemberPerCycle: Number(r.max_swap_out_per_member_per_cycle ?? 0),
    swapHaltedAt: r.swap_halted_at ? new Date(r.swap_halted_at).toISOString() : null,
    swapHaltedBy: r.swap_halted_by ?? null,
    swapHaltReason: r.swap_halt_reason ?? null,
  };
}

export async function exchangeSettings(pool: Pool): Promise<ExchangeSettings[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM token_exchange_settings ORDER BY sort_order, token_slug",
  );
  return rows.map(rowToSettings);
}

export async function settingsFor(pool: Pool, slug: string): Promise<ExchangeSettings | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM token_exchange_settings WHERE token_slug = ?",
    [slug],
  );
  return rows[0] ? rowToSettings(rows[0]) : null;
}

/** The static union of module-sold tokens (stays -> stay-credit, …). */
export function moduleSoldTokens(): Set<string> {
  return new Set(MODULES.filter((m) => m.sellsToken).map((m) => m.sellsToken!));
}

/**
 * Tokens that are NEVER listed, whatever an admin clicks: library credits
 * are backed by shelved items and minted only through guarded intake —
 * selling them for fiat would sever the backing (S41). Static on purpose,
 * like the ledger's allow-negative whitelist.
 */
export const NEVER_LISTED: ReadonlySet<string> = new Set(["library-credit"]);

/**
 * The rules true of BOTH buying and swapping. Returns a human refusal or
 * null. Enforced at write time and re-proven at boot, so a hand-edited row
 * can never outlive a deploy.
 */
export function tradingProblem(slug: string): string | null {
  if (NEVER_LISTED.has(slug)) {
    return `${slug} is backed by the library's shelves and never trades — its only doors are intake and loans`;
  }
  const def = tokenDef(slug);
  if (!def) return `"${slug}" is not a registered token`;
  if (def.kind === "recognition") {
    return `${slug} is recognition — it is earned through contribution and can never be bought or swapped`;
  }
  if (def.governance === "hypha") {
    return `${slug} is governed on Hypha — nothing share-like trades on this platform`;
  }
  if (moduleSoldTokens().has(slug)) {
    return `${slug} already has a selling module — one seller per token, and the exchange would be a second`;
  }
  return null;
}

/**
 * L9 (Gate F, opened by Rye 2026-07-27): selling library credits for fiat.
 *
 * The objection was never technical. A library credit is backed by a
 * physical item somebody brought to the shelf; a SOLD credit is backed by
 * money instead, and past that sale the two are indistinguishable claims on
 * the same shelves. Opening this changes what the token IS — so it opens
 * the way trading opened: a per-deployment caution card, version-stamped,
 * server-stamped, refused for any card but the current one. The ledger
 * keeps the provenances separate forever (shelf-backed credits enter via
 * sys:library-mint on intake; sold stock enters via sys:mint -> treasury),
 * so a village can always answer "how many of our credits are money-backed".
 *
 * The relaxation is PURCHASE-ONLY, structurally: tradingProblem still
 * refuses library-credit, which keeps the swap door shut regardless of any
 * config — and the faucet-issuance test would refuse it a second time.
 */
export const LIBRARY_CREDIT_CARD_VERSION = "2026-07-27";

export function creditSaleOpen(): boolean {
  const cfg = (moduleConfig("library") as any) ?? {};
  if (cfg.creditSaleEnabled !== true) return false;
  return String(cfg.creditSaleAck?.cardVersion ?? "") === LIBRARY_CREDIT_CARD_VERSION;
}

/** Buying refuses what v1 refused — except behind the L9 caution card. */
export function purchaseProblem(slug: string): string | null {
  if (NEVER_LISTED.has(slug) && creditSaleOpen()) {
    // The card is accepted: run every OTHER shared rule (recognition,
    // hypha, one-seller) without the shelf-backing refusal.
    const def = tokenDef(slug);
    if (!def) return `"${slug}" is not a registered token`;
    if (def.kind === "recognition") return `${slug} is recognition — never for sale`;
    if (def.governance === "hypha") return `${slug} is governed on Hypha`;
    if (moduleSoldTokens().has(slug)) return `${slug} already has a selling module`;
    return null;
  }
  return tradingProblem(slug);
}

/**
 * Which tokens a FAUCET has issued into circulation — the structural test
 * behind the swap firewall.
 *
 * The rule is about DESTINATION, not about what a source string is called:
 *
 *   faucet -> sys:treasury   = stocking a shop, whatever the source says
 *   faucet -> anything else  = issuance, whatever the source says
 *
 * A source-name allowlist rots. `admin_mint` posts sys:mint -> mem:{user}
 * for ANY slug, and every module invents its own award source
 * (quest_stay_reward, library_intake, stay_comp…). Naming them all is a
 * race nobody wins. Asking where the money went is a question no future
 * module can answer wrongly.
 */
export async function faucetIssuedTokens(pool: Pool): Promise<Map<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT l.token_type, COUNT(*) AS n FROM token_ledger l " +
      "JOIN ledger_accounts a ON a.id = l.from_account " +
      "WHERE a.faucet = 1 AND l.to_account <> ? GROUP BY l.token_type",
    [TREASURY],
  );
  return new Map(rows.map((r) => [String(r.token_type), Number(r.n)]));
}

/**
 * Swapping refuses everything buying refuses, PLUS faucet issuance.
 *
 * A token the village can conjure as a reward must never become a claim on
 * goods someone paid real money for. Recognition is the obvious case; the
 * subtle one is any credit a module hands out for free. There is no
 * override for this rule at any privilege level, through any config path.
 */
export async function swapProblem(
  pool: Pool,
  slug: string,
  tainted?: Map<string, number>,
): Promise<string | null> {
  const shared = tradingProblem(slug);
  if (shared) return shared;
  const issued = tainted ?? (await faucetIssuedTokens(pool));
  if (issued.has(slug)) {
    const name = tokenDef(slug)?.name ?? slug;
    return `${name} is minted by the village as a reward — tokens you can earn from thin air are never bought or swapped here`;
  }
  return null;
}

/**
 * The write-time firewall for a listing change. Purchasable and swappable
 * are checked against their OWN rules: swapping is strictly stricter.
 */
export async function listingProblemAsync(
  pool: Pool,
  slug: string,
  flags: { purchasable: boolean; swappable: boolean },
): Promise<string | null> {
  if (!flags.purchasable && !flags.swappable) return null; // delisting is always legal
  if (flags.purchasable) {
    const p = purchaseProblem(slug);
    if (p) return p;
  }
  if (flags.swappable) {
    const s = await swapProblem(pool, slug);
    if (s) return s;
  }
  return null;
}

/** Synchronous subset, kept for the buy-only call sites and boot sweep. */
export function listingProblem(slug: string, flags: { purchasable: boolean; swappable: boolean }): string | null {
  if (!flags.purchasable && !flags.swappable) return null;
  // Any swap flag answers to the FULL shared rule — the L9 card never
  // opens the swap door. A purchase-only listing answers to purchaseProblem,
  // which is where the card (and only the card) can matter.
  if (flags.swappable) return tradingProblem(slug);
  return purchaseProblem(slug);
}

export async function upsertSettings(
  pool: Pool,
  input: {
    slug: string;
    purchasable?: boolean;
    swappable?: boolean;
    minStageToBuy?: string | null;
    sortOrder?: number;
    active?: boolean;
    maxSwapOutPerCycle?: number;
    maxSwapOutPerMemberPerCycle?: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await settingsFor(pool, input.slug);
  const next = {
    purchasable: input.purchasable ?? current?.purchasable ?? false,
    swappable: input.swappable ?? current?.swappable ?? false,
  };
  // Swapping is strictly stricter than buying: the async form also applies
  // the faucet-issuance test when swappable is being turned on.
  const problem = await listingProblemAsync(pool, input.slug, next);
  if (problem) return { ok: false, error: problem };
  await pool.query(
    "INSERT INTO token_exchange_settings (token_slug, purchasable, swappable, min_stage_to_buy, sort_order, active, " +
      "max_swap_out_per_cycle, max_swap_out_per_member_per_cycle) VALUES (?,?,?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE purchasable=VALUES(purchasable), swappable=VALUES(swappable), " +
      "min_stage_to_buy=VALUES(min_stage_to_buy), sort_order=VALUES(sort_order), active=VALUES(active), " +
      "max_swap_out_per_cycle=VALUES(max_swap_out_per_cycle), " +
      "max_swap_out_per_member_per_cycle=VALUES(max_swap_out_per_member_per_cycle)",
    [
      input.slug,
      next.purchasable ? 1 : 0,
      next.swappable ? 1 : 0,
      input.minStageToBuy !== undefined ? input.minStageToBuy : current?.minStageToBuy ?? null,
      input.sortOrder ?? current?.sortOrder ?? 0,
      (input.active ?? current?.active ?? true) ? 1 : 0,
      Math.max(0, Math.floor(input.maxSwapOutPerCycle ?? current?.maxSwapOutPerCycle ?? 0)),
      Math.max(0, Math.floor(input.maxSwapOutPerMemberPerCycle ?? current?.maxSwapOutPerMemberPerCycle ?? 0)),
    ],
  );
  return { ok: true };
}

/**
 * The boot assertion (called before serving): every ACTIVE listing must pass
 * the same firewall the write path enforces. Refusing boot beats serving a
 * market that sells what must not be sold.
 */
export async function assertExchangeFirewalls(pool: Pool): Promise<void> {
  const problems: string[] = [];
  for (const s of await exchangeSettings(pool)) {
    if (!s.active) continue;
    const p = listingProblem(s.tokenSlug, s);
    if (p) problems.push(p);
  }
  // The inverse of one-seller: no two MODULES claim the same token either
  // (assertModuleGraph covers that); here we cover module ∪ exchange.
  if (problems.length) {
    for (const p of problems) console.error(`[exchange firewall] ${p}`);
    throw new Error(`exchange firewalls violated (${problems.length}) — refusing to serve`);
  }
}

// ── Prices: append-only, bounded, always explained ──────────────────────────

export interface PriceRow {
  id: string;
  tokenSlug: string;
  priceMinor: number;
  note: string;
  setBy: string | null;
  effectiveAt: string;
}

export async function latestPrice(pool: Pool, slug: string): Promise<PriceRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM currency_prices WHERE token_slug = ? ORDER BY effective_at DESC, id DESC LIMIT 1",
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id), tokenSlug: String(r.token_slug), priceMinor: Number(r.price_minor),
    note: String(r.note), setBy: r.set_by ?? null, effectiveAt: new Date(r.effective_at).toISOString(),
  };
}

export async function setPrice(
  pool: Pool,
  input: { slug: string; priceMinor: number; note: string; setBy: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const price = Math.floor(Number(input.priceMinor));
  if (!(price > 0)) return { ok: false, error: "The price must be a positive amount in cents" };
  if (!String(input.note ?? "").trim()) {
    return { ok: false, error: "A note is required — every price change must explain itself" };
  }
  const prev = await latestPrice(pool, input.slug);
  const maxPct = numberVar("exchange.price_change_max_pct");
  if (prev && maxPct > 0) {
    const movePct = (Math.abs(price - prev.priceMinor) / prev.priceMinor) * 100;
    if (movePct > maxPct + 1e-9) {
      return {
        ok: false,
        error: `That is a ${movePct.toFixed(1)}% move; the bound is ${maxPct}% per change (exchange.price_change_max_pct). Step there in bounded changes, each with its note.`,
      };
    }
  }
  await pool.query(
    "INSERT INTO currency_prices (id, token_slug, price_minor, note, set_by) VALUES (?,?,?,?,?)",
    [`cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, input.slug, price, String(input.note).trim().slice(0, 500), input.setBy],
  );
  return { ok: true };
}

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Create a pending order and claim the next receipt number under a row lock —
 * receipts are a human-facing sequence with no gaps from racing buyers.
 */
export async function createExchangeOrder(
  pool: Pool,
  input: { userId: string; tokenSlug: string; quantity: number; priceMinorEach: number; amountMinor: number },
): Promise<{ id: string; receiptNo: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[maxRow]] = await conn.query<any[]>(
      "SELECT COALESCE(MAX(receipt_no), 0) AS m FROM exchange_orders FOR UPDATE",
    );
    const receiptNo = Number(maxRow.m) + 1;
    const id = `xo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await conn.query(
      "INSERT INTO exchange_orders (id, receipt_no, user_id, token_slug, quantity, price_minor_each, amount_minor, status) VALUES (?,?,?,?,?,?,?,'pending')",
      [id, receiptNo, input.userId, input.tokenSlug, input.quantity, input.priceMinorEach, input.amountMinor],
    );
    await conn.commit();
    return { id, receiptNo };
  } catch (e) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

export async function exchangeOrderById(pool: Pool, id: string): Promise<any | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM exchange_orders WHERE id = ?", [id]);
  return rows[0] ?? null;
}

/**
 * The settle leg: treasury -> buyer, keyed on the order. The treasury is not
 * a faucet — an under-stocked treasury makes this THROW, the webhook answer
 * 500, Stripe retry, and the trio alert admins. Fail loud, never mint.
 */
export async function settleExchangeOrder(pool: Pool, orderId: string, order: any): Promise<number> {
  const r = await postTransfer(pool, {
    from: TREASURY,
    to: memberAccount(String(order.user_id)),
    tokenType: String(order.token_slug),
    amount: Number(order.quantity),
    source: "exchange_purchase",
    sourceRef: orderId,
    description: `Exchange receipt #${order.receipt_no}`,
    idempotencyKey: `ord:${orderId}:leg1`,
  });
  if (!r.ok) {
    throw new Error(`treasury cannot cover order ${orderId} (${r.error}) — stock it, then let the retry settle`);
  }
  return r.toBalance;
}

/** Treasury stock on hand, per LISTED token (cached balances, one query). */
export async function treasuryStock(pool: Pool): Promise<Record<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT token_type, balance FROM token_balances WHERE account_id = ?",
    [TREASURY],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.token_type)] = Number(r.balance);
  return out;
}

/** Open economic state that blocks disabling the module (invariant #13). */
export async function exchangeOpenState(pool: Pool): Promise<{ count: number; description: string }> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM exchange_orders WHERE status IN ('pending','disputed')",
  );
  return { count: Number(row.n), description: `${row.n} pending/disputed exchange order(s)` };
}

/** Every platform token an admin could conceivably list (for the admin UI). */
export function listableTokens(): { slug: string; name: string; kind: string; reason: string | null }[] {
  return allTokens()
    .filter((t) => t.active)
    .map((t) => ({ slug: t.slug, name: t.name, kind: t.kind, reason: listingProblem(t.slug, { purchasable: true, swappable: false }) }));
}

// ══ S59: the swap engine ═════════════════════════════════════════════════════

export interface SwapQuote {
  payToken: string;
  receiveToken: string;
  receiveQuantity: number;
  payQuantity: number;
  /** PAY-side fiat valuation: what the member hands over, in minor units. */
  valueMinor: number;
  /** RECEIVE-side fiat valuation. */
  netMinor: number;
  /** valueMinor - netMinor: spread plus whole-unit rounding. Always printed. */
  takeMinor: number;
  spreadBps: number;
  payPriceMinor: number;
  receivePriceMinor: number;
  payPriceRowId: string;
  receivePriceRowId: string;
  /** The village's own words for this trade — rendered verbatim by the client. */
  sentence: string;
  disclosure: string;
}

/**
 * Receive-driven quote, ceil on the pay side, BigInt throughout.
 *
 *   payQty = ceil( qB · pB · 10000 / ( pA · (10000 − spread) ) )
 *
 * Ceiling rounds toward the treasury, which is what makes A→B→A unprofitable
 * at EVERY spread including zero: the round trip can never return more than
 * qB·pB/pA, and the outbound leg already cost at least that. The spread is a
 * policy dial layered on top, never the safety mechanism.
 *
 * BigInt because qB·pB·10000 exceeds Number.MAX_SAFE_INTEGER at plausible
 * bounds, and a float multiply can round UP — the one direction that would
 * break the proof.
 */
export function quoteSwap(input: {
  payToken: string;
  receiveToken: string;
  receiveQuantity: number;
  payPrice: PriceRow;
  receivePrice: PriceRow;
  spreadBps: number;
  payTokenName?: string;
  receiveTokenName?: string;
  currencySymbol?: string;
}): SwapQuote | { error: string } {
  const qB = Math.trunc(Number(input.receiveQuantity) || 0);
  const pA = Math.trunc(Number(input.payPrice.priceMinor) || 0);
  const pB = Math.trunc(Number(input.receivePrice.priceMinor) || 0);
  const s = Math.max(0, Math.min(2000, Math.trunc(Number(input.spreadBps) || 0)));
  if (qB <= 0) return { error: "How many do you need?" };
  if (qB > 1_000_000_000) return { error: "That is more than this exchange handles" };
  if (pA <= 0 || pB <= 0) return { error: "Both sides need a posted price before they can be swapped" };

  // BigInt() calls rather than literals: the build targets below ES2020,
  // where 10000n is a syntax error. The arithmetic is identical.
  const numerator = BigInt(qB) * BigInt(pB) * BigInt(10000);
  const denominator = BigInt(pA) * BigInt(10000 - s);
  const payQty = Number((numerator + denominator - BigInt(1)) / denominator); // ceil
  if (!Number.isSafeInteger(payQty) || payQty <= 0) {
    return { error: "That amount is too small to swap — ask for more and the exchange can price it" };
  }
  const valueMinor = Number(BigInt(payQty) * BigInt(pA));
  const netMinor = Number(BigInt(qB) * BigInt(pB));
  const takeMinor = valueMinor - netMinor;

  // Defaults to the symbol the platform actually CHARGES in (payments.ts
  // sends Stripe 'usd') and that every other money surface prints. A quote
  // that says ₡20.00 beside a card reading $0.20 is two different claims
  // about the same number. Forks override it.
  const sym = input.currencySymbol ?? "$";
  const payName = input.payTokenName ?? input.payToken;
  const receiveName = input.receiveTokenName ?? input.receiveToken;
  const money = (m: number) => `${sym}${(m / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sentence = `You hand over ${payQty} ${payName}. You receive ${qB} ${receiveName}.`;
  const disclosure =
    takeMinor === 0
      ? `Both sides are worth ${money(valueMinor)}. The village keeps nothing on this swap.`
      : `You hand over ${money(valueMinor)} and receive ${money(netMinor)}. The difference — ${money(takeMinor)} — is whole-unit rounding` +
        (s > 0 ? ` plus the village's ${(s / 100).toFixed(2)}% share.` : ".");

  return {
    payToken: input.payToken,
    receiveToken: input.receiveToken,
    receiveQuantity: qB,
    payQuantity: payQty,
    valueMinor,
    netMinor,
    takeMinor,
    spreadBps: s,
    payPriceMinor: pA,
    receivePriceMinor: pB,
    payPriceRowId: input.payPrice.id,
    receivePriceRowId: input.receivePrice.id,
    sentence,
    disclosure,
  };
}

/**
 * A swap order shares the SAME gapless receipt sequence as fiat purchases —
 * one book, one numbering, because a member's receipts are one story.
 */
export async function createSwapOrder(
  pool: Pool,
  input: { userId: string; quote: SwapQuote; clientKey: string },
): Promise<{ id: string; receiptNo: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[maxRow]] = await conn.query<any[]>(
      "SELECT COALESCE(MAX(receipt_no), 0) AS m FROM exchange_orders FOR UPDATE",
    );
    const receiptNo = Number(maxRow.m) + 1;
    // 'xs-' for swaps, 'xo-' for fiat orders: the leg1 idempotency namespace
    // can never collide across the two kinds.
    const id = `xs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await conn.query(
      "INSERT INTO exchange_orders (id, receipt_no, user_id, kind, token_slug, quantity, price_minor_each, amount_minor, " +
        "pay_token_slug, pay_quantity, pay_price_minor_each, pay_price_row_id, receive_price_row_id, spread_bps, net_minor, client_key, status) " +
        "VALUES (?,?,?,'swap',?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
      [
        id, receiptNo, input.userId,
        input.quote.receiveToken, input.quote.receiveQuantity, input.quote.receivePriceMinor, input.quote.valueMinor,
        input.quote.payToken, input.quote.payQuantity, input.quote.payPriceMinor,
        input.quote.payPriceRowId, input.quote.receivePriceRowId, input.quote.spreadBps, input.quote.netMinor,
        input.clientKey,
      ],
    );
    await conn.commit();
    return { id, receiptNo };
  } catch (e) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * The two legs, in one transaction. Both or neither — a member is never
 * debited without being credited.
 */
export async function executeSwap(
  pool: Pool,
  order: { id: string; user_id: string; pay_token_slug: string; pay_quantity: number; token_slug: string; quantity: number; receipt_no: number },
  guard?: PairGuard,
): Promise<{ ok: boolean; error?: string }> {
  const member = memberAccount(String(order.user_id));
  const r = await postTransferPair(pool, [
    {
      from: member, to: TREASURY, tokenType: String(order.pay_token_slug), amount: Number(order.pay_quantity),
      source: "exchange_swap", sourceRef: order.id,
      description: `Swap receipt #${order.receipt_no}`, idempotencyKey: `ord:${order.id}:leg1`,
    },
    {
      from: TREASURY, to: member, tokenType: String(order.token_slug), amount: Number(order.quantity),
      source: "exchange_swap", sourceRef: order.id,
      description: `Swap receipt #${order.receipt_no}`, idempotencyKey: `ord:${order.id}:leg2`,
    },
  ], guard);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * How much of a token has left the treasury by swap this lunation.
 *
 * Takes a Pool OR a PoolConnection on purpose: called on a pool it is an
 * advisory read for the quote surface, and called on the transaction's own
 * connection (from a PairGuard) it is the enforcing read, serialized behind
 * the same treasury row lock as every competing swap.
 */
export async function swapCycleUsage(
  pool: Pool | PoolConnection,
  slug: string,
  cycleStart: Date,
  userId?: string,
): Promise<number> {
  const params: any[] = [TREASURY, slug, cycleStart];
  let sql =
    "SELECT COALESCE(SUM(amount),0) AS s FROM token_ledger " +
    "WHERE from_account = ? AND token_type = ? AND source = 'exchange_swap' AND at >= ?";
  if (userId) { sql += " AND to_account = ?"; params.push(memberAccount(userId)); }
  const [[row]] = await pool.query<any[]>(sql, params);
  return Number(row.s);
}

/**
 * Tokens bought with a card are frozen from swapping for a while: long
 * enough that a chargeback still finds them in the wallet rather than
 * converted into something the village cannot claw back.
 */
export async function swappableBalance(
  pool: Pool | PoolConnection,
  userId: string,
  slug: string,
  holdDays: number,
): Promise<{ balance: number; held: number; swappable: number; clearsAt: string | null }> {
  const balance = await balanceOf(pool, memberAccount(userId), slug);
  if (holdDays <= 0) return { balance, held: 0, swappable: balance, clearsAt: null };
  const [[row]] = await pool.query<any[]>(
    "SELECT COALESCE(SUM(quantity),0) AS held, MAX(paid_at) AS latest FROM exchange_orders " +
      "WHERE user_id = ? AND token_slug = ? AND kind = 'fiat_purchase' AND status = 'paid' " +
      "AND paid_at > (NOW() - INTERVAL ? DAY)",
    [userId, slug, holdDays],
  );
  // Commerce token packs are card money too: every token-granting product is
  // forced onto the Stripe path, so a `product_grant` ledger row is by
  // construction a recent card purchase. Without this leg the chargeback
  // hold had a side door — buy the pack in commerce, swap immediately.
  // Works on Pool or PoolConnection alike, so the in-transaction capGuard
  // read stays serialized behind the same treasury lock.
  const [[grants]] = await pool.query<any[]>(
    "SELECT COALESCE(SUM(amount),0) AS held, MAX(at) AS latest FROM token_ledger " +
      "WHERE to_account = ? AND token_type = ? AND source = 'product_grant' " +
      "AND at > (NOW() - INTERVAL ? DAY)",
    [memberAccount(userId), slug, holdDays],
  );
  const held = Number(row.held) + Number(grants.held);
  const latestTimes = [row.latest, grants.latest]
    .filter(Boolean)
    .map((d: any) => new Date(d).getTime());
  const clearsAt = latestTimes.length
    ? new Date(Math.max(...latestTimes) + holdDays * 86400000).toISOString()
    : null;
  return { balance, held, swappable: Math.max(0, balance - held), clearsAt };
}

/**
 * The reaper. A pending swap older than five minutes either has both legs
 * (mark it paid) or neither (cancel it). EXACTLY ONE leg is unreachable
 * under postTransferPair, so it refuses rather than guessing.
 */
export async function reconcileSwapOrders(pool: Pool): Promise<{ settled: number; cancelled: number }> {
  const [stale] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM exchange_orders WHERE kind = 'swap' AND status = 'pending' AND created_at < (NOW() - INTERVAL 5 MINUTE)",
  );
  let settled = 0;
  let cancelled = 0;
  for (const row of stale) {
    const id = String(row.id);
    const [[legs]] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM token_ledger WHERE source = 'exchange_swap' AND source_ref = ?",
      [id],
    );
    const n = Number(legs.n);
    if (n === 2) {
      await pool.query("UPDATE exchange_orders SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE id = ?", [id]);
      settled += 1;
    } else if (n === 0) {
      // Nothing moved, so the member's confirmation code goes back to them —
      // a key left attached to a cancelled order would refuse the retry.
      await pool.query("UPDATE exchange_orders SET status = 'cancelled', client_key = NULL WHERE id = ?", [id]);
      cancelled += 1;
    } else {
      throw new Error(`swap order ${id} has ${n} ledger leg(s) — a half-applied swap must never be normalized`);
    }
  }
  return { settled, cancelled };
}

/**
 * The other reaper: abandoned CARD checkouts (X4).
 *
 * A fiat purchase inserts its order as `pending` BEFORE the Stripe Checkout
 * session opens, so every closed tab leaves one behind and nothing ever
 * cleared them. That is not merely untidy. Both blockers that read this table
 * are kind-agnostic — `exchangeOpenState` refuses to turn the module off while
 * any order is pending, and the exit enumerator refuses to release a member
 * with one — so a single abandoned checkout could keep the exchange
 * permanently un-disableable and hold someone in the village indefinitely.
 * Nobody would connect the two.
 *
 * Two rules make releasing safe:
 *
 *  - Never touch an order with ledger legs. Tokens moved means it was paid,
 *    whatever the row says; that is a settle bug, not an abandonment, and it
 *    is left alone and reported rather than quietly cancelled.
 *  - Wait longer than Stripe will. A Checkout session stays payable for about
 *    24 hours, so a shorter window could cancel an order while the member is
 *    still on the payment page — taking their money against a cancelled
 *    order. Hence hours, a 48-hour default, and a floor enforced here rather
 *    than trusted to whoever edits the variable.
 *
 * `client_key` is cleared with the status for the same reason the swap reaper
 * clears it: a key still attached to a dead order refuses the member's retry.
 */
export const ORDER_EXPIRY_FLOOR_HOURS = 25;

export async function releaseAbandonedFiatOrders(
  pool: Pool,
  expiryHours: number,
): Promise<{ released: number; skipped: string[] }> {
  if (expiryHours <= 0) return { released: 0, skipped: [] };
  const hours = Math.max(ORDER_EXPIRY_FLOOR_HOURS, Math.floor(expiryHours));
  const [stale] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM exchange_orders WHERE kind = 'fiat_purchase' AND status = 'pending' " +
      "AND created_at < (NOW() - INTERVAL ? HOUR)",
    [hours],
  );
  let released = 0;
  const skipped: string[] = [];
  for (const row of stale) {
    const id = String(row.id);
    const [[legs]] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM token_ledger WHERE source = 'exchange_purchase' AND source_ref = ?",
      [id],
    );
    if (Number(legs.n) > 0) {
      // Paid in the ledger, pending on the row. Releasing it would erase the
      // only record that the member is owed something.
      skipped.push(id);
      continue;
    }
    await pool.query(
      "UPDATE exchange_orders SET status = 'cancelled', client_key = NULL WHERE id = ? AND status = 'pending'",
      [id],
    );
    released += 1;
  }
  return { released, skipped };
}

/**
 * Automated authority may NARROW the market and never widen it. A listing
 * that no longer passes its own firewall (a token that has since been
 * faucet-issued, say) is delisted loudly at boot rather than crashing a
 * deployment that was fine yesterday.
 */
export async function repairTaintedListings(pool: Pool): Promise<string[]> {
  const repaired: string[] = [];
  const tainted = await faucetIssuedTokens(pool);
  for (const s of await exchangeSettings(pool)) {
    if (!s.active || (!s.purchasable && !s.swappable)) continue;
    // Only auto-fix what delisting can fix; anything else falls through to
    // the assertion below and refuses boot.
    if (!tokenDef(s.tokenSlug)) continue;
    // Each flag answers to ITS OWN rule. Swapping refuses strictly more than
    // buying, so a token that becomes faucet-tainted after it was listed
    // loses only its SWAP listing — closing the shop too would delist a
    // sale that was always legal, silently, at a boot nobody was watching.
    const purchaseBad = s.purchasable ? purchaseProblem(s.tokenSlug) : null;
    const swapBad = s.swappable ? await swapProblem(pool, s.tokenSlug, tainted) : null;
    if (!purchaseBad && !swapBad) continue;
    await pool.query(
      "UPDATE token_exchange_settings SET purchasable = ?, swappable = ? WHERE token_slug = ?",
      [purchaseBad ? 0 : s.purchasable ? 1 : 0, swapBad ? 0 : s.swappable ? 1 : 0, s.tokenSlug],
    );
    repaired.push(`${s.tokenSlug}: ${purchaseBad ?? swapBad}`);
  }
  return repaired;
}

/**
 * The swap boot assertions. Everything the write path refuses, re-proven
 * against the whole ledger — plus the structural facts no single write can
 * check: leg pairing, faucet abstinence, and Gate C2 asserted in data.
 */
export async function assertSwapFirewalls(
  pool: Pool,
  ctx: { tradingEnabled: boolean; sharedPasswordPosture: boolean; legalAckVersion?: string | null; cardVersion: string },
): Promise<string[]> {
  const problems: string[] = [];
  // Warnings close SWAPPING. Problems refuse to serve at all. The difference
  // matters: an amended caution card must stop trades, but it must not take
  // the village's quests and stays down with it.
  const warnings: string[] = [];

  // 2. allowNegative must never learn the swap source.
  if (ALLOW_NEGATIVE_SOURCES.has("exchange_swap")) {
    problems.push("exchange_swap is in ALLOW_NEGATIVE_SOURCES — a swap may never create debt");
  }

  // 4. No swap leg touches a faucet, on either side, anywhere in history.
  const [faucetLegs] = await pool.query<RowDataPacket[]>(
    "SELECT l.id FROM token_ledger l JOIN ledger_accounts a ON a.id IN (l.from_account, l.to_account) " +
      "WHERE l.source = 'exchange_swap' AND a.faucet = 1 LIMIT 5",
  );
  for (const r of faucetLegs) problems.push(`swap ledger row ${r.id} touches a faucet account — a swap must never mint`);

  // 5. Leg pairing: every swap group is exactly two rows, opposite
  // directions across the treasury, in two different tokens.
  const [groups] = await pool.query<RowDataPacket[]>(
    "SELECT source_ref, COUNT(*) AS n, COUNT(DISTINCT token_type) AS tokens, " +
      "SUM(from_account = ?) AS out_legs, SUM(to_account = ?) AS in_legs " +
      "FROM token_ledger WHERE source = 'exchange_swap' GROUP BY source_ref HAVING n <> 2 OR tokens <> 2 OR out_legs <> 1 OR in_legs <> 1 LIMIT 5",
    [TREASURY, TREASURY],
  );
  for (const g of groups) {
    problems.push(
      `swap ${g.source_ref} has ${g.n} leg(s) across ${g.tokens} token(s) — a half-applied or malformed swap must never be normalized`,
    );
  }

  // 6. Gate C2 in data: a swap never carries a payment provider.
  const [[provider]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM exchange_orders WHERE kind = 'swap' AND (provider_ref IS NOT NULL OR stripe_payment_intent_id IS NOT NULL)",
  );
  if (Number(provider.n) > 0) {
    problems.push(`${provider.n} swap order(s) carry a payment provider reference — swaps never touch fiat`);
  }

  // 10. Caps are non-negative; the spread is inside its bounds.
  const [badCaps] = await pool.query<RowDataPacket[]>(
    "SELECT token_slug FROM token_exchange_settings WHERE max_swap_out_per_cycle < 0 OR max_swap_out_per_member_per_cycle < 0 LIMIT 5",
  );
  for (const c of badCaps) problems.push(`${c.token_slug} has a negative swap cap`);

  // 8/9. Opening the market is a posture decision, not just a toggle.
  if (ctx.tradingEnabled && ctx.sharedPasswordPosture) {
    problems.push(
      "internal trading is enabled while a shared password is the only admin credential — bootstrap per-admin identities first",
    );
  }
  // A version bump here is a DOCS change that would otherwise brick every
  // fork running trading, so it closes swapping and shouts instead. The
  // safety property survives — no trade happens under a stale acceptance —
  // without an upgrade becoming a village-wide outage.
  if (ctx.tradingEnabled && ctx.legalAckVersion !== ctx.cardVersion) {
    warnings.push(
      `swapping is CLOSED: the legal caution card is version ${ctx.cardVersion} but this village accepted ` +
        `${ctx.legalAckVersion ?? "none"} — an admin must read and accept the current card in Admin → Exchange`,
    );
  }

  if (problems.length) {
    for (const p of problems) console.error(`[swap firewall] ${p}`);
    throw new Error(`swap firewalls violated (${problems.length}) — refusing to serve`);
  }
  for (const w of warnings) console.error(`[swap firewall] ${w}`);
  return warnings;
}
