-- 0083: the power map (round 4, lane L2).
--
-- /map/circles becomes the picture of how power is held, and this is the data
-- under it. Nothing here moves money or applies a structure change by itself:
-- these are WORDS a village declares about itself, columns for when a seat
-- speaks for its circle, a vision block on drafts a human still has to apply,
-- and a cache of daily exchange rates for DISPLAY only.
--
-- Vocabulary ids (shapes, ways of deciding, domains, how a holder is chosen)
-- are validated in code against shared/power.ts, not by enum columns, for the
-- same reason 0049 chose varchar for `criticality`: an enum turns "that word
-- is not in the list" into a truncation error instead of a sentence, and
-- adding a word later becomes DDL.

-- ── Circles: how each one decides ───────────────────────────────────────────
-- Per circle, with optional per-domain overrides (money, people, space_land,
-- rules), all NULL until a village says otherwise: the village-level default
-- lives in the map module's config, not in a row.
ALTER TABLE `circles`
  ADD COLUMN `decides_by` varchar(32) NULL,
  ADD COLUMN `decides_by_gloss` varchar(160) NULL,
  -- {money?, people?, space_land?, rules?}, each {method, gloss?}. A LENS over
  -- the circle's one method, so partial is the normal state.
  ADD COLUMN `decides_by_domains` json NULL;

-- ── Seats: representation and succession ────────────────────────────────────
ALTER TABLE `org_roles`
  -- The one narrow bridge from the seat plane to a permission (P10, N5):
  -- a live holder of a seat flagged represents_circle may declare how ITS
  -- circle decides, and nothing else. Recorded as a one-exception ADR
  -- (docs/ADR_2026-08_REPRESENTS_CIRCLE_DECLARES.md); never a capability.
  ADD COLUMN `represents_circle` tinyint(1) NOT NULL DEFAULT 0,
  -- How the next holder is chosen (P6): the heart of "how power is held",
  -- shown on the seat card. Gloss carries the village's own words for `other`.
  ADD COLUMN `how_chosen` varchar(32) NULL,
  ADD COLUMN `how_chosen_gloss` varchar(160) NULL;

-- ── Drafts: the vision block (P1, N2) ───────────────────────────────────────
-- {objectives: [{text, metric, target, current, source, done}], trigger:
-- {all_objectives_done, by?}}. The platform PROMPTS when every objective is
-- done; a human presses the existing publish button. Nothing applies itself.
ALTER TABLE `org_drafts`
  ADD COLUMN `vision` json NULL;

-- ── The escalation relation (P5) ────────────────────────────────────────────
-- "If I disagree, where do I go" becomes a drawable line. This row is ONLY
-- for deployments whose vocabulary was seeded before 0083, which is why it
-- guards on the table being non-empty: on a fresh install the migrations run
-- before first boot, and an unconditional insert here would leave one row in
-- the table, so seedStarterTypes (which only fills an EMPTY table, exactly so
-- a village's deletions stay deleted) would skip the other five starter
-- types. Fresh installs get escalation from STARTER_TYPES instead; either
-- door, deleted once is gone for good.
INSERT IGNORE INTO `org_relation_types` (`id`, `label`, `inverse_label`, `symmetric`, `is_cover`, `sort_order`)
SELECT 'escalation', 'escalates objections to', 'hears objections from', 0, 0, 6
  FROM (SELECT 1 FROM `org_relation_types` LIMIT 1) AS `already_seeded`;

-- ── Daily exchange rates, for display only (P8, N4) ─────────────────────────
-- Base EUR because the source is the ECB's daily reference list. One row per
-- (quote, day); the fx-rates-daily job upserts today's row and old rows stay,
-- so "the rate we showed that day" remains answerable. `source` is 'ecb' for
-- fetched rows and 'manual' for a rate an admin declares (a village currency
-- the ECB does not list, CRC among them). NOTHING here touches settlement:
-- Stripe charges what payments.ts always charged.
CREATE TABLE IF NOT EXISTS `fx_rates` (
  `quote` char(3) NOT NULL,
  `rate` decimal(18,8) NOT NULL,
  `as_of` date NOT NULL,
  `source` varchar(16) NOT NULL DEFAULT 'ecb',
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`quote`, `as_of`)
);
