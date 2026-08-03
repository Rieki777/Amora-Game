-- Standing examples: how many times retirement has tried and left rows behind.
--
-- Retirement is housekeeping riding on somebody else's successful write, so a
-- DELETE that fails deliberately leaves the tombstone unstamped and lets the
-- next publish retry. With no ceiling that retry is forever: every subsequent
-- real item re-enters the whole failing delete loop and logs the same error,
-- on every write, for the life of the deployment. This counter is reset by a
-- clean pass and read as a stop condition once it climbs past a small bound.
ALTER TABLE `example_state` ADD COLUMN `retire_attempts` INT NOT NULL DEFAULT 0;
