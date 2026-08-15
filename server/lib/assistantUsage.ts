/**
 * What each assistant call actually cost (S77, Lane A).
 *
 * `rate_hits` counts events in a bucket. It knows a mode was called forty times
 * today and nothing about whether those forty calls read a hundred tokens each
 * or a hundred thousand, so every question about what the assistant costs has
 * been answered by guessing. Anthropic returns the real numbers in the response
 * body and nothing wrote them down.
 *
 * This writer lives OUTSIDE `assistant.ts` on purpose. That file's header
 * states it takes none of the server's globals, and its unit tests run with no
 * database. A pool argument in there would end both properties in one commit.
 *
 * Append-only operations data. It is not the ledger, it holds no balance, and
 * nothing in it moves value.
 */
import { randomUUID } from "crypto";
import type { Pool } from "mysql2/promise";
import type { AssistantUsage, KeySource } from "./assistant";

export interface UsageRecord {
  /** instanceIdentity().instanceId. Minted at first boot, not configurable. */
  villageId: string;
  mode: string;
  model: string;
  keySource: KeySource;
  /** Null for public surfaces where nobody is signed in. */
  userId?: string | null;
  usage: AssistantUsage;
  /** Upstream POSTs behind one answer. A tool-using turn is 2 or more. */
  iterations: number;
  stopReason?: string | null;
}

/** Whole non-negative counts. A NaN from a malformed reply must land as 0. */
function count(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Record one call, or say loudly that it could not.
 *
 * This never throws into the caller. The row is a trace of a call that already
 * happened and whose answer is already on its way to a person; losing the
 * measurement must never cost them the reply. A failure is a log line an
 * operator can find, which is the same posture `recordEvent` takes.
 */
export async function recordAssistantUsage(pool: Pool, input: UsageRecord): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO assistant_usage (id, village_id, mode, model, key_source, user_id, " +
        "input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, " +
        "iterations, stop_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        `au-${randomUUID().slice(0, 16)}`,
        String(input.villageId).slice(0, 64),
        String(input.mode).slice(0, 24),
        String(input.model).slice(0, 64),
        String(input.keySource).slice(0, 16),
        input.userId ? String(input.userId).slice(0, 64) : null,
        count(input.usage?.inputTokens),
        count(input.usage?.outputTokens),
        count(input.usage?.cacheCreationInputTokens),
        count(input.usage?.cacheReadInputTokens),
        Math.max(1, count(input.iterations)),
        input.stopReason ? String(input.stopReason).slice(0, 24) : null,
      ],
    );
  } catch (e) {
    console.error("[assistant-usage] could not record what a call cost", e);
  }
}
