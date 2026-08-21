-- 0088: the calendar's community half (round 4, lane L5b).
--
-- Three tables and one column:
--
--   event_waitlist      who is queued for a full gathering, per occurrence.
--                       Promotion happens INSIDE the transaction that freed
--                       the seat (server/lib/calendarCommunity.ts), after the
--                       FOR UPDATE lock on the events row that rsvp() already
--                       takes, so a promoted person and a walk-up can never
--                       both land the same seat.
--   event_slots         what a gathering asks its people to bring or hold:
--                       a dish, a ride, childcare, setup crew. Declared by
--                       whoever holds event.manage.
--   event_slot_signups  who took a slot, per occurrence. Counts are public to
--                       whoever may see the event; names only to a viewer who
--                       is going, or to the crew.
--   quests.created_at   when a quest first appeared, so the weekly brief can
--                       say which quests are NEW this week. Existing rows are
--                       set NULL on purpose: their creation date is unknown,
--                       and an unknown date must never read as "new".
--
-- The MySQL UNIQUE-exempts-NULL trap (0085's rule): every column inside a
-- unique key below is NOT NULL. occurrence_key mirrors event_rsvps: the
-- village-time date (YYYY-MM-DD) of one evening of a recurring gathering,
-- and the empty string for a one-off.
--
-- No CHARSET clause on any table (0078's reasoning): inherit the database
-- default, because user_id joins users.id and a mixed-collation join fails
-- loudly on MySQL 8.

CREATE TABLE IF NOT EXISTS `event_waitlist` (
  `id` varchar(64) NOT NULL,
  `event_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `occurrence_key` varchar(10) NOT NULL DEFAULT '',
  -- Millisecond precision: the queue is ordered by this, and two people
  -- joining inside the same second must not tie.
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- Stamped once, by the promotion that seated this person.
  `promoted_at` timestamp NULL,
  -- Stamped when the person left the queue themselves. Rejoining clears it
  -- and moves them to the back (created_at is reset).
  `left_at` timestamp NULL,
  PRIMARY KEY (`id`),
  -- One queue place per person per evening. NOT NULL columns only, because
  -- MySQL unique indexes exempt NULLs.
  UNIQUE KEY `event_waitlist_one_per_person` (`event_id`, `user_id`, `occurrence_key`),
  -- The promotion scan: oldest un-promoted, un-left row for one evening.
  KEY `event_waitlist_queue_idx` (`event_id`, `occurrence_key`, `promoted_at`, `left_at`, `created_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `event_slots` (
  `id` varchar(64) NOT NULL,
  `event_id` varchar(64) NOT NULL,
  -- One of SLOT_KINDS in shared/gatherings.ts: dish, ride, childcare, setup,
  -- other. varchar, not enum: the vocabulary is validated at write time and
  -- widening a live MySQL enum is the migration nobody wants (0006's rule).
  `kind` varchar(24) NOT NULL DEFAULT 'other',
  `label` varchar(120) NOT NULL DEFAULT '',
  -- How many people this slot needs. The signup route refuses past it, under
  -- FOR UPDATE on this row.
  `needed` int NOT NULL DEFAULT 1,
  `note` varchar(400) NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `event_slots_event_idx` (`event_id`, `sort_order`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `event_slot_signups` (
  `id` varchar(64) NOT NULL,
  `slot_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `occurrence_key` varchar(10) NOT NULL DEFAULT '',
  `note` varchar(200) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_slot_signups_one_per_person` (`slot_id`, `user_id`, `occurrence_key`),
  KEY `event_slot_signups_slot_idx` (`slot_id`, `occurrence_key`)
) ENGINE=InnoDB;

-- When a quest first appeared. New inserts stamp themselves through the
-- default; the UPDATE right after makes every EXISTING row NULL, because
-- MySQL materialises CURRENT_TIMESTAMP for existing rows at ALTER time and
-- a whole board suddenly "created this week" would lie to the first brief.
ALTER TABLE `quests`
  ADD COLUMN `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `quests` SET `created_at` = NULL;
