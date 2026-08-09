/**
 * Import an exported Living Map scene into the village's own tables.
 *
 *   npx tsx scripts/import-map-scene.ts <amora-scene.json>          import
 *   npx tsx scripts/import-map-scene.ts <file> --dry                report only
 *   npx tsx scripts/import-map-scene.ts <file> --only events,skin   pick blocks
 *
 * The map exports a fifteen-block scene. This imports the blocks that HAVE A
 * HOME in the schema today, and it names every block it skipped and why. A
 * seed importer that quietly drops two thirds of its input is worse than no
 * importer: it reports success, and the founder believes their scene landed.
 *
 * ── WHAT LANDS ───────────────────────────────────────────────────────────
 *   events            -> the `events` table (0059)
 *   skin              -> the `brand` document's `skin` (Make This Yours, step 5)
 *   circles           -> `circles.home_structure_key` (0060)
 *   org_roles         -> `org_roles.structure_key` + `address_source` (0060)
 *   quests            -> `quests.structure_key` + `address_source` (0060)
 *   forum_threads     -> `forum_threads.structure_keys` + `address_source`
 *   vocabulary        -> the `map_vocabulary` document
 *   concierge_queries -> the `concierge_queries` table (0018)
 *
 * ── MATCH, NEVER CREATE ──────────────────────────────────────────────────
 * The scene names things the way a person does, so seats match on role name,
 * quests on title, threads on title, circles on name. Anything with no match
 * here is REPORTED and skipped. Creating a quest because a scene mentioned one
 * would let the map invent village records, and a typo would quietly fork a
 * seat into two.
 *
 * ── THE DOCTRINE ─────────────────────────────────────────────────────────
 * A `creator` or `creator-board` address is never overwritten, by this script
 * or by anything else automated. Only silence (NULL) and a stale
 * `resolver-guess` may be replaced. The rule is one function,
 * `mayOverwriteAddress` in shared/mapAddress.ts, and every write below asks
 * it rather than reimplementing the comparison.
 *
 * The scene's own `pool` value means "no structure was set", so it maps to
 * NULL and never to `creator-board`: silence is not a decision.
 *
 * Idempotent: every write is an upsert or a guarded UPDATE keyed on something
 * derived from the scene, so running twice updates and never duplicates.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { sanitiseMapSkin } from "../shared/mapSkin";
import {
  MAP_VOCABULARY_DOC,
  mayOverwriteAddress,
  normaliseAddressSource,
  sanitiseMapVocabulary,
} from "../shared/mapAddress";

/**
 * Scene versions this importer understands.
 *
 * A refusal, not a warning. The scene's shape IS the contract, and importing
 * an unknown one would write plausible rows from fields that have moved.
 */
const SUPPORTED_VERSIONS = ["v0.6-buildmode"];

const SKIPPED_BLOCKS: Array<{ block: string; reason: string }> = [
  { block: "structures", reason: "no map_structures table; the scene's geometry has no home yet" },
  { block: "zones", reason: "no map_zones table" },
  { block: "flows", reason: "no map_flows table" },
  { block: "edits", reason: "an editing journal for the map itself, not village data" },
  { block: "journeys", reason: "journey steps address to structures, and journeys are not rows here at all" },
  { block: "stays_occupancy", reason: "sample by design until the stays module feeds it; importing lots would fight it" },
  { block: "vital_overrides", reason: "village vitals are computed on read, never stored" },
];

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const file = argv.find((a) => !a.startsWith("--"));
const onlyFlag = argv.indexOf("--only");
const ONLY: string[] | null =
  onlyFlag !== -1 && argv[onlyFlag + 1] ? argv[onlyFlag + 1].split(",").map((s) => s.trim()) : null;

const wanted = (block: string) => (ONLY ? ONLY.includes(block) : true);

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!file) die("Usage: tsx scripts/import-map-scene.ts <scene.json> [--dry] [--only events,skin]");
const scenePath = path.resolve(file);
if (!fs.existsSync(scenePath)) die(`No such file: ${scenePath}`);

let scene: any;
try {
  /*
   * Strip a byte-order mark before parsing. JSON.parse rejects one, and a
   * scene that has been through almost any Windows tool on the way here will
   * have picked one up (PowerShell's `Set-Content -Encoding utf8` adds one
   * unasked). Failing a founder's export over three invisible bytes, with
   * "unexpected token" as the only clue, is a bad afternoon.
   */
  scene = JSON.parse(fs.readFileSync(scenePath, "utf-8").replace(/^﻿/, ""));
} catch (err) {
  die(`That file is not valid JSON: ${(err as Error).message}`);
}

const meta = scene?.map_scene;
if (!meta) die("This does not look like a map scene: no `map_scene` block.");
if (!SUPPORTED_VERSIONS.includes(meta.version)) {
  die(
    `Scene version "${meta.version}" is not supported (this importer knows ${SUPPORTED_VERSIONS.join(", ")}).\n` +
      "  Re-export from a matching map build, or teach this importer the new shape.\n" +
      "  Importing an unknown version would write plausible rows from fields that have moved.",
  );
}

const sceneKey = String(meta.key ?? "scene").replace(/[^a-z0-9-]/gi, "-").slice(0, 24);
/** Deterministic and namespaced, so a re-import updates its own rows. */
const rowId = (kind: string, id: string) =>
  `${kind}-${sceneKey}-${String(id).replace(/[^a-z0-9-]/gi, "-")}`.slice(0, 64);

/**
 * The scene stores `days_until`, not a date, because the map draws a countdown
 * and the prose lives in `when` ("tonight", "next fire"). Reconstructing a
 * timestamp is therefore a REPHRASING, not a recovery: the day is honest and
 * the hour is invented. It is stamped at 18:00 UTC and the original prose is
 * kept in the description so nothing the founder wrote is lost.
 */
function startsAtFrom(daysUntil: unknown): Date {
  const days = Number.isFinite(Number(daysUntil)) ? Number(daysUntil) : 0;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

/** Named in the scene, absent in this village. Reported, never created. */
const unmatched: Array<{ kind: string; name: string }> = [];
/** A person had already placed these, so the doctrine left them alone. */
const protectedRows: Array<{ kind: string; name: string; held: string }> = [];

async function findOne(conn: mysql.Connection, sql: string, params: any[]): Promise<any | null> {
  const [rows] = await conn.query<any[]>(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Address one table's rows from a scene block.
 *
 * `org_roles` and `quests` differ only in what the row is called and which
 * column holds its name, so they share this. Every write asks
 * `mayOverwriteAddress` first: that is where the creator-wins rule lives, and
 * duplicating the comparison per table is how it would eventually differ per
 * table.
 */
async function addressRows(
  conn: mysql.Connection | null,
  items: any[],
  opts: { label: string; table: string; matchColumn: string; nameOf: (x: any) => string },
): Promise<number> {
  let wrote = 0;
  for (const item of items) {
    const name = opts.nameOf(item);
    if (!name) continue;
    const key = item?.structure_key ? String(item.structure_key) : null;
    const incoming = normaliseAddressSource(item?.address_source);

    if (!conn) {
      console.log(`  ${opts.label.padEnd(6)} ${name} -> ${key ?? "(board)"} (${incoming ?? "unaddressed"})`);
      continue;
    }
    const row = await findOne(
      conn,
      `SELECT id, structure_key, address_source FROM \`${opts.table}\` WHERE \`${opts.matchColumn}\` = ?`,
      [name],
    );
    if (!row) { unmatched.push({ kind: opts.label, name }); continue; }
    if (!mayOverwriteAddress(row.address_source, incoming)) {
      protectedRows.push({ kind: opts.label, name, held: String(row.address_source) });
      continue;
    }
    console.log(`  ${opts.label.padEnd(6)} ${name} -> ${key ?? "(board)"} (${incoming ?? "unaddressed"})`);
    if (!DRY) {
      await conn.query(
        `UPDATE \`${opts.table}\` SET structure_key = ?, address_source = ? WHERE id = ?`,
        [key, incoming, row.id],
      );
      wrote++;
    }
  }
  return wrote;
}

async function main() {
  console.log(`\n  Scene: ${meta.name ?? sceneKey} (${meta.version})`);
  console.log(`  Mode:  ${DRY ? "DRY RUN, nothing is written" : "writing"}\n`);

  /*
   * A dry run never opens a connection. Checking a scene file is exactly what
   * somebody does BEFORE they have a database in front of them, and demanding
   * DATABASE_URL to print a report would make the flag useless on a laptop.
   */
  const url = process.env.DATABASE_URL;
  if (!DRY && !url) die("DATABASE_URL is not set. This writes to the village's own database.");
  const conn = DRY ? null : await mysql.createConnection({ uri: url!, timezone: "Z" });
  let wrote = 0;

  try {
    // ── events ───────────────────────────────────────────────────────────
    if (wanted("events") && Array.isArray(scene.events)) {
      for (const e of scene.events) {
        const id = rowId("ev", e.id);
        const startsAt = startsAtFrom(e.days_until);
        const keys = Array.isArray(e.structure_keys) ? e.structure_keys.filter((k: any) => typeof k === "string") : [];
        // The scene labels its own demo rows. They import as examples so the
        // standing-examples flag travels with them and a founder can tell
        // what they wrote from what the map shipped.
        const isExample = e.src === "sample" ? 1 : 0;
        const description = e.when ? `Originally scheduled: ${e.when}.` : null;

        console.log(
          `  event  ${isExample ? "[sample] " : ""}${e.title}` +
            `  ${startsAt.toISOString().slice(0, 10)}  ${keys.length ? keys.join(", ") : "no structure"}`,
        );
        if (DRY || !conn) continue;

        await conn.query(
          `INSERT INTO events (id, title, description, starts_at, structure_keys, status, is_example)
             VALUES (?,?,?,?,?,'draft',?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title), description = VALUES(description),
             starts_at = VALUES(starts_at), structure_keys = VALUES(structure_keys),
             is_example = VALUES(is_example)`,
          [id, String(e.title ?? "Untitled"), description, startsAt, JSON.stringify(keys), isExample],
        );
        wrote++;
      }
      // Imported as drafts on purpose. Publishing somebody's calendar to the
      // whole village is a decision, and it is one click in the admin surface.
      if (scene.events.length) console.log("  (events import as drafts; publish them from the admin calendar)\n");
    }

    // ── skin ─────────────────────────────────────────────────────────────
    const skin = meta?.art_manifest?.skin;
    if (wanted("skin") && skin) {
      // Straight into the same document Make This Yours writes, through the
      // same sanitiser the API uses. This is the round trip the wizard was
      // built for: style inside the map, export, import, and the site agrees.
      const clean = sanitiseMapSkin(skin);
      console.log(`  skin   theme="${clean.theme || "(map default)"}" accent=${clean.accent || "(none)"} icons=${clean.icon_mode}`);
      if (!DRY && conn) {
        /*
         * The column is `config_key`, not `key`. This is written to match
         * dbDocument (server/repos/store-db.ts) statement for statement,
         * including the JSON.stringify: mysql2 would serialise an object for
         * a json column too, and matching the app's own write exactly is what
         * keeps a hand-run script from storing a subtly different document.
         *
         * Read-modify-write on the WHOLE brand document, because it holds
         * project, currency, images, setup, theme and identityPack alongside
         * skin. Writing `{skin}` alone would erase a village's entire brand.
         */
        const [rows] = await conn.query<any[]>("SELECT value FROM app_config WHERE config_key = 'brand'");
        let current: Record<string, unknown> = {};
        if (rows.length) {
          const v = rows[0].value;
          const parsed = typeof v === "string" ? JSON.parse(v) : v;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
        }
        await conn.query(
          "INSERT INTO app_config (config_key, value) VALUES ('brand', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
          [JSON.stringify({ ...current, skin: clean })],
        );
        wrote++;
      }
    }

    // ── circles: where a circle calls home ───────────────────────────────
    if (wanted("circles") && Array.isArray(scene.circles)) {
      for (const c of scene.circles) {
        const name = String(c?.name ?? "").trim();
        const key = c?.home_structure_key ? String(c.home_structure_key) : null;
        if (!name) continue;
        const row = conn ? await findOne(conn, "SELECT id, home_structure_key FROM circles WHERE name = ?", [name]) : null;
        if (!conn) { console.log(`  circle ${name} -> ${key ?? "(no home)"}`); continue; }
        if (!row) { unmatched.push({ kind: "circle", name }); continue; }
        /*
         * Circles carry no address_source, in the schema or in the export, so
         * there is no provenance to defend and the map is the only place a
         * circle's home is ever authored. It is written straight, and the
         * change is printed so an overwrite is never silent.
         */
        if ((row.home_structure_key ?? null) === key) { console.log(`  circle ${name} unchanged`); continue; }
        console.log(`  circle ${name}: ${row.home_structure_key ?? "(none)"} -> ${key ?? "(none)"}`);
        if (!DRY) { await conn.query("UPDATE circles SET home_structure_key = ? WHERE id = ?", [key, row.id]); wrote++; }
      }
    }

    // ── org_roles and quests: the addressed rows ─────────────────────────
    if (wanted("org_roles") && Array.isArray(scene.org_roles)) {
      wrote += await addressRows(conn, scene.org_roles, {
        label: "seat", table: "org_roles", matchColumn: "name",
        nameOf: (x) => String(x?.role ?? "").trim(),
      });
    }
    if (wanted("quests") && Array.isArray(scene.quests)) {
      wrote += await addressRows(conn, scene.quests, {
        label: "quest", table: "quests", matchColumn: "title",
        nameOf: (x) => String(x?.title ?? "").trim(),
      });
    }

    // ── forum threads: the multi-address ─────────────────────────────────
    if (wanted("forum_threads") && Array.isArray(scene.forum_threads)) {
      for (const t of scene.forum_threads) {
        const title = String(t?.title ?? "").trim();
        if (!title) continue;
        const keys: string[] = Array.isArray(t.structure_keys)
          ? t.structure_keys.filter((k: any) => typeof k === "string") : [];
        const incoming = normaliseAddressSource(t.address_source);
        if (!conn) { console.log(`  thread ${title} -> [${keys.join(", ")}] (${incoming ?? "unaddressed"})`); continue; }
        const row = await findOne(conn, "SELECT id, address_source FROM forum_threads WHERE title = ?", [title]);
        if (!row) { unmatched.push({ kind: "thread", name: title }); continue; }
        if (!mayOverwriteAddress(row.address_source, incoming)) {
          protectedRows.push({ kind: "thread", name: title, held: String(row.address_source) });
          continue;
        }
        console.log(`  thread ${title} -> [${keys.join(", ")}] (${incoming ?? "unaddressed"})`);
        if (!DRY) {
          await conn.query(
            "UPDATE forum_threads SET structure_keys = ?, address_source = ? WHERE id = ?",
            [keys.length ? JSON.stringify(keys) : null, incoming, row.id],
          );
          wrote++;
        }
      }
    }

    // ── vocabulary: the founder's own words ──────────────────────────────
    const vocab = meta?.vocabulary;
    if (wanted("vocabulary") && vocab) {
      const clean = sanitiseMapVocabulary(vocab);
      const total = clean.road.length + clean.water.length + clean.zone.length;
      console.log(`  vocab  ${total} word(s): road ${clean.road.length}, water ${clean.water.length}, zone ${clean.zone.length}`);
      if (!DRY && conn) {
        // Its own document, so a scene import replaces the words wholesale
        // without touching anything else the village has configured.
        await conn.query(
          "INSERT INTO app_config (config_key, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
          [MAP_VOCABULARY_DOC, JSON.stringify(clean)],
        );
        wrote++;
      }
    }

    // ── concierge queries: the demand signal ─────────────────────────────
    if (wanted("concierge_queries") && Array.isArray(scene.concierge_queries) && scene.concierge_queries.length) {
      const KINDS = ["role", "quest", "circle", "none"];
      let n = 0;
      for (const q of scene.concierge_queries) {
        const text = String(q?.query ?? "").trim().slice(0, 500);
        if (!text) continue;
        /*
         * The id is derived from the query text, so a re-import updates the
         * same row. This log is the "which role is the village missing"
         * report, and duplicating it once per import would bend the very
         * signal it exists to measure.
         */
        const id = rowId("cq", text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40));
        const kind = KINDS.includes(q?.matched_kind) ? q.matched_kind : "none";
        n++;
        if (DRY || !conn) continue;
        await conn.query(
          `INSERT INTO concierge_queries (id, user_id, query, matched_kind, matched_id, method, contacted)
             VALUES (?,NULL,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             matched_kind = VALUES(matched_kind), matched_id = VALUES(matched_id)`,
          [id, text, kind, q?.matched_id ?? null, q?.method === "llm" ? "llm" : "deterministic", q?.contacted ? 1 : 0],
        );
        wrote++;
      }
      console.log(`  concierge  ${n} logged quer${n === 1 ? "y" : "ies"}`);
    }

    if (DRY) console.log("\n  Dry run: nothing was written.");
    else console.log(`\n  Wrote ${wrote} row(s).`);
  } finally {
    await conn?.end();
  }

  /*
   * Rows the scene named that this village does not have, and rows a person
   * had already placed. Both are printed loudly: the first is usually a typo
   * or a village that has not created the thing yet, and the second is the
   * doctrine doing its job, which an operator should be able to see rather
   * than infer from a write count that came up short.
   */
  if (unmatched.length) {
    console.log(`\n  NO MATCH (named in the scene, absent here; nothing was created):`);
    for (const u of unmatched) console.log(`    ${u.kind.padEnd(8)} ${u.name}`);
  }
  if (protectedRows.length) {
    console.log(`\n  LEFT ALONE (a person placed these; a scene import never moves them):`);
    for (const p of protectedRows) console.log(`    ${p.kind.padEnd(8)} ${p.name}  [${p.held}]`);
  }

  /*
   * No silent caps: what was left on the floor, and why, every run.
   *
   * Some blocks sit at the top level and some inside `map_scene` (vocabulary
   * is nested, which is exactly how it went unreported the first time).
   */
  const present = (block: string) => scene[block] !== undefined || meta[block] !== undefined;
  const skippedPresent = SKIPPED_BLOCKS.filter((s) => present(s.block));
  if (skippedPresent.length) {
    console.log("\n  SKIPPED (present in the scene, no home in the schema):");
    for (const s of skippedPresent) console.log(`    ${s.block.padEnd(20)} ${s.reason}`);
    console.log("");
  }
}

main().catch((err) => die(`Import failed: ${err?.message ?? err}`));
