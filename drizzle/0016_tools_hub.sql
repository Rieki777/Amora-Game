-- 0016 (S15): the tools hub — the module framework's reference consumer.
-- DB-native day one (post-S12 there is no other kind). Categories are NOT a
-- table: they are the tools module's module_settings.config document,
-- validated by its validateConfig() — structural config takes the paved path.
CREATE TABLE IF NOT EXISTS `tools` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  -- The card's one-liner.
  `purpose` varchar(200) NOT NULL,
  `description` text NULL,
  -- https-only, validated on write AND at link-check time.
  `url` varchar(1000) NOT NULL,
  `cta_label` varchar(24) NOT NULL DEFAULT 'Open',
  -- Must match a category id in the module config (checked on write).
  `category` varchar(64) NOT NULL,
  -- 'slug' = a lucide icon name; 'upload' = a compressed webp under /uploads.
  `icon_kind` enum('slug','upload') NOT NULL DEFAULT 'slug',
  `icon` varchar(255) NULL,
  -- 'core team' is a seeded ROLE, deliberately not an enum value here.
  `visibility` enum('public','members','roles') NOT NULL DEFAULT 'members',
  `role_ids` json NULL,
  `getting_started` text NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `last_checked_at` timestamp NULL,
  `last_check_status` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- Append-only click analytics. If a write fails the click is silently
-- dropped — this table is signal, never truth. Rows survive tool deletion.
CREATE TABLE IF NOT EXISTS `tool_clicks` (
  `id` varchar(64) NOT NULL,
  `tool_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `tool_clicks_tool_idx` (`tool_id`, `at`)
);
