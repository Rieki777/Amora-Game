-- 0035 (Wave 1, F1): editing, with the edit visible.
--
-- forum_mentions has been the edit-idempotency ledger since 0019, built
-- for an editor that never shipped: a re-parse notifies only NEW handles,
-- and removing a mention never retracts a delivered notification. This
-- adds the only two columns editing needs.
--
-- `edited_at` is not cosmetics: a village that cannot see a post was
-- changed after people replied to it cannot trust its own record. The
-- marker is public, always.
ALTER TABLE `forum_threads`
  ADD COLUMN `edited_at` timestamp NULL,
  ADD COLUMN `edit_count` int NOT NULL DEFAULT 0;

ALTER TABLE `forum_replies`
  ADD COLUMN `edited_at` timestamp NULL,
  ADD COLUMN `edit_count` int NOT NULL DEFAULT 0;
