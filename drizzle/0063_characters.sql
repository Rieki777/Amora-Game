-- 0063: characters. The five classes, the party a player builds from them,
-- and the class tags that let work say which hands it is calling for.
--
-- A class is a LENS, never a gate. Nothing in this migration is allowed to
-- become a permission: the tag columns tune what a player is SHOWN, and the
-- capability gate (shared/capabilities.ts) never learns these words. That is
-- why the tags live on the work rather than on the person, and why they are
-- nullable with empty meaning everyone.
--
-- On `village_id`. This deployment is one village, and no other table here
-- carries the column. It is on every table in this sequence anyway, because
-- every idempotency key and unique constraint the economy depends on has to
-- carry the village scope to be correct when a second one exists, and adding
-- a scope to keys that already minted value is not a migration anybody wants
-- to write. It costs a column now. It is the whole retrofit later.

CREATE TABLE IF NOT EXISTS `archetypes` (
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  `key` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  -- The archetypal contribution this class is a name for, e.g.
  -- "Building & Developing". Village vocabulary, renameable like all of it.
  `subtitle` varchar(160) NOT NULL DEFAULT '',
  `blurb` text,
  -- Four example contributions, shown on the class panel. JSON array of
  -- strings; the seed carries the platform's five sets.
  `examples` json,
  -- A key into the shared glyph library the map's flow media already use.
  -- Not a file path: a path in a data column is a path somebody can point
  -- anywhere, and this string is rendered into an avatar lookup.
  `sigil` varchar(64) NOT NULL DEFAULT '',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`village_id`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `player_characters` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  `user_id` varchar(64) NOT NULL,
  `archetype_key` varchar(64) NOT NULL,
  -- Enums, and that is the point: presentation and tone are rendered into an
  -- avatar filename through a fixed lookup map, so the set of values they can
  -- ever hold is closed at the schema and not at the caller.
  `presentation` enum('f','m') NOT NULL DEFAULT 'f',
  `tone` enum('deep','olive','light') NOT NULL DEFAULT 'olive',
  `chosen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One character per class per player. Playing a class twice is not a thing,
  -- and without this a double-tap on "Walk this path" puts two of the same
  -- card in the party row.
  UNIQUE KEY `player_characters_one_per_class` (`village_id`, `user_id`, `archetype_key`),
  KEY `player_characters_user_idx` (`village_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The one-primary invariant lives HERE, as a single nullable pointer, rather
-- than as an `is_primary` flag on player_characters. A flag makes "exactly one
-- primary" a rule somebody has to enforce on every write and two concurrent
-- set-primary calls can both win. A pointer makes it a property of the schema:
-- there is one column, so there is one primary, and setting it is one UPDATE.
ALTER TABLE `users`
  ADD COLUMN `primary_character_id` varchar(64) NULL AFTER `avatar`;

-- Class tags on the work. `org_roles` is the org chart (what work exists),
-- which is what the selection page's "Open paths" list reads; `roles` is the
-- capability plane and is deliberately NOT tagged, because a class must never
-- come near a permission.
--
-- NULL and empty both mean "every class", and readers must treat them the
-- same. "Not tagged for this class" and "tagged for nobody" collapsing into
-- one branch is how a filter quietly hides the whole board.
ALTER TABLE `org_roles`
  ADD COLUMN `archetypes` json NULL;

ALTER TABLE `quests`
  ADD COLUMN `archetypes` json NULL;

-- Set by an admin who accepted a suggested tag rather than typing it. The
-- seed marks its guesses so the admin UI can show them amber and a human can
-- confirm or clear them, instead of the village inheriting a machine's opinion
-- as though somebody had decided it.
ALTER TABLE `org_roles`
  ADD COLUMN `archetypes_suggested` tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE `quests`
  ADD COLUMN `archetypes_suggested` tinyint(1) NOT NULL DEFAULT 0;
