-- 0077: how many homes a hamlet has open, and who has spoken for them.
--
-- Rye: founders set, per hamlet, how many homes are open for reservation and
-- how many are taken, in TWO places (builder mode on the map, Admin on the
-- main site) writing ONE table, so the reservation system has a single source
-- of truth. Until a hamlet is set, every surface showing its numbers says
-- they are an example.
--
-- ── UNSET IS NULL, NOT A SENTINEL ────────────────────────────────────────
-- `homes_total` and `homes_taken` are nullable and independent. A row can
-- exist with both NULL, because builder mode inserts the row when a hamlet is
-- NAMED, before any number is typed. So A ROW EXISTING DOES NOT MEAN THE
-- HAMLET IS SET, and every consumer must test the counts rather than the row.
--
-- `-1` was rejected as the unset marker: it survives arithmetic silently, so
-- `total - taken` yields a plausible wrong integer instead of failing, and all
-- three consuming surfaces would have to know the convention. This schema
-- already uses NULL-as-silence for exactly this distinction (0060's
-- `address_source`). `0` means zero homes and never unlimited, which is the
-- caps-fail-closed invariant.
--
-- ── homes_open IS DERIVED, NEVER STORED ──────────────────────────────────
-- `open = max(0, total - taken)`. A stored third number can disagree with the
-- other two, and there is no way to tell which one lied. The clamp is
-- fail-closed for a founder typo where taken > total: it must never render
-- negative and must never read as unlimited.
--
-- ── TAKEN IS STORED, AND ITS AUTHORITY IS RECORDED ───────────────────────
-- A derive-only design cannot represent homes that were spoken for before
-- this platform existed, which is this village's actual state. So
-- `homes_taken` holds the number the founder types, and `taken_source` names
-- who is authoritative for that row: 'founder' (default) or 'reservations'.
-- Precedence is whatever `taken_source` names, even when the other side has
-- data. While it says 'founder', the typed number wins over any reservation
-- count. When the reservation system takes over a hamlet, the row flips to
-- 'reservations', the count becomes a live query against housing_reservations
-- below, and `homes_taken` stops being read for that row.
--
-- varchar not enum, matching `address_source` (0060): the set of authorities
-- will grow and an enum change is a table rebuild.

CREATE TABLE IF NOT EXISTS `housing_availability` (
  `id` varchar(64) NOT NULL,
  -- Same scope column every table in the 0069+ sequence carries, for the same
  -- reason: adding a village scope to a unique key that already holds real
  -- counts is the migration nobody wants to write.
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- The MAP's key for the place, byte for byte. The map mints it, the site
  -- stores it verbatim and computes nothing (0062 doctrine). Never derived
  -- from a label: labels get edited and every derived key stops resolving.
  --
  -- NOT NULL because it is the dedupe column in the unique key below, and
  -- MySQL UNIQUE indexes exempt NULLs, so a nullable dedupe column admits
  -- infinite duplicates. varchar(64) matches `structure_key` on org_roles and
  -- quests (0060).
  --
  -- No foreign key: structures live inside the published scene JSON (0063),
  -- not in a table, so there is nothing to reference. A key matching no
  -- structure is a no-op on the map and not an error, because a founder may
  -- set a hamlet before the scene that paints it is published.
  `structure_key` varchar(64) NOT NULL,
  -- The founder's own name for the hamlet. NULL means the map's own name for
  -- the structure wins.
  `label` varchar(190) NULL,
  `homes_total` int NULL,
  `homes_taken` int NULL,
  `taken_source` varchar(24) NOT NULL DEFAULT 'founder',
  `updated_by` varchar(64) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- One row per hamlet per village. This is what makes both founder surfaces
  -- an UPSERT rather than a read-then-write, so builder mode and Admin cannot
  -- race each other into two rows for one place.
  UNIQUE KEY `housing_avail_village_structure_uniq` (`village_id`, `structure_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── THE INTENT SIDE ──────────────────────────────────────────────────────
--
-- Slice 1 of the reservation flow: a person picks a home type, says which
-- hamlet they want it in, and that intent is recorded. NO MONEY MOVES HERE.
-- The deposit is a later step and it reuses server/lib/payments.ts, which
-- already does HMAC over the raw body and event-level dedupe on
-- stripe_event_id. This table is what a future charge will attach to.
--
-- WHY THIS IS NOT A ROW IN `submissions`. That generic table (0001) already
-- takes anonymous intake as a json blob and has an admin surface, so reusing
-- it was the cheaper option and it was rejected for one measurable reason:
-- `taken_source = 'reservations'` above turns homes_taken into a live COUNT
-- per structure_key. Counting rows keyed inside a json column means a full
-- scan with JSON extraction on every read of the public map config, and no
-- index can help. Here the count is an indexed lookup on
-- (village_id, structure_key, status). The second reason is the deposit: a
-- payment reversal handler needs a stable typed row to claw back against.
--
-- `user_id` is nullable because this form is reachable from the public
-- housing pages, where the person has usually not signed in yet. That is the
-- whole point of the step: it is the first thing they do.

CREATE TABLE IF NOT EXISTS `housing_reservations` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- Which hamlet, carried from the map through ?hamlet=<structureKey>. NULL
  -- when someone reached the form from the housing page with no hamlet in
  -- mind, which is allowed: an intent without a location is still an intent,
  -- and forcing a choice here would lose the lead.
  `structure_key` varchar(64) NULL,
  -- tiny-home | casita | family-home | villa. varchar and not enum for the
  -- same reason as taken_source: a village adds a home type by typing one.
  `home_type` varchar(48) NOT NULL,
  `name` varchar(190) NOT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(64) NULL,
  `notes` text NULL,
  -- How they arrived, e.g. 'map' or 'site'. Rye asked that the form remember
  -- which neighbourhood they came from; this records the ROUTE beside the
  -- hamlet so a lead from the map is distinguishable from one typed in cold.
  `arrived_from` varchar(32) NULL,
  -- new | contacted | reserved | withdrawn. Only 'reserved' counts against a
  -- hamlet's homes_taken when that hamlet's taken_source is 'reservations',
  -- so an unanswered enquiry never silently consumes a home.
  `status` varchar(24) NOT NULL DEFAULT 'new',
  `user_id` varchar(64) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- The index the live count reads. Ordered scope, place, status so the count
  -- for one hamlet is a prefix lookup.
  KEY `housing_res_place_idx` (`village_id`, `structure_key`, `status`),
  KEY `housing_res_email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
