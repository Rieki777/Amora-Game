-- 0046 — Standing examples.
--
-- Every non-core module ships OFF. A founder turns one on and meets
-- "No items yet." — the module works and teaches nothing. Standing examples
-- fill that void with platform-authored worked content that retires itself
-- the moment the village publishes anything real.
--
-- The flag lives ON THE ROW rather than in a side table, so it travels through
-- every existing SELECT and no read path can present an example as real.
-- DEFAULT 0 means every row that already exists is correctly marked real.
--
-- Examples are INERT: mutations against them are refused, so no example ever
-- becomes a ledger row, escrow, a Stripe object, or open economic state.
-- See docs/STANDING_EXAMPLES.md.

ALTER TABLE `users` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `circles` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `roles` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `quests` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `forum_threads` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `forum_replies` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `tools` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `library_categories` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `library_items` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `accommodations` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `accommodation_prices` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `payment_products` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `badges` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `regen_entries` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `health_snapshots` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `health_events` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `recordings` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `call_syntheses` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `call_tasks` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `shared_items` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `peer_instances` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `token_exchange_settings` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `currency_prices` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `gratitude_log` ADD COLUMN `is_example` tinyint(1) NOT NULL DEFAULT 0;

-- Per-module bookkeeping. seeded_at makes seeding idempotent; retired_at is a
-- PERMANENT tombstone, so examples cannot return once a village has spoken for
-- itself. Deleting your real items later does not bring them back.

CREATE TABLE IF NOT EXISTS `example_state` (
  `module_id` varchar(64) NOT NULL,
  `seeded_at` timestamp NULL DEFAULT NULL,
  `retired_at` timestamp NULL DEFAULT NULL,
  `retired_reason` varchar(64) DEFAULT NULL,
  `retired_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Partial indexes do not exist in MySQL, and example rows are a handful per
-- module, so retirement scans by flag. These two carry the most rows and are
-- the only ones where the scan is worth an index.

CREATE INDEX `forum_threads_example_idx` ON `forum_threads` (`is_example`);
CREATE INDEX `health_events_example_idx` ON `health_events` (`is_example`);
