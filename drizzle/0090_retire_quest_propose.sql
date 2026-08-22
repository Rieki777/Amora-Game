-- 0090: retire the `quest.propose` capability key from live data.
--
-- The key gated nothing. `/api/forms/submit` is the house pattern for
-- anonymous public intake (honeypot plus a per-IP cap), so a signed-out
-- stranger could always suggest a quest, and a suggestion never becomes a
-- quest without an admin creating one through POST /api/admin/quests. There
-- was no gated act to hold a permission over, while the platform told members
-- at contributor stage that they had newly unlocked one.
--
-- The code drops the key in the same change. This file runs FIRST, at boot,
-- because `assertBadgeInvariants` refuses to serve when any active badge
-- carries a capability key the platform does not know: a village whose admin
-- had made a badge granting `quest.propose` would fail to start. Roles are
-- cleaned for tidiness (an unknown key in a role simply never matches), and
-- the orphaned unlock override is deleted because nothing reads it once the
-- generated variable stops existing.
--
-- JSON_SEARCH plus JSON_REMOVE rather than string surgery: both are available
-- on MySQL 5.7+ and MariaDB 10.2+, and the WHERE clause skips NULL columns on
-- its own. One occurrence per row is removed, which is all the admin surfaces
-- can produce (a capability list is a set of checkboxes).

UPDATE `badges`
SET `capabilities` = JSON_REMOVE(`capabilities`, JSON_UNQUOTE(JSON_SEARCH(`capabilities`, 'one', 'quest.propose')))
WHERE JSON_SEARCH(`capabilities`, 'one', 'quest.propose') IS NOT NULL;

UPDATE `badges`
SET `denies` = JSON_REMOVE(`denies`, JSON_UNQUOTE(JSON_SEARCH(`denies`, 'one', 'quest.propose')))
WHERE JSON_SEARCH(`denies`, 'one', 'quest.propose') IS NOT NULL;

UPDATE `roles`
SET `capabilities` = JSON_REMOVE(`capabilities`, JSON_UNQUOTE(JSON_SEARCH(`capabilities`, 'one', 'quest.propose')))
WHERE JSON_SEARCH(`capabilities`, 'one', 'quest.propose') IS NOT NULL;

DELETE FROM `game_variables` WHERE `config_key` = 'progression.unlock.quest.propose';
