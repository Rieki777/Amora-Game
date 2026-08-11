-- 0064: the body of the Player Profile.
--
-- The profile is a character sheet, so it needs a name a stranger can reach it
-- by, a title the player equips, a place on the land, and a say in which of
-- those a stranger sees. Everything else the sheet renders already exists:
-- `quest_claims` since 0001, `event_rsvps` since 0059, `badges` and
-- `badge_awards` since 0023, `journeys` on the user row since 0011. This
-- migration adds what is genuinely missing and touches nothing that works.
--
-- Two things it deliberately does NOT do.
--
-- It does not rename the `quest_claims` status enum to the build doc's words.
-- `claimed / submitted / consented / declined` is the same four-state lifecycle
-- as `claimed / turned_in / confirmed / declined`, it is live in production
-- data, MySQL enums are ordinal, and around forty hand-written reads compare
-- these strings. The words are mapped once in the reader and the column is
-- left alone.
--
-- It does not create a second badges table. The build doc asks for `badgeDefs`
-- and `badgeAwards`; `badges` and `badge_awards` already carry criteria,
-- capabilities, multipliers and seasonal scope, and a village with two badge
-- cabinets has neither.

-- The build doc asks for `handle UNIQUE`. It has been unique since 0003
-- (`users_handle_unique`), so there is nothing to add and no duplicates to
-- clean up. Recorded here rather than silently skipped, because the next
-- person reading the doc against the schema will ask the same question.
--
-- Empty string is worth one line of care even so: it is not NULL, so it would
-- occupy the unique index exactly once and then refuse every later member who
-- saved a blank one. This releases any that exist to NULL, which the index
-- exempts and which correctly reads as "has not chosen yet".
UPDATE `users` SET `handle` = NULL WHERE `handle` = '';

ALTER TABLE `users`
  -- The equipped title, chosen from what the player has earned: a journey
  -- stage, a held role, a badge title. Stored as the resolved string because
  -- a title is identity and should not change under someone when a role ends.
  ADD COLUMN `title` varchar(120) NULL AFTER `handle`,
  -- Where they sleep, as a structure key on the map. Behind `showHome`, which
  -- defaults to off, because where someone sleeps is not public data.
  ADD COLUMN `home_structure_key` varchar(64) NULL AFTER `title`,
  ADD COLUMN `verified_at` timestamp NULL AFTER `home_structure_key`,
  -- What a stranger sees. Defaults are the conservative reading of each
  -- question: the things a member chose to earn are shown, the things that
  -- describe their life are not. Readers must default a MISSING key to the
  -- same answer, so a row written before a new flag existed stays private.
  ADD COLUMN `privacy` json NULL AFTER `verified_at`;

-- Who witnessed the work. `consented_at` has recorded WHEN since 0001 and has
-- never recorded WHO, which makes the one rule that matters unenforceable
-- after the fact: a steward may not confirm their own claim. Without this
-- column the audit cannot see a reciprocal pair either, because there is no
-- second party on the row to pair with.
ALTER TABLE `quest_claims`
  ADD COLUMN `consented_by` varchar(64) NULL,
  ADD COLUMN `village_id` varchar(64) NOT NULL DEFAULT 'local';

ALTER TABLE `quest_claims`
  ADD KEY `quest_claims_consented_by_idx` (`consented_by`);

-- Attendance is a badge, never a coin, and it is recorded by a steward who saw
-- the person there. An RSVP is an intention: counting it as attendance is a
-- free badge for anyone willing to tap a button, which is the whole reason
-- this table exists separately from `event_rsvps`.
CREATE TABLE IF NOT EXISTS `event_checkins` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  `event_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- The steward who confirmed it. NOT NULL: a check-in nobody stands behind is
  -- an RSVP wearing a different name.
  `confirmed_by` varchar(64) NOT NULL,
  `note` varchar(280) NULL,
  -- NOT NULL, and load-bearing for the same reason it is everywhere else in
  -- this schema: MySQL UNIQUE indexes exempt NULLs, so a nullable dedupe
  -- column reads as protection and prevents nothing.
  `idempotency_key` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_checkins_idem` (`idempotency_key`),
  -- One check-in per person per gathering. Counting attendance is then a
  -- plain COUNT and a double tap by a steward is a no-op.
  UNIQUE KEY `event_checkins_one_per_person` (`village_id`, `event_id`, `user_id`),
  KEY `event_checkins_user_idx` (`village_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
