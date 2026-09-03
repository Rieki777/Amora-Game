/**
 * THE ONE PLACE MINOR UNITS BECOME THE NUMBER A MEMBER READS.
 *
 * `token_ledger.amount` and `token_balances.balance` are INTs, so a token with
 * decimals stores minor units: Village Voice rides in thousandths, and a
 * member who earned 10 Voice has 10000 on the row. Dividing is not a nicety.
 * A surface that prints the row prints 10000, and a member who is told they
 * hold ten thousand of something they earned ten of has been lied to by the
 * one page they came to trust.
 *
 * WHY THIS EXISTS BEFORE THE 4-DECIMALS SWEEP, AND NOT AS PART OF IT.
 *
 * Rye has ruled that every token moves to 4 decimals. Today exactly one token
 * carries decimals at all, so exactly one number on one screen is wrong, and
 * it is wrong by 1000x. The day that ruling lands, EVERY token is wrong by
 * 10,000x on EVERY surface that does not divide, all at once, with no single
 * broken screen to point at. So the dividing goes in first, on every surface,
 * while there is still one token to check it against. Adding decimals to a
 * token after this is then a registry row and nothing else.
 *
 * A surface that renders a token amount calls `formatTokenAmount`. It does not
 * write its own division: two spellings of the same rule is how the profile
 * chip and the wallet came to disagree in the first place.
 *
 * `decimals` travels with the amount in the payload, per token, read live from
 * the registry. Nothing on the client hardcodes which token has how many.
 */

/**
 * Minor units to the number a member reads.
 *
 * FORMATTING RULE, one for every surface: a whole amount renders whole, and a
 * fractional one renders to its significant digits and no further. 10, not
 * 10.000. 0.125, not 0.13 and not 0.1250. "10.000 Voice" and "10 Voice" are
 * the same number and not the same sentence: the first reads like a price tag
 * on a thing that is not for sale, and Voice is not for sale.
 *
 * A token with no decimals is passed through untouched, so the gratitude and
 * stay-credit surfaces read exactly as they always have.
 */
export function formatTokenAmount(units: number, decimals: number): string {
  const n = Number(units) || 0;
  const d = Number(decimals) || 0;
  if (d <= 0) return String(Math.trunc(n));
  // toFixed first, then strip: dividing alone leaves binary noise (100 / 1000
  // is 0.1, but 1229 / 10000 is not always what a member would type).
  return (n / 10 ** d)
    .toFixed(d)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

/**
 * The decimals for one token out of a payload's `slug -> decimals` map.
 *
 * Absent means zero, which is what every token in the registry carried before
 * Voice and what an unregistered slug honestly means. It never guesses at a
 * token's scale from its name.
 */
export function decimalsOf(map: Record<string, number> | undefined | null, slug: string): number {
  return Number(map?.[slug] ?? 0) || 0;
}
