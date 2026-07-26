-- 0017 (S16): the notification spine + the scheduler's job ledger.
--
-- The RULES port from regen-civics (dedupe keys, precedence, caps, per-type
-- email cadence); the code does not — regen's forum-notify.ts stays behind,
-- along with its known warts: dedupe_key is NOT NULL from day one (regen's
-- nullable unique was a back-fill artifact), type is varchar not enum
-- (modules add types at runtime — registry philosophy), and delivery is an
-- explicit dispatch step after insert, never a side effect buried in it.
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NULL,
  -- Canonical in-app URL the row links to.
  `link` varchar(500) NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `actor_user_id` varchar(64) NULL,
  -- The idempotency key: a retried producer inserts exactly once.
  `dedupe_key` varchar(191) NOT NULL,
  -- Per-channel delivery stamps: emailed once, ever, per row.
  `emailed_at` timestamp NULL,
  `pushed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notifications_dedupe_uq` (`dedupe_key`),
  KEY `notifications_bell_idx` (`user_id`, `is_read`, `created_at`)
);

-- Web push subscriptions (schema ready; delivery activates when a fork sets
-- VAPID keys — the pipeline no-ops without them, exactly like regen's).
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `failure_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_endpoint_uq` (`endpoint`)
);

-- The scheduler's job ledger: ONE mechanism (regen ran split-brain timers +
-- external crons with no locks). A job runs when a single UPDATE claims it —
-- DB-level, restart-safe, multi-process-safe.
CREATE TABLE IF NOT EXISTS `scheduled_jobs` (
  `job` varchar(64) NOT NULL,
  `last_run_at` timestamp NULL,
  `last_result` varchar(255) NULL,
  PRIMARY KEY (`job`)
);

-- Member preferences (notification cadence today; the village map's contact
-- opt-out and future prefs land in the same JSON — never a bespoke flag).
ALTER TABLE `users`
  ADD COLUMN `prefs` json NULL AFTER `journeys`;
