/**
 * Money as words, for DISPLAY only (0083, P8, N4).
 *
 * Amounts live as minor units plus an ISO code, the `ModulePricing` rule.
 * This file turns them into a sentence, optionally through a display
 * currency: a member who thinks in colones reads colones, and what Stripe
 * charges never passes through here. There is no rounding-safe way to move
 * money through a float, so nothing here ever feeds a charge, a ledger row
 * or a settlement; `server/lib/payments.ts` has an empty diff this round and
 * a test asserting its currency, which is the whole point.
 *
 * The exponent comes from `Intl`, exactly like `priceLine` in modules.ts: a
 * price in yen has no decimals, and assuming two would misprice it a
 * hundredfold. Unknown codes (a village's own CR, a token symbol) fall back
 * to two decimals and a plain "123.45 CRC" spelling, which is honest and
 * never throws inside a render.
 */

/** Decimal places for a currency, per Intl; 2 when the code is unknown. */
export function exponentOf(currency: string): number {
  try {
    const fmt = new Intl.NumberFormat("en", { style: "currency", currency });
    return fmt.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Minor units -> "CHF 12.50" / "$12.50", falling back to "12.5 XXX". */
function plainFormat(amountMinor: number, currency: string): string {
  const digits = exponentOf(currency);
  const major = amountMinor / Math.pow(10, digits);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(major);
  } catch {
    return `${major} ${currency}`;
  }
}

/**
 * Convert minor units between currencies given ONE pairwise rate: units of
 * `toCurrency` per one unit of `fromCurrency`. Exponents of both sides are
 * honoured, so 500 JPY minor (¥500) at 0.006 becomes 300 USD minor ($3.00).
 * Display arithmetic only; the result is rounded to the nearest minor unit.
 */
export function convertMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): number {
  const fromMajor = amountMinor / Math.pow(10, exponentOf(fromCurrency));
  const toMajor = fromMajor * rate;
  return Math.round(toMajor * Math.pow(10, exponentOf(toCurrency)));
}

/**
 * The cross rate between two currencies from a base-EUR table (the fx_rates
 * cache): units of `to` per one unit of `from`. Null when either side is
 * missing, and the CALLER then shows the original currency: a rate invented
 * from nothing is worse than a foreign number.
 */
export function crossRate(
  rates: Record<string, number>,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1;
  const table: Record<string, number> = { EUR: 1, ...rates };
  const f = table[from];
  const t = table[to];
  if (!Number.isFinite(f) || !Number.isFinite(t) || f <= 0 || t <= 0) return null;
  return t / f;
}

/**
 * The one formatter (coordinator amendment 2): minor units and their ISO
 * code, optionally through a display currency.
 *
 *   formatMoney(1250, "USD")                                  -> "$12.50"
 *   formatMoney(1250, "USD", { currency: "CHF", rate: 0.8 })  -> "CHF 10.00"
 *   formatMoney(1250, "CRC", { currency: "CHF", rate: null }) -> "CRC 12.50"
 *
 * WHEN NO RATE EXISTS THE ORIGINAL CURRENCY SHOWS, converted nowhere: the
 * ECB's daily list carries no CRC (measured 2026-08-21), so a colones price
 * stays a colones price until an admin records a manual rate, and the
 * currency picker says so rather than pretending.
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  display?: { currency: string; rate: number | null },
): string {
  if (!display || display.currency === currency || display.rate === null || !Number.isFinite(display.rate) || display.rate <= 0) {
    return plainFormat(amountMinor, currency);
  }
  return plainFormat(convertMinor(amountMinor, currency, display.currency, display.rate), display.currency);
}

/**
 * The display currency to start a viewer on (P8): the project's own fiat
 * currency, and CHF when the project has not said, the universal default the
 * ruling names. A per-member preference (`users.prefs.displayCurrency`)
 * overrides both.
 */
export function defaultDisplayCurrency(project: { country?: string | null; fiatCurrency?: string | null }): string {
  const declared = String(project.fiatCurrency ?? "").trim().toUpperCase();
  if (declared) return declared;
  return "CHF";
}

/** A display-currency preference is three letters, or nothing at all. */
export function displayCurrencyProblem(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z]{3}$/.test(v)) {
    return "A display currency is a three letter code, like CHF or CRC";
  }
  return null;
}
