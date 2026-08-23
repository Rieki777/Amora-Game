-- 0097: every outcome that came back from Hypha, including the ones that
-- matched nothing.
--
-- THE MARKER IS THE WHOLE CONTRACT AND A HUMAN CAN DELETE IT. The bridge says
-- so in its own header: `[gm:<id>]` goes into the Hypha proposal title, and if
-- somebody tidies the title before the vote the outcome cannot find its way
-- home. `mechanics_proposals.hypha_proposal_id` already fixed half of that by
-- storing the numeric agreement id at link time, which is the identifier the
-- chain actually carries. What neither half fixed is what happens to an outcome
-- that matches NEITHER: today it is answered and forgotten, and a village
-- learns that a decision went missing when somebody asks why nothing applied.
--
-- So every delivery lands here first, matched or not, and an unmatched one is a
-- row with `matched_proposal_id` NULL that a steward can see and resolve by
-- hand. An orphan is a fact about the bridge, and a bridge that drops facts
-- silently is one nobody can debug.
--
-- Deliberately NOT a decision record. Nothing here applies anything, changes a
-- proposal's status, or moves value; the existing verify path still owns all of
-- that. This table answers one question: what arrived, and did it land.
--
-- No charset or collation is named, for the reason 0079 gives.

CREATE TABLE IF NOT EXISTS `hypha_outcomes` (
  `id` varchar(64) NOT NULL,
  -- The identifier Hypha returns at creation and the chain carries afterwards.
  -- Empty string when a delivery carried only a title marker: NOT NULL because
  -- MySQL exempts NULLs from the unique key below, and a nullable dedupe column
  -- admits infinite duplicates.
  `agreement_id` varchar(64) NOT NULL DEFAULT '',
  -- The `[gm:<id>]` marker as delivered, kept even when the agreement id
  -- matched. When the two disagree, that disagreement is the interesting fact
  -- and both halves have to survive for anybody to notice it.
  `marker` varchar(64) NOT NULL DEFAULT '',
  `verdict` enum('confirmed','rejected','unknown') NOT NULL,
  -- Which of the two listener paths delivered this: the ReGen hub's signed
  -- callback, or this village's own listener. R58a makes that a property of the
  -- hosting relationship, so it is worth knowing which one spoke.
  `source` varchar(32) NOT NULL DEFAULT 'hub',
  -- How it found its home, or that it did not. `agreement` is the strong match,
  -- `marker` is the fallback the bridge header warns about, `none` is an orphan.
  `matched_by` enum('agreement','marker','none') NOT NULL DEFAULT 'none',
  `matched_proposal_id` varchar(64) NULL,
  -- One row per delivery, so a webhook retry repairs instead of duplicating.
  -- Composed by the caller from whatever identified the delivery; NOT NULL for
  -- the same reason `agreement_id` is.
  `delivery_key` varchar(190) NOT NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A steward's answer to an orphan: they found the proposal it belonged to, or
  -- they decided it belonged to nothing here. Set by hand, never by a job.
  `resolved_at` timestamp NULL,
  `resolved_by_user_id` varchar(64) NULL,
  `note` varchar(500) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hypha_outcomes_delivery` (`delivery_key`),
  -- The orphan list: unresolved first, newest first. `matched_by` leads because
  -- the one query this table exists to serve is "what did not land".
  KEY `hypha_outcomes_orphans_idx` (`matched_by`, `resolved_at`, `received_at`)
) ENGINE=InnoDB;
