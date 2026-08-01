/**
 * Badges v1 (S37-S40): data about people that flows into THE ONE GATE.
 *
 * Five kinds, five authorities:
 *   self     — the member's own declaration. Gates NOTHING (caps must be []).
 *   earned   — the engine's act, computed from SETTLED events only (consented
 *              quests, posted ledger rows, settled cycle distributions).
 *   granted  — an admin's act, with a note.
 *   warning  — an admin's act that DENIES capabilities. Deny beats role and
 *              stage in the gate (Gate E); only admin outranks it.
 *   hypha    — a mirror of an external fact. Display only (caps must be []).
 *
 * The recognition firewall: a capability-bearing EARNED badge may never ride
 * a recognition metric (gratitude_breadth). Recognition is social proof —
 * letting applause auto-mint permissions would let bought reach become
 * power. Boot refuses that configuration outright.
 *
 * The engine consumes what settlement already computed — in particular
 * gratitude_distributions.distinct_senders, which settleCycle produced
 * through the Sybil rule (eligibleSenderIds). It NEVER re-derives breadth
 * from raw sends.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ALL_CAPABILITIES } from "../../shared/capabilities";

export const BADGE_KINDS = ["self", "earned", "granted", "warning", "hypha"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const EARNED_METRICS = ["quests_consented", "ledger_earned_total", "gratitude_breadth"] as const;
/** Metrics that measure recognition: capability-bearing earned badges may not use them. */
export const RECOGNITION_METRICS: ReadonlySet<string> = new Set(["gratitude_breadth"]);

export interface BadgeRule {
  metric: (typeof EARNED_METRICS)[number];
  threshold: number;
  stackable?: boolean;
  maxStack?: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  kind: BadgeKind;
  capabilities: string[];
  denies: string[];
  rule: BadgeRule | null;
  active: boolean;
  /** A standing example: renders like any other badge, but never awards. */
  isExample: boolean;
}

const parseJsonArray = (v: unknown): string[] => {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch { return []; }
};

function rowToBadge(r: RowDataPacket): BadgeDef {
  let rule: BadgeRule | null = null;
  try {
    const raw = typeof r.rule === "string" ? JSON.parse(r.rule) : r.rule;
    if (raw && typeof raw === "object" && raw.metric) {
      rule = { metric: raw.metric, threshold: Number(raw.threshold), stackable: !!raw.stackable, maxStack: Number(raw.maxStack) || 1 };
    }
  } catch { /* an unreadable rule is a null rule; validation refuses it on write */ }
  return {
    id: String(r.id),
    name: String(r.name),
    description: r.description ?? null,
    icon: r.icon ?? null,
    kind: r.kind as BadgeKind,
    capabilities: parseJsonArray(r.capabilities),
    denies: parseJsonArray(r.denies),
    rule,
    active: !!r.active,
    isExample: Number(r.is_example) === 1,
  };
}

export async function allBadges(pool: Pool): Promise<BadgeDef[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM badges ORDER BY name");
  return rows.map(rowToBadge);
}

export async function badgeById(pool: Pool, id: string): Promise<BadgeDef | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM badges WHERE id = ?", [id]);
  return rows[0] ? rowToBadge(rows[0]) : null;
}

/**
 * One validator for the write path AND the boot assertion — a badge that
 * cannot be created can also never boot.
 */
export function badgeProblem(b: {
  kind: string;
  capabilities: string[];
  denies: string[];
  rule: BadgeRule | null;
}): string | null {
  if (!BADGE_KINDS.includes(b.kind as BadgeKind)) return `unknown badge kind "${b.kind}"`;
  const known = new Set<string>(ALL_CAPABILITIES);
  for (const c of b.capabilities) {
    if (!known.has(c)) return `unknown capability key "${c}": the gate would silently ignore it`;
  }
  for (const d of b.denies) {
    if (!known.has(d)) return `unknown capability key "${d}" in denies`;
  }
  if ((b.kind === "self" || b.kind === "hypha") && b.capabilities.length) {
    return `${b.kind} badges gate nothing. Self-declarations and external mirrors cannot carry capabilities`;
  }
  if (b.denies.length && b.kind !== "warning") {
    return "only warning badges may deny capabilities";
  }
  if (b.kind === "earned") {
    if (!b.rule) return "an earned badge needs a rule {metric, threshold}";
    if (!EARNED_METRICS.includes(b.rule.metric)) return `unknown metric "${b.rule.metric}"`;
    if (!(Number(b.rule.threshold) > 0)) return "the rule threshold must be positive";
    if (b.rule.stackable && !(Number(b.rule.maxStack) >= 1)) return "a stackable rule needs maxStack >= 1";
    if (b.capabilities.length && RECOGNITION_METRICS.has(b.rule.metric)) {
      return "a capability-bearing earned badge cannot ride a recognition metric. Applause must never auto-mint permissions";
    }
  } else if (b.rule) {
    return `only earned badges carry a rule (this one is ${b.kind})`;
  }
  return null;
}

/** Boot assertion: every ACTIVE badge must still validate. Refuse boot otherwise. */
export async function assertBadgeInvariants(pool: Pool): Promise<void> {
  const problems: string[] = [];
  for (const b of await allBadges(pool)) {
    if (!b.active) continue;
    const p = badgeProblem(b);
    if (p) problems.push(`badge "${b.id}": ${p}`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`[badge invariant] ${p}`);
    throw new Error(`badge invariants violated (${problems.length}), refusing to serve`);
  }
}

/**
 * The gate feed: what a member's ACTIVE, unexpired badge awards grant and
 * deny. One indexed query; lazy expiry is the WHERE clause, never a sweeper.
 */
export async function badgeGrantsFor(pool: Pool, userId: string): Promise<{ capabilities: string[]; denies: string[] }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT b.capabilities, b.denies FROM badge_awards a JOIN badges b ON b.id = a.badge_id " +
      "WHERE a.user_id = ? AND b.active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW())",
    [userId],
  );
  const capabilities = new Set<string>();
  const denies = new Set<string>();
  for (const r of rows) {
    for (const c of parseJsonArray(r.capabilities)) capabilities.add(c);
    for (const d of parseJsonArray(r.denies)) denies.add(d);
  }
  return { capabilities: Array.from(capabilities), denies: Array.from(denies) };
}

export interface AwardRow {
  id: string;
  badgeId: string;
  userId: string;
  count: number;
  awardedBy: string | null;
  note: string | null;
  expiresAt: string | null;
  featured?: boolean;
  reissueCount?: number;
  expired: boolean;
}

export async function awardsFor(pool: Pool, userId: string): Promise<AwardRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM badge_awards WHERE user_id = ?",
    [userId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    badgeId: String(r.badge_id),
    userId: String(r.user_id),
    count: Number(r.count),
    awardedBy: r.awarded_by ?? null,
    note: r.note ?? null,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    expired: !!r.expires_at && new Date(r.expires_at).getTime() <= Date.now(),
    featured: !!r.featured,
    reissueCount: Number(r.reissue_count ?? 0),
  }));
}

export async function upsertAward(
  pool: Pool,
  input: { badgeId: string; userId: string; count?: number; awardedBy?: string | null; note?: string | null; expiresAt?: Date | null },
): Promise<{ reissued: boolean; reissueCount: number }> {
  // B5: an overwrite IS a re-issue, and re-issues are counted — visibly.
  // The affectedRows convention (1 = insert, 2 = duplicate-key update) is
  // how MySQL tells us which happened. Re-awarding also clears the expiry
  // sweep marker: a fresh warning gets a fresh expiry story.
  const [r] = await pool.query<any>(
    "INSERT INTO badge_awards (id, badge_id, user_id, count, awarded_by, note, expires_at) VALUES (?,?,?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE count = VALUES(count), note = COALESCE(VALUES(note), note), " +
      "expires_at = VALUES(expires_at), awarded_by = COALESCE(VALUES(awarded_by), awarded_by), " +
      "reissue_count = reissue_count + 1, expiry_notified_at = NULL",
    [
      `ba-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      input.badgeId,
      input.userId,
      Math.max(1, Math.floor(input.count ?? 1)),
      input.awardedBy ?? null,
      input.note ?? null,
      input.expiresAt ?? null,
    ],
  );
  const reissued = Number((r as any).affectedRows) === 2;
  if (!reissued) return { reissued: false, reissueCount: 0 };
  const [[row]] = await pool.query<any[]>(
    "SELECT reissue_count FROM badge_awards WHERE badge_id = ? AND user_id = ?",
    [input.badgeId, input.userId],
  );
  return { reissued: true, reissueCount: Number(row?.reissue_count ?? 0) };
}

export interface ExpiredWarning {
  awardId: string;
  userId: string;
  badgeName: string;
  expiredAt: string;
  reissueCount: number;
}

/**
 * B4: the warning-expiry sweep. Reads already EXCLUDE expired awards — the
 * capability came back the second the clock passed — but nobody was ever
 * TOLD, and a standing that restores itself silently is indistinguishable
 * from one that never restores. Finds expired, un-notified warning awards,
 * marks them swept, and returns them so the caller can notify the member
 * and write the audit row. Idempotent: the marker makes each expiry a
 * one-time event however often the sweep runs.
 */
export async function sweepExpiredWarnings(pool: Pool): Promise<ExpiredWarning[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT a.id, a.user_id, a.expires_at, a.reissue_count, b.name FROM badge_awards a " +
      "JOIN badges b ON b.id = a.badge_id " +
      "WHERE b.kind = 'warning' AND a.expires_at IS NOT NULL AND a.expires_at <= NOW() AND a.expiry_notified_at IS NULL",
  );
  if (rows.length === 0) return [];
  await pool.query(
    `UPDATE badge_awards SET expiry_notified_at = NOW() WHERE id IN (${rows.map(() => "?").join(",")})`,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    awardId: String(r.id),
    userId: String(r.user_id),
    badgeName: String(r.name),
    expiredAt: new Date(r.expires_at).toISOString(),
    reissueCount: Number(r.reissue_count ?? 0),
  }));
}

// ── The earned engine ────────────────────────────────────────────────────────

/** metric -> Map<userId, value>, from SETTLED sources only. */
async function metricValues(pool: Pool, metric: string): Promise<Map<string, number>> {
  if (metric === "quests_consented") {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id, COUNT(*) AS v FROM quest_claims WHERE status = 'consented' GROUP BY user_id",
    );
    return new Map(rows.map((r) => [String(r.user_id), Number(r.v)]));
  }
  if (metric === "ledger_earned_total") {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT to_account, COALESCE(SUM(amount),0) AS v FROM token_ledger WHERE source = 'quest_consent' GROUP BY to_account",
    );
    return new Map(
      rows
        .filter((r) => String(r.to_account).startsWith("mem:"))
        .map((r) => [String(r.to_account).slice(4), Number(r.v)]),
    );
  }
  if (metric === "gratitude_breadth") {
    // CONSUMES the settlement's Sybil-filtered distinct_senders — the widest
    // breadth reached in any settled cycle. Never re-derived from raw sends.
    // Closed cycles only: the sticky-split close persists distribution rows
    // BEFORE the cycle flips to closed, and a badge must never be granted
    // from a settlement that has not actually settled.
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT d.user_id, MAX(d.distinct_senders) AS v FROM gratitude_distributions d " +
        "JOIN gratitude_cycles c ON c.id = d.cycle_id AND c.status = 'closed' GROUP BY d.user_id",
    );
    return new Map(rows.map((r) => [String(r.user_id), Number(r.v)]));
  }
  return new Map();
}

export interface EvaluateResult {
  badgesEvaluated: number;
  newTiers: { badgeId: string; userId: string; tier: number }[];
}

/**
 * Evaluate every active earned badge. Idempotent by construction: each tier
 * is one badge_events row keyed `rule:{badgeId}:{userId}:tier-{n}`, and the
 * award count is RECOMPUTED to the target, never incremented. Tiers never
 * retract in v1 — the metric moved past the line while it was the rule, and
 * that fact does not un-happen.
 */
export async function evaluateEarnedBadges(pool: Pool): Promise<EvaluateResult> {
  // Example badges are skipped: the engine runs at every cycle close, so an
  // example earned badge would quietly award itself to every qualifying member
  // and the definition would stop being inert.
  const earned = (await allBadges(pool)).filter(
    (b) => b.active && b.kind === "earned" && b.rule && !b.isExample,
  );
  const newTiers: EvaluateResult["newTiers"] = [];
  for (const badge of earned) {
    const rule = badge.rule!;
    const values = await metricValues(pool, rule.metric);
    const [awardRows] = await pool.query<RowDataPacket[]>(
      "SELECT user_id, count FROM badge_awards WHERE badge_id = ?",
      [badge.id],
    );
    const current = new Map(awardRows.map((r) => [String(r.user_id), Number(r.count)]));
    for (const [userId, value] of Array.from(values.entries())) {
      const cap = rule.stackable ? Math.max(1, Math.floor(rule.maxStack ?? 1)) : 1;
      const target = Math.min(Math.floor(value / rule.threshold), cap);
      const have = current.get(userId) ?? 0;
      if (target <= have) continue;
      for (let tier = have + 1; tier <= target; tier++) {
        try {
          await pool.query(
            "INSERT INTO badge_events (id, badge_id, user_id, tier, idempotency_key) VALUES (?,?,?,?,?)",
            [
              `be-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              badge.id,
              userId,
              tier,
              `rule:${badge.id}:${userId}:tier-${tier}`,
            ],
          );
          newTiers.push({ badgeId: badge.id, userId, tier });
        } catch (e: any) {
          if (e?.code !== "ER_DUP_ENTRY") throw e; // a replayed tier is a no-op
        }
      }
      await upsertAward(pool, { badgeId: badge.id, userId, count: target, awardedBy: null });
    }
  }
  return { badgesEvaluated: earned.length, newTiers };
}

/** Open state that blocks module-off: standing warnings are live governance. */
export async function badgesOpenState(pool: Pool): Promise<{ count: number; description: string }> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM badge_awards a JOIN badges b ON b.id = a.badge_id " +
      "WHERE b.kind = 'warning' AND b.active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW())",
  );
  return { count: Number(row.n), description: `${row.n} active warning badge(s)` };
}

// ── Skill tags ───────────────────────────────────────────────────────────────

export async function skillsFor(pool: Pool, userId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT tag FROM skill_tags WHERE user_id = ? ORDER BY tag",
    [userId],
  );
  return rows.map((r) => String(r.tag));
}

export async function addSkill(pool: Pool, userId: string, tag: string): Promise<boolean> {
  try {
    await pool.query("INSERT INTO skill_tags (id, user_id, tag) VALUES (?,?,?)", [
      `sk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      tag,
    ]);
    return true;
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") return false;
    throw e;
  }
}

export async function removeSkill(pool: Pool, userId: string, tag: string): Promise<boolean> {
  const [r] = await pool.query<any>("DELETE FROM skill_tags WHERE user_id = ? AND tag = ?", [userId, tag]);
  return !!(r as any).affectedRows;
}
