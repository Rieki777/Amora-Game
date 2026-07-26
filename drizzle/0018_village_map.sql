-- 0018 (S19-S23): the village map — circles as data, the contact relay's
-- ledger, and the concierge's demand-signal log. DB-native day one; the map
-- moves no tokens, ever.
CREATE TABLE IF NOT EXISTS `circles` (
  -- Slug id, e.g. 'permaculture-council'. Per-deployment data, seeded from
  -- server/seeds/circles-seed.json — Amora names never live in platform code.
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `purpose` text NULL,
  -- Legacy quests.circle free-text values that resolve HERE. One alias maps
  -- to exactly one circle; admin writes reject collisions.
  `aliases` json NULL,
  `parent_circle_id` varchar(64) NULL,
  -- Display/contact convention only — NOT a governance object (F5 boundary).
  `lead_role_id` varchar(64) NULL,
  `icon` varchar(64) NULL,
  `color` varchar(32) NULL,
  `status` enum('active','forming','dormant') NOT NULL DEFAULT 'active',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- A contact EVENT, not a DM system: one row per relayed introduction.
CREATE TABLE IF NOT EXISTS `contact_requests` (
  `id` varchar(64) NOT NULL,
  `from_user_id` varchar(64) NOT NULL,
  `to_user_id` varchar(64) NOT NULL,
  `role_id` varchar(64) NULL,
  `circle_id` varchar(64) NULL,
  `quest_id` varchar(64) NULL,
  -- Closes the concierge funnel: which query led to this introduction.
  `query_id` varchar(64) NULL,
  `message` text NOT NULL,
  `source` varchar(32) NOT NULL DEFAULT 'map',
  `email_status` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
  `idempotency_key` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contact_requests_idem_uq` (`idempotency_key`),
  KEY `contact_requests_from_idx` (`from_user_id`, `created_at`),
  KEY `contact_requests_to_idx` (`to_user_id`, `created_at`)
);

-- Every concierge question, matched or not. matched_kind='none' rows are the
-- founders' role-creation demand signal.
CREATE TABLE IF NOT EXISTS `concierge_queries` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NULL,
  `query` varchar(500) NOT NULL,
  `matched_kind` enum('role','quest','circle','none') NOT NULL DEFAULT 'none',
  `matched_id` varchar(64) NULL,
  `method` enum('deterministic','llm') NOT NULL DEFAULT 'deterministic',
  `contacted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `concierge_unmatched_idx` (`matched_kind`, `created_at`)
);

-- Roles join the map: which circle they orbit, how many seats they carry.
-- Vacancy is DERIVED (holders < seats), never a status column.
ALTER TABLE `roles`
  ADD COLUMN `circle_id` varchar(64) NULL AFTER `min_stage`,
  ADD COLUMN `seats` int NOT NULL DEFAULT 1 AFTER `circle_id`;

-- The contact opt-out is a member preference, server-enforced.
ALTER TABLE `users`
  ADD COLUMN `contactable` tinyint(1) NOT NULL DEFAULT 1 AFTER `prefs`;
