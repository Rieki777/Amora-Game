-- 0131: the homes a village offers, in that village's own words.
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────
-- `client/src/pages/Housing.tsx` carried four home tiers as a module
-- constant: Tiny Home at 200-400 sq ft for $80,000 to $150,000, through to
-- Luxury Villa at 1,500+ sq ft for $1,000,000+, each with a "Reserve this
-- home" button under it. `client/src/pages/ReserveHome.tsx` carried a second
-- copy of the same four sizes, worded differently for the same homes.
-- `/housing` is not module-gated, so EVERY village that deploys this platform
-- published those American figures under its own name, to prospective
-- residents, and no admin field anywhere could change one of them. Read live
-- on 2026-09-02 at a Costa Rican village publishing dollars and square feet
-- nobody there chose.
--
-- 0077 gave housing its table, and it models AVAILABILITY: how many homes a
-- hamlet has and how many are spoken for. It models no price and no size.
-- This is that gap.
--
-- ── WHY A SIBLING TABLE AND NOT COLUMNS ON housing_availability ──────────
-- Wrong grain. `housing_availability` is keyed (village_id, structure_key):
-- one row per HAMLET. A price and a size belong to a HOME TYPE, and the two
-- surfaces that show them hold no hamlet at all: /housing draws one card per
-- home type, and /reserve draws the chooser before anyone has said where.
-- Putting price on the hamlet row would let a village state four different
-- casita prices in four hamlets while neither reader has a hamlet to pick
-- one with, and neither could say which was meant.
--
-- So: one row per (village_id, home_type), the same key `housing_reservations`
-- already files an intent under, and the same four values
-- `server/lib/housing.ts` refuses a reservation outside of.
--
-- ── UNSET IS NULL, NOT A SENTINEL, AND NOT AN EMPTY STRING ───────────────
-- Straight from 0077, whose reasoning applies here word for word. Every
-- describing column is nullable and independent, and A ROW EXISTING DOES NOT
-- MEAN THE HOME TYPE IS PUBLISHED. A founder can name a home and price it
-- later, or write a description before deciding what to call it.
--
-- The predicate is applied EXACTLY ONCE, in `publicHomeTypes`
-- (server/lib/housing.ts), the way `publicEntries` owns the hamlet one: a
-- home type publishes when it has a NAME and at least one of SIZE or PRICE.
-- A name alone is a card with a heading and nothing under it; a size or price
-- with no name is a figure with nothing to attach it to. Every consuming
-- surface then tests one thing, whether the home type came back in the list,
-- and no surface re-derives what published means.
--
-- ── FREE TEXT, AND NEVER A NUMBER ────────────────────────────────────────
-- `size_text` and `price_text` carry the `_text` suffix so nobody reads them
-- as quantities later and adds a currency, a unit, a conversion or a sort.
-- Whatever the founder types is what publishes: "0.5 hectares", "45 m2",
-- "₡45,000,000", "$80,000 to $150,000", "ask us". A sibling lane spent a day
-- on the mirror of this defect, a page asserting "Total Acres" over a figure
-- a founder meant as hectares, and the answer was the same one: the platform
-- has no opinion about a founder's units or currency.
--
-- A decimal price column with a currency code beside it was the other option
-- and was rejected. It cannot hold a range, it cannot hold "ask us", and it
-- forces the platform to pick a rounding and a symbol placement for every
-- currency on earth. The figure on this page is a shop window, not an
-- invoice; nothing computes with it. `server/lib/payments.ts` owns money that
-- moves, and the deposit still goes through it.
--
-- ── AND NO SEEDING ───────────────────────────────────────────────────────
-- This migration inserts NO ROWS. The live village's tier cards disappear the
-- moment it lands and come back when a founder types their own figures into
-- Admin, Housing. Seeding the old four as defaults to spare it a blank
-- section would put the entire defect back with a migration number on it.

CREATE TABLE IF NOT EXISTS `housing_home_types` (
  `id` varchar(64) NOT NULL,
  -- Same scope column every table in the 0069+ sequence carries.
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- tiny-home | casita | family-home | villa. varchar(48) and not enum,
  -- matching `housing_reservations`.`home_type` byte for byte, because these
  -- are the same values: a card links to the reservation form carrying this
  -- key, and the form's POST refuses anything outside the list. varchar for
  -- the same reason 0077 gives, a village adds a home type by typing one.
  --
  -- NOT NULL because it is the dedupe column in the unique key below, and
  -- MySQL UNIQUE indexes exempt NULLs, so a nullable dedupe column admits
  -- infinite duplicates.
  `home_type` varchar(48) NOT NULL,
  -- What this village calls this home. NULL means unnamed, and an unnamed
  -- home type never publishes. The KEY above is the contract and this is not:
  -- a village renaming the casita to "cabina" types that here, and every link
  -- already sent, every intent already recorded and every report already run
  -- still means the same home.
  `name` varchar(190) NULL,
  -- How big, in the founder's own words and units. Never parsed.
  `size_text` varchar(190) NULL,
  -- What it costs, in the founder's own words and currency. Never parsed.
  `price_text` varchar(190) NULL,
  `description` text NULL,
  -- The bullet list under the description, one feature per line. Stored as
  -- the founder typed it, newlines and all, and split on newlines at render.
  -- text and not json: a founder types lines into a textarea, and a json
  -- column would mean a parse step that can fail on a column nothing else
  -- queries into.
  `features` text NULL,
  `updated_by` varchar(64) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  -- One row per home type per village, which is what makes the founder write
  -- an UPSERT rather than a read-then-write, exactly as 0077 does for hamlets.
  UNIQUE KEY `housing_home_type_village_uniq` (`village_id`, `home_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
