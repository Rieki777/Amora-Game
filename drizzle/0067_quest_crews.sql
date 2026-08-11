-- 0067: nobody has to walk a quest alone.
--
-- A crew is a small named group walking ONE quest together. Verification does
-- not change and is not pooled: every member still claims, submits and is
-- consented to on their own work. The crew is company, never a shortcut.
--
-- Membership lives here rather than on conversation_members because messaging
-- is a NON-CORE module and ships off, while quests is core and cannot be
-- disabled. A crew has to exist and hold its roster on a village that has
-- never turned messaging on. When messaging IS on, a crew also gets a
-- conversation (kind 'crew', context_type 'quest', context_id the quest id,
-- per 0066) and conversation_id below points at it. The crew is who they are,
-- the conversation is where they talk, and this table is the roster of record.
--
-- invite_code is NOT NULL because MySQL exempts NULLs from UNIQUE indexes: a
-- nullable dedupe column admits infinite duplicates.
CREATE TABLE IF NOT EXISTS `quest_crews` (
  `id` varchar(64) NOT NULL,
  `quest_id` varchar(100) NOT NULL,
  `name` varchar(120) NOT NULL,
  `creator_id` varchar(64) NOT NULL,
  `conversation_id` varchar(64) NULL,
  `invite_code` varchar(32) NOT NULL,
  `status` enum('forming','active','completed','disbanded') NOT NULL DEFAULT 'forming',
  `max_size` int NOT NULL DEFAULT 5,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `quest_crews_invite_idx` (`invite_code`),
  KEY `quest_crews_quest_idx` (`quest_id`, `status`)
);

CREATE TABLE IF NOT EXISTS `quest_crew_members` (
  `crew_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `role` enum('founder','member') NOT NULL DEFAULT 'member',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`crew_id`, `user_id`),
  KEY `quest_crew_members_user_idx` (`user_id`)
);
