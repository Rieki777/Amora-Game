-- 0109: clear the voice keys out of every warning badge's `denies`.
--
-- R65 and R66, the founder's ruling: "denying a voice is not a power anyone
-- should hold", and "when voice is earned it should never be force taken
-- away". Waning survives it and removal does not. A rule under which unused
-- voice decays over time is legitimate and belongs to Hypha, for villages that
-- want to run governance professionally. An act by which one party strips
-- another's earned voice is not legitimate, held by anybody, at any tier.
--
-- `shared/capabilities.ts` names the voice keys in `DENIABLE`, the gate
-- ignores a deny that names one, and `badgeProblem` refuses to save one. This
-- file is the third lock: a row already stored answers to none of the other
-- two, and a warning badge written months ago outlives the admin who wrote it.
--
-- ORDER MATTERS AT BOOT, and it is the same reason 0090 gave. `applyPending`
-- runs migrations before `assertBadgeInvariants` re-validates every active
-- badge, and that assertion now refuses a voice key in `denies`. Without this
-- file a village whose admin had once paused somebody's vote would fail to
-- start. With it, the row is cleaned a few seconds before the check reads it.
--
-- The two keys:
--   ballot.vote   casting a vote. The ruling names this one outright, and
--                 round 6 measured what it did: the holder was left off
--                 `ballot_electorate` on every ballot opened afterwards.
--   member.vouch  vouching for an applicant at the membrane. A member's own
--                 say in the village's decision about who joins.
--
-- JSON_SEARCH plus JSON_REMOVE rather than string surgery, as in 0090: both
-- are available on MySQL 5.7+ and MariaDB 10.2+, the WHERE clause skips NULL
-- columns on its own, and one occurrence per row is all the admin surface can
-- produce, because a deny list is a set of checkboxes.
--
-- The badge itself is untouched. A warning may still exist and may still say
-- something true about what happened; this removes only what it took.

UPDATE `badges`
SET `denies` = JSON_REMOVE(`denies`, JSON_UNQUOTE(JSON_SEARCH(`denies`, 'one', 'ballot.vote')))
WHERE JSON_SEARCH(`denies`, 'one', 'ballot.vote') IS NOT NULL;

UPDATE `badges`
SET `denies` = JSON_REMOVE(`denies`, JSON_UNQUOTE(JSON_SEARCH(`denies`, 'one', 'member.vouch')))
WHERE JSON_SEARCH(`denies`, 'one', 'member.vouch') IS NOT NULL;
