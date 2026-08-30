-- 0112 (lane GAMESTART, R67/R74): whether this village's Game has STARTED,
-- which is the fact token issuance now waits on.
--
-- No new table. The fact is one singleton document in `app_config`, the same
-- home `launch-state` already uses, under the key `game-start`:
--
--   { startedAt, ballotId, startedBy, note }
--
-- ── TWO FACTS, NOT ONE, AND THIS IS THE WHOLE REASON FOR THIS FILE ──────────
--
-- `launch-state.launchedAt` says the village's own launch vote carried.
-- `game-start.startedAt` says token issuance is on.
--
-- R74 makes them the same event from here on: the launch ballot carrying
-- writes both, and `game-start.ballotId` names the vote that did it. They are
-- NOT the same event looking backwards. Every deployment that already exists
-- has been issuing tokens for months and no village has ever held this vote,
-- because the vote did not exist. Reading one flag for both would either turn
-- issuance off on a live village on deploy day, or claim a village held a vote
-- it never held.
--
-- So this migration writes the second fact only, and only where the ledger
-- already proves it. The evidence is exact and it is already in the database:
-- a posting whose `from_account` is a faucet is issuance, by the definition
-- 0009 built the ledger around ("designated FAUCET accounts may run negative,
-- and their negative balance IS the issuance-to-date figure"). A village with
-- one of those has been issuing. A village with none has not.
--
-- `ballotId` and `startedBy` stay NULL on the row this writes, and the note
-- says why in words, so nothing anywhere reads this as a vote. A grandfathered
-- start and a voted start are told apart by looking, never inferred.
--
-- A FRESH DEPLOYMENT WRITES NOTHING HERE. An empty ledger produces no row, so
-- a new village starts at "not started" and issuance waits for its vote, which
-- is R67 exactly. The same is true of every scratch test schema, which is why
-- the ledger suites now start their own Game explicitly.
--
-- Idempotent: INSERT IGNORE on the primary key, so a re-run is a no-op and a
-- village that has since voted keeps the row its vote wrote.

INSERT IGNORE INTO `app_config` (`config_key`, `value`)
SELECT
  'game-start',
  JSON_OBJECT(
    'startedAt', DATE_FORMAT(MIN(`l`.`at`), '%Y-%m-%dT%H:%i:%sZ'),
    'ballotId', NULL,
    'startedBy', NULL,
    'note',
      'This village was already issuing tokens before the launch vote existed. Migration 0112 read that from the ledger and recorded the Game as started, with no ballot behind it.'
  )
FROM `token_ledger` `l`
JOIN `ledger_accounts` `a` ON `a`.`id` = `l`.`from_account` AND `a`.`faucet` = 1
HAVING COUNT(*) > 0;
