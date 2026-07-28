/**
 * The token ledger, S7 edition: transfer rows in MySQL, between ACCOUNTS.
 *
 * The JSON era recorded bare credits — "N appeared in X's balance" — which
 * makes issuance invisible. The keystone shape is double-entry-lite: every
 * movement is a transfer FROM one account TO another, amount strictly
 * positive. Ordinary accounts can never overdraft. Designated FAUCET accounts
 * (sys:gratitude-pool, sys:cycle-pool) may run negative, and their negative
 * balance IS the issued-to-date figure. Conservation is therefore a checkable
 * invariant, not a hope: for every token, SUM(balance) over all accounts ≡ 0.
 *
 * Disciplines carried forward from the JSON ledger, both learned at
 * regen-civics:
 *
 *  1. RECOMPUTE, NEVER INCREMENT. token_balances is a cache; every posting
 *     rewrites the two touched rows from SUM(transfers) inside the same
 *     transaction. A wrong cache is fixed by recomputation, not hand-patching.
 *  2. EVERY WRITE CARRIES AN IDEMPOTENCY KEY. The UNIQUE index is the dedupe:
 *     a retried request posts once because the second INSERT fails, not
 *     because a flag was checked.
 *
 * The registry now READS THE tokens TABLE (0006/0007) — the in-memory list
 * this file used to carry is gone, because two registries drift. It is loaded
 * at boot and refreshed whenever an admin creates a token (S9).
 *
 * `governance` is the guard that matters: 'platform' tokens are minted and
 * moved here; 'hypha' tokens (equity, voice) live on Base under Hypha and are
 * read-only mirrors — if this platform ever posted one it would quietly
 * become the source of truth for the cap table, which decision 5 says it must
 * never be. Boot invariants enforce that with a loud failure, not a comment.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

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
  active: boolean;
}

/** The default recognition token. The others are read from chain. */
export const PLATFORM_TOKEN: TokenType = "gratitude";

/** System account ids the platform is born knowing (seeded by 0009). */
export const RECOGNITION_FAUCET = "sys:gratitude-pool";
export const CYCLE_POOL_FAUCET = "sys:cycle-pool";
export const TREASURY = "sys:treasury";
/** Seeded by 0011. Its negative balance IS each credit token's issued supply. */
export const MINT_FAUCET = "sys:mint";

/** The ledger account id that belongs to a member. */
export function memberAccount(userId: string): string {
  return `mem:${userId}`;
}

// ── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, TokenDef>();

/**
 * Fill the in-memory registry from the tokens table. Called at boot (after
 * migrations) and after any admin change to the table. Handlers then use the
 * synchronous tokenDef() they always used.
 */
export async function loadTokenRegistry(pool: Pool): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT slug, name, kind, governance, transferable, active FROM tokens",
  );
  registry.clear();
  for (const r of rows) {
    registry.set(String(r.slug), {
      slug: String(r.slug),
      name: String(r.name),
      kind: String(r.kind),
      governance: r.governance === "hypha" ? "hypha" : "platform",
      transferable: !!r.transferable,
      active: !!r.active,
    });
  }
}

/** Look up a token. Undefined means "not a token" — callers must fail loud. */
export function tokenDef(slug: string): TokenDef | undefined {
  return registry.get(slug);
}

export function allTokens(): TokenDef[] {
  return Array.from(registry.values());
}

/**
 * Create or update a token (S9 admin surface; module layer later). Writes the
 * table first, then refreshes the registry — the table is the truth.
 */
export async function registerToken(
  pool: Pool,
  def: Omit<TokenDef, "active"> & { active?: boolean },
): Promise<void> {
  await pool.query(
    "INSERT INTO tokens (slug, name, kind, governance, transferable, active) VALUES (?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE name=VALUES(name), kind=VALUES(kind), governance=VALUES(governance), " +
      "transferable=VALUES(transferable), active=VALUES(active)",
    [def.slug, def.name, def.kind, def.governance, def.transferable ? 1 : 0, def.active === false ? 0 : 1],
  );
  await loadTokenRegistry(pool);
}

// ── Posting ─────────────────────────────────────────────────────────────────

export interface TransferInput {
  from: string;
  to: string;
  tokenType?: TokenType;
  amount: number;
  /** Machine-readable origin, e.g. "quest_consent", "gratitude_received". */
  source: string;
  sourceRef?: string;
  description?: string;
  /** Unique. A repeat write with the same key is a no-op, not a second post. */
  idempotencyKey: string;
  /**
   * Permit this post to drive a NON-FAUCET account below zero. Only honored
   * when `source` is in ALLOW_NEGATIVE_SOURCES — a negative balance is the
   * truthful state after a grace-night burn or a chargeback clawback, never
   * a convenience for ordinary spending paths.
   */
  allowNegative?: boolean;
}

/**
 * The only sources that may legally drive a non-faucet account negative
 * (with allowNegative set): stay-night burns inside the grace window, and
 * mechanical reversal legs after a refund/dispute. Static ON PURPOSE —
 * extending it is a one-line reviewed change to the keystone, not a runtime
 * registration that can race the boot invariant check.
 */
export const ALLOW_NEGATIVE_SOURCES: ReadonlySet<string> = new Set(["stay_night", "payment_reversal"]);

export interface TransferResult {
  ok: boolean;
  duplicate: boolean;
  error?: string;
  /** The recomputed balance of the RECEIVING account after this post. */
  toBalance: number;
}

async function recomputeBalance(conn: PoolConnection, accountId: string, tokenType: string): Promise<number> {
  await conn.query(
    "INSERT IGNORE INTO token_balances (account_id, token_type, balance) VALUES (?,?,0)",
    [accountId, tokenType],
  );
  await conn.query(
    "UPDATE token_balances tb SET tb.balance = (" +
      "SELECT COALESCE(SUM(CASE WHEN t.to_account = ? THEN t.amount ELSE -t.amount END), 0) " +
      "FROM token_ledger t WHERE t.token_type = ? AND (t.to_account = ? OR t.from_account = ?)" +
      ") WHERE tb.account_id = ? AND tb.token_type = ?",
    [accountId, tokenType, accountId, accountId, accountId, tokenType],
  );
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT balance FROM token_balances WHERE account_id = ? AND token_type = ?",
    [accountId, tokenType],
  );
  return Number(rows[0]?.balance ?? 0);
}

/**
 * Post one transfer, transactionally and idempotently.
 *
 * Inside the transaction: the transfer row is inserted (the UNIQUE
 * idempotency key rejects replays), both touched balances are RECOMPUTED from
 * the transfer table, and the sending account is checked for overdraft —
 * non-faucet accounts must never go negative; if this post would take one
 * below zero the whole transaction rolls back and nothing moved.
 *
 * Member accounts (mem:*) are created on first touch; system accounts must
 * already exist — a typo'd system id is a bug to hear about, not an account
 * to invent.
 */
/**
 * Everything true of a leg BEFORE any transaction opens. Extracted so the
 * single-leg and paired posters cannot drift apart: one validator, two
 * callers. Returns null when the leg is postable.
 */
function validateLeg(input: TransferInput): { tokenType: string; amount: number } | { error: string } {
  const tokenType = input.tokenType ?? PLATFORM_TOKEN;
  const amount = Math.trunc(Number(input.amount) || 0);

  if (!input.from || !input.to) return { error: "from and to accounts are required" };
  if (input.from === input.to) return { error: "an account cannot transfer to itself" };
  if (amount <= 0) return { error: "amount must be a positive integer" };
  if (!input.idempotencyKey) return { error: "idempotencyKey is required" };

  const def = tokenDef(tokenType);
  if (!def) {
    // Fail loud, never coerce: a typo that silently became 'gratitude' would
    // be a mint bug wearing a coercion costume.
    return { error: `unknown token "${tokenType}" — register it in the token registry before posting` };
  }
  if (def.governance !== "platform") {
    return { error: `${tokenType} is issued on Hypha and only read here; the platform cannot move it` };
  }
  return { tokenType, amount };
}

/**
 * A veto that runs INSIDE a single transfer's transaction, after the accounts
 * are locked FOR UPDATE and before the ledger row is written.
 *
 * Same shape and same reason as {@link PairGuard}, for the same class of bug:
 * a limit that lives OUTSIDE the ledger — a per-cycle mint cap, for one — is
 * check-then-act when the caller reads the running total, decides, and posts
 * several awaits later. A concurrent request reads the same stale total and
 * also decides yes, and the cap is quietly exceeded with every individual
 * request looking lawful.
 *
 * Running the check under the lock that already orders the writes makes
 * deciding and writing one atomic step. The accounts are locked before the
 * guard runs, so two posts moving the same token between the same accounts
 * are serialised and the second one reads the first one's committed row.
 *
 * Return a human-readable reason to refuse, or null to proceed.
 */
export type TransferGuard = (conn: PoolConnection) => Promise<string | null>;

export async function postTransfer(
  pool: Pool,
  input: TransferInput,
  guard?: TransferGuard,
): Promise<TransferResult> {
  const checked = validateLeg(input);
  if ("error" in checked) return { ok: false, duplicate: false, toBalance: 0, error: checked.error };
  const { tokenType, amount } = checked;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Accounts: members materialize on first touch, system ids must exist.
    for (const acct of [input.from, input.to]) {
      if (acct.startsWith("mem:")) {
        await conn.query(
          "INSERT IGNORE INTO ledger_accounts (id, kind, user_id, label, faucet) VALUES (?,?,?,?,0)",
          [acct, "member", acct.slice(4), acct.slice(4)],
        );
      }
    }
    const [acctRows] = await conn.query<RowDataPacket[]>(
      "SELECT id, faucet FROM ledger_accounts WHERE id IN (?, ?) FOR UPDATE",
      [input.from, input.to],
    );
    const accounts = new Map(acctRows.map((r) => [String(r.id), { faucet: !!r.faucet }]));
    const fromAcct = accounts.get(input.from);
    if (!fromAcct || !accounts.get(input.to)) {
      await conn.rollback();
      const missing = !fromAcct ? input.from : input.to;
      return { ok: false, duplicate: false, toBalance: 0, error: `account "${missing}" does not exist` };
    }

    // The veto, under the lock the accounts are already holding.
    if (guard) {
      const refusal = await guard(conn);
      if (refusal) {
        await conn.rollback();
        return { ok: false, duplicate: false, toBalance: 0, error: refusal };
      }
    }

    try {
      await conn.query(
        "INSERT INTO token_ledger (id, from_account, to_account, token_type, amount, source, source_ref, description, idempotency_key) " +
          "VALUES (?,?,?,?,?,?,?,?,?)",
        [
          `led-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          input.from,
          input.to,
          tokenType,
          amount,
          input.source,
          input.sourceRef ?? null,
          input.description ?? null,
          input.idempotencyKey,
        ],
      );
    } catch (e: any) {
      await conn.rollback();
      if (e?.code === "ER_DUP_ENTRY") {
        // Replay: the money already moved exactly once. Report the current state.
        const [b] = await pool.query<RowDataPacket[]>(
          "SELECT balance FROM token_balances WHERE account_id = ? AND token_type = ?",
          [input.to, tokenType],
        );
        return { ok: true, duplicate: true, toBalance: Number(b[0]?.balance ?? 0) };
      }
      throw e;
    }

    // Recompute both caches in a stable order (avoids lock-order deadlocks).
    const ordered = [input.from, input.to].sort();
    const balances = new Map<string, number>();
    for (const acct of ordered) balances.set(acct, await recomputeBalance(conn, acct, tokenType));

    const fromBalance = balances.get(input.from)!;
    const negativeAllowed = !!input.allowNegative && ALLOW_NEGATIVE_SOURCES.has(input.source);
    if (!fromAcct.faucet && fromBalance < 0 && !negativeAllowed) {
      await conn.rollback();
      return {
        ok: false,
        duplicate: false,
        toBalance: 0,
        error: `insufficient ${tokenType}: "${input.from}" holds ${fromBalance + amount} and cannot overdraft`,
      };
    }

    await conn.commit();
    return { ok: true, duplicate: false, toBalance: balances.get(input.to)! };
  } catch (e) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

// ── The pair: two legs, one transaction (S57) ────────────────────────────────

export interface PairResult {
  ok: boolean;
  duplicate: boolean;
  error?: string;
  /** "accountId|tokenType" → recomputed balance, for all four touched pairs. */
  balances: Record<string, number>;
}

/**
 * Post EXACTLY TWO transfers in ONE transaction: both, or neither.
 *
 * postTransfer owns its own transaction, so two sequential calls can commit
 * the first leg and fail the second — the member debited and never credited.
 * A swap is the first operation in this platform where that gap is reachable
 * by ordinary use, so the gap gets closed rather than documented.
 *
 * Fixed at two legs ON PURPOSE. A generic N-leg API is what makes a router
 * easy to build, and a router is an automated market maker wearing a helper
 * function. Two legs is a swap; anything longer is a different decision that
 * deserves its own gate.
 */
/**
 * A veto that runs INSIDE the pair's transaction, after the accounts are
 * locked and before the rows are written. It exists for limits that live
 * outside the ledger — per-cycle swap caps, for one — which are otherwise
 * check-then-act: read the total, decide, and write several awaits later
 * while a concurrent request reads the same stale total and also decides
 * yes. Running the check under the same lock that orders the writes makes
 * the decision and the write one atomic step. Return a member-readable
 * reason to refuse, or null to proceed.
 */
export type PairGuard = (conn: PoolConnection) => Promise<string | null>;

export async function postTransferPair(
  pool: Pool,
  legs: [TransferInput, TransferInput],
  guard?: PairGuard,
): Promise<PairResult> {
  // InnoDB may still pick a deadlock victim under real contention even with
  // perfect lock ordering (the balance recompute reads rows a neighbour is
  // writing). A rolled-back transaction moved nothing, so retrying is safe
  // and honest; giving up after three tries keeps a pathological case from
  // hiding as latency.
  for (let attempt = 1; ; attempt++) {
    try {
      return await postTransferPairOnce(pool, legs, guard);
    } catch (e: any) {
      const retryable = e?.code === "ER_LOCK_DEADLOCK" || e?.code === "ER_LOCK_WAIT_TIMEOUT";
      if (!retryable || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
    }
  }
}

async function postTransferPairOnce(
  pool: Pool,
  legs: [TransferInput, TransferInput],
  guard?: PairGuard,
): Promise<PairResult> {
  const fail = (error: string): PairResult => ({ ok: false, duplicate: false, error, balances: {} });

  // A pair NEVER creates debt. allowNegative exists for grace nights and
  // chargebacks — situations where a debt is the truth. A swap that could
  // overdraft is just a mint with extra steps, so this is a hard error
  // inside the primitive rather than a rule callers are asked to remember.
  for (const leg of legs) {
    if (leg.allowNegative) return fail("allowNegative is illegal in a paired post — a swap may never create debt");
  }
  if (legs[0].idempotencyKey === legs[1].idempotencyKey) {
    return fail("both legs carry the same idempotency key — a pair needs two distinct keys");
  }

  const checked = legs.map(validateLeg);
  for (const c of checked) if ("error" in c) return fail(c.error);
  const [a, b] = checked as [{ tokenType: string; amount: number }, { tokenType: string; amount: number }];
  const meta = [a, b];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const touched = Array.from(new Set([legs[0].from, legs[0].to, legs[1].from, legs[1].to]));
    // ONE sorted lock statement over the deduped union: concurrent swaps
    // serialize deterministically on sys:treasury instead of deadlocking.
    //
    // LOCK FIRST, create second. Materializing member accounts up front
    // looks harmless but takes a SHARED lock on an already-existing row,
    // and two transactions that both hold it then both try to upgrade to
    // the exclusive FOR UPDATE lock deadlock every time. Taking the
    // exclusive lock first means the hot path never upgrades.
    const sorted = [...touched].sort();
    const lockStatement = `SELECT id, faucet FROM ledger_accounts WHERE id IN (${sorted.map(() => "?").join(",")}) ORDER BY id FOR UPDATE`;
    let [acctRows] = await conn.query<RowDataPacket[]>(lockStatement, sorted);
    let accounts = new Map(acctRows.map((r) => [String(r.id), { faucet: !!r.faucet }]));

    const missingMembers = touched.filter((a) => !accounts.has(a) && a.startsWith("mem:"));
    if (missingMembers.length) {
      // Only a member account may be born here, and only when it truly does
      // not exist yet — so the shared-lock upgrade never happens on a hot row.
      for (const acct of missingMembers) {
        await conn.query(
          "INSERT IGNORE INTO ledger_accounts (id, kind, user_id, label, faucet) VALUES (?,?,?,?,0)",
          [acct, "member", acct.slice(4), acct.slice(4)],
        );
      }
      [acctRows] = await conn.query<RowDataPacket[]>(lockStatement, sorted);
      accounts = new Map(acctRows.map((r) => [String(r.id), { faucet: !!r.faucet }]));
    }
    for (const acct of touched) {
      if (!accounts.has(acct)) {
        await conn.rollback();
        return fail(`account "${acct}" does not exist`);
      }
    }

    // The accounts are locked now, so any concurrent pair touching the same
    // treasury row is queued behind this one. A limit checked here sees every
    // committed neighbour; the same limit checked before this point does not.
    if (guard) {
      const refusal = await guard(conn);
      if (refusal) {
        await conn.rollback();
        return fail(refusal);
      }
    }

    try {
      for (let i = 0; i < 2; i++) {
        await conn.query(
          "INSERT INTO token_ledger (id, from_account, to_account, token_type, amount, source, source_ref, description, idempotency_key) " +
            "VALUES (?,?,?,?,?,?,?,?,?)",
          [
            `led-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            legs[i].from,
            legs[i].to,
            meta[i].tokenType,
            meta[i].amount,
            legs[i].source,
            legs[i].sourceRef ?? null,
            legs[i].description ?? null,
            legs[i].idempotencyKey,
          ],
        );
      }
    } catch (e: any) {
      await conn.rollback();
      if (e?.code !== "ER_DUP_ENTRY") throw e;
      // A clean replay has BOTH keys already present. Exactly one means two
      // different orders minted the same key — unreachable under a single
      // transaction, so it is a key-shape bug, and the honest response is to
      // refuse rather than guess which half is real.
      const [existing] = await pool.query<RowDataPacket[]>(
        "SELECT idempotency_key FROM token_ledger WHERE idempotency_key IN (?, ?)",
        [legs[0].idempotencyKey, legs[1].idempotencyKey],
      );
      if (existing.length === 2) return { ok: true, duplicate: true, balances: {} };
      if (existing.length === 1) {
        throw new Error(
          `partial idempotency collision on ${existing[0].idempotency_key} — keys from different orders have merged; refusing to complete`,
        );
      }
      throw e;
    }

    // Recompute every touched (account, token) cache in a stable order.
    const pairs = [
      { acct: legs[0].from, token: meta[0].tokenType },
      { acct: legs[0].to, token: meta[0].tokenType },
      { acct: legs[1].from, token: meta[1].tokenType },
      { acct: legs[1].to, token: meta[1].tokenType },
    ];
    const seen = new Set<string>();
    const balances: Record<string, number> = {};
    for (const p of pairs.map((p) => ({ ...p, key: `${p.acct}|${p.token}` })).sort((x, y) => x.key.localeCompare(y.key))) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      balances[p.key] = await recomputeBalance(conn, p.acct, p.token);
    }

    // Overdraft-check EVERY non-faucet sender. Either failing rolls both back.
    for (let i = 0; i < 2; i++) {
      const sender = legs[i].from;
      if (accounts.get(sender)?.faucet) continue;
      const bal = balances[`${sender}|${meta[i].tokenType}`];
      if (bal < 0) {
        await conn.rollback();
        return fail(
          `insufficient ${meta[i].tokenType}: "${sender}" holds ${bal + meta[i].amount} and cannot overdraft`,
        );
      }
    }

    await conn.commit();
    return { ok: true, duplicate: false, balances };
  } catch (e) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Cached balance of one account for one token. */
export async function balanceOf(pool: Pool | PoolConnection, accountId: string, tokenType: TokenType = PLATFORM_TOKEN): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT balance FROM token_balances WHERE account_id = ? AND token_type = ?",
    [accountId, tokenType],
  );
  return Number(rows[0]?.balance ?? 0);
}

/** All of one account's balances: slug -> cached balance. */
export async function balancesFor(pool: Pool, accountId: string): Promise<Record<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT token_type, balance FROM token_balances WHERE account_id = ?",
    [accountId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.token_type)] = Number(r.balance);
  return out;
}

/** A member-perspective ledger line: amount signed from the member's side. */
export interface MemberLedgerEntry {
  id: string;
  tokenType: string;
  amount: number;
  source: string;
  sourceRef?: string;
  description?: string;
  at: string;
}

/** A member's movements, newest first, signed from their perspective. */
export async function entriesForMember(pool: Pool, userId: string): Promise<MemberLedgerEntry[]> {
  const acct = memberAccount(userId);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, from_account, to_account, token_type, amount, source, source_ref, description, at " +
      "FROM token_ledger WHERE to_account = ? OR from_account = ? ORDER BY at DESC, id DESC",
    [acct, acct],
  );
  return rows.map((r) => ({
    id: String(r.id),
    tokenType: String(r.token_type),
    amount: String(r.to_account) === acct ? Number(r.amount) : -Number(r.amount),
    source: String(r.source),
    sourceRef: r.source_ref ?? undefined,
    description: r.description ?? undefined,
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
  }));
}

// ── Boot invariants ─────────────────────────────────────────────────────────

export interface InvariantReport {
  ok: boolean;
  problems: string[];
}

/**
 * The checks that make the economy trustworthy, run at every boot:
 *
 *  1. Hypha-governed tokens have ZERO transfer rows — the moment one appears,
 *     this database has started minting equity, and the server must not come
 *     up and normalize that.
 *  2. Every transfer's token is registered — an orphan slug is a mint bug.
 *  3. Conservation: per token, SUM(cached balances) ≡ 0.
 *  4. The cache agrees with recomputation from transfers (drift = a posting
 *     path that skipped the discipline).
 *  5. No non-faucet account is ILLEGALLY negative — negative is legal only
 *     where the account has a debit from an ALLOW_NEGATIVE_SOURCES source
 *     (grace-night burn, payment reversal); anything else refuses boot.
 */
export async function checkLedgerInvariants(pool: Pool): Promise<InvariantReport> {
  const problems: string[] = [];

  const [hypha] = await pool.query<RowDataPacket[]>(
    "SELECT l.token_type, COUNT(*) n FROM token_ledger l JOIN tokens t ON t.slug = l.token_type " +
      "WHERE t.governance = 'hypha' GROUP BY l.token_type",
  );
  for (const r of hypha) problems.push(`hypha token "${r.token_type}" has ${r.n} ledger row(s) — this platform must never move it`);

  const [orphans] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT l.token_type FROM token_ledger l LEFT JOIN tokens t ON t.slug = l.token_type WHERE t.slug IS NULL",
  );
  for (const r of orphans) problems.push(`ledger rows exist for unregistered token "${r.token_type}"`);

  const [sums] = await pool.query<RowDataPacket[]>(
    "SELECT token_type, SUM(balance) s FROM token_balances GROUP BY token_type HAVING SUM(balance) <> 0",
  );
  for (const r of sums) problems.push(`conservation broken for "${r.token_type}": balances sum to ${r.s}, not 0`);

  const [drift] = await pool.query<RowDataPacket[]>(
    "SELECT tb.account_id, tb.token_type, tb.balance AS cached, COALESCE(x.actual, 0) AS actual FROM token_balances tb " +
      "LEFT JOIN (SELECT account_id, token_type, SUM(delta) actual FROM (" +
      "  SELECT to_account account_id, token_type, amount delta FROM token_ledger " +
      "  UNION ALL SELECT from_account, token_type, -amount FROM token_ledger" +
      ") m GROUP BY account_id, token_type) x " +
      "ON x.account_id = tb.account_id AND x.token_type = tb.token_type " +
      "WHERE tb.balance <> COALESCE(x.actual, 0)",
  );
  for (const r of drift) problems.push(`cache drift ${r.account_id}/${r.token_type}: cached=${r.cached} actual=${r.actual}`);

  const allowNeg = Array.from(ALLOW_NEGATIVE_SOURCES);
  const [negatives] = await pool.query<RowDataPacket[]>(
    "SELECT tb.account_id, tb.token_type, tb.balance FROM token_balances tb " +
      "JOIN ledger_accounts a ON a.id = tb.account_id WHERE a.faucet = 0 AND tb.balance < 0 " +
      "AND NOT EXISTS (SELECT 1 FROM token_ledger t WHERE t.from_account = tb.account_id " +
      "AND t.token_type = tb.token_type AND t.source IN (?))",
    [allowNeg],
  );
  for (const r of negatives) problems.push(`non-faucet account ${r.account_id} is negative: ${r.balance} ${r.token_type}`);

  return { ok: problems.length === 0, problems };
}
