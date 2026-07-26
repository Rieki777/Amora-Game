-- 0001: the initial schema, a faithful mirror of the 20 JSON files in data/.
--
-- Phase 1 of AMORA_FOUNDATION_UPGRADE_PLAN.md. Nothing reads from these tables
-- yet: the app still reads JSON. This exists so the database can be populated
-- and proven to match the files before a single route is cut over.
--
-- Collections get real columns. Singleton config documents stay documents in
-- app_config, because the admin UI edits each one wholesale and nothing queries
-- inside them. See server/db/schema.ts for the reasoning in full.

CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `paths` json,
  `hearts_balance` int NOT NULL DEFAULT 0,
  `contributions` json,
  `quests` json,
  `bio` text,
  `avatar` varchar(500),
  `stage_granted` varchar(64),
  `training_complete` boolean NOT NULL DEFAULT false,
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
);

CREATE TABLE IF NOT EXISTS `submissions` (
  `id` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'new',
  `data` json,
  `rewarded` boolean NOT NULL DEFAULT false,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `submissions_type_idx` (`type`),
  KEY `submissions_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `quests` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `impact` text,
  `gratitude` int NOT NULL DEFAULT 0,
  `duration` varchar(64),
  `difficulty` varchar(32),
  `circle` varchar(64),
  `status` varchar(32) NOT NULL DEFAULT 'open',
  `icon` varchar(64),
  `role_required` varchar(64),
  `tags` json,
  `sort_order` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `quests_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `quest_claims` (
  `id` varchar(64) NOT NULL,
  `quest_id` varchar(64) NOT NULL,
  `quest_title` varchar(255),
  `user_id` varchar(64) NOT NULL,
  `user_name` varchar(255),
  `status` enum('claimed','submitted','consented','declined') NOT NULL DEFAULT 'claimed',
  `artifact_url` varchar(1000),
  `note` text,
  `amount` int,
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at` timestamp NULL,
  `consented_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `quest_claims_user_idx` (`user_id`),
  KEY `quest_claims_quest_idx` (`quest_id`),
  KEY `quest_claims_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `gratitude_log` (
  `id` varchar(64) NOT NULL,
  `from_id` varchar(64) NOT NULL,
  `from_name` varchar(255),
  `to_id` varchar(64) NOT NULL,
  `to_name` varchar(255),
  `amount` int NOT NULL,
  `message` text,
  `cycle_id` varchar(16) NOT NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `gratitude_from_cycle_idx` (`from_id`, `cycle_id`),
  KEY `gratitude_to_idx` (`to_id`)
);

CREATE TABLE IF NOT EXISTS `activity` (
  `id` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL,
  `text` text NOT NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `activity_at_idx` (`at`)
);

CREATE TABLE IF NOT EXISTS `investor_docs` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `url` varchar(1000),
  `requires_request` boolean NOT NULL DEFAULT false,
  `sort_order` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `training_modules` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `type` varchar(64),
  `url` varchar(1000),
  `sort_order` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `milestones` (
  `id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `phase` varchar(64),
  `status` varchar(32),
  `update_note` text,
  `completed_date` varchar(32),
  `sort_order` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- One row per singleton config document, keyed by its old filename minus .json.
CREATE TABLE IF NOT EXISTS `app_config` (
  `config_key` varchar(64) NOT NULL,
  `value` json NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
);
