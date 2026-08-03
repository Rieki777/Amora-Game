-- The mechanics amendment ledger (Game Mechanics initiative, 2026-07-31).
--
-- game_variables stores DELTAS ONLY -- reverting a value to its platform
-- default DELETES the row, which is right for inheritance and fatal for
-- history: the record of what the village changed, and changed back, was
-- being thrown away. This table is the append-only story of every mechanics
-- change: who moved which dial, from what to what, under whose authority.
-- The public Game Mechanics page renders it as the village's amendment
-- history; the future Hypha loop stamps proposal_ref with the on-chain
-- proposal id and transaction hash.
--
-- NULL old/new value means "the platform default at the time" -- deliberately
-- NOT resolved to a literal, because the default can move with a platform
-- upgrade and this row records the village's ACT, not the platform's state.
-- House rule: no comment line in this file may end with a semicolon
CREATE TABLE IF NOT EXISTS `mechanics_changes` (
  `id` varchar(64) NOT NULL,
  `config_key` varchar(191) NOT NULL,
  `old_value` varchar(255) NULL,
  `new_value` varchar(255) NULL,
  `actor_user_id` varchar(64) NULL,
  `source` enum('admin','governance','platform') NOT NULL DEFAULT 'admin',
  `proposal_ref` varchar(255) NULL,
  `note` varchar(500) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `mechanics_changes_key_idx` (`config_key`, `at`),
  KEY `mechanics_changes_at_idx` (`at`)
);
