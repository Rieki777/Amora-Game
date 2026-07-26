-- 0013 (S11): the event spine. One append-only table for everything that
-- happened: the public Village Pulse AND the admin audit trail, distinguished
-- by audience, each row carrying WHO (actor_user_id) and WHAT it was about
-- (entity_type/entity_ref). The old activity rows had neither, which is why
-- this session runs right after S10 — every session it waited was
-- actor-attributed history lost forever, and the S49 dashboard needs
-- lunations of it.
--
-- Subsumes: activity.json (audience 'public') and admin-audit.json
-- (audience 'admin'). The 0001 `activity` table never went live and stays
-- behind as a fossil; nothing writes it after this migration.
CREATE TABLE IF NOT EXISTS `health_events` (
  `id` varchar(64) NOT NULL,
  -- The old `type` ("join", "quest", "gratitude", …); audit rows use 'audit'.
  `kind` varchar(64) NOT NULL,
  -- The human-readable line: pulse copy for public rows, the action string
  -- ("PUT /api/admin/variables/x", "role:member->admin") for audit rows.
  `text` text NOT NULL,
  `actor_user_id` varchar(64) NULL,
  `entity_type` varchar(32) NULL,
  `entity_ref` varchar(120) NULL,
  `audience` enum('public','admin') NOT NULL DEFAULT 'public',
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `health_events_at_idx` (`audience`, `at`),
  KEY `health_events_actor_idx` (`actor_user_id`, `at`),
  KEY `health_events_kind_idx` (`kind`, `at`)
);
