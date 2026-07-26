/**
 * Generic repositories for the two shapes the rest of the data takes.
 *
 * `users` earned a bespoke repository because member records are edited one at a
 * time by many handlers and that is where the read-modify-write race lives.
 * Everything else is one of two shapes, and ten near-identical hand-written
 * modules would be ten places to fix the same bug:
 *
 *   COLLECTIONS  - arrays of records with an `id`: submissions, quest claims,
 *                  gratitude entries, quests, activity, milestones, roles, cycles.
 *   DOCUMENTS    - one config object edited wholesale by the admin UI: content,
 *                  faqs, brand, settings, season, work-with-us, journey state.
 *
 * Both exist for the same reason as the users repository: ONE seam per domain, so
 * the JSON-to-MySQL swap happens in this file rather than at 130 call sites. The
 * document repository is also the reason `app_config` is a key-value table with a
 * JSON column rather than shredded into columns (see server/db/schema.ts): these
 * are documents in the app's own mental model, not just in its storage.
 *
 * Synchronous while the backing store is a file, for the same reason the users
 * repository is: converting to async cascades through every sync helper and route,
 * and that belongs in its own change with the loop test as the gate.
 */
import fs from "fs";

export type Row = Record<string, any>;

// ─── Collections ─────────────────────────────────────────────────────────────

export interface CollectionRepo<T extends Row = Row> {
  all(): T[];
  byId(id: string): T | null;
  find(pred: (row: T) => boolean): T | null;
  filter(pred: (row: T) => boolean): T[];
  count(): number;
  add(row: T): T;
  /** Read, mutate the matching row, write. The narrow path; prefer it. */
  update(id: string, mutate: (row: T) => void): T | null;
  remove(id: string): T | null;
  /** Replace the whole collection. Used by admin screens that reorder or bulk-edit. */
  saveAll(rows: T[]): void;
  /**
   * Append and trim to the newest `max` entries, for capped logs like the Village
   * Pulse. Kept here rather than at the call site so the cap cannot drift between
   * writers.
   */
  appendCapped(row: T, max: number): T;
}

function loadArray<T extends Row>(file: string): T[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Matches readJson: a corrupt file reads as empty rather than throwing.
    return [];
  }
}

function saveArray<T extends Row>(file: string, rows: T[]) {
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

export function collectionRepo<T extends Row = Row>(file: string): CollectionRepo<T> {
  return {
    all() {
      return loadArray<T>(file);
    },
    byId(id) {
      return loadArray<T>(file).find((r) => r.id === id) ?? null;
    },
    find(pred) {
      return loadArray<T>(file).find(pred) ?? null;
    },
    filter(pred) {
      return loadArray<T>(file).filter(pred);
    },
    count() {
      return loadArray<T>(file).length;
    },
    add(row) {
      const rows = loadArray<T>(file);
      rows.push(row);
      saveArray(file, rows);
      return row;
    },
    update(id, mutate) {
      const rows = loadArray<T>(file);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      mutate(rows[idx]);
      saveArray(file, rows);
      return rows[idx];
    },
    remove(id) {
      const rows = loadArray<T>(file);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      const [removed] = rows.splice(idx, 1);
      saveArray(file, rows);
      return removed;
    },
    saveAll(rows) {
      saveArray(file, rows);
    },
    appendCapped(row, max) {
      const rows = loadArray<T>(file);
      rows.push(row);
      saveArray(file, rows.slice(-max));
      return row;
    },
  };
}

// ─── Documents ───────────────────────────────────────────────────────────────

export interface DocumentRepo<T extends Row = Row> {
  /** The document, or the fallback when the file is absent or corrupt. */
  get(): T;
  /** Replace it wholesale, which is how the admin UI edits these. */
  set(doc: T): T;
  /** Shallow-merge a patch, for endpoints that update one section. */
  merge(patch: Partial<T>): T;
}

export function documentRepo<T extends Row = Row>(file: string, fallback: T): DocumentRepo<T> {
  const load = (): T => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
      return fallback;
    } catch {
      return fallback;
    }
  };
  return {
    get: load,
    set(doc) {
      fs.writeFileSync(file, JSON.stringify(doc, null, 2));
      return doc;
    },
    merge(patch) {
      const next = { ...load(), ...patch } as T;
      fs.writeFileSync(file, JSON.stringify(next, null, 2));
      return next;
    },
  };
}
