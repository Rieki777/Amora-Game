-- 0004: quest rewards are a RANGE, not a number.
--
-- 0001 declared `quests.gratitude` as int, because the field is named like a
-- number. It is not: every quest advertises a range string such as "50-100", so
-- the import coerced all fourteen quests to 0 and the shadow copy was silently
-- wrong. The row-count verification passed, which is the real lesson: counting
-- rows proves nothing about column fidelity.
--
--   gratitude       -> the advertised label, exactly as written (display)
--   gratitude_min   -> parsed floor   (validation, sorting, sums)
--   gratitude_max   -> parsed ceiling
--
-- Keeping the label as well as the bounds matters: "50-100" and "50 to 100" mean
-- the same thing to the game but a village wrote one of them deliberately, and
-- round-tripping through numbers would silently rewrite their copy.

ALTER TABLE `quests`
  ADD COLUMN `gratitude_min` int NOT NULL DEFAULT 0,
  ADD COLUMN `gratitude_max` int NOT NULL DEFAULT 0;

-- int -> varchar preserves nothing useful (every value is currently 0), and the
-- importer rewrites all fourteen rows immediately afterwards.
ALTER TABLE `quests`
  MODIFY COLUMN `gratitude` varchar(64) NOT NULL DEFAULT '';
