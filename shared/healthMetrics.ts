/**
 * THE health-metric registry (S49): every number the village tracks about
 * itself, as data, shared by server and client.
 *
 * Two families:
 *   snapshot — computed ONCE when a lunar cycle closes and frozen forever
 *              (point-in-time facts are unrecoverable retroactively — F13).
 *   regen    — the land's ledger, hand-recorded by stewards: trees planted,
 *              water protected. ABSOLUTE COUNTS, never percentiles or ranks
 *              (a rank over a village-sized population is noise with a
 *              scoreboard attached), and never a per-person leaderboard.
 */

export type HealthMetricKind = "snapshot" | "regen";

export interface HealthMetricDef {
  key: string;
  kind: HealthMetricKind;
  label: string;
  unit: string;
  description: string;
}

export const HEALTH_METRICS: HealthMetricDef[] = [
  // ── Snapshots: frozen at each cycle close ──────────────────────────────────
  {
    key: "members_total",
    kind: "snapshot",
    label: "Members",
    unit: "people",
    description: "Accounts at close (tombstones excluded).",
  },
  {
    key: "members_active_cycle",
    kind: "snapshot",
    label: "Active this cycle",
    unit: "people",
    description: "Distinct members who did anything the village heard about during the lunation.",
  },
  {
    key: "events_total_cycle",
    kind: "snapshot",
    label: "Village events",
    unit: "events",
    description: "Everything the event spine recorded during the lunation; the per-kind split rides in meta.",
  },
  {
    key: "gratitude_senders_distinct",
    kind: "snapshot",
    label: "Members who gave recognition",
    unit: "people",
    description: "Distinct ELIGIBLE senders this cycle — the Sybil rule (stage >= member or >= 1 consented quest) is consumed from settlement, never re-implemented.",
  },
  {
    key: "gratitude_recipients_distinct",
    kind: "snapshot",
    label: "Members who were recognized",
    unit: "people",
    description: "Distinct recipients of recognition this cycle.",
  },
  {
    key: "quests_consented_cycle",
    kind: "snapshot",
    label: "Quests consented",
    unit: "quests",
    description: "Work shown and consented to during the lunation.",
  },
  {
    key: "decisions_opened_cycle",
    kind: "snapshot",
    label: "Decisions opened",
    unit: "decisions",
    description: "Governance threads opened during the lunation; distinct authors ride in meta (authorship concentration is the F13 read).",
  },

  // ── Regen: the land's own ledger, steward-recorded ─────────────────────────
  { key: "trees_planted", kind: "regen", label: "Trees planted", unit: "trees", description: "Cumulative plantings, recorded as they happen." },
  { key: "hectares_restored", kind: "regen", label: "Hectares in restoration", unit: "ha", description: "Land under active regeneration." },
  { key: "food_produced_kg", kind: "regen", label: "Food produced", unit: "kg", description: "Harvest weighed out of the gardens and food forest." },
  { key: "water_protected_liters", kind: "regen", label: "Water protected", unit: "liters", description: "Storage and springflow brought under protection." },
  { key: "carbon_sequestered_kg", kind: "regen", label: "Carbon sequestered", unit: "kg", description: "Estimated sequestration from plantings and soil work." },
];

export const HEALTH_METRICS_BY_KEY: Record<string, HealthMetricDef> = Object.fromEntries(
  HEALTH_METRICS.map((m) => [m.key, m]),
);

export const SNAPSHOT_METRICS = HEALTH_METRICS.filter((m) => m.kind === "snapshot");
export const REGEN_METRICS = HEALTH_METRICS.filter((m) => m.kind === "regen");

/** How many lunations of snapshots the dashboard needs before trends render. */
export const TREND_MIN_LUNATIONS = 3;
