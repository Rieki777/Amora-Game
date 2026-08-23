/**
 * A village-level chain figure, read through and cached, carrying the one rule
 * this whole surface stands on: NULL ON RPC FAILURE, NEVER ZERO.
 *
 * Three outcomes and they are three different things, which is the point:
 *
 *   - the chain answered: the row is upserted and the figure comes back fresh.
 *   - the chain did not answer and this village has read it before: NOTHING is
 *     written, and the last true figure comes back marked stale with the moment
 *     it was true.
 *   - the chain did not answer and it has never been read: null. Not zero.
 *
 * That third case is why this lives in its own function instead of inside the
 * route closure it started in. A zero total supply reads as a statement that
 * the DAO issued nothing, which is a claim about the village's whole cap table,
 * and a claim that big deserves a test that can reach it. `server/hypha.test.ts`
 * drives all three against a real JSON-RPC node it then takes away.
 */
import type { Pool } from "mysql2/promise";
import { formatUnits, readVillageMetric } from "../base-reads";
import * as repo from "../../repos/hypha";

export interface VillageFigure {
  tokenSlug: string;
  metric: repo.VillageMetric;
  raw: string;
  decimals: number;
  subjectAddress: string;
  fetchedAt: string;
  /** Full precision, string math, no floats. */
  formatted: string;
  /** True when the fresh read failed and this is what was last true. */
  stale: boolean;
}

/**
 * Serve a figure under a minute old without touching the RPC. A page load must
 * not hammer an endpoint somebody pays per call for, and this is the same
 * read-through window `readOnchainBalance` uses for member balances.
 */
const FRESH_MS = 60_000;

export async function villageFigure(
  pool: Pool,
  input: {
    tokenSlug: string;
    metric: repo.VillageMetric;
    contractAddress: string;
    /** Required for treasuryBalance, ignored for totalSupply. */
    holderAddress?: string;
    /** Skip the read-through window; the admin refresh button sets this. */
    force?: boolean;
  },
): Promise<VillageFigure | null> {
  const subject = input.metric === "treasuryBalance" ? (input.holderAddress ?? "") : "";
  if (input.metric === "treasuryBalance" && !subject) return null;

  const cached = await repo.villageRead(pool, input.tokenSlug, input.metric, subject).catch(() => null);
  if (!input.force && cached && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) {
    return { ...cached, formatted: formatUnits(cached.raw, cached.decimals), stale: false };
  }

  const fresh = await readVillageMetric({
    contractAddress: input.contractAddress,
    metric: input.metric === "totalSupply" ? "totalSupply" : "balanceOf",
    holderAddress: subject || undefined,
  });

  if (fresh) {
    /*
     * ONE timestamp, stored and returned, truncated to the second the column
     * holds. Returning `new Date()` while storing something else would make the
     * first read of a figure report a different moment from every read after
     * it, which is the kind of difference nobody notices until a staleness
     * message contradicts itself.
     */
    const at = new Date(Math.floor(Date.now() / 1000) * 1000);
    await repo
      .saveVillageRead(pool, {
        tokenSlug: input.tokenSlug,
        metric: input.metric,
        raw: fresh.raw,
        decimals: fresh.decimals,
        subjectAddress: subject,
        fetchedAt: at,
      })
      .catch(() => {});
    return {
      tokenSlug: input.tokenSlug,
      metric: input.metric,
      raw: fresh.raw,
      decimals: fresh.decimals,
      subjectAddress: subject,
      fetchedAt: at.toISOString(),
      formatted: formatUnits(fresh.raw, fresh.decimals),
      stale: false,
    };
  }

  // The rule, verbatim. Last known wins when it exists, marked with when it was
  // actually true. Nothing was written on the way through here.
  if (cached) return { ...cached, formatted: formatUnits(cached.raw, cached.decimals), stale: true };
  return null;
}
