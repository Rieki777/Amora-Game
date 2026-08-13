-- 0075: a rule change that waits for the moon.
--
-- The doctrine says every economic dial takes effect at the NEXT cycle, so a
-- rule cannot be spiked, paid against, and lowered again around a settlement.
-- 0071 gave `mint_rules` an `effective_from_cycle` stamp for that, and the
-- stamp alone cannot express it.
--
-- With one `amount` column there are only two things an edit can do, and both
-- are wrong. Write the new amount now and the deferral is a fiction: the next
-- mint pays the new number. Stamp `effective_from_cycle` forward instead and
-- `rulesFor` stops returning the rule at all, because it filters on that
-- column, so the village pays NOTHING until the moon turns rather than paying
-- the old rate. A dial edit that silently suspends a payout is worse than one
-- that applies immediately, because it looks like it worked.
--
-- So the pending change is its own set of columns. The live numbers keep
-- serving untouched, the pending ones are visible in the admin surface as
-- "from the next moon", and settlement is the only thing that promotes them.
-- The stamp says WHEN, and these say WHAT, and it takes both.
--
-- Nullable throughout, and that is the whole state machine: NULL means nothing
-- is queued. There is no "has pending" boolean to disagree with the values.

ALTER TABLE `mint_rules`
  -- What the amount BECOMES. NULL when nothing is queued, which is different
  -- from a queued change TO null: `pending_from_cycle` is what says a change
  -- exists, so a rule can legitimately be queued to switch to from_source.
  ADD COLUMN `pending_amount` decimal(18,4) NULL,
  ADD COLUMN `pending_ceiling` decimal(18,4) NULL,
  ADD COLUMN `pending_enabled` tinyint(1) NULL,
  -- The cycle the queued change lands in, and the ONE flag that says a change
  -- is queued at all. Settlement promotes a row when the cycle it is closing
  -- has reached this number, then clears all four columns in the same write.
  ADD COLUMN `pending_from_cycle` int NULL,
  -- Who queued it and when. An economic dial change is a governance act, so it
  -- is attributable after the fact and not only in the audit feed.
  ADD COLUMN `pending_by` varchar(64) NULL,
  ADD COLUMN `pending_at` timestamp NULL;

-- The one query settlement runs: which rules are due to change this cycle.
ALTER TABLE `mint_rules`
  ADD KEY `mint_rules_pending_idx` (`village_id`, `pending_from_cycle`);
