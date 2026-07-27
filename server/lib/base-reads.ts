/**
 * Base chain reads (S47): the economics section's ONLY chain surface.
 *
 * The platform READS Amora/Voice balances to display them — it never mints,
 * moves, or prices what Hypha governs (Gate B; economy invariant 2.1 #6).
 * Three rules, all load-bearing:
 *
 *   1. decimals() is READ from each contract, never assumed 18, and stored
 *      beside every cached balance. Raw uint256 stays raw (DECIMAL(65,0));
 *      formatting is string math at the edge. BigInt-dividing 0.5 tokens of
 *      equity into an INT that displays as 0 is a misstatement about
 *      ownership, and this file is where that can never happen.
 *   2. NULL ON RPC FAILURE, NEVER ZERO. A failed read returns the last
 *      known value marked stale (with when it was true), or null if nothing
 *      was ever read. Nothing is written on failure — a zero in the cache
 *      means the CHAIN said zero.
 *   3. Balances render only against wallet_verified_at bindings (the
 *      signed-message challenge in index.ts). An address string someone
 *      merely typed proves nothing; equity beside a name must.
 */
import crypto from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { createPublicClient, http, erc20Abi, verifyMessage, getAddress } from "viem";
import { base } from "viem/chains";
import { stringVar } from "./variables";

export interface OnchainBalance {
  /** Raw uint256 as a decimal string — full fixed-point, never truncated. */
  raw: string;
  decimals: number;
  /** Human string with full precision, e.g. "0.5" — string math, no floats. */
  formatted: string;
  fetchedAt: string;
  /** True when this is a LAST-KNOWN value (the fresh read failed). */
  stale: boolean;
}

/** Fixed-point → human string. Pure string math; exported for tests. */
export function formatUnits(raw: string, decimals: number): string {
  const neg = raw.startsWith("-");
  let digits = (neg ? raw.slice(1) : raw).replace(/^0+(?=\d)/, "");
  if (decimals <= 0) return (neg ? "-" : "") + digits;
  digits = digits.padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const frac = digits.slice(-decimals).replace(/0+$/, "");
  return (neg ? "-" : "") + whole + (frac ? `.${frac}` : "");
}

/** decimals() per contract, cached per process. Refreshed only on success. */
const decimalsCache = new Map<string, number>();

function rpcClient() {
  const url = stringVar("tokens.base_rpc_url").trim();
  if (!url) return null;
  return createPublicClient({ chain: base, transport: http(url, { retryCount: 1, timeout: 8_000 }) });
}

async function readCache(pool: Pool, userId: string, tokenSlug: string): Promise<{ raw: string; decimals: number; fetchedAt: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT raw_balance, decimals, fetched_at FROM onchain_balances WHERE user_id = ? AND token_slug = ?",
    [userId, tokenSlug],
  );
  const r = rows[0];
  if (!r) return null;
  return { raw: String(r.raw_balance), decimals: Number(r.decimals), fetchedAt: new Date(r.fetched_at).toISOString() };
}

/**
 * One read-through cached balance. On success the cache row is upserted; on
 * ANY failure nothing is written and the caller gets last-known-with-
 * staleness or null. This function never throws.
 */
export async function readOnchainBalance(
  pool: Pool,
  input: { userId: string; walletAddress: string; tokenSlug: string; contractAddress: string },
): Promise<OnchainBalance | null> {
  const cached = await readCache(pool, input.userId, input.tokenSlug).catch(() => null);
  // Read-through TTL: a value under a minute old is served as fresh without
  // touching the RPC — profile loads must not hammer a public endpoint.
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 60_000) {
    return { raw: cached.raw, decimals: cached.decimals, formatted: formatUnits(cached.raw, cached.decimals), fetchedAt: cached.fetchedAt, stale: false };
  }
  try {
    const client = rpcClient();
    if (!client) throw new Error("no RPC configured");
    const contract = getAddress(input.contractAddress);
    const holder = getAddress(input.walletAddress);
    let decimals = decimalsCache.get(contract.toLowerCase());
    if (decimals === undefined) {
      decimals = Number(await client.readContract({ address: contract, abi: erc20Abi, functionName: "decimals" }));
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) throw new Error(`implausible decimals() = ${decimals}`);
      decimalsCache.set(contract.toLowerCase(), decimals);
    }
    const raw = (await client.readContract({
      address: contract, abi: erc20Abi, functionName: "balanceOf", args: [holder],
    })) as bigint;
    const rawStr = raw.toString();
    await pool.query(
      "INSERT INTO onchain_balances (id, user_id, token_slug, raw_balance, decimals, fetched_at) VALUES (?,?,?,?,?,NOW()) " +
        "ON DUPLICATE KEY UPDATE raw_balance = VALUES(raw_balance), decimals = VALUES(decimals), fetched_at = NOW()",
      [`${input.userId}:${input.tokenSlug}`.slice(0, 120), input.userId, input.tokenSlug, rawStr, decimals],
    );
    return { raw: rawStr, decimals, formatted: formatUnits(rawStr, decimals), fetchedAt: new Date().toISOString(), stale: false };
  } catch (e) {
    // The rule, verbatim: null on RPC failure, NEVER zero. Last-known wins
    // when it exists, marked with when it was actually true.
    console.error(`[base-reads] ${input.tokenSlug} read failed for ${input.userId}: ${(e as any)?.message ?? e}`);
    if (cached) {
      return { raw: cached.raw, decimals: cached.decimals, formatted: formatUnits(cached.raw, cached.decimals), fetchedAt: cached.fetchedAt, stale: true };
    }
    return null;
  }
}

// ── The signed-message challenge ─────────────────────────────────────────────

export function challengeMessage(input: { nonce: string; userId: string; host: string }): string {
  // Human-readable on purpose: wallets show this text to the person signing.
  // The HOST names the village — no deployment's brand is welded in here.
  return (
    `Wallet verification for ${input.host}\n\n` +
    `This signature proves you control this wallet. It authorizes nothing ` +
    `and costs nothing.\n\nMember: ${input.userId}\nSite: ${input.host}\nNonce: ${input.nonce}`
  );
}

export async function createWalletChallenge(pool: Pool, userId: string, host: string): Promise<{ message: string; expiresAt: string }> {
  const nonce = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    "INSERT INTO wallet_challenges (user_id, nonce, expires_at) VALUES (?,?,?) " +
      "ON DUPLICATE KEY UPDATE nonce = VALUES(nonce), expires_at = VALUES(expires_at)",
    [userId, nonce, expires],
  );
  return { message: challengeMessage({ nonce, userId, host }), expiresAt: expires.toISOString() };
}

/**
 * Verify the signature against the OUTSTANDING challenge. Consumes the nonce
 * on success (one signature, one binding); an expired or missing challenge
 * refuses. EIP-191 recovery via viem — "nobody else claimed the string" was
 * regen-civics' bug; the signature is the point.
 */
export async function verifyWalletSignature(
  pool: Pool,
  input: { userId: string; address: string; signature: string; host: string },
): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT nonce, expires_at FROM wallet_challenges WHERE user_id = ?",
    [input.userId],
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "No challenge outstanding — request one first" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "The challenge expired — request a fresh one" };
  }
  let address: string;
  try {
    address = getAddress(String(input.address));
  } catch {
    return { ok: false, error: "That is not a valid address" };
  }
  const message = challengeMessage({ nonce: String(row.nonce), userId: input.userId, host: input.host });
  let valid = false;
  try {
    valid = await verifyMessage({ address: address as `0x${string}`, message, signature: input.signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "The signature does not match this address and challenge" };
  await pool.query("DELETE FROM wallet_challenges WHERE user_id = ?", [input.userId]);
  return { ok: true, address };
}
