-- 0061: where the Welcome Walk loses people.
--
-- The map records a row each time a newcomer reaches a step, and one more when
-- the walk completes or is abandoned. Until now those rows lived in the
-- browser and travelled out in the scene export with nowhere to land.
--
-- This is the same shape as `concierge_queries` (0018) and exists for the same
-- reason: the interesting rows are the NEGATIVE ones. A walk that completes
-- tells you it worked. A walk abandoned at step three tells you what to
-- rewrite, and that signal is unrecoverable if it is never stored.
--
-- Deliberately NOT joined to users. A walk runs before anyone has signed in,
-- so there is nobody to attribute it to; `session_key` groups the rows of one
-- run and says nothing about who. Anonymous by construction beats anonymous by
-- filtering later.

CREATE TABLE IF NOT EXISTS `walk_log` (
  `id` varchar(64) NOT NULL,
  -- Groups the rows of a single walk. Not a user, not a device: only enough
  -- to tell one run's steps from another's when counting.
  `session_key` varchar(64) NOT NULL,
  -- A step id from the walk, or the terminal words `complete` / `abandoned`.
  -- Left as a plain varchar rather than an enum: step ids are village data
  -- and a village renames them whenever it edits its walk.
  `step` varchar(64) NOT NULL,
  -- Position reached. Kept alongside the id because a step that has since
  -- been deleted still has a position, and the drop-off curve survives an
  -- edit to the walk that the ids alone would not.
  `at_index` int NOT NULL DEFAULT 0,
  -- Order within the run, as the map counted it.
  `ts_seq` int NOT NULL DEFAULT 0,
  `lang` varchar(8) NULL,
  -- `import` for rows carried in from a scene file, `live` for rows the
  -- running map posted. Mixing the two without saying so would let a demo
  -- scene quietly inflate a real village's numbers.
  `source` varchar(16) NOT NULL DEFAULT 'live',
  -- NOT NULL, and load-bearing: MySQL UNIQUE indexes exempt NULLs, so a
  -- nullable dedupe column would admit infinite duplicates on re-import.
  `idempotency_key` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `walk_log_idem` (`idempotency_key`),
  -- The two questions this table answers: "how did this run go" and
  -- "which step loses people".
  KEY `walk_log_session_idx` (`session_key`, `ts_seq`),
  KEY `walk_log_step_idx` (`step`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
