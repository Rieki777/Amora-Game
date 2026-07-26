/**
 * The token ledger: one append-only record of every movement of value.
 *
 * Before this, a member's balance was a single mutable number incremented in two
 * places (`+=` at quest consent and at gratitude send) across two non-atomic file
 * writes, with no record of why it changed. That is three problems at once: two
 * writers racing on one number, no audit trail, and no way to answer "where did
 * this come from" when a founder asks.
 *
 * Two disciplines are non-negotiable here, both learned from regen-civics:
 *
 *  1. RECOMPUTE, NEVER INCREMENT. The balance column is a cache derived from
 *     SUM(entries). Every credit rewrites it from the sum rather than adding to
 *     it, so the cache is self-healing: a crash halfway through leaves a
 *     recoverable state, and a wrong balance is fixed by recomputing rather than
 *     by hand-patching a number nobody can explain.
 *  2. EVERY WRITE CARRIES AN IDEMPOTENCY KEY. A retried request, a double-clicked
 *     button, or a re-run job must credit once. The key is the dedupe, not a flag,
 *     because a flag can be lost while the money stays credited.
 *
 * Token types are a REGISTRY, not a closed union (0006 superseded 0005's enum).
 * The village module layer creates internal tokens at runtime — material
 * library credits, stay credits, access tokens — so the set of valid tokens is
 * data, seeded with the three the platform is born knowing. Validation is
 * fail-loud, matching the game-variables philosophy: an unknown token slug is
 * an error, never a silent default, because a typo that quietly becomes
 * 'gratitude' is a mint bug wearing a coercion costume.
 *
 * `governance` is the guard that matters: 'platform' tokens are minted and
 * moved here; 'hypha' tokens (`amora` equity, `voice` governance weight) live
 * on Base under Hypha and are read-only mirrors — if this platform ever minted
 * them it would quietly become the source of truth for the cap table, which
 * decision 5 says it must never be.
 */
import fs from "fs";

export type TokenType = string;

export interface TokenDef {
  slug: string;
  name: string;
  /** Levers-spec taxonomy: recognition | equity | voice | credit. */
  kind: string;
  /** 'platform' = this ledger mints and moves it; 'hypha' = read-only mirror. */
  governance: "platform" | "hypha";
  /** May members send it peer-to-peer? */
  transferable: boolean;
}

/** The tokens every deployment is born knowing (mirrors the 0006/0007 seed rows). */
const BUILT_IN_TOKENS: TokenDef[] = [
  { slug: "gratitude", name: "Gratitude", kind: "recognition", governance: "platform", transferable: true },
  { slug: "amora", name: "Amora", kind: "equity", governance: "hypha", transferable: false },
  { slug: "voice", name: "Voice", kind: "voice", governance: "hypha", transferable: false },
  // The default value token the gratitude cycle pool pays (ReGen model, Rye
  // 2026-07-26). Per-deployment DATA: villages rename it, point the pool at a
  // different platform token, or add per-module tokens as they configure them.
  { slug: "credits", name: "Village Credits", kind: "credit", governance: "platform", transferable: false },
];

const registry = new Map<string, TokenDef>(BUILT_IN_TOKENS.map((t) => [t.slug, t]));

/** Look up a token. Undefined means "not a token" — callers must fail loud. */
export function tokenDef(slug: string): TokenDef | undefined {
  return registry.get(slug);
}

/**
 * Register a runtime-created token (module layer: library credits, stay
 * credits…). Re-registering a slug replaces its definition, so a registry
 * loaded from the tokens table on boot can be refreshed after an admin edit.
 */
export function registerToken(def: TokenDef) {
  registry.set(def.slug, def);
}

/** The default recognition token. The others are read from chain. */
export const PLATFORM_TOKEN: TokenType = "gratitude";

export interface LedgerEntry {
  id: string;
  userId: string;
  tokenType: TokenType;
  /** Signed: negative entries are legitimate (corrections, reversals). */
  amount: number;
  /** Machine-readable origin, e.g. "quest_consent", "gratitude_received". */
  source: string;
  /** What it points at, e.g. a claim id. */
  sourceRef?: string;
  description?: string;
  /** Unique. A repeat write with the same key is a no-op, not a second credit. */
  idempotencyKey: string;
  at: string;
}

export interface CreditInput {
  userId: string;
  tokenType?: TokenType;
  amount: number;
  source: string;
  sourceRef?: string;
  description?: string;
  idempotencyKey: string;
}

export interface CreditResult {
  ok: boolean;
  duplicate: boolean;
  entry?: LedgerEntry;
  /** The recomputed balance after this credit. */
  balance: number;
  error?: string;
}

function load(file: string): LedgerEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(file: string, entries: LedgerEntry[]) {
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
}

/** Sum of a member's entries for one token. This is the truth; columns are caches. */
export function balanceOf(file: string, userId: string, tokenType: TokenType = PLATFORM_TOKEN): number {
  return load(file)
    .filter((e) => e.userId === userId && e.tokenType === tokenType)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/** A member's entries, newest first, for the profile's flows view. */
export function entriesFor(file: string, userId: string, tokenType?: TokenType): LedgerEntry[] {
  return load(file)
    .filter((e) => e.userId === userId && (tokenType === undefined || e.tokenType === tokenType))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * Write one credit, idempotently, then return the RECOMPUTED balance.
 *
 * The caller is responsible for persisting that balance onto the member record as
 * a cache; this function never mutates the member. Splitting it that way keeps the
 * ledger the single writer of truth and makes the cache obviously derived.
 */
export function creditTokens(file: string, input: CreditInput): CreditResult {
  const tokenType = input.tokenType ?? PLATFORM_TOKEN;
  const amount = Math.trunc(Number(input.amount) || 0);

  if (!input.userId) return { ok: false, duplicate: false, balance: 0, error: "userId is required" };
  if (!input.idempotencyKey) {
    return { ok: false, duplicate: false, balance: 0, error: "idempotencyKey is required" };
  }
  const def = tokenDef(tokenType);
  if (!def) {
    // Fail loud, never coerce: a typo that silently became 'gratitude' would be
    // a mint bug. Unknown token = registration was forgotten, and that is the
    // caller's bug to hear about.
    return {
      ok: false,
      duplicate: false,
      balance: 0,
      error: `unknown token "${tokenType}" — register it in the token registry before crediting`,
    };
  }
  if (def.governance !== "platform") {
    // A guard, not a limitation: Amora and Voice are Hypha's to issue. If this
    // platform ever mints them it has quietly become the source of truth for
    // equity, which is exactly what decision 5 says it must never be.
    return {
      ok: false,
      duplicate: false,
      balance: balanceOf(file, input.userId, tokenType),
      error: `${tokenType} is issued on Hypha and only read here; the platform cannot credit it`,
    };
  }

  const entries = load(file);
  const existing = entries.find((e) => e.idempotencyKey === input.idempotencyKey);
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      entry: existing,
      balance: balanceOf(file, input.userId, tokenType),
    };
  }

  const entry: LedgerEntry = {
    id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    tokenType,
    amount,
    source: input.source,
    sourceRef: input.sourceRef,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    at: new Date().toISOString(),
  };
  entries.push(entry);
  save(file, entries);

  return { ok: true, duplicate: false, entry, balance: balanceOf(file, input.userId, tokenType) };
}

/**
 * Give every member without one an opening balance entry, so the ledger explains
 * the whole of their current balance rather than only what happened after it was
 * introduced. Idempotent per member, so it is safe to run on every boot.
 */
export function backfillOpeningBalances(
  file: string,
  members: Array<{ id: string; balance: number }>,
): { created: number } {
  let created = 0;
  for (const m of members) {
    const key = `opening_balance:${m.id}`;
    const amount = Math.trunc(Number(m.balance) || 0);
    if (amount === 0) continue;
    const before = load(file).some((e) => e.idempotencyKey === key);
    if (before) continue;
    const res = creditTokens(file, {
      userId: m.id,
      amount,
      source: "opening_balance",
      description: "Balance carried over from before the ledger existed",
      idempotencyKey: key,
    });
    if (res.ok && !res.duplicate) created++;
  }
  return { created };
}
