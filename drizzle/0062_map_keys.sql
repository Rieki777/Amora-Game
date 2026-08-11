-- 0062: the map's own name for a thing, stored and never recomputed.
--
-- The Living Map lets a visitor RSVP to a gathering and claim a quest. When
-- they do, it posts the id IT knows: a scene-local event id (`e1`) or a quest
-- key the map derived from the title once (`plant-the-dry-season-beds`). The
-- site has to turn that into a row, and until now it had no way to.
--
-- ── WHY A COLUMN AND NOT A COMPUTATION ───────────────────────────────────
-- Events were already importable under a derived id,
-- `ev-<sceneKey>-<sceneEventId>`, so the obvious move was to rebuild that
-- string at request time. It does not work: sceneKey is read from the scene
-- FILE during import and nothing ever writes it down, so at runtime the site
-- does not know it. Storing the map's key instead removes the guess entirely.
--
-- The same argument beat the other candidate for quests, matching on title.
-- Titles are edited. The map renamed three of its own seed quests in one
-- afternoon and every one of them stopped resolving. A key that is derived
-- once and then kept survives exactly the edit that breaks a title match.
--
-- So the rule on both tables is the same, and it is the rule the map lane and
-- this lane agreed: THE MAP MINTS THE KEY, THE SITE STORES IT VERBATIM AND
-- COMPUTES NOTHING. A key that arrives is kept on re-import rather than
-- re-derived.
--
-- ── WHY 190 ──────────────────────────────────────────────────────────────
-- Long enough that a real title never has to be cut. The first attempt cut
-- quest keys to 32 to match the vocabulary-media pattern, and two of twenty
-- seed quests landed exactly on the cap: "Walk the possible spring with the
-- hydrologist" and a hypothetical "...with the surveyor" both truncate to
-- `walk-the-possible-spring-with-th`. A cut join key collides silently and
-- addresses two rows as one, which is worse than the title matching it
-- replaces, because a title mismatch at least fails loudly as NO MATCH.
-- 190 is the utf8mb4 ceiling for an indexed varchar (190 * 4 = 760 bytes).
--
-- ── WHY UNIQUE, AND WHY NULLABLE IS SAFE HERE ────────────────────────────
-- MySQL UNIQUE indexes exempt NULLs, so every row that predates the map keeps
-- a NULL and there can be any number of them. That is the correct state: most
-- villages have never imported a scene. The constraint only binds rows that
-- actually carry a key, and there it does the one job that matters, which is
-- refusing to let two rows answer to the same name.

ALTER TABLE `quests`
  ADD COLUMN `map_key` varchar(190) NULL;

ALTER TABLE `events`
  ADD COLUMN `map_key` varchar(190) NULL;

ALTER TABLE `quests`
  ADD UNIQUE KEY `quests_map_key_uniq` (`map_key`);

ALTER TABLE `events`
  ADD UNIQUE KEY `events_map_key_uniq` (`map_key`);
