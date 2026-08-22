-- 0095: two pieces of 0089 that nothing ever reached (round 5, lane GOV-FIX).
--
-- 0089 shipped this morning. A grounding pass over it found four pieces with
-- no caller; two of them are code and are wired in the same commit as this
-- file (the withdraw route now writes `ballots.status='withdrawn'`, and
-- `methodForDecidesBy` now has the open-ballot route as its caller). The other
-- two are schema, and they come out here.
--
-- `governance_supports` was created to generalize staging supports for the
-- subject types later lanes add. Nothing reads it and nothing writes it:
-- mechanics stages through `mechanics_proposal_backers`, which 0089 left
-- untouched on purpose, and the subject type this lane adds (advisory) does
-- not stage at all, because a vote whose whole purpose is practice should not
-- ask a village to gather signatures first. A table with no writer is not
-- infrastructure, it is a guess about a lane that has not been designed yet,
-- and it is empty by construction so nothing is lost by dropping it. A lane
-- that needs it re-creates it in one CREATE TABLE IF NOT EXISTS.
--
-- `ballots.circle_id` was plumbed through OpenBallotInput and BallotRow and
-- never set by any caller. It is NULL on every row that exists. Wiring it
-- would mean a circle-scoped ELECTORATE, and this codebase has no membership
-- of a circle to scope one from: circles are pointed AT by two separate planes
-- (permission groups carry a circleId from 0018, org seats carry one from
-- 0049) and neither is a roll. A ballot that stored a circle id while freezing
-- a village-wide electorate would be a wrong electorate wearing a right label,
-- and the snapshot law would then freeze that wrongness permanently. The lane
-- that builds circle ballots has to decide what a circle's roll IS, and that
-- decision belongs in the migration that adds the column back.

DROP TABLE IF EXISTS `governance_supports`;

ALTER TABLE `ballots` DROP COLUMN `circle_id`;
