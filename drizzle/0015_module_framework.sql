-- 0015 (S13): the module framework's two tables. DB-native day one — there
-- is no JSON era for module state (critique override #1).
--
-- module_settings is delta-only, like game_variables: an ABSENT row is the
-- platform default (lifecycle 'off'), so forks inherit every new module as
-- OFF and enabling is always a deliberate per-deployment admin act.
CREATE TABLE IF NOT EXISTS `module_settings` (
  -- Must exist in the code registry (shared/modules.ts); unknown ids are
  -- refused on write and listed as orphans on read, never served.
  `module_id` varchar(64) NOT NULL,
  `lifecycle` enum('off','preview','members','public') NOT NULL DEFAULT 'off',
  -- Structural config (categories, registries…), validated by the module's
  -- validateConfig() before every write. Tunables live in game_variables
  -- and identity lives in brand — the config split is the paved path.
  `config` json NULL,
  `updated_by` varchar(64) NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`module_id`)
);

-- Append-only: every lifecycle or config change, who and when. The S49
-- dashboard reads this; nothing ever updates or deletes a row.
CREATE TABLE IF NOT EXISTS `module_events` (
  `id` varchar(64) NOT NULL,
  `module_id` varchar(64) NOT NULL,
  `kind` enum('lifecycle','config') NOT NULL,
  `from_value` varchar(255) NULL,
  `to_value` varchar(255) NULL,
  `by_user_id` varchar(64) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `module_events_module_idx` (`module_id`, `at`)
);
