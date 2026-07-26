-- 0010 (S8): the gratitude domain moves to MySQL, with the D5 riders the
-- forum module will need already in place — adding them now costs one column
-- default; adding them after the cutover is a live-data migration.
--
--   kind          'gratitude' = a budgeted send. 'heart' (D5) = a one-tap
--                 acknowledgment attached to content, unbudgeted, amount 0+.
--   context_*     what the acknowledgment is attached to (forum_post, quest,
--                 …). Plain sends carry NULL context.
--   cycle_number  integer twin of cycle_id: settlement math wants a number,
--                 and parsing 'lunar-000328' in every query is how off-by-one
--                 formatting bugs become settlement bugs.
--
-- The unique heart index: one heart per sender per piece of content. Plain
-- sends have NULL context_type/context_ref, and MySQL exempts NULLs from
-- unique indexes, so ordinary gratitude is untouched by the constraint.

ALTER TABLE `gratitude_log`
  ADD COLUMN `kind` varchar(24) NOT NULL DEFAULT 'gratitude' AFTER `id`,
  ADD COLUMN `cycle_number` int NULL AFTER `cycle_id`,
  ADD COLUMN `context_type` varchar(32) NULL AFTER `message`,
  ADD COLUMN `context_ref` varchar(120) NULL AFTER `context_type`,
  ADD UNIQUE KEY `gratitude_heart_unique` (`from_id`, `kind`, `context_type`, `context_ref`);

UPDATE `gratitude_log`
  SET `cycle_number` = CAST(SUBSTRING(`cycle_id`, 7) AS UNSIGNED)
  WHERE `cycle_id` LIKE 'lunar-%' AND `cycle_number` IS NULL;

-- The ReGen pool model records what each settlement RELEASED per member
-- (credited, in pool_token). The JSON records carried these since the pool
-- landed; the table predates them.
ALTER TABLE `gratitude_distributions`
  ADD COLUMN `credited` int NOT NULL DEFAULT 0 AFTER `distinct_senders`,
  ADD COLUMN `pool_token` varchar(32) NULL AFTER `credited`;
