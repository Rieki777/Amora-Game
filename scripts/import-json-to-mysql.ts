/**
 * Imports data/*.json into MySQL, then proves the two agree.
 *
 * Phase 1 of AMORA_FOUNDATION_UPGRADE_PLAN.md. This does NOT change how the app
 * reads anything: the server still reads JSON. The point is a shadow copy that
 * can be verified, so that when routes are cut over domain by domain, each one
 * is checked against data that is already known to match.
 *
 *   npx tsx scripts/import-json-to-mysql.ts            import, then verify
 *   npx tsx scripts/import-json-to-mysql.ts --verify   verify only, no writes
 *   npx tsx scripts/import-json-to-mysql.ts --dir <p>  import from a backup dir
 *
 * Idempotent: every write is an upsert keyed on the record's existing id, so
 * running it twice is a no-op rather than a duplicate. Re-runnable is what makes
 * it safe to use repeatedly during the cutover.
 *
 * Reversible: nothing here deletes or edits a JSON file. data/ remains the
 * source of truth until a route is deliberately switched, and the volume stays
 * mounted. To roll back, stop using the database.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { parseRewardRange } from "../shared/questRewards";

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes("--verify");
const dirFlag = argv.indexOf("--dir");
const DATA_DIR =
  dirFlag !== -1 && argv[dirFlag + 1]
    ? path.resolve(argv[dirFlag + 1])
    : path.resolve(process.cwd(), "data");

function read(file: string): any {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    // readJson in server/index.ts also swallows parse errors and returns null,
    // so a corrupt file reads as absent there too. Surfaced loudly here because
    // silently importing nothing would look like success.
    console.warn(`  WARN: ${file} did not parse; treating as absent`);
    return null;
  }
}

/** ISO string or epoch to a MySQL DATETIME, or null. */
function ts(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function str(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  return String(v).slice(0, max);
}

function num(v: any, dflt: number | null = null): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : dflt;
}

/** The 10 singleton config documents, keyed by old filename minus .json. */
const CONFIG_FILES = [
  "brand",
  "content",
  "email-config",
  "faqs",
  "investor-summary",
  "journey-state",
  "season",
  "settings",
  "visit-config",
  "work-with-us",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  console.log(`Source: ${DATA_DIR}`);
  const conn = await mysql.createConnection({ uri: url });

  // ── Import ────────────────────────────────────────────────────────────────
  if (!VERIFY_ONLY) {
    const usersDoc = read("users.json");
    const users: any[] = Array.isArray(usersDoc) ? usersDoc : (usersDoc?.users ?? []);
    for (const u of users) {
      await conn.query(
        "INSERT INTO `users` (id, name, email, password_hash, paths, recognition_balance, contributions, quests, bio, avatar, stage_granted, training_complete, joined_at) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), password_hash=VALUES(password_hash), " +
          "paths=VALUES(paths), recognition_balance=VALUES(recognition_balance), contributions=VALUES(contributions), " +
          "quests=VALUES(quests), bio=VALUES(bio), avatar=VALUES(avatar), stage_granted=VALUES(stage_granted), " +
          "training_complete=VALUES(training_complete)",
        [
          str(u.id, 64), str(u.name, 255), str(u.email, 255), str(u.passwordHash, 255),
          JSON.stringify(u.paths ?? []), num(u.recognitionBalance, 0),
          JSON.stringify(u.contributions ?? []), JSON.stringify(u.quests ?? []),
          u.bio ?? null, str(u.avatar, 500), str(u.stageGranted, 64),
          u.trainingComplete ? 1 : 0, ts(u.joinedAt),
        ],
      );
    }

    for (const s of read("submissions.json") ?? []) {
      await conn.query(
        "INSERT INTO `submissions` (id, type, status, data, rewarded, submitted_at) VALUES (?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE type=VALUES(type), status=VALUES(status), data=VALUES(data), rewarded=VALUES(rewarded)",
        [str(s.id, 64), str(s.type, 64), str(s.status, 32) ?? "new", JSON.stringify(s.data ?? {}), s.rewarded ? 1 : 0, ts(s.submittedAt)],
      );
    }

    for (const q of read("quests.json") ?? []) {
      await conn.query(
        "INSERT INTO `quests` (id, title, description, impact, gratitude, gratitude_min, gratitude_max, duration, difficulty, circle, status, icon, role_required, tags, sort_order) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), impact=VALUES(impact), " +
          "gratitude=VALUES(gratitude), gratitude_min=VALUES(gratitude_min), gratitude_max=VALUES(gratitude_max), " +
          "duration=VALUES(duration), difficulty=VALUES(difficulty), circle=VALUES(circle), " +
          "status=VALUES(status), icon=VALUES(icon), role_required=VALUES(role_required), tags=VALUES(tags), sort_order=VALUES(sort_order)",
        [
          str(q.id, 64), str(q.title, 255), q.description ?? null, q.impact ?? null,
          // The label is preserved verbatim; the bounds are derived from it.
          str(q.gratitude, 64) ?? "", parseRewardRange(q.gratitude).min, parseRewardRange(q.gratitude).max,
          str(q.duration, 64), str(q.difficulty, 32), str(q.circle, 64),
          str(q.status, 32) ?? "open", str(q.icon, 64), str(q.roleRequired, 64),
          JSON.stringify(q.tags ?? []), num(q.order, 0),
        ],
      );
    }

    for (const c of read("quest-claims.json") ?? []) {
      await conn.query(
        "INSERT INTO `quest_claims` (id, quest_id, quest_title, user_id, user_name, status, artifact_url, note, amount, claimed_at, submitted_at, consented_at) " +
          "VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP),?,?) " +
          "ON DUPLICATE KEY UPDATE status=VALUES(status), artifact_url=VALUES(artifact_url), note=VALUES(note), " +
          "amount=VALUES(amount), submitted_at=VALUES(submitted_at), consented_at=VALUES(consented_at)",
        [
          str(c.id, 64), str(c.questId, 64), str(c.questTitle, 255), str(c.userId, 64), str(c.userName, 255),
          ["claimed", "submitted", "consented", "declined"].includes(c.status) ? c.status : "claimed",
          str(c.artifactUrl, 1000), c.note ?? null, num(c.amount), ts(c.claimedAt), ts(c.submittedAt), ts(c.consentedAt),
        ],
      );
    }

    for (const g of read("gratitude-log.json") ?? []) {
      await conn.query(
        "INSERT INTO `gratitude_log` (id, from_id, from_name, to_id, to_name, amount, message, cycle_id, at) " +
          "VALUES (?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE amount=VALUES(amount), message=VALUES(message), cycle_id=VALUES(cycle_id)",
        [
          str(g.id, 64), str(g.fromId, 64), str(g.fromName, 255), str(g.toId, 64), str(g.toName, 255),
          num(g.amount, 0), g.message ?? null, str(g.cycleId, 16) ?? "", ts(g.at),
        ],
      );
    }

    for (const a of read("activity.json") ?? []) {
      await conn.query(
        "INSERT INTO `activity` (id, type, text, at) VALUES (?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE type=VALUES(type), text=VALUES(text)",
        [str(a.id, 64), str(a.type, 64) ?? "event", String(a.text ?? ""), ts(a.at)],
      );
    }

    for (const [i, d] of (read("investor-docs.json") ?? []).entries()) {
      await conn.query(
        "INSERT INTO `investor_docs` (id, title, description, url, requires_request, sort_order) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), url=VALUES(url), " +
          "requires_request=VALUES(requires_request), sort_order=VALUES(sort_order)",
        [str(d.id ?? `doc-${i}`, 64), str(d.title, 255) ?? "", d.description ?? null, str(d.url, 1000), d.requiresRequest ? 1 : 0, num(d.order, i)],
      );
    }

    for (const [i, m] of (read("training-modules.json") ?? []).entries()) {
      await conn.query(
        "INSERT INTO `training_modules` (id, title, description, type, url, sort_order) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), type=VALUES(type), url=VALUES(url), sort_order=VALUES(sort_order)",
        [str(m.id ?? `mod-${i}`, 64), str(m.title, 255) ?? "", m.description ?? null, str(m.type, 64), str(m.url, 1000), num(m.order, i)],
      );
    }

    for (const [i, m] of (read("milestones.json") ?? []).entries()) {
      await conn.query(
        "INSERT INTO `milestones` (id, title, description, phase, status, update_note, completed_date, sort_order) VALUES (?,?,?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), phase=VALUES(phase), " +
          "status=VALUES(status), update_note=VALUES(update_note), completed_date=VALUES(completed_date), sort_order=VALUES(sort_order)",
        [
          str(m.id ?? `ms-${i}`, 64), str(m.title, 255) ?? "", m.description ?? null, str(m.phase, 64),
          str(m.status, 32), m.updateNote ?? null, str(m.completedDate, 32), num(m.order, i),
        ],
      );
    }

    for (const [i, r] of (read("roles.json") ?? []).entries()) {
      await conn.query(
        "INSERT INTO `roles` (id, name, description, capabilities, min_stage, sort_order) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), capabilities=VALUES(capabilities), " +
          "min_stage=VALUES(min_stage), sort_order=VALUES(sort_order)",
        [str(r.id, 64), str(r.name, 120) ?? "", r.description ?? null, JSON.stringify(r.capabilities ?? []), str(r.minStage, 64), num(r.order, i)],
      );
    }

    for (const h of read("role-holders.json") ?? []) {
      await conn.query(
        "INSERT INTO `role_holders` (id, role_id, user_id, granted_by, granted_at) VALUES (?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE granted_by=VALUES(granted_by)",
        [str(h.id, 64), str(h.roleId, 64), str(h.userId, 64), str(h.grantedBy, 64), ts(h.grantedAt)],
      );
    }

    for (const c of read("gratitude-cycles.json") ?? []) {
      await conn.query(
        "INSERT INTO `gratitude_cycles` (id, cycle_number, starts_at, ends_at, status, closed_at) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE status=VALUES(status), closed_at=VALUES(closed_at)",
        [
          str(c.id, 64), num(c.cycleNumber, 0), ts(c.startsAt), ts(c.endsAt),
          ["open", "distributing", "closed"].includes(c.status) ? c.status : "open", ts(c.closedAt),
        ],
      );
    }

    for (const d of read("gratitude-distributions.json") ?? []) {
      await conn.query(
        "INSERT INTO `gratitude_distributions` (id, cycle_id, user_id, received, distinct_senders, created_at) VALUES (?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE received=VALUES(received), distinct_senders=VALUES(distinct_senders)",
        [str(d.id, 64), str(d.cycleId, 64), str(d.userId, 64), num(d.received, 0), num(d.distinctSenders, 0), ts(d.createdAt)],
      );
    }

    for (const e of read("token-ledger.json") ?? []) {
      await conn.query(
        "INSERT INTO `token_ledger` (id, user_id, token_type, amount, source, source_ref, description, idempotency_key, at) " +
          "VALUES (?,?,?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          // The UNIQUE on idempotency_key is the dedupe; re-importing is a no-op.
          "ON DUPLICATE KEY UPDATE amount=VALUES(amount), source=VALUES(source)",
        [
          str(e.id, 64), str(e.userId, 64),
          ["gratitude", "amora", "voice"].includes(e.tokenType) ? e.tokenType : "gratitude",
          num(e.amount, 0), str(e.source, 64) ?? "", str(e.sourceRef, 120),
          str(e.description, 500), str(e.idempotencyKey, 160) ?? "", ts(e.at),
        ],
      );
    }

    for (const e of read("stage-events.json") ?? []) {
      await conn.query(
        "INSERT INTO `stage_events` (id, user_id, from_stage, to_stage, unlocked, reason, at) VALUES (?,?,?,?,?,?,COALESCE(?, CURRENT_TIMESTAMP)) " +
          "ON DUPLICATE KEY UPDATE reason=VALUES(reason)",
        [str(e.id, 64), str(e.userId, 64), str(e.fromStage, 64) ?? "", str(e.toStage, 64) ?? "", JSON.stringify(e.unlocked ?? []), str(e.reason, 255), ts(e.at)],
      );
    }

    // game-variables.json stores ONLY overrides ({key: value}); mirror that.
    {
      const overrides = read("game-variables.json");
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        for (const [key, value] of Object.entries(overrides)) {
          await conn.query(
            "INSERT INTO `game_variables` (config_key, value, value_type) VALUES (?,?,?) " +
              "ON DUPLICATE KEY UPDATE value=VALUES(value), value_type=VALUES(value_type)",
            [str(key, 100), str(value, 255) ?? "", "text"],
          );
        }
      }
    }

    for (const key of CONFIG_FILES) {
      const doc = read(`${key}.json`);
      if (doc === null) {
        console.log(`  skip config '${key}' (file absent)`);
        continue;
      }
      await conn.query(
        "INSERT INTO `app_config` (config_key, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
        [key, JSON.stringify(doc)],
      );
    }
    console.log("Import complete.\n");
  }

  // ── Verify: the database must agree with the files ────────────────────────
  const usersDoc = read("users.json");
  const expected: Record<string, number> = {
    users: (Array.isArray(usersDoc) ? usersDoc : (usersDoc?.users ?? [])).length,
    submissions: (read("submissions.json") ?? []).length,
    quests: (read("quests.json") ?? []).length,
    quest_claims: (read("quest-claims.json") ?? []).length,
    gratitude_log: (read("gratitude-log.json") ?? []).length,
    activity: (read("activity.json") ?? []).length,
    investor_docs: (read("investor-docs.json") ?? []).length,
    training_modules: (read("training-modules.json") ?? []).length,
    milestones: (read("milestones.json") ?? []).length,
    roles: (read("roles.json") ?? []).length,
    role_holders: (read("role-holders.json") ?? []).length,
    gratitude_cycles: (read("gratitude-cycles.json") ?? []).length,
    gratitude_distributions: (read("gratitude-distributions.json") ?? []).length,
  };

  let bad = 0;

  /**
   * COLUMN fidelity, not just row counts.
   *
   * The first version of this script verified only counts, and passed while
   * every one of the fourteen quests had its reward silently stored as 0:
   * `quests.gratitude` is a range string like "50-100" and the column was
   * declared int. Counting rows proves the right NUMBER of records arrived and
   * nothing whatsoever about whether they arrived intact. These checks compare
   * actual values for the fields most likely to be silently coerced.
   */
  const fieldChecks: Array<{
    table: string;
    file: string;
    idField: string;
    columns: Array<{ col: string; from: (rec: any) => unknown; label: string }>;
  }> = [
    {
      table: "quests",
      file: "quests.json",
      idField: "id",
      columns: [
        { col: "gratitude", from: (q) => String(q.gratitude ?? ""), label: "advertised range" },
        { col: "gratitude_min", from: (q) => parseRewardRange(q.gratitude).min, label: "range floor" },
        { col: "gratitude_max", from: (q) => parseRewardRange(q.gratitude).max, label: "range ceiling" },
        { col: "title", from: (q) => String(q.title ?? ""), label: "title" },
      ],
    },
    {
      table: "milestones",
      file: "milestones.json",
      idField: "id",
      columns: [{ col: "title", from: (m) => String(m.title ?? ""), label: "title" }],
    },
    {
      table: "training_modules",
      file: "training-modules.json",
      idField: "id",
      columns: [{ col: "title", from: (m) => String(m.title ?? ""), label: "title" }],
    },
  ];

  for (const check of fieldChecks) {
    const records: any[] = read(check.file) ?? [];
    if (records.length === 0) continue;
    for (const rec of records) {
      const id = rec[check.idField];
      if (!id) continue;
      const cols = check.columns.map((c) => `\`${c.col}\``).join(", ");
      const [rows] = await conn.query<any[]>(
        `SELECT ${cols} FROM \`${check.table}\` WHERE id = ? LIMIT 1`,
        [id],
      );
      if (rows.length === 0) {
        console.log(`field ${check.table}/${id}: MISSING ROW`);
        bad++;
        continue;
      }
      for (const c of check.columns) {
        const want = c.from(rec);
        const got = rows[0][c.col];
        // Compare as strings so 50 and "50" agree, but "50-100" and 0 do not.
        if (String(want) !== String(got)) {
          console.log(`field ${check.table}/${id}.${c.col} (${c.label}): json=${JSON.stringify(want)} mysql=${JSON.stringify(got)}  MISMATCH`);
          bad++;
        }
      }
    }
  }
  console.log(bad === 0 ? "column fidelity   ok (values match, not just counts)" : `column fidelity   ${bad} MISMATCH(ES)`);

  // The balance column is a CACHE of the ledger, so prove they agree in MySQL
  // too. A drift here means the cutover would carry a wrong number forward.
  {
    const [rows] = await conn.query<any[]>(
      "SELECT u.id, u.recognition_balance AS cached, " +
        "COALESCE((SELECT SUM(amount) FROM token_ledger l WHERE l.user_id = u.id AND l.token_type='gratitude'), 0) AS summed " +
        "FROM users u",
    );
    const drift = rows.filter((r) => Number(r.cached) !== Number(r.summed));
    for (const d of drift) {
      console.log(`balance drift ${d.id}: cached=${d.cached} ledger=${d.summed}  MISMATCH`);
      bad++;
    }
    console.log(`balance vs ledger ${drift.length === 0 ? "ok" : `${drift.length} DRIFTED`} (${rows.length} member(s))`);
  }

  console.log("table                 json    mysql");
  for (const [table, want] of Object.entries(expected)) {
    const [r] = await conn.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);
    const got = Number(r[0].n);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${table.padEnd(20)} ${String(want).padStart(5)}    ${String(got).padStart(5)}  ${ok ? "ok" : "MISMATCH"}`);
  }

  // Config documents must be present AND byte-identical once re-serialised.
  const [cfgRows] = await conn.query<any[]>("SELECT config_key, value FROM `app_config`");
  const stored = new Map(cfgRows.map((r) => [r.config_key, r.value]));
  for (const key of CONFIG_FILES) {
    const doc = read(`${key}.json`);
    if (doc === null) continue;
    const got = stored.get(key);
    if (got === undefined) {
      console.log(`config ${key.padEnd(20)} MISSING`);
      bad++;
      continue;
    }
    // mysql2 parses JSON columns, so compare structurally with stable key order.
    const same = JSON.stringify(sortKeys(got)) === JSON.stringify(sortKeys(doc));
    console.log(`config ${key.padEnd(20)} ${same ? "identical" : "DIFFERS"}`);
    if (!same) bad++;
  }

  await conn.end();
  if (bad > 0) {
    console.error(`\n${bad} mismatch(es). The database is NOT a faithful copy yet.`);
    process.exit(1);
  }
  console.log("\nEvery collection and config document matches the JSON.");
}

/** Recursively sort object keys so JSON.stringify is order-independent. */
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
