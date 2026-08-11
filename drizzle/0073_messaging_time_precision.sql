-- 0073: the inbox stops ordering by chance.
--
-- 0066 declared every timestamp without precision, and a MySQL `timestamp`
-- with no precision stores WHOLE SECONDS. inboxFor orders by
--
--   (last_message_at IS NULL), last_message_at DESC, created_at DESC
--
-- so two conversations that receive a message in the same second hold equal
-- last_message_at, fall through to created_at, which is also whole-second and
-- for two threads started in the same second is also equal, and then there is
-- no tiebreaker left. MySQL is free to return either order.
--
-- That is not only a flaky test. It is a member's inbox reordering itself for
-- no reason they can see, any time two conversations are active in the same
-- second. The test caught it because it creates its fixtures five milliseconds
-- apart, which ties essentially always; making the test sleep would have
-- hidden the behaviour worth keeping.
--
-- messages.created_at is included because it is the SOURCE the cache is
-- derived from: recomputeLastMessageAt writes MAX(created_at), so raising the
-- precision of the cache alone would just store whole seconds in a column
-- that can hold thousandths.
--
-- Millisecond precision, not microsecond: it is the resolution the ids
-- already carry (prefix-<epoch-ms>-<random>), so the two agree, and it takes
-- the ambiguity window from a second to a thousandth. The ORDER BY also gains
-- a deterministic last resort in the same change, so even a genuine
-- same-millisecond tie now returns one stable answer instead of either.
--
-- Fix-forward in a new file: 0066 has shipped and the runner keys its ledger
-- on the filename, so it is never edited.
ALTER TABLE `messages`
  MODIFY COLUMN `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `conversations`
  MODIFY COLUMN `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY COLUMN `last_message_at` timestamp(3) NULL;
