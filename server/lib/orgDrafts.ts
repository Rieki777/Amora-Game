/**
 * A reorganisation you can read before it is true (0056).
 *
 * A village's org chart is edited live, one field at a time, by whoever has
 * the admin page open. There is no moment where the whole shape of a proposed
 * change is visible, and no way to say "this is what we would become" without
 * becoming it first. A draft is that moment.
 *
 * ── WHAT IS DRAFTABLE, AND WHY THE LINE IS THERE ─────────────────────────
 *
 * Seats, their circle assignment, and their holders. NOT circles themselves.
 *
 * That is a real constraint, not an oversight. `circles` is written through a
 * dbCollection whose `replaceAll` opens its OWN transaction on its OWN
 * connection and swaps the in-memory cache after committing. So a circle write
 * cannot join this transaction and cannot be undone once it has returned; a
 * draft that claimed to apply both planes atomically would be lying about the
 * half it cannot roll back. `org_roles` and `org_role_assignments` are raw SQL
 * with no cache, so they genuinely commit together.
 *
 * Moving a seat BETWEEN circles is `org_roles.circle_id` and is fully covered.
 * What is not is creating or deleting the circles themselves.
 *
 * ── APPLY IS ALL OR NOTHING ──────────────────────────────────────────────
 *
 * One connection, one transaction, every change or none. A half-applied
 * reorganisation is worse than none at all: the village would be left in a
 * shape nobody chose and nobody can describe.
 *
 * ── REVERT READS `before_json`, CAPTURED AT APPLY TIME ───────────────────
 *
 * Not at draft time. Two weeks can pass between writing a draft and consenting
 * to it, and undoing to what somebody saw a fortnight ago would silently throw
 * away everything that happened in between. The change journal cannot serve
 * this purpose either: `recordEvent` swallows its own errors by design, so it
 * is lossy, and an archive may not be.
 */
import type { Pool, PoolConnection } from "mysql2/promise";

export type DraftOp = "create_seat" | "update_seat" | "rest_seat" | "seat_holder" | "end_holding";
export type DraftStatus = "open" | "published" | "reverted" | "withdrawn";

export interface DraftChange {
  id: string;
  draftId: string;
  op: DraftOp;
  orgRoleId: string;
  payload: any;
  beforeJson: any;
  order: number;
}

export interface Draft {
  id: string;
  title: string;
  rationale: string | null;
  status: DraftStatus;
  threadId: string | null;
  createdBy: string | null;
  publishedAt: string | null;
  revertedAt: string | null;
  changes: DraftChange[];
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

function asJson(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

function rowToChange(r: any): DraftChange {
  return {
    id: r.id, draftId: r.draft_id, op: r.op, orgRoleId: r.org_role_id,
    payload: asJson(r.payload), beforeJson: asJson(r.before_json),
    order: Number(r.sort_order ?? 0),
  };
}

export async function listDrafts(pool: Pool): Promise<Draft[]> {
  const [drafts]: any = await pool.query("SELECT * FROM org_drafts ORDER BY created_at DESC");
  const [changes]: any = await pool.query("SELECT * FROM org_draft_changes ORDER BY sort_order, id");
  const byDraft = new Map<string, DraftChange[]>();
  for (const c of changes as any[]) {
    byDraft.set(c.draft_id, [...(byDraft.get(c.draft_id) ?? []), rowToChange(c)]);
  }
  return (drafts as any[]).map((d) => ({
    id: d.id, title: d.title, rationale: d.rationale ?? null,
    status: d.status, threadId: d.thread_id ?? null, createdBy: d.created_by ?? null,
    publishedAt: d.published_at ? new Date(d.published_at).toISOString() : null,
    revertedAt: d.reverted_at ? new Date(d.reverted_at).toISOString() : null,
    changes: byDraft.get(d.id) ?? [],
  }));
}

export async function createDraft(
  pool: Pool,
  body: { title: string; rationale?: string | null; threadId?: string | null; createdBy?: string | null },
): Promise<string> {
  const id = newId("draft");
  await pool.query(
    "INSERT INTO org_drafts (id, title, rationale, thread_id, created_by) VALUES (?,?,?,?,?)",
    [id, String(body.title || "Untitled reorganisation").slice(0, 200), body.rationale ?? null,
      body.threadId ?? null, body.createdBy ?? null],
  );
  return id;
}

export async function addChange(
  pool: Pool,
  draftId: string,
  body: { op: DraftOp; orgRoleId: string; payload?: any },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [[d]] = await pool.query<any[]>("SELECT status FROM org_drafts WHERE id = ?", [draftId]);
  if (!d) return { ok: false, error: "No such draft" };
  // A published draft is a record of what happened. Editing it would make the
  // revert data describe a change nobody made.
  if (d.status !== "open") return { ok: false, error: `This draft is ${d.status} and can no longer be edited` };
  const [[n]] = await pool.query<any[]>(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM org_draft_changes WHERE draft_id = ?", [draftId],
  );
  const id = newId("dch");
  await pool.query(
    "INSERT INTO org_draft_changes (id, draft_id, op, org_role_id, payload, sort_order) VALUES (?,?,?,?,?,?)",
    [id, draftId, body.op, body.orgRoleId, JSON.stringify(body.payload ?? {}), Number(n?.next ?? 1)],
  );
  return { ok: true, id };
}

export interface PreviewLine {
  changeId: string;
  op: DraftOp;
  orgRoleId: string;
  /** What this does, in the words somebody would use about it. */
  reads: string;
  /** Why it cannot be applied, or null. */
  blocked: string | null;
}

/**
 * What this draft would do, and what refuses.
 *
 * Same shape as the season roll's dry run, which is the existing template for
 * "bulk structural apply" in this codebase: preview everything, refuse the
 * WHOLE thing if any single change is blocked, and never half-apply.
 */
export async function previewDraft(pool: Pool, draftId: string): Promise<{ lines: PreviewLine[]; blocked: number }> {
  const drafts = await listDrafts(pool);
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) return { lines: [], blocked: 0 };

  const [roles]: any = await pool.query("SELECT id, name, is_example, active FROM org_roles");
  const byId = new Map((roles as any[]).map((r) => [String(r.id), r]));
  const [circles]: any = await pool.query("SELECT id FROM circles WHERE is_example = 0");
  const circleIds = new Set((circles as any[]).map((c) => String(c.id)));
  // Seats this draft creates count as existing for the changes after them, so
  // a draft can create a seat and then put somebody in it.
  const willExist = new Set(draft.changes.filter((c) => c.op === "create_seat").map((c) => c.orgRoleId));

  const lines: PreviewLine[] = [];
  for (const c of draft.changes) {
    const existing = byId.get(c.orgRoleId);
    const name = existing?.name ?? c.payload?.name ?? c.orgRoleId;
    let blocked: string | null = null;
    let reads = "";

    if (c.op === "create_seat") {
      reads = `Create the seat "${c.payload?.name ?? c.orgRoleId}"`;
      if (existing) blocked = "A seat with that id already exists";
      if (c.payload?.circleId && !circleIds.has(String(c.payload.circleId))) {
        blocked = "That circle does not exist. A draft cannot create circles";
      }
    } else {
      if (!existing && !willExist.has(c.orgRoleId)) blocked = "That seat no longer exists";
      // Standing examples are inert everywhere else and must be here too, or a
      // draft becomes the one door that edits demo data into the real chart.
      else if (existing?.is_example) blocked = "That is a standing example seat";

      if (c.op === "update_seat") reads = `Edit ${name}`;
      if (c.op === "rest_seat") reads = `Rest ${name}, so it stops appearing on the chart`;
      if (c.op === "seat_holder") reads = `Put ${c.payload?.displayName ?? "a member"} in ${name}`;
      if (c.op === "end_holding") reads = `End a holding on ${name}`;
    }
    lines.push({ changeId: c.id, op: c.op, orgRoleId: c.orgRoleId, reads, blocked });
  }
  return { lines, blocked: lines.filter((l) => l.blocked).length };
}

/**
 * Apply every change, or none.
 *
 * One connection, one transaction. `before_json` is captured HERE, inside it,
 * so what a revert undoes is what was actually there at the moment of publish.
 */
export async function publishDraft(
  pool: Pool,
  draftId: string,
  publishedBy: string | null,
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  const preview = await previewDraft(pool, draftId);
  if (!preview.lines.length) return { ok: false, error: "This draft has no changes in it" };
  if (preview.blocked > 0) {
    const first = preview.lines.find((l) => l.blocked);
    return { ok: false, error: `${preview.blocked} change(s) cannot be applied. First: ${first?.blocked}` };
  }

  const drafts = await listDrafts(pool);
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) return { ok: false, error: "No such draft" };
  if (draft.status !== "open") return { ok: false, error: `This draft is already ${draft.status}` };

  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const c of draft.changes) {
      const before = await captureBefore(conn, c);
      await conn.query("UPDATE org_draft_changes SET before_json = ? WHERE id = ?", [JSON.stringify(before), c.id]);
      await applyChange(conn, c);
    }
    await conn.query(
      "UPDATE org_drafts SET status = 'published', published_by = ?, published_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'",
      [publishedBy, draftId],
    );
    await conn.commit();
    return { ok: true, applied: draft.changes.length };
  } catch (e: any) {
    await conn.rollback();
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    conn.release();
  }
}

async function captureBefore(conn: PoolConnection, c: DraftChange): Promise<any> {
  if (c.op === "create_seat") return null;
  if (c.op === "seat_holder") return null;
  if (c.op === "end_holding") {
    const [[row]] = await conn.query<any[]>(
      "SELECT id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, note, season_id, term_ends_at FROM org_role_assignments WHERE id = ?",
      [String(c.payload?.assignmentId ?? "")],
    );
    return row ?? null;
  }
  const [[row]] = await conn.query<any[]>(
    "SELECT id, circle_id, name, aim, domain, accountabilities, why_it_matters, seats, criticality, active, recruiting FROM org_roles WHERE id = ?",
    [c.orgRoleId],
  );
  return row ?? null;
}

/** Column names are a fixed map, never interpolated from a payload key. */
const SEAT_FIELDS: Record<string, string> = {
  name: "name", circleId: "circle_id", aim: "aim", domain: "domain",
  whyItMatters: "why_it_matters", seats: "seats", criticality: "criticality",
  recruiting: "recruiting",
};

async function applyChange(conn: PoolConnection, c: DraftChange): Promise<void> {
  const p = c.payload ?? {};
  if (c.op === "create_seat") {
    await conn.query(
      "INSERT INTO org_roles (id, name, circle_id, aim, domain, accountabilities, seats) VALUES (?,?,?,?,?,?,?)",
      [c.orgRoleId, String(p.name ?? c.orgRoleId), p.circleId ?? null, p.aim ?? null, p.domain ?? null,
        JSON.stringify(Array.isArray(p.accountabilities) ? p.accountabilities : []), Number(p.seats ?? 1)],
    );
    return;
  }
  if (c.op === "rest_seat") {
    await conn.query("UPDATE org_roles SET active = 0 WHERE id = ?", [c.orgRoleId]);
    return;
  }
  if (c.op === "seat_holder") {
    const holderKey = p.userId ? String(p.userId) : `doc:${String(p.displayName ?? "unnamed").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await conn.query(
      `INSERT INTO org_role_assignments (id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, season_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [newId("orgasg"), c.orgRoleId, p.userId ? "member" : "documented", p.userId ?? null,
        p.displayName ?? null, holderKey, p.focus ?? null, p.seasonId ?? null],
    );
    return;
  }
  if (c.op === "end_holding") {
    await conn.query(
      "UPDATE org_role_assignments SET ended_at = CURRENT_TIMESTAMP, ended_reason = ? WHERE id = ? AND ended_at IS NULL",
      [String(p.reason ?? "reorganisation").slice(0, 200), String(p.assignmentId ?? "")],
    );
    return;
  }
  // update_seat: only the fields the draft names, mapped through a fixed
  // table. A payload key is never used as a column name.
  const sets: string[] = [];
  const args: any[] = [];
  for (const [key, col] of Object.entries(SEAT_FIELDS)) {
    if (p[key] === undefined) continue;
    sets.push(`\`${col}\` = ?`);
    args.push(p[key]);
  }
  if (Array.isArray(p.accountabilities)) {
    sets.push("`accountabilities` = ?");
    args.push(JSON.stringify(p.accountabilities));
  }
  if (!sets.length) return;
  args.push(c.orgRoleId);
  await conn.query(`UPDATE org_roles SET ${sets.join(", ")} WHERE id = ?`, args);
}

/**
 * Put back what was there, from `before_json`.
 *
 * In REVERSE order, because the changes were applied forwards and a draft that
 * creates a seat and then seats somebody in it has to be undone the other way
 * round or the seat is gone before its holder is.
 *
 * A revert is honest about what it cannot do: a seat created by the draft is
 * RESTED rather than deleted, because deleting it would take its journal and
 * any holding history with it, and history is the thing this whole model is
 * for.
 */
export async function revertDraft(
  pool: Pool,
  draftId: string,
): Promise<{ ok: true; reverted: number } | { ok: false; error: string }> {
  const drafts = await listDrafts(pool);
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) return { ok: false, error: "No such draft" };
  if (draft.status !== "published") return { ok: false, error: "Only a published draft can be reverted" };

  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const c of [...draft.changes].reverse()) {
      if (c.op === "create_seat") {
        await conn.query("UPDATE org_roles SET active = 0 WHERE id = ?", [c.orgRoleId]);
      } else if (c.op === "seat_holder") {
        await conn.query(
          "UPDATE org_role_assignments SET ended_at = CURRENT_TIMESTAMP, ended_reason = 'draft reverted' WHERE org_role_id = ? AND ended_at IS NULL AND holder_key = ?",
          [c.orgRoleId, c.payload?.userId ? String(c.payload.userId)
            : `doc:${String(c.payload?.displayName ?? "unnamed").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`],
        );
      } else if (c.op === "end_holding" && c.beforeJson) {
        const b = c.beforeJson;
        // A NEW row, not a resurrection of the old id. `active_holder_key` is
        // a generated column under a unique index, and the ended row still
        // holds the seat's history; clearing its ended_at would rewrite the
        // past to look as though the person never left.
        await conn.query(
          `INSERT INTO org_role_assignments (id, org_role_id, holder_kind, user_id, display_name, holder_key, focus, note, season_id, term_ends_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [newId("orgasg"), b.org_role_id, b.holder_kind, b.user_id, b.display_name, b.holder_key,
            b.focus, b.note ?? null, b.season_id, b.term_ends_at],
        );
      } else if (c.beforeJson) {
        const b = c.beforeJson;
        await conn.query(
          `UPDATE org_roles SET circle_id = ?, name = ?, aim = ?, domain = ?, accountabilities = ?,
             why_it_matters = ?, seats = ?, criticality = ?, active = ?, recruiting = ? WHERE id = ?`,
          [b.circle_id, b.name, b.aim, b.domain,
            typeof b.accountabilities === "string" ? b.accountabilities : JSON.stringify(b.accountabilities ?? []),
            b.why_it_matters, b.seats, b.criticality, b.active, b.recruiting, c.orgRoleId],
        );
      }
    }
    await conn.query(
      "UPDATE org_drafts SET status = 'reverted', reverted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'published'",
      [draftId],
    );
    await conn.commit();
    return { ok: true, reverted: draft.changes.length };
  } catch (e: any) {
    await conn.rollback();
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    conn.release();
  }
}
