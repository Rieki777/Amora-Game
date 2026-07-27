/**
 * Village health (S49-S51): snapshot collection + the dashboard's reads.
 *
 * COLLECTION IS INFRASTRUCTURE, DISPLAY IS THE MODULE. Snapshots ride the
 * admin-triggered cycle close whether or not the health module is enabled -
 * point-in-time facts (member counts, eligibility-filtered breadth) are
 * unrecoverable retroactively (F13), so every close without the hook would
 * be a lunation of history lost. The dashboard PAGE ships behind the
 * module's OFF lifecycle and the village flips it when there is something
 * honest to show (the calendar guard, honored without losing data).
 *
 * Snapshot rules:
 *   - Written ONCE per (cycle_number, metric_key), insert-ignore. A closed
 *     cycle's numbers are never recomputed - recomputing later freezes
 *     different values depending on when you ran it, which is how a
 *     dashboard starts lying.
 *   - Economic metrics attribute by the WRITE-TIME cycle stamp on
 *     gratitude rows (2.2 #4); only event/consent counts window on time,
 *     because those rows carry no stamp.
 *   - The Sybil rule is CONSUMED (the close passes its eligible-sender
 *     set in), never re-implemented (2.2 #9).
 *   - Snapshot failure never fails the close: the trace must not outrank
 *     the mutation. Failures land as an admin-audience event instead.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { SNAPSHOT_METRICS } from "../../shared/healthMetrics";

export interface SnapshotCycle {
  id: string;
  cycleNumber: number;
  startsAt: string;
  endsAt: string;
}

async function insertSnapshot(pool: Pool, cycleNumber: number, metricKey: string, value: number, meta?: any): Promise<void> {
  await pool.query(
    "INSERT IGNORE INTO health_snapshots (id, cycle_number, metric_key, value, meta) VALUES (?,?,?,?,?)",
    [`snap-${cycleNumber}-${metricKey}`.slice(0, 120), cycleNumber, metricKey, value, meta ? JSON.stringify(meta) : null],
  );
}

/**
 * Compute and freeze every snapshot metric for one just-closed cycle.
 * Idempotent by the UNIQUE key: a crash-retry or double close writes nothing
 * the first pass didn't.
 */
export async function snapshotCycle(pool: Pool, cycle: SnapshotCycle, eligibleSenders: Set<string>): Promise<void> {
  const start = new Date(cycle.startsAt);
  const end = new Date(cycle.endsAt);

  // members_total: real accounts (tombstones carry an anonymized.invalid email).
  const [[membersRow]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM users WHERE email NOT LIKE '%anonymized.invalid'",
  );
  await insertSnapshot(pool, cycle.cycleNumber, "members_total", Number(membersRow.n));

  // Event-spine reads: windowed on at (these rows carry no cycle stamp).
  const [kinds] = await pool.query<RowDataPacket[]>(
    "SELECT kind, COUNT(*) AS n FROM health_events WHERE at >= ? AND at < ? GROUP BY kind",
    [start, end],
  );
  const byKind: Record<string, number> = {};
  let totalEvents = 0;
  for (const k of kinds) { byKind[String(k.kind)] = Number(k.n); totalEvents += Number(k.n); }
  await insertSnapshot(pool, cycle.cycleNumber, "events_total_cycle", totalEvents, { byKind });

  const [[activeRow]] = await pool.query<any[]>(
    "SELECT COUNT(DISTINCT actor_user_id) AS n FROM health_events WHERE at >= ? AND at < ? AND actor_user_id IS NOT NULL",
    [start, end],
  );
  await insertSnapshot(pool, cycle.cycleNumber, "members_active_cycle", Number(activeRow.n));

  // Recognition reads: attributed by the WRITE-TIME cycle stamp, never a
  // time window - the rows carry the stamp for exactly this reason.
  const [senders] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT from_id FROM gratitude_log WHERE cycle_id = ?",
    [cycle.id],
  );
  const eligibleCount = senders.filter((s) => eligibleSenders.has(String(s.from_id))).length;
  await insertSnapshot(pool, cycle.cycleNumber, "gratitude_senders_distinct", eligibleCount, {
    rawSenders: senders.length,
  });
  const [[recipientsRow]] = await pool.query<any[]>(
    "SELECT COUNT(DISTINCT to_id) AS n FROM gratitude_log WHERE cycle_id = ?",
    [cycle.id],
  );
  await insertSnapshot(pool, cycle.cycleNumber, "gratitude_recipients_distinct", Number(recipientsRow.n));

  // Consents: windowed on consented_at (claims carry no cycle stamp).
  const [[consentsRow]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM quest_claims WHERE status = 'consented' AND consented_at >= ? AND consented_at < ?",
    [start, end],
  );
  await insertSnapshot(pool, cycle.cycleNumber, "quests_consented_cycle", Number(consentsRow.n));

  // Governance: decisions opened + distinct authors (the F13 authorship-
  // concentration read builds on this). Zero rows is a fact, not a failure.
  const [[decRow]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT author_id) AS authors FROM forum_threads " +
      "WHERE kind = 'decision' AND created_at >= ? AND created_at < ?",
    [start, end],
  ).catch(() => [[{ n: 0, authors: 0 }]] as any);
  await insertSnapshot(pool, cycle.cycleNumber, "decisions_opened_cycle", Number(decRow.n), {
    distinctAuthors: Number(decRow.authors),
  });

  // ── H3: the reserved keys, wired to real sources ────────────────────────
  // Each is wrapped: a module that never shipped in this deployment has no
  // table, and a missing table must leave the metric ABSENT rather than
  // recording a zero. Zero means "we measured none"; absent means "we do
  // not run that" — a dashboard that confuses them lies quietly for months.

  // Library utilization: items that saw a loan this lunation / items owned.
  try {
    const [[libRow]] = await pool.query<any[]>(
      "SELECT (SELECT COUNT(*) FROM library_items WHERE status <> 'written_off') AS items, " +
        "(SELECT COUNT(DISTINCT item_id) FROM library_loans WHERE created_at >= ? AND created_at < ?) AS loaned",
      [start, end],
    );
    const items = Number(libRow.items);
    if (items > 0) {
      const loaned = Number(libRow.loaned);
      await insertSnapshot(
        pool, cycle.cycleNumber, "library_utilization_pct",
        Math.round((loaned / items) * 100),
        { items, itemsLoaned: loaned },
      );
    }
  } catch { /* library module never ran here */ }

  // Stay occupancy: nights POSTED (slept), never nights booked.
  try {
    const [[nightsRow]] = await pool.query<any[]>(
      "SELECT COALESCE(SUM(amount),0) AS nights FROM token_ledger WHERE source = 'stay_night' AND at >= ? AND at < ?",
      [start, end],
    );
    await insertSnapshot(pool, cycle.cycleNumber, "stay_occupancy_nights", Number(nightsRow.nights));
  } catch { /* stays never ran here */ }

  // Treasury + faucet issuance, straight from the ledger's own accounts.
  try {
    const [treasury] = await pool.query<RowDataPacket[]>(
      "SELECT token_type, balance FROM token_balances WHERE account_id = 'sys:treasury' AND balance <> 0",
    );
    const perToken: Record<string, number> = {};
    let total = 0;
    for (const t of treasury) { perToken[String(t.token_type)] = Number(t.balance); total += Number(t.balance); }
    await insertSnapshot(pool, cycle.cycleNumber, "treasury_balance", total, { perToken });

    // A faucet's NEGATIVE balance is issuance-to-date; report it positive.
    const [[poolRow]] = await pool.query<any[]>(
      "SELECT COALESCE(SUM(balance),0) AS b FROM token_balances WHERE account_id = 'sys:gratitude-pool'",
    );
    await insertSnapshot(pool, cycle.cycleNumber, "gratitude_pool_issued", Math.abs(Number(poolRow.b)));
  } catch { /* ledger tables are core; this should not fail */ }
}

export interface ThresholdAlert {
  metricKey: string;
  label: string;
  direction: "fell" | "rose";
  value: number;
  previous: number;
  changePct: number;
}

/**
 * H7 (Wave 1): threshold alerts, computed from the frozen series.
 *
 * Deliberately NOT configurable thresholds per metric — a village drowning
 * in knobs sets none of them. The rule is one sentence: a snapshot metric
 * that moved more than `pct` against its own previous value is worth a
 * steward's attention, in either direction. Requires at least two closed
 * lunations, because a "change" with one data point is a fabrication.
 *
 * Direction is reported, never judged: a fall in decisions opened might be
 * peace or apathy, and the dashboard is not qualified to say which.
 */
export async function thresholdAlerts(pool: Pool, pct: number): Promise<ThresholdAlert[]> {
  const { series } = await snapshotSeries(pool);
  const out: ThresholdAlert[] = [];
  for (const m of SNAPSHOT_METRICS) {
    const points = series[m.key] ?? [];
    if (points.length < 2) continue;
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    // A move away from zero is unbounded as a percentage; report it as a
    // fact ("0 -> 12") rather than as infinity.
    if (prev.value === 0) {
      if (latest.value !== 0) {
        out.push({ metricKey: m.key, label: m.label, direction: "rose", value: latest.value, previous: 0, changePct: 100 });
      }
      continue;
    }
    const change = ((latest.value - prev.value) / prev.value) * 100;
    if (Math.abs(change) >= pct) {
      out.push({
        metricKey: m.key, label: m.label,
        direction: change < 0 ? "fell" : "rose",
        value: latest.value, previous: prev.value,
        changePct: Math.round(change),
      });
    }
  }
  return out;
}

// -- Reads for the dashboard --------------------------------------------------

export interface SnapshotSeriesPoint {
  cycleNumber: number;
  value: number;
  meta: any;
}

export async function snapshotSeries(pool: Pool): Promise<{ lunationsCollected: number; series: Record<string, SnapshotSeriesPoint[]> }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT cycle_number, metric_key, value, meta FROM health_snapshots ORDER BY cycle_number ASC",
  );
  const series: Record<string, SnapshotSeriesPoint[]> = {};
  const cycles = new Set<number>();
  for (const r of rows) {
    cycles.add(Number(r.cycle_number));
    const key = String(r.metric_key);
    (series[key] ??= []).push({
      cycleNumber: Number(r.cycle_number),
      value: Number(r.value),
      meta: typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta,
    });
  }
  // Every registry metric appears, even before its first point - the client
  // renders honest emptiness, not undefined.
  for (const m of SNAPSHOT_METRICS) series[m.key] ??= [];
  return { lunationsCollected: cycles.size, series };
}

export interface RegenEntry {
  id: string;
  metricKey: string;
  value: number;
  unit: string;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}

export async function regenEntries(pool: Pool, limit = 100): Promise<RegenEntry[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM regen_entries ORDER BY recorded_at DESC, id DESC LIMIT ?",
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    metricKey: String(r.metric_key),
    value: Number(r.value),
    unit: String(r.unit),
    note: r.note ?? null,
    recordedBy: String(r.recorded_by),
    recordedAt: new Date(r.recorded_at).toISOString(),
  }));
}

/** Absolute cumulative totals per regen metric - the impact tiles. */
export async function regenTotals(pool: Pool): Promise<Record<string, { total: number; unit: string; entries: number }>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT metric_key, SUM(value) AS total, MAX(unit) AS unit, COUNT(*) AS n FROM regen_entries GROUP BY metric_key",
  );
  const out: Record<string, { total: number; unit: string; entries: number }> = {};
  for (const r of rows) out[String(r.metric_key)] = { total: Number(r.total), unit: String(r.unit), entries: Number(r.n) };
  return out;
}

/**
 * Governance reads (F13's dashboard list), computed honestly: null with a
 * reason when the data cannot support the number yet. The one framing rule
 * that ships with the data: an objection rate TRENDING TO ZERO is a warning
 * (silence), not a win - the client must render it that way when it exists.
 */
export async function governanceReads(pool: Pool): Promise<{
  decisionsAllTime: number;
  distinctAuthors: number;
  authorshipConcentration: number | null;
  note: string;
}> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT author_id) AS authors FROM forum_threads WHERE kind = 'decision'",
  ).catch(() => [[{ n: 0, authors: 0 }]] as any);
  const decisions = Number(row.n);
  let concentration: number | null = null;
  if (decisions >= 3) {
    const [[top]] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM forum_threads WHERE kind = 'decision' GROUP BY author_id ORDER BY n DESC LIMIT 1",
    );
    concentration = Number(top.n) / decisions;
  }
  return {
    decisionsAllTime: decisions,
    distinctAuthors: Number(row.authors),
    authorshipConcentration: concentration,
    note:
      decisions < 3
        ? "Too few decisions to read authorship concentration honestly yet."
        : "Share of decisions opened by the single most frequent author. Rising concentration is worth a conversation; an objection rate trending to ZERO is a warning, not a win.",
  };
}
