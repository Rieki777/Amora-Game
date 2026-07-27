-- 0031 (S67): interop foundations — the peer registry and the publish frame.
--
-- The design bet: MANY collaboration features (needs & offers today;
-- co-hiring, shared events, resource pooling later) can ride ONE generic
-- frame — a village PUBLISHES items to the network, peers SUBSCRIBE and
-- cache. Federation, not a hub: each instance serves its own public JSON,
-- each instance decides whom it reads. Adding a new collaboration type
-- later is a new `type` value and a renderer, not a new protocol.
--
-- Consent posture (decided with Rye, 2026-07-27): publishing is an explicit
-- per-item act by an admin/steward. Nothing person-shaped is ever published
-- without that person's own opt-in — enforced today by the publish surface
-- carrying no member fields at all; a future people-directory type adds a
-- per-member consent row FIRST.

-- Who this village chooses to listen to. instance_id is learned from the
-- peer's own handshake at add time and re-verified on every sync — a peer
-- whose identity CHANGES under a known URL is flagged, not silently trusted.
CREATE TABLE IF NOT EXISTS `peer_instances` (
  `id` varchar(64) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `base_url` varchar(300) NOT NULL,
  `name` varchar(120) NOT NULL,
  `version` varchar(20) NULL,
  `added_by` varchar(64) NOT NULL,
  `status` enum('active','paused') NOT NULL DEFAULT 'active',
  `last_sync_at` timestamp NULL,
  `last_error` varchar(300) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `peer_instance_uq` (`instance_id`),
  UNIQUE KEY `peer_url_uq` (`base_url`)
);

-- What THIS village publishes. `type` is the extension point; v1 ships
-- 'need' and 'offer' and validates against a server-side allowlist, so a
-- future type is a code change with a review, never a free string.
CREATE TABLE IF NOT EXISTS `shared_items` (
  `id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `title` varchar(200) NOT NULL,
  `detail` text NOT NULL,
  -- How the network reaches the village about this item. A village-level
  -- address chosen at publish time, never a member's personal contact.
  `contact` varchar(200) NULL,
  `created_by` varchar(64) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shared_items_pub_idx` (`status`, `type`, `created_at`)
);

-- What peers publish, as last fetched. A cache, never a source of truth:
-- one JSON payload per peer, refreshed by the sync job, dropped with the peer.
CREATE TABLE IF NOT EXISTS `peer_shared_cache` (
  `peer_id` varchar(64) NOT NULL,
  `payload` json NOT NULL,
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`peer_id`)
);
