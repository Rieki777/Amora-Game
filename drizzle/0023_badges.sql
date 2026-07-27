-- 0023 (S37-S40): Badges v1 + self-declared skill tags.
-- Badges are DATA about people that can carry capability grants (earned/
-- granted kinds) or capability DENIES (warning kind) into the one gate.
-- kinds: self (member declares), earned (the engine, settled events only),
-- granted (an admin act), warning (denies only, admin act), hypha (mirror
-- of an external fact — display only, like everything hypha).

CREATE TABLE IF NOT EXISTS `badges` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  `icon` varchar(64) NULL,
  `kind` enum('self','earned','granted','warning','hypha') NOT NULL DEFAULT 'granted',
  -- Capability keys this badge grants. MUST be [] for self/hypha kinds
  -- (self-declaration and external mirrors gate nothing) — boot-asserted.
  `capabilities` json NULL,
  -- Capability keys this badge DENIES. Only the warning kind may carry any
  -- (boot-asserted). Deny beats role/badge/stage in the gate; admin outranks.
  `denies` json NULL,
  -- Earned engine rule: {metric, threshold, stackable, maxStack}. Only the
  -- earned kind reads it. Capability-bearing earned badges on recognition
  -- metrics (gratitude_breadth) are REFUSED at boot: bought reach must never
  -- be laundered into permissions through applause.
  `rule` json NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `badge_awards` (
  `id` varchar(64) NOT NULL,
  `badge_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- Stack tier. RECOMPUTED from the metric each evaluation, never ++.
  `count` int NOT NULL DEFAULT 1,
  -- NULL = the earned engine; otherwise the awarding admin.
  `awarded_by` varchar(64) NULL,
  `note` varchar(500) NULL,
  -- Lazy expiry: expired rows are FILTERED at read time, never swept.
  `expires_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `badge_awards_uq` (`badge_id`, `user_id`),
  KEY `badge_awards_user_idx` (`user_id`)
);

-- Append-only journal of engine grants; the idempotency key is what makes
-- re-evaluation (cycle close + the manual button) safe to run forever.
CREATE TABLE IF NOT EXISTS `badge_events` (
  `id` varchar(64) NOT NULL,
  `badge_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `tier` int NULL,
  `idempotency_key` varchar(191) NOT NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `badge_events_key_uq` (`idempotency_key`),
  KEY `badge_events_user_idx` (`user_id`)
);

-- Self-declared skills: searchable facts a member says about themselves.
-- They gate NOTHING (that is what badges with capabilities are for).
CREATE TABLE IF NOT EXISTS `skill_tags` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `tag` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `skill_tags_uq` (`user_id`, `tag`)
);
