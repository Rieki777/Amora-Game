-- 0038: separate "we claimed this Stripe event" from "we finished it".
--
-- The webhook inserts a payments_log row keyed on stripe_event_id BEFORE
-- doing any work, and a duplicate insert is how a replayed event becomes a
-- no-op. That claim was treated as proof of completion. It is not: if the
-- handler THROWS the claim is deleted and Stripe redelivers, but if the
-- process DIES mid-settle -- a deploy, an OOM kill, a dropped connection --
-- nothing deletes it, and Stripe's redelivery is answered "duplicate" by a
-- claim whose work never happened. The purchase stays unsettled forever and
-- no alarm fires, because from the log's point of view it succeeded.
--
-- handled_at is stamped only after the dispatch returns. A claim still
-- lacking one after the grace window is an abandoned claim, and the webhook
-- lets that event through to run again -- safe, because every handler is
-- idempotent on its own period key.
ALTER TABLE `payments_log`
  ADD COLUMN `handled_at` datetime NULL;

-- Rows that predate this column all belong to completed dispatches (the
-- failed ones were deleted), so backfill them as handled rather than
-- inviting a replay of every event the platform has ever seen.
UPDATE `payments_log` SET `handled_at` = `at` WHERE `handled_at` IS NULL;
