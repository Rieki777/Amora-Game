-- 0063: the map gets a draft, a live version, and a way back.
--
-- Build mode could rearrange the whole land and the only route to the live
-- site was an exported file, a person with database access, and
-- scripts/import-map-scene.ts, which skips `structures`, `zones` and `flows`
-- because the geometry had nowhere to go. These two tables are where it goes.
--
-- The shape is one draft per person and an append-only history of what has
-- been made live. Drafts are private and separate on purpose: two admins can
-- each be rearranging the land without either one's work appearing under the
-- other's hands, which is only true because a draft is a row keyed on a
-- person and the live map is a different row entirely.

-- The publish history. Append-only, and the newest row IS the live map.
--
-- WHY LONGTEXT AND NOT JSON. MySQL's `json` type normalises what it stores:
-- it reorders object keys, strips insignificant whitespace, and drops
-- duplicate keys. All of that is harmless to JSON.parse and all of it makes
-- "stored verbatim" a false claim. The scene is the MAP's document, written
-- by buildExportJSON and read back by restoreScene, and this repo has already
-- paid four times for a value that lost parts crossing a boundary. Storing
-- the exact string the map sent removes this table from that list of risks.
-- Nothing here ever queries inside a scene, so the json type buys nothing to
-- weigh against it.
CREATE TABLE IF NOT EXISTS `map_scene_revisions` (
  -- Monotonic, and it IS the version a draft pins itself to.
  `version` int NOT NULL AUTO_INCREMENT,
  `scene` longtext NOT NULL,
  -- The version this publish superseded, and the whole concurrency guard.
  --
  -- Every revision supersedes exactly one predecessor, so this column is
  -- UNIQUE, and that uniqueness is what makes two admins publishing at the
  -- same instant safe without a transaction or a lock. Both forked from
  -- version 5, both insert base_version 5, and MySQL fails the second one
  -- with ER_DUP_ENTRY. The loser is told the ground moved and what changed,
  -- instead of silently flattening the winner a millisecond after it landed.
  -- Same shape as the idempotency key on contact_requests, for the same
  -- reason: let the database decide the race, never a read followed by a
  -- write.
  --
  -- NOT NULL is load-bearing. MySQL UNIQUE indexes exempt NULLs, so a
  -- nullable guard column would admit unlimited duplicates and quietly do
  -- nothing at all. 0 is the honest first value: superseding nothing.
  `base_version` int NOT NULL,
  -- NULL means the platform published it, never a missing person.
  `actor_user_id` varchar(64) NULL,
  `note` varchar(500) NULL,
  -- The map's own edit journal for this publish, in plain words, so the
  -- history reads as what changed instead of a diff nobody opens.
  `summary` json NULL,
  -- Set when this row exists to put an earlier version back. An undo is a new
  -- revision carrying an old scene, never a mutation or a delete: the same
  -- append-only rule the ledger and badge_events keep, for the same reason.
  `restored_from` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`),
  UNIQUE KEY `map_scene_revisions_base_uniq` (`base_version`)
);

-- One working copy per person.
--
-- The draft a member is building, and the published version it was forked
-- from. `base_version` is the whole concurrency story: publish compares it to
-- the live version and refuses when the ground has moved underneath, so the
-- second of two admins is told what changed instead of silently overwriting
-- the first. 0 means the draft was forked before anything was ever published,
-- which is the ordinary state of a village running the map's own seed.
CREATE TABLE IF NOT EXISTS `map_scene_drafts` (
  `user_id` varchar(64) NOT NULL,
  `scene` longtext NOT NULL,
  `base_version` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
);

-- The badge that governs the map.
--
-- Two capability keys and not one. map.edit opens build mode and a private
-- draft; map.publish is what puts a change in front of every visitor. Split,
-- a founder can let someone shape a proposal without handing them the live
-- land, which is the arrangement most villages actually want.
--
-- INSERT IGNORE so a deployment that already made its own badge with this id
-- keeps theirs, and so this migration is safe to re-run. The badges module
-- ships off; while it is off this row exists and grants nothing, because the
-- gate never asks about badges until the module is on.
INSERT IGNORE INTO `badges` (`id`, `name`, `description`, `icon`, `kind`, `capabilities`, `denies`, `rule`, `active`)
VALUES (
  'cartographer',
  'Cartographer',
  'One who makes the map. A cartographer shapes the living map of the land and decides when that shape becomes the one everyone sees.',
  'compass',
  'granted',
  '["map.edit","map.publish"]',
  NULL,
  NULL,
  1
);
