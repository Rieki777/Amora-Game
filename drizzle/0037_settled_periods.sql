-- 0037: which charges a purchase has already settled, as a fact on the row.
--
-- `periods_paid` is a COUNT, and a count cannot answer "have we already
-- settled THIS charge?". Token-granting products could answer it from the
-- ledger's idempotency key, but a plain fee or donation writes no ledger
-- row, so a redelivered event for one of those had nothing to check against
-- and incremented the counter again.
--
-- One append-only list of Stripe-derived period keys (invoice id, payment
-- intent, or event id) makes the question answerable for every product
-- shape, anonymous purchases included, and makes `periods_paid` a derived
-- convenience rather than the source of truth.
ALTER TABLE `product_purchases`
  ADD COLUMN `settled_periods` json NULL;
