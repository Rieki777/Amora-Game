-- 0093: photographs of the places on the living map, contributed by the village.
--
-- Rye: "sprite cards to accept photos but we should also make this like a
-- google maps listing where the community can upload photos". A place stops
-- being a drawing with facts attached and becomes a place people have
-- photographed: one member posts the first wall going up, another posts the
-- same wall a season later with a roof on it, a third posts the view from
-- inside.
--
-- A photograph is the only thing in this game that cannot be typed from a
-- sofa. Every other number a member enters is a claim; a picture of the wall
-- they built is evidence they stood there. That is why attribution and the
-- date are columns and not decoration.
--
-- No CHARSET clause on either table, deliberately: they inherit the database's
-- collation because contributor_id and reporter_id join users.id (0078's
-- header, and the collation-split trap). No FK constraints, house norm.
-- `--` comments sit on their own lines and never end in `;` (the 0015 trap:
-- the runner splits statements on line-final `;`).

-- ── WHY A ROW AND NOT A FIELD ON THE STRUCTURE ──────────────────────────────
--
-- The map's structures live inside the published scene JSON (0063), not in a
-- table. An image field on a structure would therefore live in the scene, be
-- overwritten wholesale by the next publish, and belong to whoever last
-- pressed publish. A photograph belongs to the person who took it and outlives
-- every redraw of the land, so it is its own row keyed on the map's own key.
--
-- No foreign key on structure_key for the same reason 0077 gives: there is
-- nothing to reference. A key matching no structure is a place nobody has
-- painted yet, which is not an error.

CREATE TABLE IF NOT EXISTS `place_photos` (
  `id` varchar(64) NOT NULL,
  -- Same scope column every table in the 0069+ sequence carries.
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- The MAP's key for the place, byte for byte (0062 doctrine, matching
  -- housing_availability). Never derived from a label.
  `structure_key` varchar(64) NOT NULL,
  -- Always /api/uploads/<name>.webp from the platform's own pipeline. The
  -- forum's rule: an offsite address would point every visitor's browser at
  -- somebody else's host, and this table is read by anonymous visitors.
  --
  -- The address stays on the row after a takedown so the retention sweep can
  -- still find the file it has to unlink. `removed_at` decides whether the
  -- bytes are served, never the presence of this value.
  `url` varchar(500) NOT NULL,
  `thumb_url` varchar(500) NULL,
  -- NOT NULL and refused empty by the route above it.
  --
  -- The platform already ships nine alt-text fields that store nowhere. A
  -- tenth would make the same promise to a member who cannot see the picture
  -- and keep it exactly as poorly. Either alt text is real or its absence is
  -- honest, so here it is a column, it is required, and it is what the img tag
  -- renders.
  `alt_text` varchar(300) NOT NULL,
  -- What the photographer wants said about it. Optional: the picture is the
  -- contribution.
  `caption` varchar(500) NULL,
  -- The day it was taken, when the contributor knows it. NULL means unknown
  -- and the surfaces say "added" instead of "taken", which is a different
  -- fact and reads as one. A date and not a timestamp: nobody remembers the
  -- hour, and a photograph of a wall is dated to a day at best.
  `taken_on` date NULL,
  `width` int NULL,
  `height` int NULL,
  `bytes` int NULL,
  -- Who stood there with the camera. NOT NULL: an unattributed photograph is
  -- a stock image, and the attribution is the whole difference between this
  -- and a gallery.
  `contributor_id` varchar(64) NOT NULL,
  -- The village's chosen lead picture for this place. At most one per place is
  -- enforced in the repo, not by an index, because a partial unique index is
  -- not a thing MySQL has and a nullable column in a unique key admits
  -- infinite duplicates (the house trap). Set means "this is the shot that
  -- says what this place is"; NULL means the place leads with its newest.
  `hero_at` timestamp(3) NULL,
  -- REVERSIBLE. Community reports past the threshold, and the subject of a
  -- photograph asking for it to come down, both land here. A hidden row keeps
  -- its file and stops being served, so a curator can put it back.
  `hidden_at` timestamp(3) NULL,
  -- A user id, or the sentinel 'community' (auto-hidden by reports) or
  -- 'subject' (the person in the picture asked). varchar and not a foreign
  -- key so the sentinels can live in the same column as a real actor, exactly
  -- as forum_threads.hidden_by does.
  `hidden_by` varchar(64) NULL,
  `hidden_reason` varchar(255) NULL,
  -- IRREVERSIBLE, and the row survives it as a tombstone.
  --
  -- The report trail names photo ids, so deleting the row would leave a
  -- resolved report pointing at nothing and a curator unable to see what they
  -- decided. The file is unlinked at the moment this is set; the tombstone
  -- ages out of the retention sweep with map.photo_tombstone_days.
  `removed_at` timestamp(3) NULL,
  `removed_by` varchar(64) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- One row per file. The retention sweep and the serving guard both key on
  -- the address, so two rows naming one file would let one row's takedown
  -- delete the other row's picture.
  UNIQUE KEY `place_photos_url_uq` (`url`),
  -- The one read the gallery serves: this place's live photographs, hero
  -- first, then newest. Scope, place, then the two state columns the WHERE
  -- clause tests, then the sort column.
  KEY `place_photos_place_idx` (`village_id`, `structure_key`, `removed_at`, `hidden_at`, `created_at`),
  -- The per-member daily cap counts against this.
  KEY `place_photos_contributor_idx` (`contributor_id`, `created_at`),
  -- The sweep's read: tombstones old enough to forget.
  KEY `place_photos_removed_idx` (`removed_at`)
) ENGINE=InnoDB;

-- ── TWO KINDS OF REPORT, AND THEY ARE NOT THE SAME ACT ──────────────────────
--
-- 'concern' is a member saying this photograph should not be on the village's
-- map. It is the forum's report, with the forum's auto-hide at N distinct
-- reporters, and it is the village judging its own record.
--
-- 'subject' is a person saying that is me, take it down. It is not a vote and
-- it does not wait for a threshold: one is enough, and it hides the picture
-- the moment it is filed. A person's say over their own image is not the
-- village's call to make by majority, and the consequence they are protected
-- from (their face on a public map of a rural land project) is one they can
-- neither see coming nor undo.
--
-- Both kinds reach the same queue, and that queue is capability-gated, never
-- admin-gated: whoever the village has appointed to curate its pictures can
-- open it. A report path that lands somewhere no client can read is a member
-- getting a success message into nothing.

CREATE TABLE IF NOT EXISTS `place_photo_reports` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  `photo_id` varchar(64) NOT NULL,
  `reporter_id` varchar(64) NOT NULL,
  `kind` enum('concern','subject') NOT NULL DEFAULT 'concern',
  `reason` varchar(500) NULL,
  `status` enum('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  `resolved_by` varchar(64) NULL,
  `resolved_at` timestamp(3) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- Report once per person per photograph per kind. All three columns are NOT
  -- NULL because a MySQL unique index exempts NULLs, so a nullable dedupe
  -- column admits infinite duplicates.
  --
  -- Per KIND on purpose: a member who flagged a picture as a concern and then
  -- realises they are in it has a second, different thing to say, and the
  -- second one carries a stronger claim.
  UNIQUE KEY `place_photo_reports_once_uq` (`photo_id`, `reporter_id`, `kind`),
  -- The queue's read: open first, oldest waiting at the top.
  KEY `place_photo_reports_status_idx` (`status`, `created_at`),
  KEY `place_photo_reports_photo_idx` (`photo_id`)
) ENGINE=InnoDB;
