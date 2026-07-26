-- 0003: the variables layer, and stage advancement events.
--
-- game_variables is the customization foundation: every tunable rule of the game
-- lives here as data so a village edits its own game from Admin without a deploy.
--
-- Two deliberate differences from regen-civics' equivalent table:
--
--   1. `value` is varchar, not decimal(20,6). Regen's is numeric-only, which
--      cannot express "one person one voice OR mirror Hypha holdings" or hold an
--      ERC-20 address. One string column plus a `value_type` tag carries numbers,
--      booleans, choices and addresses without a column per kind.
--   2. Only CHANGED values are stored. Regen seeds every row by migration, so
--      changing a default needs a migration and a village silently keeps whatever
--      was seeded on launch day. Here an absent row means "use the platform
--      default from shared/gameVariables.ts", so upgrades are inherited.
--
-- stage_events exists because advancement previously left no trace: a profile
-- could not show "you reached Contributor and this opened", and no test could
-- assert it.

CREATE TABLE IF NOT EXISTS `game_variables` (
  `config_key` varchar(100) NOT NULL,
  `value` varchar(255) NOT NULL,
  `value_type` enum('integer','decimal','percentage','boolean','choice','text') NOT NULL,
  `updated_by` varchar(64),
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
);

CREATE TABLE IF NOT EXISTS `stage_events` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `from_stage` varchar(64) NOT NULL,
  `to_stage` varchar(64) NOT NULL,
  `unlocked` json,
  `reason` varchar(255),
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stage_events_user_idx` (`user_id`, `at`)
);

-- Admins become real users (decision 2: adding admins is step one of any new
-- custom game). Until now the only admin identity was a shared password, so
-- every audit row had nothing truthful to write for "who did this".
-- `handle` is the public identifier the forum's @mentions will need; without it
-- mentions would have to route by email and leak member addresses.
-- `wallet_address` binds a member to on-chain holdings, and `wallet_verified_at`
-- records that they proved control by signing, because showing equity next to
-- someone's name on an unproven claim is a cap-table misstatement.
ALTER TABLE `users`
  ADD COLUMN `role` varchar(32) NOT NULL DEFAULT 'member',
  ADD COLUMN `handle` varchar(40) NULL,
  ADD COLUMN `wallet_address` varchar(42) NULL,
  ADD COLUMN `wallet_verified_at` timestamp NULL;

CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);
CREATE UNIQUE INDEX `users_wallet_unique` ON `users` (`wallet_address`);
