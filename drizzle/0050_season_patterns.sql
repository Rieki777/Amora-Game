-- 0050: a season carries a PATTERN, and a badge knows whether its powers
-- are permanent or seasonal.
--
-- A village runs the same shapes again: a festival season with its own
-- circles, seats, badges and quests, then a building season with a different
-- suite. Until now a season was a name and two dates in a config document,
-- carrying no structure at all, so every year the village rebuilt its
-- festival from memory.
--
-- A pattern is a MEMBERSHIP LIST, never a copy. One seat can belong to
-- several patterns; editing it edits it everywhere and its history stays
-- continuous across every season it ever ran in. Nothing is duplicated and
-- nothing is deleted: a row with no membership at all is permanent and always
-- live, which is the safe default and means a village that never touches
-- patterns sees no change whatsoever.
--
-- Deliberately NOT modelled on the standing-examples machinery, which looks
-- like the same problem and is the opposite one: examples retire ONE WAY
-- behind a permanent tombstone and hide by DELETING, while a season must come
-- back next year with its rows intact.

CREATE TABLE IF NOT EXISTS `season_patterns` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  -- A founding season runs once. A festival returns every year.
  `recurrence` enum('once','recurring') NOT NULL DEFAULT 'recurring',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- What belongs to a pattern. The catalogue is every row the village has ever
-- made; a pattern is a selection from it.
CREATE TABLE IF NOT EXISTS `season_pattern_members` (
  `id` varchar(64) NOT NULL,
  `pattern_id` varchar(64) NOT NULL,
  `kind` enum('circle','org_role','badge','quest') NOT NULL,
  `entity_id` varchar(64) NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `season_pattern_members_uq` (`pattern_id`, `kind`, `entity_id`),
  KEY `season_pattern_members_entity_idx` (`kind`, `entity_id`)
);

-- Every change a roll made, append-only.
--
-- The roll WRITES lifecycle columns that existing queries already respect,
-- instead of teaching forty hand-written reads a new question. That is only
-- honest if what it changed is recoverable, so each change is a row here.
CREATE TABLE IF NOT EXISTS `season_roll_log` (
  `id` varchar(64) NOT NULL,
  `season_id` varchar(64) NULL,
  `pattern_id` varchar(64) NULL,
  `kind` varchar(32) NOT NULL,
  `entity_id` varchar(64) NOT NULL,
  `from_value` varchar(64) NULL,
  `to_value` varchar(64) NULL,
  `by_user_id` varchar(64) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `season_roll_log_at_idx` (`at`),
  KEY `season_roll_log_season_idx` (`season_id`)
);

-- A badge carries powers: capabilities, or a reward multiplier. Whether those
-- powers are always live or live only during their seasons is a property of
-- the badge, chosen when it is created.
--
-- `permanent` (the default, and what every existing badge becomes) means the
-- powers never lapse. A moderator badge keeps moderating between festivals.
--
-- `seasonal` means the powers apply only while a season running a pattern
-- that includes the badge is current. The AWARD row persists, the badge stays
-- on the profile with its full history, and only the power sleeps.
--
-- `badges.active` is NEVER written by a roll, for either scope. `active`
-- means retired-by-an-admin; seasonality is this column. Flipping `active` at
-- a season turn would strip a moderator of their powers, which is the bug
-- this split exists to avoid.
ALTER TABLE `badges`
  ADD COLUMN `season_scope` enum('permanent','seasonal') NOT NULL DEFAULT 'permanent' AFTER `kind`,
  ADD COLUMN `multiplier` decimal(6,3) NULL AFTER `rule`;
