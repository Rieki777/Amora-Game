/**
 * The S12 stores: MySQL-authoritative, memory-cached, write-through.
 *
 * The remaining domains (submissions, milestones, roles, config documents…)
 * are read on hot synchronous paths — computeStage reads training modules and
 * submissions, getBrand() runs inside mergedConfig() on nearly every request —
 * and they change rarely, through a handful of admin screens. Making every
 * read async would re-open the cascade S6 and S10 paid for, for domains where
 * a cache can simply BE the read path:
 *
 *   - boot loads each table/document into memory (load(), fail-loud);
 *   - reads are synchronous against the cache — same semantics the file
 *     reads always had, minus the disk;
 *   - writes are ASYNC and RENAMED (saveAll→replaceAll, set→put) so the
 *     compiler forces every write site through the conversion — a floating
 *     promise on a same-named method is exactly the silent-bypass trap the
 *     S6 auth rename existed to prevent;
 *   - every write updates MySQL first, then the cache; a failed write throws
 *     into the route (500) and the cache never lies about what persisted.
 *
 * One process per deployment (Railway) is what makes the cache sound. If that
 * ever changes, these stores are the seam where cache invalidation lands.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export type Row = Record<string, any>;

// ─── Collections ─────────────────────────────────────────────────────────────

export interface ColumnSpec {
  /** camelCase field on the record. */
  js: string;
  /** snake_case column in the table. */
  db: string;
  kind?: "json" | "bool" | "int" | "time" | "text";
  /** For NOT-NULL time columns: an absent value writes now() instead of NULL. */
  defaultNow?: boolean;
}

export interface CollectionSpec {
  table: string;
  columns: ColumnSpec[];
  /** ORDER BY for load(); defaults to the first column. */
  orderBy?: string;
}

export interface DbCollection<T extends Row = Row> {
  load(): Promise<void>;
  /** Synchronous, from cache. A fresh array each call; mutate freely, then replaceAll. */
  all(): T[];
  /** Replace the whole collection, transactionally: DELETE + INSERT. */
  replaceAll(rows: T[]): Promise<void>;
  /** Append one row. */
  insert(row: T): Promise<T>;
}

function fromDb(spec: ColumnSpec, v: any): any {
  if (v == null) return spec.kind === "json" ? undefined : v;
  switch (spec.kind) {
    case "json":
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return undefined; }
      }
      return v;
    case "bool":
      return !!v;
    case "int":
      return Number(v);
    case "time":
      return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
    default:
      return v;
  }
}

function toDb(spec: ColumnSpec, v: any): any {
  // An absent boolean is false, not NULL. Every tinyint(1) in this schema is
  // NOT NULL, so writing NULL for a field the caller simply did not set turns
  // "I have no opinion" into a constraint violation (or a silent 0 outside
  // strict mode). Two-valued columns get the two-valued answer.
  if (v == null && spec.kind === "bool") return 0;
  if (v == null) return spec.defaultNow ? new Date() : null;
  switch (spec.kind) {
    case "json":
      return JSON.stringify(v);
    case "bool":
      return v ? 1 : 0;
    case "int":
      return Number(v) || 0;
    case "time": {
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    default:
      return v;
  }
}

export function dbCollection<T extends Row = Row>(pool: Pool, spec: CollectionSpec): DbCollection<T> {
  let cache: T[] = [];
  const colList = spec.columns.map((c) => `\`${c.db}\``).join(", ");
  const placeholders = spec.columns.map(() => "?").join(",");

  const rowToItem = (r: RowDataPacket): T => {
    const item: Row = {};
    for (const c of spec.columns) {
      const v = fromDb(c, r[c.db]);
      if (v !== undefined) item[c.js] = v;
    }
    return item as T;
  };

  const itemParams = (item: T) => spec.columns.map((c) => toDb(c, item[c.js]));

  async function insertOn(conn: Pool | PoolConnection, item: T) {
    await conn.query(`INSERT INTO \`${spec.table}\` (${colList}) VALUES (${placeholders})`, itemParams(item));
  }

  return {
    async load() {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ${colList} FROM \`${spec.table}\` ORDER BY ${spec.orderBy ?? `\`${spec.columns[0].db}\``}`,
      );
      cache = rows.map(rowToItem);
    },

    all() {
      return [...cache];
    },

    async replaceAll(rows) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM \`${spec.table}\``);
        for (const r of rows) await insertOn(conn, r);
        await conn.commit();
        cache = [...rows];
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async insert(row) {
      await insertOn(pool, row);
      cache.push(row);
      return row;
    },
  };
}

// ─── Documents (app_config key/value, JSON column) ──────────────────────────

export interface DbDocument<T extends Row = Row> {
  load(): Promise<void>;
  /** Synchronous, from cache; the fallback when no row exists. */
  get(): T;
  /** True when a row actually exists (get() alone cannot distinguish the fallback). */
  exists(): boolean;
  /** Replace wholesale — how the admin UI edits these. */
  put(doc: T): Promise<T>;
}

export function dbDocument<T extends Row = Row>(pool: Pool, key: string, fallback: T): DbDocument<T> {
  let cache: T | null = null;

  return {
    async load() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT value FROM app_config WHERE config_key = ?",
        [key],
      );
      if (!rows[0]) {
        cache = null;
        return;
      }
      let v = rows[0].value;
      if (typeof v === "string") {
        try { v = JSON.parse(v); } catch { v = null; }
      }
      cache = v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
    },

    get() {
      return cache ?? fallback;
    },

    exists() {
      return cache !== null;
    },

    async put(doc) {
      await pool.query(
        "INSERT INTO app_config (config_key, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
        [key, JSON.stringify(doc)],
      );
      cache = doc;
      return doc;
    },
  };
}

/**
 * The two column coercers, for tests only.
 *
 * They decide what value the writer HANDS the database, which is where the
 * `replaceAll` re-default trap lives, and that decision happens before any
 * connection is involved. Exposing them lets the round trip be tested without
 * a MySQL instance; nothing in the app should import this.
 */
export const __testing = { toDb, fromDb };
