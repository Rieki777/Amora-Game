-- 0123: where the village is, so the Living Map can show the real ground.
--
-- WHAT WAS MISSING. This platform draws a village's land from a `SCENE` that
-- the map artifact ships baked in, and a founder rearranges it by hand in
-- build mode. Nothing anywhere records WHERE THE LAND IS. `gameConfig`
-- carries `location: "Dominicalito, Costa Rica"`, which is a caption: it
-- cannot be fetched against, cannot frame an image, and cannot tell two
-- villages apart if they name the same town. So every founder starts their
-- map by dragging shapes over a picture of somebody else's valley.
--
-- One row per village holds a point and a width. That is enough to ask an
-- imagery provider for a photograph of the actual ground, which is the thing
-- a founder needs under their structures before the map means anything.
--
-- ── NULL IS UNSET AND ZERO IS THE GULF OF GUINEA ─────────────────────────
--
-- The most important line in this file. `centre_lat` and `centre_lon` are
-- NULLABLE and their unset value is NULL, never 0. Latitude 0, longitude 0 is
-- a real point on the earth, about 600 km south of Ghana, and any code that
-- asks `if (!lat)` cannot tell a village that has said nothing from a village
-- in the Atlantic. Every reader of these two columns tests `IS NULL`, and
-- `server/routes/land.ts` tests `=== null`. A DEFAULT of 0 here would have
-- made that distinction impossible to recover afterwards, which is why there
-- is no default at all.
--
-- The same rule holds for `span_m`: NULL means the founder has not chosen a
-- width, and 0 would mean an image of nothing.
--
-- ── WHY DECIMAL AND NOT DOUBLE ───────────────────────────────────────────
--
-- decimal(9,6) stores exactly what the founder typed and hands it back byte
-- for byte. A float would return 9.234499999999999 for 9.2345, which then
-- renders in the admin field as a number the founder did not type and cannot
-- correct, because typing it again produces the same drift. Six decimal
-- places is about 11 cm at the equator, which is finer than any satellite
-- imagery this will ever be paired with.
--
-- ── WHY THE PASTED TEXT IS KEPT ──────────────────────────────────────────
--
-- `source_text` is what the founder actually put in the box, and
-- `source_format` is what the parser made of it. Neither is read to compute
-- anything. They exist so that when a founder says the map is in the wrong
-- place, the record shows whether they pasted a plus code, a link, or a pair
-- of numbers, and whether the parser read it the way they meant. A stored
-- result with no stored input makes that conversation guesswork.
--
-- ── VISIBILITY DEFAULTS TO HIDDEN, AND THAT IS DELIBERATE ────────────────
--
-- A village is a place people sleep. This codebase already re-encodes every
-- uploaded photograph to strip the GPS coordinates out of it
-- (server/lib/uploads.ts), so shipping a table that publishes the village
-- centre to five decimal places by default would undo that on the first
-- deploy. 'hidden' means the imagery still renders for signed-in members and
-- nothing about the location reaches an uncredentialed reader. A founder
-- turns it up by choosing, once, in the admin screen.
--
-- ── EXPAND, NEVER CONTRACT ───────────────────────────────────────────────
--
-- This adds one table and touches nothing that exists. The release running
-- before it never reads or writes this table, so a rollback is safe and a
-- deploy that half-lands leaves every other surface exactly as it was.
--
-- No foreign keys, house norm. `village_id` carries the same 0069 scope
-- column every table in that sequence has, defaulted to 'local' because one
-- deployment is one village today.
CREATE TABLE IF NOT EXISTS `village_land` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',

  -- The centre of the land, in signed decimal degrees. NULL means the founder
  -- has not said. See the note above: this is never 0 for "unset".
  `centre_lat` decimal(9,6) NULL,
  `centre_lon` decimal(9,6) NULL,

  -- How wide across the pictured area should be, in metres, edge to edge.
  -- NULL means unchosen. shared/land.ts holds the floor and the ceiling.
  `span_m` int unsigned NULL,

  -- 'hidden', 'approximate' or 'exact'. The vocabulary lives in
  -- shared/land.ts (LAND_VISIBILITIES) and is validated in code, not here: a
  -- CHECK constraint would have to be migrated every time the list grows, and
  -- MySQL versions disagree about enforcing them.
  `visibility` varchar(16) NOT NULL DEFAULT 'hidden',

  -- What the founder pasted, and what the parser made of it. Kept for the
  -- support conversation, read by nothing that computes.
  `source_text` varchar(500) NULL,
  `source_format` varchar(24) NULL,

  -- ── THE CACHED PHOTOGRAPH ──────────────────────────────────────────────
  -- `imagery_filename` names a file on the uploads volume, written through
  -- server/lib/uploads.ts like every other byte that lands there. It is NOT a
  -- provider URL. This repository lost six hero photographs in one week
  -- because they were hotlinked to a site that got rebuilt, and an image
  -- fetched once and stored is the fix for that class.
  `imagery_provider` varchar(32) NULL,
  `imagery_filename` varchar(255) NULL,

  -- The credit line the provider's licence requires, captured at fetch time
  -- and stored beside the file. Stored rather than looked up, because the
  -- attribution owed is the attribution of the SOURCE THAT WAS FETCHED: if
  -- the deployment later switches providers, the old picture still owes the
  -- old credit until it is replaced.
  `imagery_attribution` varchar(255) NULL,
  `imagery_fetched_at` datetime NULL,

  -- Why the last fetch failed, in words a founder can act on. NULL means the
  -- last attempt succeeded or none has been made. Kept so the admin screen
  -- can say what went wrong without re-running a request that costs money.
  `imagery_error` varchar(255) NULL,

  `updated_by` varchar(64) NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  -- One land record per village. The unique key is what stops two concurrent
  -- saves from becoming two rows, so the upsert in server/routes/land.ts can
  -- rely on the database to settle it instead of a read-then-write window.
  UNIQUE KEY `village_land_village_uniq` (`village_id`)
) ENGINE=InnoDB;
