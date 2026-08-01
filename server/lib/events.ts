/**
 * The event spine (S11): recordEvent() is the ONE way anything lands in the
 * village's history — the public Pulse and the admin audit trail are the same
 * table, split by audience. Every row can carry WHO (actorUserId) and WHAT it
 * was about (entityType/entityRef), which is what the old activity log lost
 * with every line it wrote.
 *
 * Recording never throws into the caller: an event is a trace of a mutation
 * that already happened, and failing the mutation because its trace failed
 * would invert their importance. Failures are logged loudly instead.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface EventInput {
  kind: string;
  text: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityRef?: string | null;
  audience?: "public" | "admin";
}

export interface EventRow {
  id: string;
  kind: string;
  text: string;
  actorUserId: string | null;
  entityType: string | null;
  entityRef: string | null;
  audience: "public" | "admin";
  at: string;
}

export async function recordEvent(pool: Pool, e: EventInput): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO health_events (id, kind, text, actor_user_id, entity_type, entity_ref, audience) VALUES (?,?,?,?,?,?,?)",
      [
        `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        e.kind,
        e.text,
        e.actorUserId ?? null,
        e.entityType ?? null,
        e.entityRef ?? null,
        e.audience ?? "public",
      ],
    );
  } catch (err) {
    console.error("[events] recordEvent failed (mutation unaffected)", err);
  }
}

function rowToEvent(r: RowDataPacket): EventRow {
  return {
    id: String(r.id),
    kind: String(r.kind),
    text: String(r.text),
    actorUserId: r.actor_user_id ?? null,
    entityType: r.entity_type ?? null,
    entityRef: r.entity_ref ?? null,
    audience: r.audience === "admin" ? "admin" : "public",
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
  };
}

/** Newest first. The Village Pulse reads audience='public'. */
export async function recentEvents(
  pool: Pool,
  audience: "public" | "admin",
  limit = 30,
): Promise<EventRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    // Example events are illustrative, not history. This spine feeds the
    // public Pulse and the feed's "village happenings", so an unfiltered read
    // presents seeded copy as things that actually happened here.
    "SELECT id, kind, text, actor_user_id, entity_type, entity_ref, audience, at " +
      "FROM health_events WHERE audience = ? AND is_example = 0 ORDER BY at DESC, id DESC LIMIT ?",
    [audience, Math.max(1, Math.min(500, limit))],
  );
  return rows.map(rowToEvent);
}

/** Admin removal of a single pulse line (e.g. a test account's join). */
export async function deleteEvent(pool: Pool, id: string): Promise<EventRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, kind, text, actor_user_id, entity_type, entity_ref, audience, at FROM health_events WHERE id = ?",
    [id],
  );
  if (!rows[0]) return null;
  await pool.query("DELETE FROM health_events WHERE id = ?", [id]);
  return rowToEvent(rows[0]);
}
