/**
 * The one place a synthesis reply becomes rows (K2).
 *
 * This is a pure extraction of what the admin synthesize route did inline. It
 * exists because there are now two ways a reply arrives — the admin route,
 * where a person is waiting, and the batch poll, where the answer comes back
 * up to a day later — and the evidence rule, the write-once ai_body and the
 * status flip must be the SAME code on both. Two copies of a rule that drops
 * unevidenced tasks is one copy that will eventually stop dropping them.
 *
 * Behaviour-identical to the inline version, deliberately: the fence strip,
 * the id shapes, the 20000-character overview clamp, the chapter and decision
 * fallbacks and the ORDER of the four writes are unchanged.
 *
 * It does NOT announce. `moduleActivity` stays with the callers, because the
 * admin route names the person who asked and the job has nobody to name.
 */
import type { Pool } from "mysql2/promise";
import { validateTasks } from "./callSynthesis";
import type { TranscriptSegment } from "./recordings";

export interface SynthesisWriteInput {
  recordingId: string;
  /** The model's reply text, fences and all. */
  replyText: string;
  /** The tape the evidence rule checks every quote against. */
  segments: TranscriptSegment[];
  /**
   * The role ids the model was ALLOWED to pick from. This is the set the
   * prompt carried, never a freshly computed one: a role added between the
   * ask and the answer would otherwise let a hallucination validate.
   */
  candidateRoleIds: ReadonlySet<string>;
  /** Deterministic chapter marks, used when the model returns none. */
  chapterMarks: { startMs: number }[];
  model: string;
}

export type SynthesisWriteResult =
  | { ok: true; synthesisId: string; kept: number; dropped: number }
  | { ok: false; reason: "unusable_json" };

/** Parse, apply the evidence rule, and write the synthesis with its tasks. */
export async function writeSynthesis(pool: Pool, input: SynthesisWriteInput): Promise<SynthesisWriteResult> {
  const text = String(input.replyText ?? "").replace(/^```json\s*|```\s*$/g, "");
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unusable_json" };
  }

  // THE EVIDENCE RULE: quote + timestamp verified against the tape, or
  // dropped — and the drops are counted where admins can see them.
  const { kept, dropped } = validateTasks(parsed.tasks, input.segments, input.candidateRoleIds);

  const synthId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const overview = String(parsed.overview ?? "").slice(0, 20000) || "(the assistant returned no overview)";
  await pool.query(
    "INSERT INTO call_syntheses (id, recording_id, ai_body, body, chapters, decisions, model, dropped_task_count) VALUES (?,?,?,?,?,?,?,?)",
    [synthId, input.recordingId, overview, overview,
      JSON.stringify(Array.isArray(parsed.chapters) ? parsed.chapters : input.chapterMarks),
      JSON.stringify(Array.isArray(parsed.decisions) ? parsed.decisions : []),
      input.model, dropped],
  );
  for (const t of kept) {
    await pool.query(
      "INSERT INTO call_tasks (id, synthesis_id, description, quote, timestamp_ms, role_id) VALUES (?,?,?,?,?,?)",
      [`ct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, synthId, t.description, t.quote, t.timestampMs, t.roleId],
    );
  }
  await pool.query("UPDATE recordings SET status = 'synthesized' WHERE id = ?", [input.recordingId]);
  return { ok: true, synthesisId: synthId, kept: kept.length, dropped };
}
