-- A STEWARD'S DECISION IS A FIRST-CLASS ACT, AND A REFUSAL CARRIES A REASON.
--
-- The founder settled it on 2026-08-31: "Yes a steward veto absolutely should
-- carry a reason." Before this table there was one post-pass human gate in the
-- whole platform, `governance.auto_apply_enabled`, and it had no approver, no
-- reason and no record. A proposal the village passed could stop dead and the
-- only trace was a proposal parked at `passed_onsite` with a `held` sentence
-- that named a setting rather than a person.
--
-- One row per ballot, so the ballot id is the primary key. A steward decides a
-- passed ballot once; a second decision on the same ballot is the same
-- decision, and the insert says so by colliding instead of by growing a
-- second opinion nobody can order. That also makes the approve route
-- idempotent without a transaction: `INSERT ... ON DUPLICATE KEY UPDATE id=id`
-- either writes the decision or finds the one already standing.
--
-- `reason` IS NOT NULL FOR BOTH DECISIONS, and that is deliberate rather than
-- a schema convenience. The refusal is the act the founder asked to be
-- explained, and an approval with a sentence beside it is worth as much to the
-- member reading the record six months later. The route requires a non-empty
-- reason on a refusal and lets an approval pass an empty string, which the
-- column stores as '' rather than as NULL. So "no reason given" and "the
-- column was never written" stay different facts.
--
-- `decision` is an enum of exactly two words. There is no third state: a
-- ballot with no row here has not been decided, and absence is the queue.
--
-- No FK constraints, house norm. `decided_by` is a user id and stays readable
-- after the account is gone, because the record is the village's and not the
-- member's.
CREATE TABLE IF NOT EXISTS `ballot_approvals` (
  `ballot_id` varchar(64) NOT NULL,
  `decided_by` varchar(64) NOT NULL,
  `decision` enum('approved','refused') NOT NULL,
  `reason` text NOT NULL,
  `decided_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ballot_id`),
  KEY `ballot_approvals_decided_by_idx` (`decided_by`),
  KEY `ballot_approvals_decision_idx` (`decision`, `decided_at`)
);
