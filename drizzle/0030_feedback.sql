-- 0030 (S66): the feedback spine — bugs and ideas, captured locally always,
-- relayed to the platform hub only while the village keeps relaying on.
--
-- The LOCAL queue is the feature; the relay is a copy. Turning the relay off
-- changes one thing only: whether the platform team also sees an item. The
-- village's own admins always see everything submitted through their door.
CREATE TABLE IF NOT EXISTS `feedback_items` (
  `id` varchar(64) NOT NULL,
  `kind` enum('bug','idea') NOT NULL,
  `title` varchar(200) NOT NULL,
  `detail` text NOT NULL,
  -- Where they were standing when it happened; often half the report.
  `page_url` varchar(500) NULL,
  -- Who said it, when signed in. NEVER relayed — the hub gets content, not people.
  `submitted_by` varchar(64) NULL,
  -- sha256 prefix over (kind, normalized title+detail): hub-side dedupe, so
  -- forty forks hitting one crash collapse into one item with a count.
  `fingerprint` varchar(64) NOT NULL,
  `status` enum('new','seen','planned','done','declined') NOT NULL DEFAULT 'new',
  -- Relay bookkeeping: NULL = not yet sent (or relay off). Set only on a 2xx
  -- from the hub, so failures retry naturally on the next sweep.
  `relayed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `feedback_status_idx` (`status`, `created_at`),
  KEY `feedback_relay_idx` (`relayed_at`, `created_at`)
);
