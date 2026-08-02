/**
 * Standing examples — the empty-module problem, solved once.
 *
 * Every non-core module ships OFF. A founder turns one on and meets
 * "No items yet." — the module works and teaches nothing. Standing examples
 * fill that void with platform-authored worked content that retires itself the
 * moment the village publishes anything real.
 *
 * Four rules, each load-bearing:
 *
 * 1. EXAMPLES ARE INERT. They render in full; every mutation against one is
 *    refused. No example ever becomes a ledger row, escrow, a Stripe object,
 *    or open economic state. This is not tidiness: an example library loan
 *    would put credits in escrow, and open escrow makes openStateCheck refuse
 *    to disable the module — a demo that traps you in the module it was
 *    demoing.
 * 2. THE FLAG LIVES ON THE ROW (`is_example`), so it travels through every
 *    existing SELECT and no read path can present an example as real.
 * 3. RETIREMENT IS PER-MODULE AND ONE-WAY. `example_state.retired_at` is a
 *    permanent tombstone; deleting your real items later never brings the
 *    examples back. A village that has spoken for itself is not talked over.
 * 4. THE COPY IS PLATFORM LANGUAGE, never a village's brand, so every fork
 *    inherits the same examples and the brand ratchet stays green.
 *
 * Generalises the exit-policy `placeholder: true` pattern already in the
 * codebase: a flag on the record, cleared by the first real write, visible in
 * launch readiness.
 */
import fs from "node:fs";
import path from "node:path";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { stringVar } from "./variables";

export const EXAMPLE_REFUSAL =
  "This is a standing example. Publish your own to replace it.";

/** What a caller sends back when a route addresses an example row. */
export const EXAMPLE_REFUSAL_BODY = { error: EXAMPLE_REFUSAL, code: "example_immutable" };

/**
 * Which tables hold each module's examples, CHILD FIRST — retirement deletes
 * in array order, so a row whose parent is also an example goes first.
 *
 * `feed` shares forum_threads with `forum` (it is a lens, not a table), so its
 * entry is scoped by the seeded ids rather than the whole table; see
 * retireExamples().
 */
export const EXAMPLE_TABLES: Record<string, string[]> = {
  map: ["circles"],
  progression: ["roles"],
  quests: ["quests"],
  forum: ["forum_replies", "forum_threads"],
  feed: ["forum_threads"],
  // NOTE: forum and feed share forum_threads — see SCOPE below. Without a
  // per-module predicate, retiring either one deletes the other's rows.
  tools: ["tools"],
  library: ["library_items", "library_categories"],
  stays: ["accommodation_prices", "accommodations"],
  commerce: ["payment_products"],
  badges: ["badges"],
  health: ["regen_entries"],
  automation: ["call_tasks", "call_syntheses", "transcripts", "recordings"],
  network: ["peer_shared_cache", "peer_instances", "shared_items"],
  exchange: ["currency_prices", "token_exchange_settings"],
  gratitude: ["gratitude_log"],
  profiles: [],
};

/**
 * Tables that must NOT be consulted when asking "has this village made its own
 * content here?".
 *
 * `health_events` is the shared event spine — every boot, seed and module
 * toggle writes to it, so it is never empty and every module listing it would
 * read as already-populated and silently skip its examples. That is exactly
 * what happened to the feed on the first run.
 */
const NOT_EVIDENCE_OF_REAL_CONTENT = new Set(["health_events"]);

/**
 * Modules whose "is there real content?" question the table list cannot answer.
 * The feed is a LENS over forum threads, so a forum thread is not evidence the
 * village has posted to the FEED — only a non-example thread in the feed's own
 * category is.
 */
const REAL_CONTENT_CHECK: Record<string, (p: Pool) => Promise<boolean>> = {
  // Scoped by CATEGORY, matching both the retirement trigger and the lens
  // query. Filtering on kind='post' instead meant a real micropost in any
  // other category permanently suppressed feed seeding without ever retiring
  // the feed's examples — two definitions of "real feed content" that
  // disagreed. The lens shows every kind in its category, so the category is
  // the only consistent answer.
  feed: async (p) => {
    const [[r]] = await p.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM forum_threads WHERE is_example = 0 AND category = ?",
      [stringVar("feed.category_slug")],
    );
    return Number(r.n) > 0;
  },
  // health_snapshots is written by the cycle close whether or not the health
  // module is on — collection is infrastructure, display is the module. Any
  // village that has settled one lunation therefore has snapshot rows, and
  // counting them as village-authored content meant enabling health seeded
  // nothing and the dashboard opened on "1 of 3 lunations". Only the land's
  // own ledger is evidence a human recorded something here.
  health: async (p) => {
    const [[r]] = await p.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM regen_entries WHERE is_example = 0",
    );
    return Number(r.n) > 0;
  },
};

/**
 * Extra WHERE predicate for a (module, table) pair, for tables two modules
 * share. `forum` and `feed` both live in forum_threads — the feed is a LENS,
 * not a table of its own — so an unscoped `WHERE is_example = 1` means the
 * first real forum thread silently deletes the feed's example posts while the
 * feed's own tombstone stays unset, leaving its banner over an empty page.
 *
 * Scoped by seeded id prefix rather than by `kind`: ex-feed-3 is seeded as an
 * announcement, so a kind='post' filter would miss it.
 */
const SCOPE: Record<string, Record<string, string>> = {
  forum: {
    forum_threads: "id LIKE 'ex-thread-%'",
    forum_replies: "id LIKE 'ex-reply-%'",
  },
  feed: {
    forum_threads: "id LIKE 'ex-feed-%'",
  },
};

const scopeFor = (moduleId: string, table: string): string | null =>
  SCOPE[moduleId]?.[table] ?? null;

/** Tables with no `is_example` column of their own — deleted by parent ref. */
const BY_PARENT: Record<string, { parentTable: string; fk: string; parentKey: string }> = {
  transcripts: { parentTable: "recordings", fk: "recording_id", parentKey: "id" },
  peer_shared_cache: { parentTable: "peer_instances", fk: "peer_id", parentKey: "id" },
};

export type RetireReason = "first_real_item" | "admin_cleared";

interface ExampleStateRow {
  seededAt: string | null;
  retiredAt: string | null;
  retiredReason: string | null;
}

let pool: Pool | null = null;
const state = new Map<string, ExampleStateRow>();

/**
 * Some of these tables are served by memory-cached collections
 * (`server/repos/store-db.ts`: MySQL-authoritative, memory-cached,
 * write-through). Retirement deletes rows with raw SQL, which is invisible to
 * those caches — the rows leave the database and the API keeps serving them
 * until the next boot. Injected at boot rather than imported, to avoid a cycle
 * back into index.ts, exactly like wireModuleAuth and wireErrorReporting.
 */
type CacheReloader = (tables: string[]) => Promise<void>;
let reloadCaches: CacheReloader | null = null;

export function wireExampleCaches(reload: CacheReloader): void {
  reloadCaches = reload;
}

// ── State ────────────────────────────────────────────────────────────────────

export async function loadExampleState(p: Pool): Promise<void> {
  pool = p;
  const [rows] = await p.query<RowDataPacket[]>(
    "SELECT module_id, seeded_at, retired_at, retired_reason FROM example_state",
  );
  state.clear();
  for (const r of rows) {
    state.set(String(r.module_id), {
      seededAt: r.seeded_at ? new Date(r.seeded_at).toISOString() : null,
      retiredAt: r.retired_at ? new Date(r.retired_at).toISOString() : null,
      retiredReason: r.retired_reason ?? null,
    });
  }
  await refreshRowPresence(p);
}

export function exampleState(moduleId: string): ExampleStateRow | null {
  return state.get(moduleId) ?? null;
}

/** Retired is PERMANENT — the one fact that keeps examples from coming back. */
export function isRetired(moduleId: string): boolean {
  return !!state.get(moduleId)?.retiredAt;
}

export function isSeeded(moduleId: string): boolean {
  return !!state.get(moduleId)?.seededAt;
}

/**
 * Every module currently showing examples.
 *
 * Seeded-and-not-retired is not enough: `gratitude` and `profiles` are stamped
 * seeded so the attempt is not repeated every boot, but they deliberately
 * create no rows. Claiming they show examples would put a banner over a page
 * that has none. Membership requires rows that actually exist.
 */
export function modulesWithExamples(): string[] {
  return Array.from(state.entries())
    .filter(([id, s]) => s.seededAt && !s.retiredAt && withRows.has(id))
    .map(([id]) => id);
}

/** Modules that currently hold at least one example row. */
const withRows = new Set<string>();

/** Recount which modules actually hold example rows. Cheap, and only at the
 *  three moments it can change: boot, a seed, and a retirement. */
async function refreshRowPresence(p: Pool, only?: string): Promise<void> {
  const ids = only ? [only] : Object.keys(EXAMPLE_TABLES);
  for (const id of ids) {
    let found = false;
    for (const table of EXAMPLE_TABLES[id] ?? []) {
      if (BY_PARENT[table]) continue;
      // Scoped exactly like retirement, or forum's surviving example replies
      // would keep the feed counted as "showing examples" and vice versa.
      const scope = scopeFor(id, table);
      try {
        const [[r]] = await p.query<RowDataPacket[]>(
          `SELECT COUNT(*) n FROM \`${table}\` WHERE is_example = 1` + (scope ? ` AND ${scope}` : ""),
        );
        if (Number(r.n) > 0) { found = true; break; }
      } catch { /* table absent on an older fork: not a failure */ }
    }
    if (found) withRows.add(id); else withRows.delete(id);
  }
}

// ── Reading the seed file ────────────────────────────────────────────────────

export function loadExampleSeed(seedsDir: string): any | null {
  const file = path.resolve(seedsDir, "examples-seed.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error("[examples] examples-seed.json is unreadable, skipping", e);
    return null;
  }
}

// ── Writing ──────────────────────────────────────────────────────────────────

const J = (v: unknown) => JSON.stringify(v ?? null);

/** INSERT IGNORE everywhere: re-running is a no-op, never a duplicate. */
async function ins(conn: Pool | PoolConnection, table: string, row: Record<string, any>): Promise<number> {
  const cols = Object.keys(row);
  const sql =
    `INSERT IGNORE INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) ` +
    `VALUES (${cols.map(() => "?").join(",")})`;
  const [r] = await conn.query<any>(sql, Object.values(row));
  return r?.affectedRows ?? 0;
}

/**
 * gratitude_min/max are DERIVED, never authored. shared/questRewards.ts is the
 * one parser in the app; this mirrors its separator set (en dash, em dash,
 * hyphen, the word "to") for seed data only. A bare number yields min === max.
 */
function parseRange(raw: unknown): { min: number; max: number } {
  const s = String(raw ?? "").trim();
  if (!s) return { min: 0, max: 0 };
  const parts = s.split(/\s*(?:–|—|-|to)\s*/i).map((p) => Number(p.replace(/[^\d.]/g, "")));
  if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
    return { min: parts[0], max: parts[1] };
  }
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? { min: n, max: n } : { min: 0, max: 0 };
}

/** Units come from the registry, never from seed data — a wrong unit poisons
 *  the MAX(unit) label on the regen totals tile. */
const REGEN_UNITS: Record<string, string> = {
  trees_planted: "trees",
  hectares_restored: "ha",
  food_produced_kg: "kg",
  water_protected_liters: "liters",
  carbon_sequestered_kg: "kg",
};

const EXAMPLE_AUTHOR = "ex-user-mira";

/**
 * Modules whose example rows carry an author, owner or recorder. Only these
 * bring the identities into existence — otherwise a deployment that never
 * turns on a single one of them still ends up with three phantom accounts,
 * which is precisely the fake-people-in-`users` problem the exclusions exist
 * to contain.
 */
const NEEDS_IDENTITIES = new Set(["forum", "feed", "commerce", "health", "network", "exchange"]);

/**
 * Seed the three example identities. No password_hash, so they can never log
 * in; `is_example` keeps them out of the member directory, launch counts,
 * gratitude eligibility, the Sybil helper and badge evaluation.
 */
async function seedIdentities(p: Pool, seed: any): Promise<number> {
  let n = 0;
  for (const u of seed?._identities?.users ?? []) {
    n += await ins(p, "users", {
      id: u.id,
      name: u.name,
      email: `${u.id}@examples.invalid`,
      password_hash: "",
      handle: u.handle,
      bio: u.bio,
      stage_granted: u.stageGranted,
      role: "member",
      paths: J([]),
      contributions: J([]),
      quests: J([]),
      journeys: J({}),
      prefs: J({}),
      is_example: 1,
    });
  }
  return n;
}

export interface SeedOptions {
  /** Health snapshots are stamped relative to this lunation. */
  baseCycle?: number;
  /** Skip the has-real-rows check (the dev seeder wants this). */
  force?: boolean;
}

/**
 * Seed one module's examples. A no-op — quietly, by design — when the module
 * has ever been seeded, has ever been retired, or already holds a real row.
 * Returns the number of rows written.
 */
export async function seedExamples(
  p: Pool,
  moduleId: string,
  seed: any,
  opts: SeedOptions = {},
): Promise<number> {
  const block = seed?.[moduleId];
  if (!block) return 0;
  if (isRetired(moduleId)) return 0;
  if (isSeeded(moduleId) && !opts.force) return 0;
  if (!opts.force && (await hasRealContent(p, moduleId))) {
    // A village with its own content never gets examples layered over it.
    await stamp(p, moduleId, { seeded: false });
    return 0;
  }

  const baseCycle = opts.baseCycle ?? 0;
  // The three identities are shared by every module, so they are created on
  // demand but NOT counted here — otherwise whichever module happens to seed
  // first reports three rows it did not create, and `gratitude`, which seeds
  // nothing at all, claims a row count.
  if (NEEDS_IDENTITIES.has(moduleId)) await seedIdentities(p, seed);
  let n = 0;

  switch (moduleId) {
    case "map":
      for (const c of block.circles ?? []) {
        n += await ins(p, "circles", {
          id: c.id, name: c.name, purpose: c.purpose, aliases: J(c.aliases),
          parent_circle_id: null, lead_role_id: c.leadRoleId, icon: c.icon,
          color: c.color, status: c.status, sort_order: c.sortOrder, is_example: 1,
        });
      }
      break;

    case "progression":
      for (const r of block.roles ?? []) {
        n += await ins(p, "roles", {
          id: r.id, name: r.name, description: r.description,
          capabilities: J(r.capabilities), min_stage: r.minStage,
          circle_id: r.circleId, seats: r.seats, sort_order: r.sortOrder, is_example: 1,
        });
      }
      break;

    case "quests":
      for (const q of block.quests ?? []) {
        const range = parseRange(q.gratitude);
        n += await ins(p, "quests", {
          id: q.id, title: q.title, description: q.description, impact: q.impact,
          gratitude: q.gratitude, gratitude_min: range.min, gratitude_max: range.max,
          duration: q.duration, difficulty: q.difficulty, circle: q.circle,
          status: q.status, icon: q.icon, min_stage: q.minStage ?? null,
          tags: J(q.tags), sort_order: q.sortOrder, is_example: 1,
        });
      }
      break;

    case "forum":
      for (const t of block.threads ?? []) {
        const replies = t.replies ?? [];
        n += await ins(p, "forum_threads", {
          id: t.id, category: t.category, author_id: t.authorId, title: t.title,
          body: t.body, kind: t.kind, meta: t.meta ? J(t.meta) : null,
          heart_count: 0, reply_count: replies.length,
          last_reply_at: replies.length ? new Date() : null,
          pinned_at: t.pinned ? new Date() : null,
          locked_at: t.locked ? new Date() : null,
          is_example: 1,
        });
        for (const tag of t.tags ?? []) {
          await ins(p, "forum_thread_tags", { thread_id: t.id, tag });
        }
        for (const r of replies) {
          n += await ins(p, "forum_replies", {
            id: r.id, thread_id: t.id, author_id: r.authorId,
            parent_reply_id: r.parentReplyId ?? null, body: r.body, is_example: 1,
          });
        }
      }
      break;

    case "feed":
      // heart_count stays 0: a heart is a real ledger send, and hearting an
      // example is refused, so the cache must never claim otherwise.
      for (const post of block.posts ?? []) {
        n += await ins(p, "forum_threads", {
          id: post.id, category: post.category, author_id: post.authorId,
          title: null, body: post.body, kind: post.kind,
          heart_count: 0, reply_count: 0, is_example: 1,
        });
        for (const tag of post.tags ?? []) {
          await ins(p, "forum_thread_tags", { thread_id: post.id, tag });
        }
      }
      // NO SEEDED EVENTS, deliberately. recentEvents reads
      // `WHERE is_example = 0` and it is right to: the event spine feeds the
      // public Pulse, where seeded copy would read as things that actually
      // happened here. That correct filter also serves the feed's own
      // "village happenings" lane, so a seeded event could never appear
      // anywhere — it was counted as seeded and rendered nowhere.
      break;

    case "tools":
      for (const t of block.tools ?? []) {
        n += await ins(p, "tools", {
          id: t.id, name: t.name, purpose: t.purpose, description: t.description,
          url: t.url, cta_label: t.ctaLabel, category: t.category,
          icon_kind: t.iconKind, icon: t.icon, visibility: t.visibility,
          role_ids: null, getting_started: t.gettingStarted,
          sort_order: t.sortOrder, enabled: t.enabled ? 1 : 0, is_example: 1,
        });
      }
      break;

    case "library":
      // Direct inserts, NOT recordIntake() — intake mints credits to the donor.
      // A direct row raises supply-vs-backing coverage without minting anything.
      for (const c of block.categories ?? []) {
        n += await ins(p, "library_categories", {
          id: c.id, label: c.label, sort_order: c.sortOrder, is_example: 1,
        });
      }
      for (const it of block.items ?? []) {
        n += await ins(p, "library_items", {
          id: it.id, name: it.name, description: it.description,
          category_id: it.categoryId, status: it.status, health_bp: it.healthBp,
          credit_value: it.creditValue, min_stage: it.minStage ?? null,
          donor_user_id: null, is_example: 1,
        });
      }
      break;

    case "stays":
      for (const a of block.accommodations ?? []) {
        n += await ins(p, "accommodations", {
          id: a.id, name: a.name, description: a.description, capacity: a.capacity,
          active: a.active ? 1 : 0, sort_order: a.sortOrder, is_example: 1,
        });
        for (const [i, price] of (a.prices ?? []).entries()) {
          n += await ins(p, "accommodation_prices", {
            id: `${a.id}-price-${i + 1}`, accommodation_id: a.id,
            token_type: price.tokenType, audience: price.audience,
            amount_minor: price.amountMinor, active: 1, is_example: 1,
          });
        }
      }
      break;

    case "commerce":
      for (const prod of block.products ?? []) {
        n += await ins(p, "payment_products", {
          id: prod.id, name: prod.name, description: prod.description, kind: prod.kind,
          amount_minor: prod.amountMinor, min_amount_minor: prod.minAmountMinor,
          recurring: prod.recurring, provider: prod.provider, audience: prod.audience,
          active: prod.active ? 1 : 0, sort_order: prod.sortOrder,
          created_by: EXAMPLE_AUTHOR, is_example: 1,
        });
      }
      break;

    case "badges":
      // Definitions only. A definition grants nothing without an award row, and
      // assertBadgeInvariants refuses BOOT on an unknown capability key.
      for (const b of block.badges ?? []) {
        n += await ins(p, "badges", {
          id: b.id, name: b.name, description: b.description, kind: b.kind,
          capabilities: J(b.capabilities), denies: J(b.denies),
          rule: b.rule ? J(b.rule) : null, active: b.active ? 1 : 0, is_example: 1,
        });
      }
      break;

    case "health":
      for (const e of block.regenEntries ?? []) {
        n += await ins(p, "regen_entries", {
          id: e.id, metric_key: e.metricKey, value: e.value,
          unit: REGEN_UNITS[e.metricKey] ?? "", note: e.note,
          recorded_by: EXAMPLE_AUTHOR, is_example: 1,
        });
      }
      // NO SEEDED SNAPSHOTS, deliberately. snapshotSeries reads
      // `WHERE is_example = 0` and it is right to: three fabricated lunations
      // would open the honest-sparse trend gate on a village that has closed
      // none. Seeding rows that a correct filter must always hide only makes
      // the boot log lie about how much was seeded — and the ids collided with
      // insertSnapshot's own `snap-<cycle>-<metric>`, so a later real backfill
      // of those cycles was silently swallowed by rows nothing could read.
      // The regen entries above DO render (regenEntries does not filter), and
      // they are what teaches the module.
      break;

    case "automation":
      for (const r of block.recordings ?? []) {
        n += await ins(p, "recordings", {
          id: r.id, source: r.source, title: r.title, url: r.url,
          duration_s: r.durationS, status: r.status, is_example: 1,
        });
        if (r.transcript) {
          n += await ins(p, "transcripts", {
            recording_id: r.id,
            body: (r.transcript.segments ?? []).map((s: any) => s.text).join("\n\n"),
            segments: J(r.transcript.segments), source: r.transcript.source,
          });
        }
        const s = r.synthesis;
        if (s) {
          n += await ins(p, "call_syntheses", {
            id: s.id, recording_id: r.id, ai_body: s.aiBody, body: s.body,
            chapters: J(s.chapters), decisions: J(s.decisions), model: s.model,
            dropped_task_count: s.droppedTaskCount, is_example: 1,
          });
          for (const t of s.tasks ?? []) {
            n += await ins(p, "call_tasks", {
              id: t.id, synthesis_id: s.id, description: t.description,
              quote: t.quote, timestamp_ms: t.timestampMs,
              role_id: t.roleId, status: t.status, is_example: 1,
            });
          }
        }
      }
      break;

    case "network":
      for (const s of block.sharedItems ?? []) {
        n += await ins(p, "shared_items", {
          id: s.id, type: s.type, title: s.title, detail: s.detail,
          contact: s.contact, created_by: EXAMPLE_AUTHOR, status: s.status, is_example: 1,
        });
      }
      for (const peer of block.peers ?? []) {
        n += await ins(p, "peer_instances", {
          id: peer.id, instance_id: peer.instanceId, base_url: peer.baseUrl,
          name: peer.name, version: peer.version, added_by: EXAMPLE_AUTHOR,
          status: peer.status, is_example: 1,
        });
        n += await ins(p, "peer_shared_cache", { peer_id: peer.id, payload: J(peer.cache) });
      }
      break;

    case "exchange":
      // A listing and a posted price, both display-only. The treasury is
      // deliberately NOT stocked, so even without the inert guard a purchase
      // refuses out-of-stock rather than minting.
      for (const l of block.listings ?? []) {
        const [[tok]] = await p.query<RowDataPacket[]>(
          "SELECT slug FROM tokens WHERE slug = ?", [l.tokenSlug],
        );
        if (!tok) {
          console.log(`[examples] exchange: token "${l.tokenSlug}" absent, skipping listing`);
          continue;
        }
        n += await ins(p, "token_exchange_settings", {
          token_slug: l.tokenSlug, purchasable: l.purchasable ? 1 : 0,
          swappable: l.swappable ? 1 : 0, active: l.active ? 1 : 0,
          sort_order: l.sortOrder, min_stage_to_buy: l.minStageToBuy, is_example: 1,
        });
        for (const [i, price] of (l.prices ?? []).entries()) {
          n += await ins(p, "currency_prices", {
            id: `ex-price-${l.tokenSlug}-${i + 1}`, token_slug: l.tokenSlug,
            price_minor: price.priceMinor, note: price.note,
            set_by: EXAMPLE_AUTHOR, is_example: 1,
          });
        }
      }
      break;

    // gratitude and profiles seed nothing, on purpose. A gratitude row posts to
    // the ledger at creation, so an example send would either mint real
    // recognition or break conservation; a profile belongs to its owner.
    default:
      break;
  }

  await stamp(p, moduleId, { seeded: true });
  await refreshRowPresence(p, moduleId);
  // Seeding writes raw rows, which the memory-cached collections cannot see.
  // Boot seeding runs after initStores, and enable-time seeding runs against a
  // long-warm cache, so without this the examples exist and never appear.
  if (n && reloadCaches) {
    try {
      await reloadCaches(EXAMPLE_TABLES[moduleId] ?? []);
    } catch (e) {
      console.error(`[examples] cache reload after seeding "${moduleId}" failed`, e);
    }
  }
  if (n) console.log(`[examples] seeded ${n} example row(s) for "${moduleId}"`);
  return n;
}

async function stamp(p: Pool, moduleId: string, o: { seeded: boolean }): Promise<void> {
  await p.query(
    "INSERT INTO example_state (module_id, seeded_at) VALUES (?, ?) " +
      "ON DUPLICATE KEY UPDATE seeded_at = VALUES(seeded_at)",
    [moduleId, o.seeded ? new Date() : null],
  );
  const prev = state.get(moduleId) ?? { seededAt: null, retiredAt: null, retiredReason: null };
  state.set(moduleId, { ...prev, seededAt: o.seeded ? new Date().toISOString() : null });
}

/**
 * Does this module already hold content the village made itself? Examples are
 * never layered over real content, and a module that already has real rows is
 * marked decided-without-seeding so the check runs once, not on every boot.
 */
export async function hasRealContent(p: Pool, moduleId: string): Promise<boolean> {
  const custom = REAL_CONTENT_CHECK[moduleId];
  if (custom) {
    try { return await custom(p); } catch { return false; }
  }
  for (const table of EXAMPLE_TABLES[moduleId] ?? []) {
    if (BY_PARENT[table] || NOT_EVIDENCE_OF_REAL_CONTENT.has(table)) continue;
    try {
      const [[r]] = await p.query<RowDataPacket[]>(
        `SELECT COUNT(*) n FROM \`${table}\` WHERE is_example = 0`,
      );
      if (Number(r.n) > 0) return true;
    } catch {
      // A module whose table does not exist yet simply has no real content.
    }
  }
  return false;
}

/**
 * Delete every example row for a module and stamp the permanent tombstone.
 *
 * Called from exactly two places: a module's own create path AFTER a real row
 * commits, and the admin clear endpoint. After the write, never before — a
 * failed create must not retire anything.
 *
 * Deliberately forgiving: retirement is housekeeping riding on someone else's
 * successful write, and it must never turn their 201 into a 500.
 */
export async function retireExamples(
  p: Pool,
  moduleId: string,
  reason: RetireReason,
  byUserId: string | null = null,
): Promise<number> {
  if (isRetired(moduleId)) return 0;
  let removed = 0;
  /** A DELETE that failed for a real reason — not a table this fork lacks. */
  let failed = false;
  try {
    // Release any REAL row still pointing at an example we are about to
    // delete. The library's admin intake picker offers every shelf, example
    // ones included, so the founder's first real donation is usually filed
    // under "Power tools" — and that same request triggers this retirement.
    // category_id carries no FK constraint, so the delete would succeed and
    // leave their item pointing at a shelf that no longer exists, permanently
    // uncategorised and unfilable.
    if (moduleId === "library") {
      await p.query(
        "UPDATE library_items SET category_id = NULL WHERE is_example = 0 AND category_id IN " +
          "(SELECT id FROM library_categories WHERE is_example = 1)",
      ).catch(() => { /* older forks without the column */ });
    }
    for (const table of EXAMPLE_TABLES[moduleId] ?? []) {
      const parent = BY_PARENT[table];
      try {
        if (parent) {
          const [r] = await p.query<any>(
            `DELETE FROM \`${table}\` WHERE \`${parent.fk}\` IN ` +
              `(SELECT \`${parent.parentKey}\` FROM \`${parent.parentTable}\` WHERE is_example = 1)`,
          );
          removed += r?.affectedRows ?? 0;
        } else {
          const scope = scopeFor(moduleId, table);
          const [r] = await p.query<any>(
            `DELETE FROM \`${table}\` WHERE is_example = 1` + (scope ? ` AND ${scope}` : ""),
          );
          removed += r?.affectedRows ?? 0;
        }
      } catch (e: any) {
        // A table or column this fork does not have is not a failure; anything
        // else is, and must not be papered over with a tombstone.
        const benign = e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR";
        if (!benign) failed = true;
        console.error(`[examples] could not clear ${table} for "${moduleId}"`, e);
      }
    }
    // The tombstone is permanent and short-circuits every later attempt,
    // including the admin clear button. Stamping it after a failed DELETE
    // would strand the surviving rows with no removal path but hand-written
    // SQL, while the module reported examplesRetired = true. Leave it unset so
    // the next trigger retries.
    if (failed) {
      console.error(`[examples] retiring "${moduleId}" left rows behind; not stamping the tombstone so it can retry`);
      return removed;
    }
    // Orphaned tag rows would otherwise outlive their threads.
    if (moduleId === "forum" || moduleId === "feed") {
      await p.query(
        "DELETE FROM forum_thread_tags WHERE thread_id NOT IN (SELECT id FROM forum_threads)",
      ).catch(() => {});
    }
    await p.query(
      "INSERT INTO example_state (module_id, retired_at, retired_reason, retired_by) " +
        "VALUES (?, NOW(), ?, ?) ON DUPLICATE KEY UPDATE " +
        "retired_at = VALUES(retired_at), retired_reason = VALUES(retired_reason), " +
        "retired_by = VALUES(retired_by)",
      [moduleId, reason, byUserId],
    );
    const prev = state.get(moduleId) ?? { seededAt: null, retiredAt: null, retiredReason: null };
    state.set(moduleId, { ...prev, retiredAt: new Date().toISOString(), retiredReason: reason });
    withRows.delete(moduleId);
    // The identities are shared, so they can only go once the last module that
    // could still be displaying their words has retired. Removing them earlier
    // would leave surviving example threads with an author nobody can resolve.
    await refreshRowPresence(p);
    if (withRows.size === 0) {
      const [r] = await p.query<any>("DELETE FROM users WHERE is_example = 1");
      if (r?.affectedRows) {
        console.log(`[examples] removed ${r.affectedRows} example identity/identities`);
      }
    }
    // Without this the rows are gone from MySQL and still on the page.
    if (reloadCaches) {
      try {
        await reloadCaches(EXAMPLE_TABLES[moduleId] ?? []);
      } catch (e) {
        console.error(`[examples] cache reload after retiring "${moduleId}" failed`, e);
      }
    }
    if (removed) {
      console.log(`[examples] retired ${removed} example row(s) for "${moduleId}" (${reason})`);
    }
  } catch (e) {
    console.error(`[examples] retiring "${moduleId}" failed (continuing)`, e);
  }
  return removed;
}

/**
 * The one call a module's create path makes after a real row commits. Fire and
 * forget — the caller's response must not wait on housekeeping, and must not
 * fail because of it.
 */
/**
 * Modules that must retire TOGETHER because they share a physical table AND a
 * category, so neither read path can tell them apart.
 *
 * The feed is a lens over `forum_threads`, both modules' examples sit in the
 * feed's category, and both list queries are category-wide (the forum's "All"
 * tab sends no category at all). Retiring one alone therefore deleted its own
 * rows, dropped its banner — and left the OTHER module's examples rendering on
 * the same page with no banner and no row-level marker. That is a worse bug
 * than the cross-deletion the scoping was added to fix: unlabelled platform
 * fiction presented as village content.
 *
 * Scoping still earns its keep — each module deletes only its own rows and
 * stamps its own tombstone — but the two tombstones are stamped together.
 */
const RETIRE_TOGETHER: Record<string, string[]> = {
  forum: ["feed"],
  feed: ["forum"],
};

export function onRealItemPublished(p: Pool, moduleId: string, byUserId: string | null = null): void {
  for (const id of [moduleId, ...(RETIRE_TOGETHER[moduleId] ?? [])]) {
    if (isRetired(id) || !isSeeded(id)) continue;
    void retireExamples(p, id, "first_real_item", byUserId);
  }
}

/**
 * Is this row a standing example?
 *
 * Asks the table directly rather than trusting whatever object a module's
 * mapper handed back. Most domain libraries build their records from an
 * explicit column list, so a new column does not reach them, and a guard that
 * silently reads `undefined` is a guard that never fires. One extra query on a
 * mutation path is the right price for that.
 */
export async function isExampleRow(
  p: Pool,
  table: string,
  id: string,
  idColumn = "id",
): Promise<boolean> {
  if (!id) return false;
  try {
    const [[row]] = await p.query<RowDataPacket[]>(
      `SELECT is_example FROM \`${table}\` WHERE \`${idColumn}\` = ? LIMIT 1`,
      [id],
    );
    return !!row && Number(row.is_example) === 1;
  } catch {
    // A missing column or table means the concept does not apply here, and a
    // guard that cannot answer must not block a real member's action.
    return false;
  }
}

/**
 * The identities that author example content. Excluded from the member
 * directory, launch counts, gratitude eligibility and badge evaluation — they
 * are content, not people, and every metric that counts humans must skip them.
 */
export function isExampleUser(u: Record<string, any> | null | undefined): boolean {
  return !!u && (u.isExample === true || u.isExample === 1);
}

/** SQL fragment for the many queries that must not count example members. */
export const NOT_EXAMPLE = "is_example = 0";
