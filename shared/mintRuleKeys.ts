/**
 * HOW A BALLOT NAMES A MINTING RULE (R81, R84).
 *
 * R81: after a village starts its Game, minting is a governance act. R84 says
 * how: the village votes on the RULES, and issuance then runs under rules the
 * village already set.
 *
 * Neither was reachable. A mint rule is a row in `mint_rules`, and the only
 * writer was `PATCH /api/admin/economy/rules/:id` behind `isAdmin`. The
 * governance side could not reach it either: `validateChangeSet` refuses any
 * key absent from `VARIABLES_BY_KEY`, and a mint rule is a row, never a dial,
 * so a proposal could not even NAME one. The seat payment of 20 gratitude and
 * 50 village voice per moon, the quest completion reward, every amount the
 * settlement job pays: numbers one admin typed, in a table no ballot could
 * address.
 *
 * ── WHY A KEY NAMESPACE AND NOT A NEW REGISTRY ──────────────────────────────
 *
 * The change set already exists, it is already validated as a whole, it is
 * already rendered into the frozen proposal document, it already has a support
 * threshold, a per-member cycle cap, a cooldown and an amendment ledger. Mint
 * rules needed an address inside it, so this file is the address.
 *
 *   mint:<ruleId>:<field>
 *
 * The colon is what makes the two vocabularies impossible to confuse. No key
 * in `VARIABLES_BY_KEY` contains one, and no mint rule id does either: ids are
 * `rule-<trigger>-<token>` where triggers are dotted and tokens are slugs. So
 * a key either parses here or it is a dial, and nothing has to guess.
 *
 * ── THE THREE FIELDS, AND THE ONES THAT ARE NOT HERE ────────────────────────
 *
 * `amount`, `ceiling` and `enabled` are exactly the three columns
 * `queueRuleChange` can move, so a key that parses here has a writer waiting
 * for it. `trigger`, `token_slug` and `recipient` are absent on purpose: those
 * three ARE the identity of the rule, the natural key `mint_rules_natural` is
 * built on two of them, and changing one is a different rule with the same id.
 * A village that wants a different trigger is asking for a rule this build
 * cannot create by ballot, and saying so is more honest than half applying it.
 */

/** The one prefix. A key starting with this is a mint rule and never a dial. */
export const MINT_RULE_KEY_PREFIX = "mint:";

/**
 * The columns a ballot may move, which is exactly what `queueRuleChange` can
 * write. Adding a fourth here without a writer would let a village vote for
 * something nothing applies.
 */
export const MINT_RULE_FIELDS = ["amount", "ceiling", "enabled"] as const;
export type MintRuleField = (typeof MINT_RULE_FIELDS)[number];

/**
 * The spelling of "read the amount from whatever posted the work".
 *
 * `mint_rules.amount` is nullable and NULL carries that meaning, so the change
 * set needs a word for it: a change set holds strings, and an empty string
 * would be indistinguishable from a field somebody left blank.
 */
export const AMOUNT_FROM_SOURCE = "from-source";

export interface ParsedMintRuleKey {
  ruleId: string;
  field: MintRuleField;
}

/** Compose one. The single place the key's shape is written down. */
export function mintRuleKey(ruleId: string, field: MintRuleField): string {
  return `${MINT_RULE_KEY_PREFIX}${ruleId}:${field}`;
}

/** Cheap enough for a filter, and it answers only what it is asked. */
export function isMintRuleKey(key: string): boolean {
  return key.startsWith(MINT_RULE_KEY_PREFIX);
}

/**
 * Read one, or null.
 *
 * Null is returned for a key that carries the prefix and nothing this build
 * can use, so a caller that has already filtered on `isMintRuleKey` still has
 * to handle the miss. A guess here would move a rule nobody named.
 */
export function parseMintRuleKey(key: string): ParsedMintRuleKey | null {
  if (!isMintRuleKey(key)) return null;
  const rest = key.slice(MINT_RULE_KEY_PREFIX.length);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0 || cut === rest.length - 1) return null;
  const ruleId = rest.slice(0, cut);
  const field = rest.slice(cut + 1);
  if (!(MINT_RULE_FIELDS as readonly string[]).includes(field)) return null;
  return { ruleId, field: field as MintRuleField };
}

/**
 * Is this value acceptable for this field, said in the member's words.
 *
 * Null means acceptable. The same three sentences `queueRuleChange` refuses
 * with, checked here at RAISE so a proposal that could never apply never
 * reaches a vote, and checked again there at EXECUTION because the row can
 * move between the two.
 */
export function mintRuleValueProblem(field: MintRuleField, raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (field === "enabled") {
    return value === "true" || value === "false"
      ? null
      : "This one is on or off, so the value has to be true or false.";
  }
  if (field === "amount" && value === AMOUNT_FROM_SOURCE) return null;
  const n = Number(value);
  if (value === "" || !Number.isFinite(n)) return "This one takes a number.";
  if (field === "amount") {
    return n > 0
      ? null
      : `An amount is greater than zero, or "${AMOUNT_FROM_SOURCE}" to read it from whatever posted the work.`;
  }
  return n >= 0 ? null : "A ceiling is zero or more, and zero means zero.";
}

/**
 * The number a field's string carries, or null for "read it from the source".
 * Callers have already run `mintRuleValueProblem`, so this parses and never
 * validates: two opinions about what a value means is how they disagree.
 */
export function mintRuleValueNumber(field: MintRuleField, raw: string): number | null {
  const value = String(raw ?? "").trim();
  if (field === "amount" && value === AMOUNT_FROM_SOURCE) return null;
  return Number(value);
}

/**
 * One spelling per value, so "already has that value" is a real comparison.
 *
 * `mint_rules.amount` is `decimal(18,4)`, so the row reads back as 20 and a
 * proposal typed as "20.0000" is the same number in a different costume. Left
 * alone, the no-op check would let a change that changes nothing go to a vote,
 * and the village would decide something that was already true. Callers have
 * run `mintRuleValueProblem` first, so this normalises and never validates.
 */
export function normalizeMintRuleValue(field: MintRuleField, raw: string): string {
  const value = String(raw ?? "").trim();
  if (field === "enabled") return value === "true" ? "true" : "false";
  if (field === "amount" && value === AMOUNT_FROM_SOURCE) return AMOUNT_FROM_SOURCE;
  return String(Number(value));
}

/** How a field is written on a proposal document and on the decision page. */
export const MINT_RULE_FIELD_LABEL: Record<MintRuleField, string> = {
  amount: "how much it pays",
  ceiling: "the most it can pay",
  enabled: "whether it pays at all",
};

/** A value as a member reads it, never as the column stores it. */
export function displayMintRuleValue(field: MintRuleField, raw: string): string {
  const value = String(raw ?? "").trim();
  if (field === "enabled") return value === "true" ? "On" : "Off";
  if (field === "amount" && value === AMOUNT_FROM_SOURCE) return "however much the work was posted for";
  return value;
}
