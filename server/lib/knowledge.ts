/**
 * Maia's knowledge (S70): what she draws on when a founder asks how to
 * organize — and in what order.
 *
 * Two shelves, one rule. The CORPUS (docs/knowledge/*.md, shipped with the
 * platform) is the distilled literature: sociocracy, governance, conflict,
 * relating, regenerative organizing, legal structures, membership design —
 * researched, sourced, and audited before it landed. The SECOND BRAIN is
 * the village's own: syntheses the automation pipeline produced from their
 * recorded calls, the human-edited `body`, never the raw AI draft. The rule
 * (Rye, 2026-07-27): the village's own material OUTRANKS the corpus. What
 * this community actually said about itself is evidence; the literature is
 * counsel.
 *
 * Selection is deterministic keyword scoring, not embeddings: at most two
 * corpus files and three syntheses ride any one prompt, so her context
 * budget stays bounded and her citations stay checkable. A search engine
 * can come later; a prompt you can predict is worth more today.
 */
import fs from "fs";
import path from "path";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface CorpusDoc {
  key: string;
  title: string;
  body: string;
  /** Lowercased haystack for scoring. */
  hay: string;
}

let corpus: CorpusDoc[] = [];

/** Load the shipped corpus once at boot; absent directory = empty shelf, loudly. */
export function loadKnowledgeCorpus(baseDir: string): number {
  const dir = path.join(baseDir, "docs", "knowledge");
  if (!fs.existsSync(dir)) {
    console.error("[knowledge] docs/knowledge missing: Maia has no corpus shelf");
    corpus = [];
    return 0;
  }
  corpus = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      const title = body.split("\n")[0]?.replace(/^#\s*/, "") ?? f;
      return { key: f.replace(/\.md$/, ""), title, body, hay: (f + "\n" + body).toLowerCase() };
    });
  return corpus.length;
}

export function corpusTitles(): Array<{ key: string; title: string }> {
  return corpus.map((c) => ({ key: c.key, title: c.title }));
}

function score(hay: string, query: string): number {
  const words = query.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) ?? [];
  let s = 0;
  for (const w of Array.from(new Set(words))) {
    // Occurrence count, dampened — ten mentions beat one, not by 10x.
    const n = hay.split(w).length - 1;
    if (n > 0) s += 1 + Math.min(3, Math.log2(n + 1));
  }
  return s;
}

/** The top corpus files for a question. Zero matches = zero files — Maia
 *  says "outside my shelf" rather than free-associating. */
export function relevantCorpus(query: string, max = 2): CorpusDoc[] {
  return corpus
    .map((c) => ({ c, s: score(c.hay, query) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.c);
}

export interface SecondBrainHit {
  recordingTitle: string;
  recordedAt: string | null;
  /** The human-edited synthesis body, truncated for the prompt. */
  excerpt: string;
}

/**
 * The village's own voice: human-edited call syntheses matching the
 * question, newest first. `body` (edited), never `ai_body` — what the
 * village CORRECTED is the trustworthy record.
 */
export async function relevantSyntheses(pool: Pool, query: string, max = 3): Promise<SecondBrainHit[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    // is_example = 0 or the seeded demo synthesis is fed to the model under
    // "THIS VILLAGE'S OWN RECORD, highest authority" and cited back as a call
    // that happened. On a fresh fork it is the only synthesis there is, so it
    // would be the top-authority source for every question it scores against.
    "SELECT s.body, r.title, r.recorded_at FROM call_syntheses s JOIN recordings r ON r.id = s.recording_id " +
      "WHERE s.is_example = 0 ORDER BY r.recorded_at DESC LIMIT 40",
  );
  return rows
    .map((r) => ({ r, s: score(String(r.body).toLowerCase(), query) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => ({
      recordingTitle: String(x.r.title ?? "Untitled call"),
      recordedAt: x.r.recorded_at ? new Date(x.r.recorded_at).toISOString() : null,
      excerpt: String(x.r.body).slice(0, 2400),
    }));
}
