-- 0028 (S53-S55): the automation pipeline.
-- Recording -> transcript -> synthesis -> forum thread -> role-targeted
-- suggestions. The weekly call becomes assigned work, not content
-- distribution — and every AI word is either evidenced or dropped.

CREATE TABLE IF NOT EXISTS `recordings` (
  `id` varchar(64) NOT NULL,
  `source` enum('manual','riverside','youtube') NOT NULL DEFAULT 'manual',
  `external_id` varchar(255) NULL,
  `title` varchar(500) NOT NULL,
  `url` varchar(1000) NULL,
  `duration_s` int NULL,
  `status` enum('ingested','transcribed','synthesized','published','failed') NOT NULL DEFAULT 'ingested',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Ingest idempotency: a webhook redelivery or an RSS re-diff is a no-op.
  UNIQUE KEY `recordings_ext_uq` (`source`, `external_id`)
);

CREATE TABLE IF NOT EXISTS `transcripts` (
  `recording_id` varchar(64) NOT NULL,
  `body` longtext NOT NULL,
  -- [{startMs, endMs, text}] — the evidence rule validates quotes against
  -- these windows; a transcript without timestamps is one whole segment.
  `segments` json NOT NULL,
  `source` enum('provided','manual') NOT NULL DEFAULT 'manual',
  PRIMARY KEY (`recording_id`)
);

CREATE TABLE IF NOT EXISTS `call_syntheses` (
  `id` varchar(64) NOT NULL,
  -- One synthesis per recording, EVER.
  `recording_id` varchar(64) NOT NULL,
  -- WRITE-ONCE: set at INSERT; no code path updates it. The human-edited
  -- copy lives in `body`; keeping both is how the village learns what the
  -- machine gets wrong.
  `ai_body` longtext NOT NULL,
  `body` longtext NOT NULL,
  `chapters` json NULL,
  `decisions` json NULL,
  `model` varchar(100) NOT NULL,
  -- Trust through visible discards: how many suggestions failed the
  -- evidence rule and were dropped, shown in the admin UI.
  `dropped_task_count` int NOT NULL DEFAULT 0,
  -- One forum thread per synthesis, EVER (send idempotency).
  `thread_id` varchar(64) NULL,
  `published_at` timestamp NULL,
  `published_by` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `call_syntheses_recording_uq` (`recording_id`),
  UNIQUE KEY `call_syntheses_thread_uq` (`thread_id`)
);

CREATE TABLE IF NOT EXISTS `call_tasks` (
  `id` varchar(64) NOT NULL,
  `synthesis_id` varchar(64) NOT NULL,
  `description` varchar(1000) NOT NULL,
  -- The evidence rule AT SCHEMA LEVEL: no quote, no timestamp, no row.
  `quote` text NOT NULL,
  `timestamp_ms` int NOT NULL,
  `role_id` varchar(64) NULL,
  `status` enum('suggested','accepted','dismissed') NOT NULL DEFAULT 'suggested',
  `acted_by` varchar(64) NULL,
  `acted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `call_tasks_synthesis_idx` (`synthesis_id`, `status`)
);
