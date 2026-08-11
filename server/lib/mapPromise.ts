/**
 * Turning the map's name for a thing into a row here, and saying honestly
 * what happened when there is no row.
 *
 * The map posts the only id it has: a scene event id (`e1`) or a quest key
 * (`plant-the-dry-season-beds`). Both live in `map_key` (migration 0062),
 * stored verbatim by the importer. Nothing in this file DERIVES a key.
 *
 * The gating is not here on purpose. The capability gate is one place
 * (`shared/capabilities.ts`) and the promise routes call it exactly like every
 * other route does; a second gate living beside the map would be a second
 * gate. What IS here is the part worth testing on its own: finding the row,
 * and telling a village that never imported a scene apart from one whose
 * gathering was cancelled.
 */
import type { Pool } from "mysql2/promise";
import type { PromiseReason } from "../../shared/mapPromise";

/** Tables the bridge can address. Named, not interpolated from a request. */
export type PromiseTable = "events" | "quests";

/**
 * The row the map means, or null.
 *
 * The table name is a literal from PromiseTable and never a request value, so
 * the interpolation is safe; the key is always a bound parameter.
 */
export async function rowByMapKey(
  pool: Pool,
  table: PromiseTable,
  mapKey: string,
): Promise<any | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM \`${table}\` WHERE map_key = ? LIMIT 1`,
    [mapKey],
  );
  return rows[0] ?? null;
}

/**
 * Why there is no row, in the two words that mean different things.
 *
 * A fresh fork has imported nothing, so EVERY key the map sends misses. Saying
 * "gone" there tells a first-time visitor that a thing was deleted when it was
 * never adopted, which is both wrong and the most common case a new village
 * will hit. The discriminator is whether this village has brought ANY of the
 * scene across: if the table holds no map keys at all, the scene is not here.
 */
export async function missingReason(
  pool: Pool,
  table: PromiseTable,
): Promise<Extract<PromiseReason, "not-here" | "gone">> {
  const [rows] = await pool.query<any[]>(
    `SELECT 1 FROM \`${table}\` WHERE map_key IS NOT NULL LIMIT 1`,
  );
  return rows.length ? "gone" : "not-here";
}

/** How many people have said they are coming. The map's sample number yields. */
export async function goingCountFor(pool: Pool, eventId: string): Promise<number> {
  const [rows] = await pool.query<any[]>(
    "SELECT COUNT(*) n FROM event_rsvps WHERE event_id = ? AND status = 'going'",
    [eventId],
  );
  return Number(rows[0]?.n ?? 0);
}
