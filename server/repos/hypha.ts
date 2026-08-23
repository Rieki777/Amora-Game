/**
 * The Hypha module's store: token bindings, village-level chain reads, and the
 * outcome log that includes the deliveries which matched nothing.
 *
 * Every query the module runs lives here, so the tables' readers stay
 * enumerable and the module's own libraries stay pure enough to unit test
 * without a database. Same discipline the contribution scan asks for and the
 * same one `server/repos/quests.ts` already keeps.
 *
 * ONE RULE RUNS THROUGH ALL THREE STORES: nothing is written on a failed read.
 * `saveVillageRead` is only ever called with a value the chain actually
 * returned, and `villageRead` hands back what was last true with the moment it
 * was true attached. A row means the chain answered. There is no code path here
 * that writes a zero on anybody's behalf, which is what makes a zero in these
 * tables readable as a statement about the DAO instead of a statement about the
 * network.
 */
import { randomUUID } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : v == null ? "" : new Date(String(v)).toISOString();

// ── Token bindings ───────────────────────────────────────────────────────────

export interface TokenBinding {
  tokenSlug: string;
  contractAddress: string;
  chainId: number;
  /** What the contract calls itself. Read from name(), never typed. */
  chainName: string;
  chainSymbol: string;
  decimals: number;
  readAt: string;
  confirmedByUserId: string;
  confirmedAt: string;
}

function toBinding(r: RowDataPacket): TokenBinding {
  return {
    tokenSlug: String(r.token_slug),
    contractAddress: String(r.contract_address),
    chainId: Number(r.chain_id),
    chainName: String(r.chain_name),
    chainSymbol: String(r.chain_symbol),
    decimals: Number(r.decimals),
    readAt: iso(r.read_at),
    confirmedByUserId: String(r.confirmed_by_user_id),
    confirmedAt: iso(r.confirmed_at),
  };
}

export async function allBindings(pool: Pool): Promise<TokenBinding[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM hypha_token_bindings ORDER BY token_slug",
  );
  return rows.map(toBinding);
}

export async function bindingFor(pool: Pool, tokenSlug: string): Promise<TokenBinding | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM hypha_token_bindings WHERE token_slug = ?",
    [tokenSlug],
  );
  return rows[0] ? toBinding(rows[0]) : null;
}

/**
 * Write a confirmed binding. Rebinding the same slug REPLACES the row, because
 * a village holds one contract per role and a second one claiming that role is
 * a correction rather than a sibling.
 *
 * The address is lowercased on the way in. Two spellings of one address that
 * compare unequal is how a rebinding silently becomes a duplicate, and the
 * checksummed form is derived at the edge where it is displayed.
 */
export async function saveBinding(
  pool: Pool,
  b: Omit<TokenBinding, "confirmedAt"> & { confirmedAt?: string },
): Promise<void> {
  await pool.query(
    "INSERT INTO hypha_token_bindings " +
      "(token_slug, contract_address, chain_id, chain_name, chain_symbol, decimals, read_at, confirmed_by_user_id) " +
      "VALUES (?,?,?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE contract_address = VALUES(contract_address), chain_id = VALUES(chain_id), " +
      "chain_name = VALUES(chain_name), chain_symbol = VALUES(chain_symbol), decimals = VALUES(decimals), " +
      "read_at = VALUES(read_at), confirmed_by_user_id = VALUES(confirmed_by_user_id), confirmed_at = CURRENT_TIMESTAMP",
    [
      b.tokenSlug,
      b.contractAddress.toLowerCase(),
      b.chainId,
      b.chainName,
      b.chainSymbol,
      b.decimals,
      new Date(b.readAt),
      b.confirmedByUserId,
    ],
  );
}

export async function removeBinding(pool: Pool, tokenSlug: string): Promise<boolean> {
  const [r] = await pool.query<any>("DELETE FROM hypha_token_bindings WHERE token_slug = ?", [tokenSlug]);
  return Number(r.affectedRows) > 0;
}

// ── Village-level reads ──────────────────────────────────────────────────────

export type VillageMetric = "totalSupply" | "treasuryBalance";

export interface VillageRead {
  tokenSlug: string;
  metric: VillageMetric;
  raw: string;
  decimals: number;
  subjectAddress: string;
  fetchedAt: string;
  /** True when the fresh read failed and this is what was last true. */
  stale: boolean;
}

export async function villageRead(
  pool: Pool,
  tokenSlug: string,
  metric: VillageMetric,
  subjectAddress = "",
): Promise<Omit<VillageRead, "stale"> | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM hypha_village_reads WHERE token_slug = ? AND metric = ? AND subject_address = ?",
    [tokenSlug, metric, subjectAddress.toLowerCase()],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    tokenSlug: String(r.token_slug),
    metric: String(r.metric) as VillageMetric,
    raw: String(r.raw_value),
    decimals: Number(r.decimals),
    subjectAddress: String(r.subject_address),
    fetchedAt: iso(r.fetched_at),
  };
}

/**
 * Only ever called with a figure the chain returned. There is no zero path.
 *
 * `fetchedAt` is supplied BY THE CALLER and never by `NOW()`, and that is a
 * correctness fix rather than a style choice. `NOW()` is the database server's
 * wall clock in the database session's timezone, and the pool declares
 * `timezone: "Z"`, so on any server not actually running UTC the value reads
 * back shifted by the server's offset. Every freshness comparison downstream is
 * `Date.now()` minus that value, so on a database four hours off UTC the
 * read-through window never engaged at all and every page load hit the RPC.
 * Driving the read path against a real node on a machine whose MySQL is not UTC
 * is what surfaced it; nothing about the code looked wrong.
 *
 * A JS Date round-trips through mysql2 consistently in both directions under
 * one `timezone` setting, so a value written here reads back as the same
 * instant whatever the server's clock is set to.
 */
export async function saveVillageRead(
  pool: Pool,
  input: {
    tokenSlug: string;
    metric: VillageMetric;
    raw: string;
    decimals: number;
    subjectAddress?: string;
    fetchedAt: Date;
  },
): Promise<void> {
  await pool.query(
    "INSERT INTO hypha_village_reads (token_slug, metric, raw_value, decimals, subject_address, fetched_at) " +
      "VALUES (?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE raw_value = VALUES(raw_value), decimals = VALUES(decimals), fetched_at = VALUES(fetched_at)",
    [
      input.tokenSlug,
      input.metric,
      input.raw,
      input.decimals,
      (input.subjectAddress ?? "").toLowerCase(),
      input.fetchedAt,
    ],
  );
}

// ── Outcomes, including the orphans ──────────────────────────────────────────

export type OutcomeVerdict = "confirmed" | "rejected" | "unknown";
export type OutcomeMatch = "agreement" | "marker" | "none";

export interface HyphaOutcome {
  id: string;
  agreementId: string;
  marker: string;
  verdict: OutcomeVerdict;
  source: string;
  matchedBy: OutcomeMatch;
  matchedProposalId: string | null;
  deliveryKey: string;
  receivedAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  note: string | null;
}

function toOutcome(r: RowDataPacket): HyphaOutcome {
  return {
    id: String(r.id),
    agreementId: String(r.agreement_id ?? ""),
    marker: String(r.marker ?? ""),
    verdict: String(r.verdict) as OutcomeVerdict,
    source: String(r.source ?? "hub"),
    matchedBy: String(r.matched_by) as OutcomeMatch,
    matchedProposalId: r.matched_proposal_id ? String(r.matched_proposal_id) : null,
    deliveryKey: String(r.delivery_key),
    receivedAt: iso(r.received_at),
    resolvedAt: r.resolved_at ? iso(r.resolved_at) : null,
    resolvedByUserId: r.resolved_by_user_id ? String(r.resolved_by_user_id) : null,
    note: r.note ? String(r.note) : null,
  };
}

/**
 * Record one delivery. A retry of the same delivery is a no-op that reports
 * `duplicate`, the same shape the gratitude log uses for its unique index: a
 * sender retrying because it did not hear us is an expected outcome and never
 * an error.
 */
export async function recordOutcome(
  pool: Pool,
  input: {
    agreementId?: string;
    marker?: string;
    verdict: OutcomeVerdict;
    source?: string;
    matchedBy: OutcomeMatch;
    matchedProposalId?: string | null;
    deliveryKey: string;
  },
): Promise<{ id: string; duplicate: boolean }> {
  const id = randomUUID();
  try {
    await pool.query(
      "INSERT INTO hypha_outcomes (id, agreement_id, marker, verdict, source, matched_by, matched_proposal_id, delivery_key) " +
        "VALUES (?,?,?,?,?,?,?,?)",
      [
        id,
        (input.agreementId ?? "").slice(0, 64),
        (input.marker ?? "").slice(0, 64),
        input.verdict,
        (input.source ?? "hub").slice(0, 32),
        input.matchedBy,
        input.matchedProposalId ?? null,
        input.deliveryKey.slice(0, 190),
      ],
    );
    return { id, duplicate: false };
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") return { id: "", duplicate: true };
    throw e;
  }
}

/**
 * The orphan list: deliveries that matched nothing and nobody has answered for.
 *
 * This is the query the table exists to serve. A bridge that drops an outcome
 * silently is one nobody can debug, and a village learns a decision went
 * missing only when somebody asks why nothing applied.
 */
export async function orphanOutcomes(pool: Pool, limit = 50): Promise<HyphaOutcome[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM hypha_outcomes WHERE matched_by = 'none' AND resolved_at IS NULL " +
      "ORDER BY received_at DESC LIMIT ?",
    [Math.max(1, Math.min(200, limit))],
  );
  return rows.map(toOutcome);
}

export async function recentOutcomes(pool: Pool, limit = 20): Promise<HyphaOutcome[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM hypha_outcomes ORDER BY received_at DESC LIMIT ?",
    [Math.max(1, Math.min(200, limit))],
  );
  return rows.map(toOutcome);
}

/** A steward's answer to an orphan. Set by hand, never by a job. */
export async function resolveOutcome(
  pool: Pool,
  id: string,
  byUserId: string,
  note: string,
): Promise<boolean> {
  const [r] = await pool.query<any>(
    "UPDATE hypha_outcomes SET resolved_at = NOW(), resolved_by_user_id = ?, note = ? " +
      "WHERE id = ? AND resolved_at IS NULL",
    [byUserId, note.slice(0, 500), id],
  );
  return Number(r.affectedRows) > 0;
}

/**
 * The agreement id a proposal was linked to, and the reverse lookup that turns
 * a delivery into a proposal.
 *
 * Reads `mechanics_proposals`, which the governance loop owns and this module
 * never writes. The strong match is the agreement id Hypha returns at creation;
 * the marker is the fallback the bridge header warns can be edited away.
 */
export async function proposalByAgreementId(pool: Pool, agreementId: string): Promise<string | null> {
  if (!agreementId) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM mechanics_proposals WHERE hypha_proposal_id = ? LIMIT 1",
    [agreementId],
  );
  return rows[0] ? String(rows[0].id) : null;
}

export async function proposalExists(pool: Pool, proposalId: string): Promise<boolean> {
  if (!proposalId) return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM mechanics_proposals WHERE id = ? LIMIT 1",
    [proposalId],
  );
  return rows.length > 0;
}

/**
 * Decisions this village has in flight, for the switchover preflight.
 *
 * Counted rather than listed, because the question a founder is asking at that
 * moment is "will I strand anything", and the answer is a number and a
 * sentence. The statuses are the three that are mid-flight in the shipped loop:
 * open for sensing, out at Hypha for the binding vote, and on an open on-site
 * ballot.
 */
export async function inFlightDecisionCounts(pool: Pool): Promise<Record<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT status, COUNT(*) AS n FROM mechanics_proposals " +
      "WHERE status IN ('open','to_hypha','onsite_vote','passed_claimed') GROUP BY status",
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.status)] = Number(r.n);
  return out;
}
