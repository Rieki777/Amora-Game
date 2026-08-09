-- 0060: the map address plane. Where a thing lives, and who said so.
--
-- The Living Map addresses circles, seats, quests and threads to painted
-- structures. Until now there was nowhere to put any of it, so the scene
-- exporter carried addresses that the site could only throw away.
--
-- Every column here is ADDITIVE and NULLABLE. Four populated tables are being
-- altered on a live deployment, migrations run at boot fail-loud, and an
-- unaddressed row is the correct state for almost everything on day one.
--
-- ── WHY address_source EXISTS ────────────────────────────────────────────
-- A person placing a quest at the greenhouse and a resolver guessing it
-- belongs there are not the same claim. Storing only the key loses that, and
-- the first automated pass then quietly overwrites somebody's decision. The
-- provenance rides beside the address so the rule "a creator is never
-- overwritten by a guess" can actually be enforced (shared/mapAddress.ts).
--
-- Vocabulary: creator, creator-board, resolver-guess. NULL is none of them and
-- means nobody has said anything yet, which is deliberately DIFFERENT from
-- creator-board: one is silence, the other is a person choosing the Board.
--
-- varchar rather than an enum, on purpose. Enum values are ordinal in MySQL
-- and this list is expected to grow as the map learns new ways to place a
-- thing; a widening enum is an ALTER on four populated tables every time.
-- The allowed values are enforced in code, where the doctrine also lives.
--
-- circles get no address_source, matching the export: the scene emits
-- home_structure_key alone for a circle, with no provenance beside it.

ALTER TABLE `circles`
  ADD COLUMN `home_structure_key` varchar(64) NULL;

ALTER TABLE `org_roles`
  ADD COLUMN `structure_key` varchar(64) NULL,
  ADD COLUMN `address_source` varchar(24) NULL;

ALTER TABLE `quests`
  ADD COLUMN `structure_key` varchar(64) NULL,
  ADD COLUMN `address_source` varchar(24) NULL;

-- A thread can be about more than one place, so this is the same JSON
-- multi-address the events table uses, and readers treat a malformed value as
-- "no structures" rather than throwing a page into a 500.
ALTER TABLE `forum_threads`
  ADD COLUMN `structure_keys` json NULL,
  ADD COLUMN `address_source` varchar(24) NULL;

-- "Everything at the greenhouse" is the question the map asks most, and
-- without these it is a full scan of three tables that every module writes to.
ALTER TABLE `org_roles`
  ADD KEY `org_roles_structure_idx` (`structure_key`);

ALTER TABLE `quests`
  ADD KEY `quests_structure_idx` (`structure_key`);

ALTER TABLE `circles`
  ADD KEY `circles_home_structure_idx` (`home_structure_key`);
