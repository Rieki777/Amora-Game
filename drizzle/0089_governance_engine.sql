-- 0089: The on-site governance engine (round 5, lane G1, GOV_DESIGN 2026-08-22 section 1).
--
-- Seven tables and one column. A ballot is one conducted decision whose
-- thresholds, electorate and weights FREEZE at open (the snapshot columns are
-- the whole point: changing village settings never rewrites a live or
-- historical vote). Votes are weighted rows joined to the frozen electorate;
-- objections carry the Sociocracy 3.0 objection/concern split as data; the
-- weight tables hold custom-mode allocations with an append-only audit trail;
-- governance_supports generalizes the staging machinery for the subject types
-- the later lanes add (mechanics keeps mechanics_proposal_backers untouched).
--
-- No CHARSET clause on any table, deliberately: they inherit the database's
-- collation, because user_id columns join users.id (see 0078's header).
-- No FK constraints, house norm. Dedupe and unique-key columns are NOT NULL
-- because MySQL unique indexes exempt NULLs.

CREATE TABLE IF NOT EXISTS `ballots` (
  `id` varchar(40) NOT NULL,
  -- mechanics | role_application | agreement | badge_grant | quest_payout
  `subject_type` varchar(24) NOT NULL,
  `subject_ref` varchar(64) NOT NULL,
  -- `${subject_type}:${subject_ref}` while open; rewritten to `...:${id}` at
  -- close. Uniqueness enforces "at most one open ballot per subject" without
  -- a partial index, and makes double-open a race-free no-op.
  `open_key` varchar(120) NOT NULL,
  -- NULL = village-wide electorate; set = circle-scoped (later lanes).
  `circle_id` varchar(64) NULL,
  `title` varchar(200) NOT NULL,
  -- The canonical document snapshot at open. What is voted on is what was
  -- checked; the mechanics proposal document idiom, one renderer per type.
  `doc_markdown` mediumtext NOT NULL,
  -- majority | custom | consensus | consent
  `method` varchar(16) NOT NULL,
  -- Snapshot of the weight mode at open: equal | token | custom.
  `weight_mode` varchar(12) NOT NULL,
  -- Snapshot of the token slug when weight_mode = token.
  `weight_token` varchar(64) NULL,
  `unity_pct` decimal(5,2) NOT NULL,
  `quorum_pct` decimal(5,2) NOT NULL,
  -- SUM of electorate weights at open. Quorum evaluates against THIS, never
  -- against a balance or a member count read later.
  `total_weight` decimal(18,4) NOT NULL,
  `electorate_count` int NOT NULL,
  `opened_by` varchar(64) NOT NULL,
  `opens_at` datetime NOT NULL,
  `closes_at` datetime NOT NULL,
  -- open | passed | failed | no_quorum | withdrawn
  `status` varchar(16) NOT NULL DEFAULT 'open',
  -- Required by the close route on every close (the Loomio stated outcome).
  `outcome_note` text NULL,
  -- Closing is a human act; the scheduler may nudge, never close.
  `closed_by` varchar(64) NULL,
  `closed_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ballots_open_key_uq` (`open_key`),
  KEY `ballots_subject_idx` (`subject_type`, `subject_ref`),
  KEY `ballots_status_idx` (`status`, `closes_at`)
) ENGINE=InnoDB;

-- The frozen who-and-how-much. Written in one transaction with the ballot
-- row; votes join here for weight, so weight is stored in exactly one place.
CREATE TABLE IF NOT EXISTS `ballot_electorate` (
  `ballot_id` varchar(40) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `weight` decimal(18,4) NOT NULL,
  PRIMARY KEY (`ballot_id`, `user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `ballot_votes` (
  `ballot_id` varchar(40) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- yes | no | abstain
  `choice` varchar(12) NOT NULL,
  -- App-required for a no vote in consent mode.
  `reason` text NULL,
  `cast_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ballot_id`, `user_id`)
) ENGINE=InnoDB;

-- Consent mode: the S3.0 objection/concern split as rows. Only an open
-- objection blocks; every ruling is attributed and explained.
CREATE TABLE IF NOT EXISTS `ballot_objections` (
  `id` varchar(40) NOT NULL,
  `ballot_id` varchar(40) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `text` text NOT NULL,
  -- open | integrated | concern | withdrawn
  `status` varchar(12) NOT NULL DEFAULT 'open',
  `ruled_by` varchar(64) NULL,
  `ruled_at` datetime NULL,
  `ruling_note` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ballot_objections_ballot_idx` (`ballot_id`, `status`)
) ENGINE=InnoDB;

-- Custom-mode current state. Absent row = zero weight, fail closed.
CREATE TABLE IF NOT EXISTS `governance_weights` (
  `user_id` varchar(64) NOT NULL,
  `weight` decimal(18,4) NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB;

-- The audit trail, mirroring mechanics_changes. Append-only, never deleted:
-- weights are power, and hidden power is what this design exists to end.
CREATE TABLE IF NOT EXISTS `governance_weight_changes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` varchar(64) NOT NULL,
  `old_weight` decimal(18,4) NULL,
  `new_weight` decimal(18,4) NOT NULL,
  `actor_user_id` varchar(64) NOT NULL,
  -- A weight change without a reason is refused.
  `note` varchar(500) NOT NULL,
  `at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `governance_weight_changes_user_idx` (`user_id`, `at`)
) ENGINE=InnoDB;

-- Staging/sensing supports generalized for the new subject types the later
-- lanes add. INSERT IGNORE idempotent, exactly like mechanics_proposal_backers,
-- which stays untouched for mechanics (consolidation is a later cleanup).
CREATE TABLE IF NOT EXISTS `governance_supports` (
  `subject_type` varchar(24) NOT NULL,
  `subject_ref` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- support | sponsor
  `kind` varchar(12) NOT NULL DEFAULT 'support',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subject_type`, `subject_ref`, `user_id`)
) ENGINE=InnoDB;

-- A mechanics proposal decided on-site carries its vote.
ALTER TABLE `mechanics_proposals` ADD COLUMN `ballot_id` varchar(40) NULL;

-- The status vocabulary gains the on-site leg (GOV_DESIGN section 2.6 calls
-- the column a varchar; the code says enum, per 0043/0044, so the enum grows
-- the way 0044 grew it). onsite_vote sits beside to_hypha; passed_onsite
-- beside passed_verified.
ALTER TABLE `mechanics_proposals` MODIFY `status` enum('draft','open','withdrawn','to_hypha','onsite_vote','passed_claimed','passed_verified','passed_onsite','failed','applied') NOT NULL DEFAULT 'open';
