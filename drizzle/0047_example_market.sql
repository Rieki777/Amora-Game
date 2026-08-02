-- Standing examples, exchange: a market you can look at.
--
-- Example tokens live in the registry like any token, flagged so retirement
-- can clear them the moment the village creates or lists a real one.
ALTER TABLE `tokens` ADD COLUMN `is_example` TINYINT(1) NOT NULL DEFAULT 0;

-- Display-only stock for an example listing. The ledger is never touched:
-- conservation holds because no ledger rows exist for an example token.
-- NULL on every real listing; the real write path nulls it on claim.
ALTER TABLE `token_exchange_settings` ADD COLUMN `example_stock` INT NULL;

-- Example badge AWARDS, held only by example identities, so the badge page
-- can show what a held badge looks like. The invariant that keeps this safe:
-- an example award may only ever point at an example user. Every route that
-- could hand one to a real member refuses examples, and the earned engine
-- skips example definitions.
ALTER TABLE `badge_awards` ADD COLUMN `is_example` TINYINT(1) NOT NULL DEFAULT 0;
