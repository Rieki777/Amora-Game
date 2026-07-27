/**
 * Exchange v1 (S33-S35): BUY-ONLY. Members buy platform tokens for fiat
 * through the trio; the tokens come out of a stocked treasury, never out of
 * thin air. Swapping is a shipped CONTRACT (the flag and column exist) with
 * no engine until v2 — trading_enabled in module config throws a 501, loudly.
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
import type { Pool, RowDataPacket } from "mysql2/promise";
import { TREASURY, memberAccount, postTransfer, tokenDef, allTokens } from "./ledger";
import { numberVar } from "./variables";
import { MODULES } from "../../shared/modules";

export interface ExchangeSettings {
  tokenSlug: string;
  purchasable: boolean;
  swappable: boolean;
  minStageToBuy: string | null;
  sortOrder: number;
  active: boolean;
}

function rowToSettings(r: RowDataPacket): ExchangeSettings {
  return {
    tokenSlug: String(r.token_slug),
    purchasable: !!r.purchasable,
    swappable: !!r.swappable,
    minStageToBuy: r.min_stage_to_buy ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: !!r.active,
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
 * The write-time firewall. Returns a human refusal or null. Checked again
 * at boot so a hand-edited row can never outlive a deploy.
 */
export function listingProblem(slug: string, flags: { purchasable: boolean; swappable: boolean }): string | null {
  if (!flags.purchasable && !flags.swappable) return null; // delisting is always legal
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

export async function upsertSettings(
  pool: Pool,
  input: { slug: string; purchasable?: boolean; swappable?: boolean; minStageToBuy?: string | null; sortOrder?: number; active?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await settingsFor(pool, input.slug);
  const next = {
    purchasable: input.purchasable ?? current?.purchasable ?? false,
    swappable: input.swappable ?? current?.swappable ?? false,
  };
  const problem = listingProblem(input.slug, next);
  if (problem) return { ok: false, error: problem };
  await pool.query(
    "INSERT INTO token_exchange_settings (token_slug, purchasable, swappable, min_stage_to_buy, sort_order, active) VALUES (?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE purchasable=VALUES(purchasable), swappable=VALUES(swappable), " +
      "min_stage_to_buy=VALUES(min_stage_to_buy), sort_order=VALUES(sort_order), active=VALUES(active)",
    [
      input.slug,
      next.purchasable ? 1 : 0,
      next.swappable ? 1 : 0,
      input.minStageToBuy !== undefined ? input.minStageToBuy : current?.minStageToBuy ?? null,
      input.sortOrder ?? current?.sortOrder ?? 0,
      (input.active ?? current?.active ?? true) ? 1 : 0,
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
