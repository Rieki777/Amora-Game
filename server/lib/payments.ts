/**
 * The fiat trio (S32) — built ONCE, consumed by every fiat module (economy
 * invariant 2.2 #10). Three responsibilities, one file:
 *
 *  1. CHECKOUT: Stripe Checkout Sessions via the REST API (no SDK — one
 *     fewer dependency, and the surface we use is three endpoints). Every
 *     session is stamped with metadata {module, orderId}; the webhook
 *     dispatches on nothing else.
 *  2. SETTLEMENT + REVERSAL: signature verification on the RAW body (manual
 *     HMAC per Stripe's v1 scheme), event-level dedupe via the unique
 *     stripe_event_id in payments_log, and dispatch to per-module handlers.
 *     Disputes and refunds are MECHANICAL: reversal handlers claw back what
 *     was granted (balances may go negative — that is the truthful state),
 *     auto-suspend the buyer, and queue for admins. Never manual
 *     reconstruction.
 *  3. LIMITS: one cross-module per-member purchase-limit helper over
 *     fiat_charges. Limits that only see one module are theater.
 *
 * Money math: ROUNDING FAVORS THE TREASURY — ceil what the member pays,
 * floor what the member receives. The property test asserts no round trip
 * ever extracts value.
 */
import crypto from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { numberVar } from "./variables";
import { recordEvent } from "./events";

// ── Configuration ────────────────────────────────────────────────────────────

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function webhookSecretConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

// ── Rounding: the treasury never loses to arithmetic ────────────────────────

/** What the member PAYS: rounds up. */
export function ceilMinor(value: number): number {
  return Math.ceil(value - 1e-9);
}

/** What the member RECEIVES: rounds down. */
export function floorTokens(value: number): number {
  return Math.floor(value + 1e-9);
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface CheckoutInput {
  module: string;
  orderId: string;
  /** One line item: a description and an amount in minor units (cents). */
  name: string;
  amountMinor: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export async function createCheckout(input: CheckoutInput): Promise<{ url: string; sessionId: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][price_data][currency]", input.currency ?? "usd");
  params.set("line_items[0][price_data][product_data][name]", input.name.slice(0, 120));
  params.set("line_items[0][price_data][unit_amount]", String(ceilMinor(input.amountMinor)));
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[module]", input.module);
  params.set("metadata[orderId]", input.orderId);
  params.set("payment_intent_data[metadata][module]", input.module);
  params.set("payment_intent_data[metadata][orderId]", input.orderId);
  if (input.customerEmail) params.set("customer_email", input.customerEmail);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Stripe checkout failed: ${data?.error?.message ?? res.status}`);
  return { url: String(data.url), sessionId: String(data.id) };
}

// ── Signature verification (Stripe v1 scheme, on the RAW body) ──────────────

export function verifyStripeSignature(rawBody: Buffer | string, sigHeader: string | undefined, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // 5-minute tolerance against replay.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Handler registry: settle + reversal, per module ──────────────────────────

type SettleHandler = (orderId: string, event: any) => Promise<void>;
type ReversalHandler = (orderId: string, event: any) => Promise<void>;

const settleHandlers = new Map<string, SettleHandler>();
const reversalHandlers = new Map<string, ReversalHandler>();

export function registerPaymentHandlers(moduleId: string, handlers: { settle: SettleHandler; reversal?: ReversalHandler }) {
  settleHandlers.set(moduleId, handlers.settle);
  if (handlers.reversal) reversalHandlers.set(moduleId, handlers.reversal);
}

// ── The ops rider: log everything, alert on failures ────────────────────────

export interface PaymentsLogEntry {
  stripeEventId?: string | null;
  module?: string | null;
  orderId?: string | null;
  type: string;
  outcome: "ok" | "sig_fail" | "no_handler" | "no_order" | "settle_error" | "duplicate";
  latencyMs?: number;
  detail?: string;
}

export async function logPayment(pool: Pool, e: PaymentsLogEntry): Promise<boolean> {
  try {
    await pool.query(
      "INSERT INTO payments_log (id, stripe_event_id, module, order_id, type, outcome, latency_ms, detail) VALUES (?,?,?,?,?,?,?,?)",
      [
        `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        e.stripeEventId ?? null,
        e.module ?? null,
        e.orderId ?? null,
        e.type,
        e.outcome,
        e.latencyMs ?? null,
        e.detail?.slice(0, 500) ?? null,
      ],
    );
    return true;
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY") return false; // event already processed
    console.error("[payments] log write failed", err);
    return true; // fail open on logging trouble; the ledger keys still dedupe
  }
}

/**
 * The one webhook entry point, called by the S13 seam with the RAW body.
 * Verifies, dedupes at event level, dispatches by event type + metadata.
 */
export async function handleStripeEvent(
  pool: Pool,
  rawBody: Buffer | string,
  sigHeader: string | undefined,
  alertAdmins: (title: string, dedupeKey: string) => Promise<void>,
): Promise<{ status: number; body: any }> {
  const started = Date.now();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && !verifyStripeSignature(rawBody, sigHeader, secret)) {
    await logPayment(pool, { type: "signature", outcome: "sig_fail" });
    await alertAdmins("Stripe webhook signature verification FAILED", `payments-sigfail:${new Date().toISOString().slice(0, 13)}`);
    return { status: 400, body: { error: "signature verification failed" } };
  }

  let event: any;
  try {
    event = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "unparseable event" } };
  }
  const eventId = String(event?.id ?? "");
  const type = String(event?.type ?? "unknown");
  const obj = event?.data?.object ?? {};
  const meta = obj?.metadata ?? {};
  const moduleId = String(meta.module ?? "");
  const orderId = String(meta.orderId ?? "");

  // Event-level dedupe: the unique stripe_event_id makes a replay a no-op.
  if (eventId) {
    const fresh = await logPayment(pool, { stripeEventId: eventId, module: moduleId || null, orderId: orderId || null, type, outcome: "ok", latencyMs: Date.now() - started });
    if (!fresh) return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    if (type === "checkout.session.completed") {
      const handler = moduleId ? settleHandlers.get(moduleId) : undefined;
      if (!handler) {
        await logPayment(pool, { module: moduleId || null, orderId: orderId || null, type, outcome: moduleId ? "no_handler" : "no_order" });
        await alertAdmins(`Stripe settle event with ${moduleId ? "no handler for module " + moduleId : "no module metadata"}`, `payments-nohandler:${new Date().toISOString().slice(0, 13)}`);
        return { status: 200, body: { received: true, unhandled: true } };
      }
      await handler(orderId, event);
      return { status: 200, body: { received: true } };
    }

    if (type === "charge.dispute.created" || type === "charge.refunded") {
      // Map the payment intent back to the module order via fiat_charges.
      const pi = String(obj?.payment_intent ?? obj?.id ?? "");
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT module, order_id, user_id FROM fiat_charges WHERE stripe_payment_intent_id = ? LIMIT 1",
        [pi],
      );
      if (!rows[0]) {
        await logPayment(pool, { type, outcome: "no_order", detail: `pi=${pi}` });
        await alertAdmins("Stripe dispute/refund event matched no known charge", `payments-noorder:${new Date().toISOString().slice(0, 13)}`);
        return { status: 200, body: { received: true, unmatched: true } };
      }
      const row = rows[0];
      const reversal = reversalHandlers.get(String(row.module));
      if (reversal) await reversal(String(row.order_id), event);
      await pool.query("UPDATE fiat_charges SET status = 'reversed' WHERE module = ? AND order_id = ?", [row.module, row.order_id]);
      await suspendPurchasing(pool, String(row.user_id), `${type} on ${row.module}:${row.order_id}`, `${row.module}:${row.order_id}`);
      await alertAdmins(`Payment ${type === "charge.refunded" ? "refund" : "DISPUTE"}: ${row.module} order ${row.order_id} — buyer suspended pending review`, `payments-dispute:${row.module}:${row.order_id}`);
      await recordEvent(pool, { kind: "audit", text: `payments:${type}:${row.module}:${row.order_id}`, entityType: "user", entityRef: String(row.user_id), audience: "admin" });
      return { status: 200, body: { received: true } };
    }

    // Everything else: acknowledged, logged, ignored.
    return { status: 200, body: { received: true, ignored: type } };
  } catch (e: any) {
    // Release the event-level dedupe claim: a FAILED dispatch must stay
    // retryable, or one transient error would orphan the order forever.
    // Concurrent redeliveries stay safe — the ledger keys absorb them.
    if (eventId) {
      try { await pool.query("DELETE FROM payments_log WHERE stripe_event_id = ?", [eventId]); } catch { /* the alert below still fires */ }
    }
    await logPayment(pool, { module: moduleId || null, orderId: orderId || null, type, outcome: "settle_error", detail: String(e?.message ?? e) });
    await alertAdmins(`Payment settle handler FAILED for ${moduleId}:${orderId}`, `payments-settleerr:${moduleId}:${orderId}`);
    console.error("[payments] settle error", e);
    // 500 so Stripe retries — the ledger keys make retries safe.
    return { status: 500, body: { error: "settle failed; will retry" } };
  }
}

// ── Charges, suspensions, limits ─────────────────────────────────────────────

export async function recordFiatCharge(
  pool: Pool,
  c: { userId: string; module: string; orderId: string; amountMinor: number; currency?: string; paymentIntentId?: string | null },
): Promise<void> {
  await pool.query(
    "INSERT INTO fiat_charges (id, user_id, module, order_id, amount_minor, currency, stripe_payment_intent_id) VALUES (?,?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE amount_minor = VALUES(amount_minor), stripe_payment_intent_id = VALUES(stripe_payment_intent_id)",
    [`fch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, c.userId, c.module, c.orderId, c.amountMinor, c.currency ?? "usd", c.paymentIntentId ?? null],
  );
}

export async function suspendPurchasing(pool: Pool, userId: string, reason: string, orderRef?: string): Promise<void> {
  await pool.query(
    "INSERT INTO payment_suspensions (id, user_id, reason, order_ref) VALUES (?,?,?,?)",
    [`sus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId, reason.slice(0, 500), orderRef ?? null],
  );
}

export async function isSuspended(pool: Pool, userId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM payment_suspensions WHERE user_id = ? AND lifted_at IS NULL LIMIT 1",
    [userId],
  );
  return rows.length > 0;
}

export type PurchaseCheck = { ok: true } | { ok: false; error: string };

/**
 * The cross-module limit helper (2.2 #10): per MEMBER, across ALL fiat
 * modules, against the three platform variables. The refusal names which
 * cap fired.
 */
export async function assertCanPurchase(pool: Pool, userId: string, amountMinor: number): Promise<PurchaseCheck> {
  if (await isSuspended(pool, userId)) {
    return { ok: false, error: "Purchasing is paused on your account pending a payment review — talk to the stewards" };
  }
  const perOrder = numberVar("payments.purchase_limit_per_order_usd") * 100;
  if (perOrder > 0 && amountMinor > perOrder) {
    return { ok: false, error: `That exceeds the per-order limit (payments.purchase_limit_per_order_usd)` };
  }
  const [[m30]] = await pool.query<any[]>(
    "SELECT COALESCE(SUM(amount_minor),0) AS s FROM fiat_charges WHERE user_id = ? AND status = 'paid' AND paid_at >= (NOW() - INTERVAL 30 DAY)",
    [userId],
  );
  const cap30 = numberVar("payments.purchase_limit_30d_usd") * 100;
  if (cap30 > 0 && Number(m30.s) + amountMinor > cap30) {
    return { ok: false, error: "That would exceed your 30-day purchase limit (payments.purchase_limit_30d_usd)" };
  }
  const [[my]] = await pool.query<any[]>(
    "SELECT COALESCE(SUM(amount_minor),0) AS s FROM fiat_charges WHERE user_id = ? AND status = 'paid' AND paid_at >= (NOW() - INTERVAL 365 DAY)",
    [userId],
  );
  const capY = numberVar("payments.purchase_limit_annual_usd") * 100;
  if (capY > 0 && Number(my.s) + amountMinor > capY) {
    return { ok: false, error: "That would exceed your annual purchase limit (payments.purchase_limit_annual_usd)" };
  }
  return { ok: true };
}
