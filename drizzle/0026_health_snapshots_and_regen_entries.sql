-- 0026 (S49): health snapshots + regen entries.
-- Snapshots are POINT-IN-TIME facts written once when a cycle closes —
-- member counts, engagement, Sybil-filtered breadth cannot be honestly
-- reconstructed later (F13: "the data is unrecoverable retroactively").
-- UNIQUE(cycle_number, metric_key) + insert-ignore semantics mean a closed
-- cycle's snapshot can never be recomputed or overwritten: re-running the
-- close writes nothing new.
CREATE TABLE IF NOT EXISTS `health_snapshots` (
  `id` varchar(120) NOT NULL,
  `cycle_number` int NOT NULL,
  `metric_key` varchar(64) NOT NULL,
  `value` decimal(20,4) NOT NULL,
  `meta` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `health_snapshots_cycle_metric_uq` (`cycle_number`, `metric_key`),
  KEY `health_snapshots_metric_idx` (`metric_key`, `cycle_number`)
);

-- Regen entries: the land's own ledger — trees planted, water protected,
-- hectares restored. Hand-recorded by stewards (absolute counts, never
-- percentiles), audit-attributed, and the investor-facing impact feed.
CREATE TABLE IF NOT EXISTS `regen_entries` (
  `id` varchar(64) NOT NULL,
  `metric_key` varchar(64) NOT NULL,
  `value` decimal(20,4) NOT NULL,
  `unit` varchar(32) NOT NULL,
  `note` text NULL,
  `recorded_by` varchar(64) NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `regen_entries_metric_idx` (`metric_key`, `recorded_at`)
);
