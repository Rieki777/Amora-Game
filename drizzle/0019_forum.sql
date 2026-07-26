-- 0019 (S24-S26): the forum, born WITH the D5 feed riders — kind, meta,
-- image_url, heart_count, tags, reports, hide semantics — so the gratitude
-- feed (S27-S29) bolts on with zero ALTERs. The kind enum ships complete
-- from birth: a live enum ALTER is the forbidden migration class.
CREATE TABLE IF NOT EXISTS `forum_threads` (
  `id` varchar(64) NOT NULL,
  -- Category slug, validated against the forum module's config document.
  `category` varchar(64) NOT NULL,
  `author_id` varchar(64) NOT NULL,
  -- NULLABLE: microposts (kind 'post') have no title; lists derive a preview.
  `title` varchar(255) NULL,
  `body` text NOT NULL,
  `kind` enum('discussion','decision','post','event','announcement') NOT NULL DEFAULT 'discussion',
  -- Event fields ({startsAt, endsAt, location, ctaLabel, ctaUrl}) and the
  -- decision primitive's state ({status, outcome, decidedBy, decidedAt}).
  `meta` json NULL,
  -- Must point at /api/uploads/… from the platform's own pipeline.
  `image_url` varchar(500) NULL,
  -- Denormalized cache; the feed recomputes it in the same transaction as
  -- each heart's ledger credit. Recomputable from gratitude_log.
  `heart_count` int NOT NULL DEFAULT 0,
  `reply_count` int NOT NULL DEFAULT 0,
  `last_reply_at` timestamp NULL,
  `pinned_at` timestamp NULL,
  -- Locks are ENFORCED server-side on the reply route (regen only ever
  -- enforced them client-side — that gap is documented, and closed here).
  `locked_at` timestamp NULL,
  `hidden_at` timestamp NULL,
  `hidden_by` varchar(64) NULL,
  `hidden_reason` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `forum_threads_list_idx` (`category`, `pinned_at`, `last_reply_at`),
  KEY `forum_threads_kind_idx` (`kind`, `created_at`),
  KEY `forum_threads_author_idx` (`author_id`)
);

CREATE TABLE IF NOT EXISTS `forum_replies` (
  `id` varchar(64) NOT NULL,
  `thread_id` varchar(64) NOT NULL,
  `author_id` varchar(64) NOT NULL,
  `parent_reply_id` varchar(64) NULL,
  `body` text NOT NULL,
  `hidden_at` timestamp NULL,
  `hidden_by` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `forum_replies_thread_idx` (`thread_id`, `created_at`),
  KEY `forum_replies_author_idx` (`author_id`)
);

-- Tags as a real junction from day one — regen stored JSON-in-TEXT and had
-- to bolt this table on later ("only matchable with LIKE scans").
CREATE TABLE IF NOT EXISTS `forum_thread_tags` (
  `thread_id` varchar(64) NOT NULL,
  `tag` varchar(64) NOT NULL,
  PRIMARY KEY (`thread_id`, `tag`),
  KEY `forum_thread_tags_tag_idx` (`tag`)
);

-- Reports: '' sentinels instead of NULLs in the target columns, because a
-- MySQL unique index exempts NULLs — report-once-per-person must actually
-- hold. soft reports auto-hide at N distinct reporters; hard reports go
-- straight to the moderation queue.
CREATE TABLE IF NOT EXISTS `forum_reports` (
  `id` varchar(64) NOT NULL,
  `thread_id` varchar(64) NOT NULL DEFAULT '',
  `reply_id` varchar(64) NOT NULL DEFAULT '',
  `reporter_id` varchar(64) NOT NULL,
  `severity` enum('soft','hard') NOT NULL DEFAULT 'soft',
  `reason` varchar(500) NULL,
  `status` enum('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  `resolved_by` varchar(64) NULL,
  `resolved_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `forum_reports_once_uq` (`thread_id`, `reply_id`, `reporter_id`),
  KEY `forum_reports_status_idx` (`status`, `created_at`)
);

-- Thread follows: first reason wins; muted rows never notify.
CREATE TABLE IF NOT EXISTS `forum_subscriptions` (
  `user_id` varchar(64) NOT NULL,
  `thread_id` varchar(64) NOT NULL,
  `reason` enum('authored','replied','mentioned','manual') NOT NULL,
  `muted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `thread_id`),
  KEY `forum_subscriptions_thread_idx` (`thread_id`)
);

-- The mention idempotency ledger: an edit re-parse notifies only NEW handles,
-- and removing a mention never retracts a delivered notification.
CREATE TABLE IF NOT EXISTS `forum_mentions` (
  `source_type` enum('thread','reply') NOT NULL,
  `source_id` varchar(64) NOT NULL,
  `mentioned_user_id` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`source_type`, `source_id`, `mentioned_user_id`)
);
