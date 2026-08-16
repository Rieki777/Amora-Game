-- 0085: one calendar table. Every dated thing the village has lives in
-- `events`, behind one read (server/lib/calendar.ts, listCalendarItems).
--
-- Round 4, lane L5a. The ruling: "only 1 calendar and source of truth per
-- village where all dates live". The events table was already the calendar
-- of gatherings (0059) and already schema.org-shaped, so it grows into the
-- calendar of everything rather than a second table appearing beside it. A
-- quest window, a new moon, a cycle close, a seat's term end, a loan's due
-- date and an event imported from a Google Calendar are all rows here.
--
-- Settlement and governance timestamps (gratitude_cycles, term_ends_at,
-- notice_ends_at) stay authoritative on their own rows because they are legal
-- facts. They are MIRRORED in with the source named (source_module +
-- source_id), never moved, so every date appears in exactly one calendar and
-- no page computes its own.

-- ── events: kind, source, layer, recurrence, external identity ─────────────

ALTER TABLE `events`
  -- What sort of dated thing this is. New kinds go on the END of this list:
  -- MySQL enums are ordinal (0059's rule).
  ADD COLUMN `kind` enum('gathering','quest-window','festival','season','sky','cycle-mark','seat-term','call','loan-due','notice-end','milestone','external','meet-me') NOT NULL DEFAULT 'gathering',
  -- Which module owns the fact this row mirrors, and that module's own id for
  -- it. NULL for a gathering somebody typed in here: this table IS its home.
  ADD COLUMN `source_module` varchar(64) NULL,
  ADD COLUMN `source_id` varchar(190) NULL,
  -- Who may see it. village and public are the calendar everyone reads;
  -- circle and household are for the layer work in L5b; private is one
  -- person's (a loan due date, a notice end); admin is the founders' desk.
  ADD COLUMN `layer` enum('village','circle','household','private','admin','public') NOT NULL DEFAULT 'village',
  -- The one person a private-layer row belongs to. NULL for shared layers.
  ADD COLUMN `owner_user_id` varchar(64) NULL,
  ADD COLUMN `all_day` tinyint(1) NOT NULL DEFAULT 0,
  -- Recurring rhythms as first-class objects: weekly, monthly, lunar (every
  -- new moon, full moon, cycle close), solar (each solstice or equinox).
  -- Occurrences are materialised on read, never as rows; per-instance
  -- overrides live inside this document.
  ADD COLUMN `recurrence` json NULL,
  -- Where the item points when tapped (a quest page, a Hypha proposal) and
  -- the colour its source asked for. Both optional.
  ADD COLUMN `link` varchar(500) NULL,
  ADD COLUMN `colour` varchar(16) NULL,
  -- Imported calendars: which subscription brought it and the upstream UID.
  ADD COLUMN `external_source_id` varchar(64) NULL,
  ADD COLUMN `external_uid` varchar(190) NULL,
  -- Soft removal. A mirrored fact that vanished upstream is marked, not
  -- deleted, so its RSVPs and its audit trail keep pointing at something.
  ADD COLUMN `removed_at` timestamp NULL;

-- One row per mirrored fact and one row per imported UID. NULL is exempt from
-- MySQL unique keys and that is the intended shape here (0062's reasoning):
-- a hand-typed gathering carries no source and there can be any number of
-- them; the constraint binds only rows that name a source, and there it
-- refuses two rows for one fact.
ALTER TABLE `events`
  ADD UNIQUE KEY `events_source_uniq` (`source_module`, `source_id`);

ALTER TABLE `events`
  ADD UNIQUE KEY `events_external_uniq` (`external_source_id`, `external_uid`);

ALTER TABLE `events`
  ADD KEY `events_kind_starts_idx` (`kind`, `starts_at`);

ALTER TABLE `events`
  ADD KEY `events_owner_idx` (`owner_user_id`);

-- ── event_rsvps: occurrence identity ────────────────────────────────────────
--
-- A recurring gathering has many evenings, and "I'm coming" answers one of
-- them. occurrence_key is the village-time date of that evening
-- (YYYY-MM-DD) and the empty string for a one-off. NOT NULL with a default,
-- never NULL: a nullable column inside a unique key is exempt from it and
-- would let one person answer the same evening twice.

ALTER TABLE `event_rsvps`
  ADD COLUMN `occurrence_key` varchar(10) NOT NULL DEFAULT '';

ALTER TABLE `event_rsvps`
  DROP INDEX `event_rsvps_one_per_person`;

ALTER TABLE `event_rsvps`
  ADD UNIQUE KEY `event_rsvps_one_per_person` (`event_id`, `user_id`, `occurrence_key`);

-- ── quests: a window and a deadline ────────────────────────────────────────
--
-- Quests carried no date; `duration` is free text. These are optional, so a
-- board written before today keeps rendering unchanged, and a quest with a
-- date becomes a calendar row through the quests repo's own save path.

ALTER TABLE `quests`
  ADD COLUMN `starts_at` datetime NULL,
  ADD COLUMN `ends_at` datetime NULL,
  ADD COLUMN `due_at` datetime NULL;

-- ── external calendars: subscriptions by iCal URL ──────────────────────────
--
-- The URL is a credential when it carries a secret token (Google's "secret
-- address in iCal format"), so it is NOT here. It lives in the integration
-- secrets store under `external_calendar_url:<id>`; this row keeps the host
-- and the last four characters, which is enough to recognise a subscription
-- and not enough to read it. Nothing here is ever returned whole.
--
-- No CHARSET clause (0082's reasoning): inherit the database default so
-- joins never die on a collation split.

CREATE TABLE IF NOT EXISTS `external_calendars` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `layer` enum('village','circle','household','private','admin','public') NOT NULL DEFAULT 'village',
  `colour` varchar(16) NULL,
  `url_host` varchar(255) NOT NULL,
  `url_last4` varchar(4) NOT NULL DEFAULT '',
  `secret_ref` varchar(120) NOT NULL,
  `last_polled_at` timestamp NULL,
  -- ok | failed | never, and a short reason with the URL scrubbed out of it.
  `last_status` varchar(24) NOT NULL DEFAULT 'never',
  `last_error` varchar(255) NULL,
  `imported_count` int NOT NULL DEFAULT 0,
  `created_by` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- ── month names: number plus the village's own word ────────────────────────
--
-- Month 1 is the first new moon after the year anchor (a game variable),
-- twelve or thirteen moons as the sky gives them. The names ship as
-- almanac examples flagged is_example, because those names describe someone
-- else's land; a village writes its own over them.

CREATE TABLE IF NOT EXISTS `calendar_month_names` (
  `month_index` tinyint NOT NULL,
  `name` varchar(80) NOT NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`month_index`)
);

INSERT IGNORE INTO `calendar_month_names` (`month_index`, `name`, `is_example`) VALUES
  (1, 'Wolf Moon', 1),
  (2, 'Snow Moon', 1),
  (3, 'Worm Moon', 1),
  (4, 'Pink Moon', 1),
  (5, 'Flower Moon', 1),
  (6, 'Strawberry Moon', 1),
  (7, 'Buck Moon', 1),
  (8, 'Sturgeon Moon', 1),
  (9, 'Harvest Moon', 1),
  (10, 'Hunter Moon', 1),
  (11, 'Beaver Moon', 1),
  (12, 'Cold Moon', 1),
  (13, 'Blue Moon', 1);

-- ── feed tokens: a member's private .ics address ───────────────────────────
--
-- 32 random bytes minted on the Events page, shown once, stored as a sha256.
-- The public feed needs no token; this one adds the layers a signed-in
-- member may see. Revocation is a timestamp, so a leaked address dies
-- without deleting the record of its life.

CREATE TABLE IF NOT EXISTS `calendar_feed_tokens` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL,
  `revoked_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `calendar_feed_tokens_hash_uq` (`token_hash`),
  KEY `calendar_feed_tokens_user_idx` (`user_id`)
);
