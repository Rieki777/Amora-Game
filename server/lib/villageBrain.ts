/**
 * The village brain (S74): MySQL is authority, markdown is the interface.
 *
 * Rows, rendered to markdown on read. Two reasons the file is not the source of
 * truth: MySQL is the only authority in this system, and a single document that
 * gets rewritten is the brochure-that-overwrites-itself failure the never-build
 * list already names for the org-chart JSON. Rows carry provenance per section,
 * so "you told me this on the 3rd, and the game says otherwise" is answerable.
 *
 * Nothing here ever leaves the fork. It is excluded by name from the feedback
 * relay, the network publish surface and the platform handshake, and a test
 * enforces that instead of a comment.
 *
 * The blanks are load-bearing. An index that says `membership: not yet written`
 * is what lets the assistant raise it unprompted six weeks later.
 */
import { randomUUID } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { BRIEF_BY_ID, BRIEF_SECTIONS, type BriefAudience, type RecordSource } from "../../shared/villageBrief";

export interface BriefRow {
  id: string;
  section: string;
  title: string;
  body: string;
  audience: BriefAudience;
  source: string;
  status: "proposed" | "confirmed";
  confirmedBy: string | null;
  confirmedAt: string | null;
  revision: number;
  updatedAt: string;
}

export interface RecordRow {
  id: string;
  section: string;
  slug: string;
  title: string;
  body: string;
  period: string | null;
  occurredAt: string | null;
  source: RecordSource;
  status: "proposed" | "confirmed";
}

// ── Pure helpers, testable without a database ────────────────────────────────

/**
 * Server-side slugs only. This is the export filename, and a filename built
 * from typed text is a path traversal waiting for someone to notice.
 */
export function slugify(input: string, fallback = "entry"): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return s || fallback;
}

/** Four characters per token, matching the shelf loader's estimate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Trim markdown to a token budget on a line boundary, and say that it was cut. */
export function capMarkdown(md: string, maxTokens: number): string {
  if (estimateTokens(md) <= maxTokens) return md;
  const budget = maxTokens * 4 - 40;
  const cut = md.slice(0, Math.max(0, budget));
  const lastBreak = cut.lastIndexOf("\n");
  return `${cut.slice(0, lastBreak > 0 ? lastBreak : cut.length)}\n\n[truncated]`;
}

/** One section, with the frontmatter that tells a reader how far to trust it. */
export function renderSectionMarkdown(row: BriefRow): string {
  return [
    "---",
    `section: ${row.section}`,
    `status: ${row.status}`,
    `source: ${row.source}`,
    `audience: ${row.audience}`,
    row.confirmedBy ? `confirmed_by: ${row.confirmedBy}` : null,
    `updated_at: ${row.updatedAt}`,
    "---",
    "",
    `# ${row.title}`,
    "",
    row.body.trim(),
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export interface RecordSummary {
  section: string;
  entries: number;
  recent: string[];
}

/**
 * The always-in-context document: every brief section with its status, blanks
 * included, and the record rolled up. Listing every record entry would blow the
 * budget within a year of ordinary use, so the record shows counts and the
 * three newest titles per section.
 */
export function renderIndexMarkdown(
  filled: BriefRow[],
  records: RecordSummary[],
  audience: BriefAudience,
): string {
  const visible = BRIEF_SECTIONS.filter((s) => audience === "admin" || s.audience === "member");
  const byId = new Map(filled.map((r) => [r.section, r]));
  const lines: string[] = ["# What is known about this village", ""];

  const blanks: string[] = [];
  lines.push("## The brief", "");
  for (const spec of visible) {
    const row = byId.get(spec.id);
    if (!row) {
      blanks.push(spec.id);
      lines.push(`- **${spec.id}** (${spec.title}): not yet written`);
      continue;
    }
    const mark = row.status === "confirmed" ? "confirmed" : "proposed, not yet confirmed";
    lines.push(`- **${spec.id}** (${spec.title}): ${mark}, updated ${row.updatedAt.slice(0, 10)}`);
  }

  if (blanks.length > 0) {
    lines.push(
      "",
      `Still blank: ${blanks.join(", ")}. Ask about one of these when the conversation touches it, one at a time.`,
    );
  }

  if (records.length > 0) {
    lines.push("", "## The record", "");
    for (const r of records) {
      lines.push(`- **${r.section}**: ${r.entries} entr${r.entries === 1 ? "y" : "ies"}${r.recent.length ? `, newest: ${r.recent.join("; ")}` : ""}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ── Reads ────────────────────────────────────────────────────────────────────

function toBrief(r: RowDataPacket): BriefRow {
  return {
    id: String(r.id),
    section: String(r.section),
    title: String(r.title),
    body: String(r.body),
    audience: r.audience === "member" ? "member" : "admin",
    source: String(r.source),
    status: r.status === "confirmed" ? "confirmed" : "proposed",
    confirmedBy: r.confirmed_by ? String(r.confirmed_by) : null,
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
    revision: Number(r.revision),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/**
 * Brief sections this viewer may see.
 *
 * `is_example = 0` on every read that can reach a prompt or a render. Example
 * rows exist so the admin editor is not blank on a fresh fork, and that is the
 * ONLY place they appear: a fixture cited as what this village said about
 * itself is the single thing the brain must never do.
 */
export async function briefAll(pool: Pool, audience: BriefAudience, includeExamples = false): Promise<BriefRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM village_brief WHERE ${includeExamples ? "1 = 1" : "is_example = 0"} ` +
      (audience === "admin" ? "" : "AND audience = 'member' ") +
      "ORDER BY section",
  );
  return rows.map(toBrief);
}

export async function briefGet(pool: Pool, section: string, audience: BriefAudience): Promise<BriefRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM village_brief WHERE section = ? AND is_example = 0" +
      (audience === "admin" ? "" : " AND audience = 'member'"),
    [section],
  );
  return rows[0] ? toBrief(rows[0]) : null;
}

export async function recordSummaries(pool: Pool): Promise<RecordSummary[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT section, COUNT(*) AS n FROM village_record WHERE is_example = 0 GROUP BY section ORDER BY section",
  );
  const out: RecordSummary[] = [];
  for (const r of rows) {
    const [recent] = await pool.query<RowDataPacket[]>(
      "SELECT title FROM village_record WHERE section = ? AND is_example = 0 ORDER BY occurred_at DESC, created_at DESC LIMIT 3",
      [r.section],
    );
    out.push({
      section: String(r.section),
      entries: Number(r.n),
      recent: recent.map((x) => String(x.title)),
    });
  }
  return out;
}

/**
 * The cache key for every render. Revision sum plus row counts, because MySQL
 * timestamps are second-granular and two writes inside one second would share
 * an `updated_at`.
 */
export async function brainEtag(pool: Pool): Promise<string> {
  const [[b]] = await pool.query<RowDataPacket[][]>(
    "SELECT COALESCE(SUM(revision), 0) AS revs, COUNT(*) AS n FROM village_brief WHERE is_example = 0",
  );
  const [[r]] = await pool.query<RowDataPacket[][]>(
    "SELECT COUNT(*) AS n FROM village_record WHERE is_example = 0",
  );
  return `W/"brain-${(b as any).revs}-${(b as any).n}-${(r as any).n}"`;
}

/** The index, capped for the prompt. 400 tokens is the always-present budget. */
export async function briefIndexForPrompt(pool: Pool, maxTokens = 400): Promise<string> {
  const [filled, records] = await Promise.all([briefAll(pool, "admin"), recordSummaries(pool)]);
  return capMarkdown(renderIndexMarkdown(filled, records, "admin"), maxTokens);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface BriefWrite {
  section: string;
  body: string;
  title?: string;
  audience?: BriefAudience;
  source?: "intake" | "session0" | "conversation" | "admin";
  /** Confirming actor. Present means the row lands confirmed. */
  confirmedBy?: string | null;
}

/**
 * Write a brief section, keeping the previous body.
 *
 * The overwrite and the history row happen in ONE transaction. A brain that
 * loses what it used to believe cannot answer "since when", which is most of
 * what provenance is for.
 */
export async function briefWrite(pool: Pool, input: BriefWrite): Promise<BriefRow> {
  const spec = BRIEF_BY_ID[input.section];
  if (!spec) throw new Error(`unknown brief section: ${input.section}`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existingRows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM village_brief WHERE section = ? FOR UPDATE",
      [input.section],
    );
    const existing = existingRows[0] ? toBrief(existingRows[0]) : null;
    const status = input.confirmedBy ? "confirmed" : "proposed";
    const audience = input.audience ?? spec.audience;
    const title = input.title ?? spec.title;

    if (existing) {
      await conn.query(
        "INSERT INTO village_brief_revisions (id, brief_id, revision, body, source, replaced_by) VALUES (?,?,?,?,?,?)",
        [`rev-${randomUUID().slice(0, 12)}`, existing.id, existing.revision, existing.body, existing.source, input.confirmedBy ?? null],
      );
      await conn.query(
        "UPDATE village_brief SET title = ?, body = ?, audience = ?, source = ?, status = ?, " +
          "confirmed_by = ?, confirmed_at = ?, revision = revision + 1 WHERE id = ?",
        [
          title, input.body, audience, input.source ?? "admin", status,
          input.confirmedBy ?? null, input.confirmedBy ? new Date() : null, existing.id,
        ],
      );
    } else {
      await conn.query(
        "INSERT INTO village_brief (id, section, title, body, audience, source, status, confirmed_by, confirmed_at) " +
          "VALUES (?,?,?,?,?,?,?,?,?)",
        [
          `brief-${input.section}`, input.section, title, input.body, audience,
          input.source ?? "admin", status, input.confirmedBy ?? null, input.confirmedBy ? new Date() : null,
        ],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  const written = await briefGet(pool, input.section, "admin");
  if (!written) throw new Error(`brief section ${input.section} vanished after write`);
  return written;
}

export interface RecordAppend {
  section: string;
  title: string;
  body: string;
  source: RecordSource;
  /** Id of the row this was derived from. With `source`, the idempotency key. */
  sourceRef?: string | null;
  period?: string | null;
  occurredAt?: Date | string | null;
}

/**
 * Append a record entry, once.
 *
 * Derivation runs on a schedule over tables that already exist, so it WILL see
 * the same decision again. `(source, source_ref)` is the idempotency key, and a
 * repeat is a no-op instead of a second copy of the village's history.
 *
 * Derived entries land `proposed`. They carry member-written text into a
 * village shelf, and only a human act moves anything to `confirmed`.
 */
export async function recordAppend(pool: Pool, input: RecordAppend): Promise<{ created: boolean; slug: string }> {
  if (input.sourceRef) {
    const [dupe] = await pool.query<RowDataPacket[]>(
      "SELECT slug FROM village_record WHERE source = ? AND source_ref = ? LIMIT 1",
      [input.source, input.sourceRef],
    );
    if (dupe[0]) return { created: false, slug: String(dupe[0].slug) };
  }
  const when = input.occurredAt ? new Date(input.occurredAt) : null;
  const base = `${when ? `${when.toISOString().slice(0, 10)}-` : ""}${input.source}-${slugify(input.title)}`;
  const slug = slugify(base).slice(0, 110);
  try {
    await pool.query(
      "INSERT INTO village_record (id, section, slug, title, body, period, occurred_at, source, source_ref) " +
        "VALUES (?,?,?,?,?,?,?,?,?)",
      [
        `rec-${randomUUID().slice(0, 12)}`, input.section, slug, input.title.slice(0, 200), input.body,
        input.period ?? null, when, input.source, input.sourceRef ?? null,
      ],
    );
    return { created: true, slug };
  } catch (e: any) {
    // A slug collision without a source_ref means the same title on the same
    // day from the same source. That is the entry we already have.
    if (e?.code === "ER_DUP_ENTRY") return { created: false, slug };
    throw e;
  }
}
