/**
 * WHICH FILES ON THE VOLUME THE DATABASE STILL NAMES.
 *
 * ── WHY THIS READS EVERY COLUMN AND NOT A LIST OF THEM ───────────────────
 *
 * The first design of this sweep carried a hand-written table of reference
 * columns, and a verifier killed it with one sequence: the investor vault
 * stamps a filename out of the uploaded document's own name, the
 * canonicalizer could not see the vault at all, and thirty-one days after
 * upload the sweep would have unlinked a live cap table while its row still
 * pointed at it. That refutation is written up in
 * `docs/DESIGN_TOKENS_SPEC.md` amendment A1, and it is not really about the
 * vault. It is about the shape: a hand-kept list of reference columns is a
 * promise that every future column gets added to it, and nothing checks that
 * promise. The next door builds, somebody stores a path in a new column, and
 * the sweep quietly reclassifies live files as garbage.
 *
 * So there is no list. This reads `information_schema` for every text-shaped
 * column of every base table in the LIVE schema and scans all of them. A
 * table added by a migration tomorrow is covered the day it exists, and the
 * count of what was read comes back with the answer so a reader can see the
 * scan was real.
 *
 * ── FROM THE DATABASE, NEVER FROM A CACHE ────────────────────────────────
 *
 * `dbCollection.replaceAll` keeps unmapped fields in its in-memory cache that
 * were never written to MySQL, and `load()` rebuilds strictly from mapped
 * columns at boot. The referenced set can legitimately differ before and
 * after a redeploy, and only the database is truth. That is the other reason
 * these queries are here: clause 13 puts raw SQL in `server/repos`, and one
 * file holding every read is the only way the sweep and the doors can be
 * shown to agree about which files are live.
 *
 * ── WHAT AN UNTRUSTED STRING CAN DO FROM HERE, WHICH IS NOTHING ──────────
 *
 * `POST /api/forms/submit` is public and stores an arbitrary `data` JSON, so
 * a stranger can put any filename they like into a column this scan reads.
 * The only thing that does is make a file look REFERENCED, which keeps it.
 * Every attacker-supplied string in this scan pushes toward keeping a file
 * and none of them can push toward removing one, which is the direction that
 * makes this safe to run without authenticating the contents of the database.
 *
 * ── FAIL CLOSED ─────────────────────────────────────────────────────────
 *
 * Any column that cannot be read, and any column with more rows than the cap,
 * marks the whole scan INCOMPLETE. An incomplete scan cannot prove a negative
 * and the negative is the entire safety argument, so the caller offers
 * nothing for removal and says why.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { indexByStamp, namesReferencedIn } from "../lib/uploadsSweep";

/**
 * Column types that can hold a filename.
 *
 * The blob family is included because a filename stored as bytes is still a
 * filename, and excluding it would be a bet that no fork ever does that.
 * MariaDB reports a JSON column as `longtext`, which this list covers either
 * way.
 */
const TEXT_TYPES = [
  "char", "varchar", "tinytext", "text", "mediumtext", "longtext",
  "json", "enum", "set",
  "binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob",
];

/**
 * The most rows one column may hold before this stops claiming to have read
 * it. A village that is genuinely past this has outgrown a synchronous sweep
 * and should hear that instead of getting a confident answer over a partial
 * read.
 */
const MAX_ROWS_PER_COLUMN = 200_000;

export interface ReferenceScan {
  /** Filenames from `candidates` that something in the database names. */
  referenced: Set<string>;
  complete: boolean;
  incompleteReason: string | null;
  tables: number;
  columns: number;
  values: number;
}

/** Backtick-quote an identifier that came out of `information_schema`. */
function quoteId(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

/**
 * A stored value as a string the scan can search.
 *
 * mysql2 parses a JSON column into an object, so `String(v)` on one would
 * produce `[object Object]` and the scan would read nothing at all in the
 * single most reference-dense column on the platform (`app_config.value`
 * holds every brand image URL there is). Buffers come back from the blob
 * family. Both are converted here and nowhere else.
 */
function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}

/**
 * Ask the database which of these filenames it still names.
 *
 * `candidates` is the set of stamped filenames actually sitting on the
 * volume. Nothing else is ever looked for, so the answer is about real files
 * and the work is bounded by the volume rather than by the schema.
 */
export async function scanUploadReferences(pool: Pool, candidates: string[]): Promise<ReferenceScan> {
  const referenced = new Set<string>();
  const scan: ReferenceScan = { referenced, complete: true, incompleteReason: null, tables: 0, columns: 0, values: 0 };
  if (!candidates.length) return scan;

  const byStamp = indexByStamp(candidates);
  if (!byStamp.size) return scan;

  let cols: RowDataPacket[];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT c.TABLE_NAME AS t, c.COLUMN_NAME AS c FROM information_schema.COLUMNS c " +
        "JOIN information_schema.TABLES tb ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME " +
        "WHERE c.TABLE_SCHEMA = DATABASE() AND tb.TABLE_TYPE = 'BASE TABLE' " +
        `AND c.DATA_TYPE IN (${TEXT_TYPES.map(() => "?").join(",")}) ` +
        "ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION",
      TEXT_TYPES,
    );
    cols = rows;
  } catch (err) {
    scan.complete = false;
    scan.incompleteReason = `The list of columns could not be read: ${(err as Error)?.message ?? "unknown reason"}`;
    return scan;
  }

  const tables = new Set<string>();
  for (const col of cols) {
    const table = String(col.t);
    const column = String(col.c);
    tables.add(table);
    scan.columns += 1;
    let rows: RowDataPacket[];
    try {
      const [r] = await pool.query<RowDataPacket[]>(
        `SELECT ${quoteId(column)} AS v FROM ${quoteId(table)} WHERE ${quoteId(column)} IS NOT NULL LIMIT ?`,
        [MAX_ROWS_PER_COLUMN + 1],
      );
      rows = r;
    } catch (err) {
      scan.complete = false;
      scan.incompleteReason = `${table}.${column} could not be read: ${(err as Error)?.message ?? "unknown reason"}`;
      continue;
    }
    if (rows.length > MAX_ROWS_PER_COLUMN) {
      scan.complete = false;
      scan.incompleteReason =
        `${table}.${column} holds more than ${MAX_ROWS_PER_COLUMN} values, which is more than this scan reads in one pass.`;
      rows = rows.slice(0, MAX_ROWS_PER_COLUMN);
    }
    for (const row of rows) {
      const text = asText(row.v);
      if (!text) continue;
      scan.values += 1;
      for (const hit of namesReferencedIn(text, byStamp)) referenced.add(hit);
    }
  }
  scan.tables = tables.size;
  return scan;
}
