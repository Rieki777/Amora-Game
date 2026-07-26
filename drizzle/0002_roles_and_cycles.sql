-- 0002: roles as data, and Gratitude lunar cycles.
--
-- Revision 2 of AMORA_FOUNDATION_UPGRADE_PLAN.md, steps 3 and 5. Additive: no
-- existing table is touched. As with 0001, nothing reads from these yet at the
-- moment they are created; the code that uses them lands in the same phase.

CREATE TABLE IF NOT EXISTS `roles` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text,
  `capabilities` json,
  `min_stage` varchar(64),
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `role_holders` (
  `id` varchar(64) NOT NULL,
  `role_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `granted_by` varchar(64),
  `granted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_holder_unique` (`role_id`, `user_id`),
  KEY `role_holders_user_idx` (`user_id`)
);

CREATE TABLE IF NOT EXISTS `gratitude_cycles` (
  `id` varchar(64) NOT NULL,
  `cycle_number` int NOT NULL,
  `starts_at` timestamp NOT NULL,
  `ends_at` timestamp NOT NULL,
  `status` enum('open','distributing','closed') NOT NULL DEFAULT 'open',
  `closed_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gratitude_cycle_number_unique` (`cycle_number`),
  KEY `gratitude_cycles_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `gratitude_distributions` (
  `id` varchar(64) NOT NULL,
  `cycle_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `received` int NOT NULL,
  `distinct_senders` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gratitude_dist_unique` (`cycle_id`, `user_id`)
);
