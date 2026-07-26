-- 0006: the token registry, and `token_type` widens from enum to varchar.
--
-- 0005 fixed `token_type` at three enum values, reasoning that widening a live
-- MySQL enum later is the migration regen-civics refused to do. The village
-- module layer (Rye, 2026-07-26) inverts that logic: internal tokens are
-- CREATED AT RUNTIME by admins — material library credits, stay credits,
-- access tokens, event tickets — so a closed enum GUARANTEES the feared
-- widening migration, once per new module. Converting now costs nothing
-- (nothing writes to token_ledger in MySQL yet); converting after the Phase 1b
-- cutover is exactly the live-data migration 0005 was trying to avoid.
--
-- Same day-one discipline, one level up: the COLUMN is right forever (a stable
-- varchar reference), and "which tokens exist" becomes data in this registry,
-- where modules can add rows without DDL.
--
-- `governance` is the load-bearing column: 'platform' tokens are minted and
-- moved by this database; 'hypha' tokens (equity, voice) live on Base under
-- Hypha and are read-only mirrors here. The ledger guard reads the registry
-- now instead of hardcoding 'gratitude' (server/lib/ledger.ts).
--
-- Brand names in the seed rows are correct, not a violation of the
-- no-brand-in-platform rule: this table is per-deployment DATA, like
-- brand.json. A fork seeds its own token names.

CREATE TABLE IF NOT EXISTS `tokens` (
  `slug` varchar(32) NOT NULL,
  `name` varchar(120) NOT NULL,
  -- Levers-spec taxonomy: recognition | equity | voice | credit.
  `kind` varchar(32) NOT NULL,
  -- 'platform' = this database mints and moves it; 'hypha' = read-only mirror.
  `governance` varchar(16) NOT NULL DEFAULT 'platform',
  `decimals` int NOT NULL DEFAULT 0,
  -- May members send it peer-to-peer?
  `transferable` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`slug`)
);

INSERT IGNORE INTO `tokens` (`slug`, `name`, `kind`, `governance`, `transferable`, `sort_order`) VALUES
  ('gratitude', 'Gratitude', 'recognition', 'platform', 1, 1),
  ('amora', 'Amora', 'equity', 'hypha', 0, 2),
  ('voice', 'Voice', 'voice', 'hypha', 0, 3);

-- enum -> varchar preserves existing values verbatim; the composite index
-- (user_id, token_type) survives the MODIFY.
ALTER TABLE `token_ledger`
  MODIFY COLUMN `token_type` varchar(32) NOT NULL DEFAULT 'gratitude';
