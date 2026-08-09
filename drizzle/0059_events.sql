-- 0059: gatherings become rows, and the village gets a calendar it owns.
--
-- Events were a link. `brand.project.eventsUrl` pointed somewhere else, and
-- the seasonal-festivals page was prose. Nothing could answer "what is on
-- this week", nothing could say how many people were coming, and the map had
-- no way to brighten a building because something was happening in it.
--
-- The shape is deliberately schema.org/Event, near enough to emit JSON-LD
-- without a translation layer: title/description/starts_at/ends_at map to
-- name/description/startDate/endDate, `status` to eventStatus, capacity to
-- maximumAttendeeCapacity, attendance_mode to eventAttendanceMode. Portable
-- and indexable was the point; a village's calendar should outlive this app.
--
-- The data model is read from the federated event apps (Gancio's lean
-- title/when/place core, Mobilizon's participant roles and capacity options,
-- Hi.Events' RSVP-as-its-own-row) and written fresh. All three are AGPL, so
-- nothing is copied: what is borrowed is the shape of the problem.
--
-- NOTE ON NAMING: `health_events` is the platform's event SPINE (the audit
-- history every module appends to via recordEvent). This table is a calendar
-- of gatherings and has nothing to do with it. The server library is called
-- gatherings.ts precisely so the two never get confused in an import.

CREATE TABLE IF NOT EXISTS `events` (
  `id` varchar(64) NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  -- datetime, NOT timestamp, for the two columns that matter. MySQL gives the
  -- first timestamp column in a table an implicit DEFAULT CURRENT_TIMESTAMP
  -- ON UPDATE CURRENT_TIMESTAMP unless explicit_defaults_for_timestamp is on,
  -- which would silently move an event's start date every time anybody edited
  -- its description. datetime has no auto-init behaviour and no 2038 ceiling.
  `starts_at` datetime NOT NULL,
  -- NULL means the village did not say when it ends, which is the honest
  -- answer for a work party. Readers treat it as unknown, never as zero.
  `ends_at` datetime NULL,
  `location_text` varchar(255) NULL,
  -- The map's multi-address: which painted structures this gathering happens
  -- in. A JSON array of structure keys, because a harvest festival occupies
  -- the greenhouse AND the commons and neither is the "real" one.
  `structure_keys` json NULL,
  -- Set when a gathering is also a bookable visit, so the two surfaces agree
  -- instead of drifting. Nullable and unconstrained by design: the stays
  -- module ships off, and an event must not depend on a module being on.
  `visit_type_id` varchar(64) NULL,
  -- NULL means uncapped. 0 means nobody, and is a real answer (a cancelled
  -- capacity), so the reader tests for NULL and never for falsiness.
  `capacity` int NULL,
  -- `draft` is ours and never leaves the admin surface. The other three are
  -- schema.org eventStatus values, mapped straight through when emitting
  -- JSON-LD. New states go on the END of this list: MySQL enums are ordinal.
  `status` enum('draft','scheduled','cancelled','postponed') NOT NULL DEFAULT 'draft',
  `attendance_mode` enum('offline','online','mixed') NOT NULL DEFAULT 'offline',
  `online_url` varchar(500) NULL,
  `created_by` varchar(64) NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The two queries this table exists to answer: "what is coming up" and
  -- "what is coming up that a member may see".
  KEY `events_starts_idx` (`starts_at`),
  KEY `events_status_starts_idx` (`status`, `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `event_rsvps` (
  `id` varchar(64) NOT NULL,
  `event_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `status` enum('going','maybe','declined') NOT NULL DEFAULT 'going',
  -- NOT NULL, and that is load-bearing. MySQL UNIQUE indexes exempt NULLs,
  -- so a nullable dedupe column admits infinite duplicates: the index would
  -- exist, read as protection, and prevent nothing.
  `idempotency_key` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One answer per person per gathering. Changing your mind UPDATEs this row
  -- and never appends a second one, so counting "going" is a plain COUNT.
  UNIQUE KEY `event_rsvps_one_per_person` (`event_id`, `user_id`),
  UNIQUE KEY `event_rsvps_idem` (`idempotency_key`),
  KEY `event_rsvps_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
