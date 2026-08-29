-- 0052 — The village brain.
--
-- Numbered 0052 because 0049, 0050 and 0051 were taken on main while this was
-- being written (org roles, season patterns, the node journal). A migration
-- number is claimed by whoever lands first, and two files sharing one would
-- have applied in an order nobody chose. This file has never run against a
-- persistent database, only against scratch schemas that get dropped, so the
-- rename is a rename and not a fix-forward.
--
-- What this village is FOR had no home. app_config holds content, faqs, brand,
-- settings and visit-config: configuration and copy, never purpose. So the
-- assistant could describe what a module does and could never say which seat
-- this village is missing, because seats come from work that must be held and
-- nothing recorded the work.
--
-- Two shelves, opposite cardinality, so two tables. The BRIEF holds exactly one
-- live row per section. The RECORD holds many rows per section, one per call or
-- decision or lunation. A single table cannot carry both constraints: the
-- unique key would be either wrong for the record or absent for the brief.
--
-- Fork-local, always. Nothing here is ever published, relayed, federated, or
-- crawled. See docs/MAIA_BRAIN_SPEC.md.

CREATE TABLE IF NOT EXISTS `village_brief` (
  `id` varchar(64) NOT NULL,
  `section` varchar(64) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `audience` enum('admin','member') NOT NULL DEFAULT 'admin',
  `source` enum('intake','session0','conversation','admin') NOT NULL DEFAULT 'admin',
  `status` enum('proposed','confirmed') NOT NULL DEFAULT 'proposed',
  `confirmed_by` varchar(64) NULL,
  `confirmed_at` timestamp NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `revision` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `brief_section_uq` (`section`),
  KEY `brief_status_idx` (`status`, `audience`)
);

-- The unique key sits on ONE NOT NULL column on purpose. A `superseded_at IS
-- NULL` scheme would admit infinite live rows per section, because MySQL unique
-- indexes exempt NULLs. That trap has already cost this repo a session.
--
-- `revision` increments on every overwrite and is also the cache key for the
-- markdown render: MySQL timestamps have one-second granularity, so two writes
-- in the same second would otherwise share an ETag.

CREATE TABLE IF NOT EXISTS `village_brief_revisions` (
  `id` varchar(64) NOT NULL,
  `brief_id` varchar(64) NOT NULL,
  `revision` int NOT NULL,
  `body` mediumtext NOT NULL,
  `source` varchar(32) NOT NULL,
  `replaced_by` varchar(64) NULL,
  `replaced_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `brief_rev_uq` (`brief_id`, `revision`),
  KEY `brief_rev_idx` (`brief_id`, `replaced_at`)
);

CREATE TABLE IF NOT EXISTS `village_record` (
  `id` varchar(64) NOT NULL,
  `section` varchar(64) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `period` varchar(32) NULL,
  `occurred_at` timestamp NULL,
  `source` enum('call','decision','cycle','mechanics','concierge','module','draft') NOT NULL,
  `source_ref` varchar(64) NULL,
  `status` enum('proposed','confirmed') NOT NULL DEFAULT 'proposed',
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `record_slug_uq` (`slug`),
  KEY `record_rank_idx` (`section`, `occurred_at`),
  KEY `record_dedupe_idx` (`source`, `source_ref`)
);

-- `slug` is generated server-side from a-z 0-9 and hyphens only, never from
-- typed text. It is the export filename, and a filename built from user input
-- is a path traversal waiting for someone to notice.
--
-- (source, source_ref) lets the derivation job be idempotent: re-running it must
-- not duplicate a decision that is already recorded.

-- Provenance on the event spine. The substrate doc has asked for this since
-- 4.7 and it cannot be backfilled: the first time a village dislikes something
-- an agent did, someone must be able to name which one and revoke exactly it.
--
-- Deliberately NOT pinned to ALGORITHM=INSTANT. No MySQL version is pinned
-- anywhere in this repo, INSTANT needs 8.0.12 or later, and migrations run at
-- boot behind a fail-loud runner, so pinning it would make a fork on 5.7
-- unbootable to avoid a copy on a table that holds thousands of rows at most in
-- every current deployment. A fork with a very large health_events should run
-- this ALTER by hand before deploying.

ALTER TABLE `health_events` ADD COLUMN `actor_kind` enum('human','agent','system','peer') NOT NULL DEFAULT 'human';
