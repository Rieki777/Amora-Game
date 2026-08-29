-- 0105: one cycle, one name.
--
-- Two formatters wrote different strings into the same `cycle_id` column for
-- the same lunation. `server/lib/gratitude-cycles.ts` wrote `lunar-000329`.
-- `server/lib/economy.ts` wrote `moon-329`. Neither knew about the other, so
-- the acknowledgement flow's budget, which filters on `cycle_id`, saw only its
-- own half of the table and one member moved 130 in a moon whose allowances
-- were 100 and 30. The settlement, which only matches `lunar-`, then read 100
-- of those 130 units and reported the missing 30 to nobody.
--
-- The code now has one formatter. This file brings the live rows to it.
--
-- WHY THE MAPPING IS ONE TO ONE, which is the thing to be sure of before
-- rewriting identifiers on rows somebody's balance depends on:
--
--   1. The map is `moon-<n>` -> `lunar-<n left-padded to at least 6>`, and it
--      only ever runs on ids matching `^moon-[0-9]{1,9}$`. Padding a decimal
--      integer is injective: two different n can never produce one string, so
--      two different lunations can never be merged onto one id. The only two
--      ids this collapses together are the two spellings of the SAME lunation,
--      which is the entire point.
--
--      `GREATEST(6, LENGTH(...))` is load-bearing and was not there first.
--      MySQL LPAD does not only pad, it also TRUNCATES anything longer than
--      the length asked for, so a plain `LPAD(n, 6, '0')` turned `moon-1234567`
--      into `lunar-123456` and put it on top of lunation 123456. That is the
--      exact collision this header promises cannot happen, written by the
--      statement that promised it. A scratch run over rows in both formats is
--      what caught it, which is why the check is a run and not a reading.
--      Lunation numbers reach six digits in about eighty thousand years, so
--      nothing live was ever going to hit this; a claim of one to one either
--      holds for every input or it is not a claim.
--   2. It cannot break a constraint on `gratitude_log`. Checked against the
--      live schema: the unique indexes are PRIMARY (`id`),
--      `gratitude_heart_unique` (from_id, kind, context_type, context_ref) and
--      `gratitude_log_nonce` (village_id, client_nonce). None of them contains
--      `cycle_id`, so no rewrite of that column can collide with another row.
--   3. It cannot break `token_ledger`, whose unique index IS on
--      `idempotency_key`. A collision would need a `role.cycle:...:lunar-...`
--      key already in the table, and no build has ever written one: `moon-` was
--      the only spelling `cycleWindow()` ever produced. If one somehow exists,
--      these statements FAIL rather than skip. That is deliberate. A silent
--      skip here would leave a seat looking unpaid and pay it twice.
--   4. Nothing else needs rewriting. Every other `cycle_id` in this build has a
--      single writer and that writer already calls the canonical formatter:
--      `gratitude_distributions` (the close, via `formatCycleId`),
--      `gratitude_cycles.id` (the same), `module_usage_marks`
--      (`server/lib/moduleUsage.ts`, via `cycleIdFor`) and
--      `library_loans.settled_cycle_id` (`server/lib/library.ts`, via
--      `cycleIdFor`). Grepped at this commit; none can hold a `moon-` id.
--
-- IDEMPOTENT. Every statement is an UPDATE whose WHERE clause stops matching
-- once it has run, so a second run changes zero rows. Nothing here is an
-- ALTER, so a re-run cannot brick boot the way a repeated ADD COLUMN would.
--
-- WHAT THIS DOES NOT TOUCH. An id in neither format (the retired `YYYY-MM`
-- calendar scheme, or anything else) is left exactly as it is, because there
-- is no honest way to compute which lunation a calendar month belongs to and
-- guessing one would move somebody's spending into a moon they did not spend
-- it in. Those rows are no longer ignored either: `unreadableCycleIds` in
-- `server/lib/gratitude-cycles.ts` now makes the settlement refuse and name
-- them, so an operator normalises them on purpose instead of the village's
-- totals quietly being wrong.

-- 1. The recognition rows themselves.
UPDATE `gratitude_log`
  SET `cycle_id` = CONCAT(
        'lunar-',
        LPAD(SUBSTRING(`cycle_id`, 6), GREATEST(6, LENGTH(SUBSTRING(`cycle_id`, 6))), '0')
      )
  WHERE `cycle_id` REGEXP '^moon-[0-9]{1,9}$';

-- 2. The integer twin 0010 added and the give path never filled. 0010 ran the
--    same backfill for the rows that existed then; every row written by
--    `give()` since has carried NULL, including the ones step 1 just renamed.
UPDATE `gratitude_log`
  SET `cycle_number` = CAST(SUBSTRING(`cycle_id`, 7) AS UNSIGNED)
  WHERE `cycle_id` REGEXP '^lunar-[0-9]{1,9}$' AND `cycle_number` IS NULL;

-- 3. The seat-thanks occurrence keys.
--
--    These are what tell the hourly settlement a seat has already been paid
--    for this lunation. Renaming the formatter without renaming these would
--    make every already-paid seat in the OPEN moon look unpaid and pay it a
--    second time, which is value made out of a rename.
--
--    The key reads `role.cycle:<village>:<cycle>:<seat>:<holder>:<token>`, so
--    the cycle segment is the text between `:moon-` and the next colon. The
--    inner expression lifts exactly that number out, and REPLACE swaps the
--    delimited segment rather than a loose substring, so a seat or holder id
--    that happens to contain the same characters is untouched.
UPDATE `token_ledger`
  SET `idempotency_key` = REPLACE(
        `idempotency_key`,
        CONCAT(':moon-', SUBSTRING_INDEX(SUBSTRING_INDEX(`idempotency_key`, ':moon-', -1), ':', 1), ':'),
        CONCAT(
          ':lunar-',
          LPAD(
            SUBSTRING_INDEX(SUBSTRING_INDEX(`idempotency_key`, ':moon-', -1), ':', 1),
            GREATEST(6, LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(`idempotency_key`, ':moon-', -1), ':', 1))),
            '0'
          ),
          ':'
        )
      )
  WHERE `source` = 'role_cycle'
    AND `idempotency_key` REGEXP '^role\.cycle:[^:]*:moon-[0-9]{1,9}:';

-- 4. The sentence beside them. A member reading their own ledger sees this
--    line, and it should name the moon the same way every other surface does.
UPDATE `token_ledger`
  SET `description` = CONCAT(
        SUBSTRING_INDEX(`description`, 'moon-', 1),
        'lunar-',
        LPAD(
          SUBSTRING_INDEX(`description`, 'moon-', -1),
          GREATEST(6, LENGTH(SUBSTRING_INDEX(`description`, 'moon-', -1))),
          '0'
        )
      )
  WHERE `source` = 'role_cycle'
    AND `description` REGEXP '^Thanks for holding a seat through moon-[0-9]{1,9}$';
