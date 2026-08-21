-- 0084: how resources flow (round 4, lane L3).
--
-- A map of rules, never a wallet. A village DECLARES who may spend what,
-- with whose approval, paid from where, and where the money comes from;
-- nothing in these tables debits, credits or settles anything. The measured
-- side of the picture (what actually arrived) is read from fiat_charges and
-- token_ledger by SELECT only, so this migration touches neither.
--
-- Amounts are minor units plus a unit code, the ModulePricing rule: an
-- amount held as a float is a rounding bug waiting for a currency with
-- three decimals. `unit` is an uppercase ISO 4217 code or `token:<slug>`
-- validated in code against the token registry, varchar rather than enum
-- for 0049's reason: an enum turns "that word is not in the list" into a
-- truncation error instead of a sentence.
--
-- `approval` and `paid_from` each carry `other` (R28: every vocabulary
-- does); code requires the note that says what `other` means here, the
-- same way a gloss rides `other` in shared/power.ts. No CHARSET clause,
-- like 0082: the database default is right and saying it again would pin
-- what ops may want to move.

-- ── Who may spend what, with whose approval ─────────────────────────────────
-- Two rows per scope answer the pair "alone" (approval none) and "with
-- permission". `visibility` gates the member tier: village rules are for
-- everyone in the village; holders rules only for whoever holds that seat
-- or a seat in that circle. Never a balance of a named person.
CREATE TABLE IF NOT EXISTS `spending_rules` (
  `id` varchar(64) NOT NULL,
  `scope` enum('circle','role') NOT NULL,
  `scope_id` varchar(64) NOT NULL,
  `amount_minor` bigint NOT NULL,
  `unit` varchar(32) NOT NULL,
  `approval` enum('none','circle-consent','lead','founders','treasury','hypha','other') NOT NULL,
  -- Required in code when approval is `other`: the village's own words.
  `approval_note` varchar(160) NULL,
  `paid_from` enum('treasury','circle-budget','member','grant','sponsor','other') NOT NULL,
  `visibility` enum('village','holders') NOT NULL DEFAULT 'village',
  -- Free words; required in code when paid_from is `other`.
  `note` varchar(500) NULL,
  `created_by` varchar(64) NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `spending_rules_scope_idx` (`scope`, `scope_id`)
);

-- ── Where the money comes from ──────────────────────────────────────────────
-- Declared inflows, as the village tells the story: a share of the whole,
-- or an amount a year, or just a named kind. Both amount columns NULL is a
-- real answer ("stays exist, we have not sized them").
CREATE TABLE IF NOT EXISTS `funding_sources` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `kind` enum('donations','memberships','stays','grants','sales','land-or-lease','investors','other') NOT NULL,
  `share_pct` decimal(5,2) NULL,
  `amount_minor_per_year` bigint NULL,
  `unit` varchar(32) NULL,
  -- Free words; required in code when kind is `other`.
  `note` varchar(500) NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- ── What each circle holds for the season ───────────────────────────────────
-- A budget is a declared envelope, never a balance: nothing decrements it.
-- `season_id` NULL means "not tied to a dated season", the same shape as
-- org_role_assignments. MySQL unique keys treat NULLs as always distinct,
-- so the app's upsert enforces one no-season row per (circle, unit) itself;
-- the key below still catches duplicates within a dated season.
CREATE TABLE IF NOT EXISTS `circle_budgets` (
  `id` varchar(64) NOT NULL,
  `circle_id` varchar(64) NOT NULL,
  `season_id` varchar(64) NULL,
  `amount_minor` bigint NOT NULL,
  `unit` varchar(32) NOT NULL,
  `note` varchar(500) NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `circle_budgets_uq` (`circle_id`, `season_id`, `unit`)
);
