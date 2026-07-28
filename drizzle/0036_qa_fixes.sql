-- 0036: three integrity fixes found by the full-app QA sweep.

-- (1) Feedback consent, recorded at CAPTURE time.
--
-- The relay selected `WHERE relayed_at IS NULL`, which conflates "not sent
-- yet" with "captured while the relay was off". Flipping the relay back on
-- therefore shipped the whole backlog — including everything submitted
-- under a form that said, in as many words, "your village's team, and
-- nowhere else". A promise made at submit time has to be stored at submit
-- time; it cannot be re-derived from a setting that changed since.
--
-- Backfill is deliberately 1 (share): every existing row was captured while
-- the relay was on by default, so 1 is the truth for them — and for a fork
-- that turned it off, no rows exist to mislabel.
ALTER TABLE `feedback_items`
  ADD COLUMN `may_relay` tinyint(1) NOT NULL DEFAULT 1;

-- (2) Receipt numbers must be unique, not merely usually-unique.
--
-- nextProductReceipt() takes MAX(receipt_no) FOR UPDATE and COMMITS before
-- the row that would claim the number exists, so two concurrent checkouts
-- can be handed the same receipt. A unique index turns that race into a
-- refused insert (which the caller retries) instead of two purchases
-- sharing one receipt number forever.
ALTER TABLE `product_purchases`
  ADD UNIQUE KEY `product_purchases_receipt_uq` (`receipt_no`);

-- (3) Swap orders: the fiat hold is re-proven inside the ledger
-- transaction, and that needs the purchase timestamps indexed by member and
-- token rather than scanned.
ALTER TABLE `exchange_orders`
  ADD KEY `exchange_orders_hold_idx` (`user_id`, `token_slug`, `status`, `paid_at`);
