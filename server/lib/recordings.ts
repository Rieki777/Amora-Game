/**
 * Recording ingestion (S53): the pipeline's front door. Three sources —
 * manual paste, the Riverside webhook, a YouTube RSS diff (no API key) —
 * all idempotent on (source, external_id), all inert while the automation
 * module is off. Ingestion writes pipeline-internal rows only; nothing a
 * member sees ever mutates on a timer.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface RecordingRow {
  id: string;
  source: "manual" | "riverside" | "youtube";
  externalId: string | null;
  title: string;
  url: string | null;
  durationS: number | null;
  status: "ingested" | "transcribed" | "synthesized" | "published" | "failed";
  createdAt: string;
  /**
   * A standing example. Carried all the way out to the admin card because the
   * Calls tab offers Publish, Save edit, Accept and Dismiss on every row, and
   * all four refuse an example — without the flag the guards are discovered as
   * errors after the click rather than read as a label before it.
   */
  isExample: boolean;
}

function rowToRecording(r: RowDataPacket): RecordingRow {
  return {
    id: String(r.id),
    source: r.source,
    externalId: r.external_id ?? null,
    title: String(r.title),
    url: r.url ?? null,
    durationS: r.duration_s == null ? null : Number(r.duration_s),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    isExample: Number(r.is_example ?? 0) === 1,
  };
}

// ── Transcript parsing (pure, unit-tested) ───────────────────────────────────

function tsToMs(ts: string): number {
  // "HH:MM:SS.mmm" | "MM:SS.mmm" | SRT's comma decimals.
  const clean = ts.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return Math.round(s * 1000);
}

/**
 * VTT / SRT / plain text → segments. A transcript without cue timestamps
 * becomes ONE segment spanning zero — the evidence rule still works, it
 * just can't window-check, so the whole text is the window.
 */
export function parseTranscript(raw: string): { body: string; segments: TranscriptSegment[] } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const cueRe = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  const segments: TranscriptSegment[] = [];

  if (cueRe.test(text)) {
    // Cue blocks: [index]\n start --> end \n text...  (VTT and SRT share this shape.)
    const blocks = text.split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split("\n").filter((l) => l.trim() && !/^WEBVTT/i.test(l));
      const cueIdx = lines.findIndex((l) => cueRe.test(l));
      if (cueIdx === -1) continue;
      const [startRaw, endRaw] = lines[cueIdx].split("-->");
      const body = lines.slice(cueIdx + 1).join(" ").trim();
      if (!body) continue;
      segments.push({ startMs: tsToMs(startRaw), endMs: tsToMs(endRaw), text: body });
    }
  }
  if (!segments.length) {
    segments.push({ startMs: 0, endMs: 0, text: text });
  }
  const body = segments.map((s) => s.text).join("\n");
  return { body, segments };
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Idempotent on (source, external_id): a redelivery returns the original. */
export async function ingestRecording(
  pool: Pool,
  input: { source: "manual" | "riverside" | "youtube"; externalId?: string | null; title: string; url?: string | null; durationS?: number | null },
): Promise<{ recording: RecordingRow; fresh: boolean }> {
  if (input.externalId) {
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM recordings WHERE source = ? AND external_id = ?",
      [input.source, input.externalId],
    );
    if (existing[0]) return { recording: rowToRecording(existing[0]), fresh: false };
  }
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await pool.query(
    "INSERT INTO recordings (id, source, external_id, title, url, duration_s) VALUES (?,?,?,?,?,?)",
    [id, input.source, input.externalId ?? null, input.title.trim().slice(0, 500), input.url ?? null, input.durationS ?? null],
  );
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM recordings WHERE id = ?", [id]);
  return { recording: rowToRecording(rows[0]), fresh: true };
}

export async function recordingById(pool: Pool, id: string): Promise<RecordingRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM recordings WHERE id = ?", [id]);
  return rows[0] ? rowToRecording(rows[0]) : null;
}

export async function allRecordings(pool: Pool): Promise<RecordingRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM recordings ORDER BY created_at DESC LIMIT 200");
  return rows.map(rowToRecording);
}

export async function putTranscript(pool: Pool, recordingId: string, raw: string, source: "provided" | "manual"): Promise<{ segments: number }> {
  const parsed = parseTranscript(raw);
  await pool.query(
    "INSERT INTO transcripts (recording_id, body, segments, source) VALUES (?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE body = VALUES(body), segments = VALUES(segments), source = VALUES(source)",
    [recordingId, parsed.body, JSON.stringify(parsed.segments), source],
  );
  await pool.query("UPDATE recordings SET status = 'transcribed' WHERE id = ? AND status = 'ingested'", [recordingId]);
  return { segments: parsed.segments.length };
}

export async function transcriptFor(pool: Pool, recordingId: string): Promise<{ body: string; segments: TranscriptSegment[] } | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM transcripts WHERE recording_id = ?", [recordingId]);
  const r = rows[0];
  if (!r) return null;
  const segments = typeof r.segments === "string" ? JSON.parse(r.segments) : r.segments;
  return { body: String(r.body), segments: Array.isArray(segments) ? segments : [] };
}

/** New video ids from a channel RSS body (no API key — a diff, not a poll). */
export function videoIdsFromRss(xml: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const idMatch = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(m[1]);
    const titleMatch = /<title>([^<]*)<\/title>/.exec(m[1]);
    if (idMatch) out.push({ id: idMatch[1].trim(), title: (titleMatch?.[1] ?? "Untitled recording").trim() });
  }
  return out;
}
