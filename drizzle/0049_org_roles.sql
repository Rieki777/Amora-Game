-- 0049: the sociocratic org chart becomes rows.
--
-- Until now "role" meant two unrelated things. The `roles` table is a
-- PERMISSION-GROUP carrier: its `capabilities` JSON is the only per-village
-- source feeding the one gate, and its seeded rows are bundles like
-- founders-circle and steward-circle. The org chart people actually read --
-- seats with an aim, a domain, accountabilities and a holder -- lived as 24
-- cards in the `content` document in app_config, with holders stored as
-- free-text NAME STRINGS and no link to any user row.
--
-- This migration adds the missing object and leaves `roles` completely
-- alone. Nothing here touches the capability gate. The bridge that would let
-- holding a seat grant a permission group is deliberately NOT built yet.
--
-- Neither new table is registered with the standing-examples machinery.
-- `is_example` rides along so the flag travels through every SELECT, but
-- EXAMPLE_TABLES is untouched, so retirement does not reach these rows. That
-- is intentional: examples retire ONE WAY and seasons must come back.
--
-- Neither table is a dbCollection. They are read through raw SQL, so the
-- DELETE-all-and-reinsert-spec'd-columns behaviour of replaceAll cannot
-- silently reset a column that was left out of a spec.

CREATE TABLE IF NOT EXISTS `org_roles` (
  `id` varchar(64) NOT NULL,
  `circle_id` varchar(64) NULL,
  `name` varchar(160) NOT NULL,
  -- The three sociocratic fields. `aim` is why the seat exists in one
  -- sentence, `domain` is what it may decide alone, `accountabilities` is
  -- the JSON list of what it is answerable for.
  `aim` text NULL,
  `domain` text NULL,
  `accountabilities` json NULL,
  `why_it_matters` text NULL,
  -- Vacancy is DERIVED (active assignments < seats), never a status column.
  `seats` int NOT NULL DEFAULT 1,
  `criticality` enum('normal','high') NOT NULL DEFAULT 'normal',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  -- The seat is published as an open application right now.
  `recruiting` tinyint(1) NOT NULL DEFAULT 0,
  -- The scorecard a seat needs before it can be posted as a job.
  `authority` text NULL,
  `first_year_outcomes` text NULL,
  `first_90_day_outcomes` text NULL,
  `location_expectations` varchar(255) NULL,
  `compensation_reality` text NULL,
  `evidence_required` text NULL,
  -- NULL means inherit the village's reassignment setting.
  `expires_each_season` tinyint(1) NULL,
  -- A hand-set state that LAPSES back to derived, so a stale override cannot
  -- outlive the moment somebody meant it.
  `status_override` enum('open','filled','partial','forming') NULL,
  `status_override_expires_at` timestamp NULL,
  `icon` varchar(64) NULL,
  `color` varchar(32) NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `org_roles_circle_idx` (`circle_id`, `sort_order`),
  KEY `org_roles_active_idx` (`active`)
);

-- One row per seating, past or present. A person is not a column on a seat.
--
-- `holder_kind = 'documented'` is how a real holder exists before they have
-- an account, and how an external advisor or a historical holder stays
-- representable forever. Peerdom calls this access level "No-access"; its
-- absence is the whole reason holders became a textarea.
CREATE TABLE IF NOT EXISTS `org_role_assignments` (
  `id` varchar(64) NOT NULL,
  `org_role_id` varchar(64) NOT NULL,
  `holder_kind` enum('member','documented') NOT NULL DEFAULT 'member',
  `user_id` varchar(64) NULL,
  `display_name` varchar(160) NULL,
  -- NOT NULL on purpose. MySQL unique indexes exempt NULLs, so a nullable
  -- user_id inside the key would admit unlimited duplicate seatings. This is
  -- `user_id` for a member and 'doc:<slug>' for a documented holder.
  `holder_key` varchar(200) NOT NULL,
  -- Which slice of the seat this person holds: "EMEA", "web", "the north
  -- slope". One seat, several holders, no duplicate seats.
  `focus` varchar(200) NULL,
  `note` varchar(280) NULL,
  -- The dated season this seating was made in. Lapsing is computed against
  -- today's season, so nothing is written when a season turns.
  `season_id` varchar(64) NULL,
  `term_ends_at` timestamp NULL,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` timestamp NULL,
  `ended_reason` varchar(160) NULL,
  `granted_by` varchar(64) NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  -- The NULL exemption used deliberately: this is the holder key while the
  -- seating is live and NULL once it ends, so one person may hold one seat
  -- once at a time and may hold it again years later without colliding with
  -- their own history.
  `active_holder_key` varchar(200) AS (IF(`ended_at` IS NULL, `holder_key`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `org_role_assignments_active_uq` (`org_role_id`, `active_holder_key`),
  KEY `org_role_assignments_user_idx` (`user_id`),
  KEY `org_role_assignments_role_idx` (`org_role_id`, `ended_at`),
  KEY `org_role_assignments_season_idx` (`season_id`)
);

-- The fractal. A project starts with few circles and one seat covering a
-- whole domain; as it grows that seat becomes a circle and its
-- accountabilities fan out into new seats beneath it. The circle records
-- which seat it grew from, so the seat keeps its identity, its history and
-- its past holders across the transition instead of being replaced.
ALTER TABLE `circles`
  ADD COLUMN `grown_from_org_role_id` varchar(64) NULL AFTER `lead_role_id`;
