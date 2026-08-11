-- 0074: the inbox orders on a monotonic key instead of a coincidence.
--
-- 0073 made the sort TOTAL by ending it in `c.id DESC`, which fixed the bug.
-- What it did not do is make the ordering independent of how ids happen to be
-- formatted. `c.id DESC` only means "newest first" because this module's
-- newId keeps the epoch-ms as a fixed-width decimal, and messaging is the ONLY
-- one of five newId implementations in server/lib that does: orgChart,
-- orgDrafts, orgRelations and seasonPatterns all use Date.now().toString(36),
-- which is variable-width and would sort a shorter string above a later time.
-- The correctness of the inbox should not rest on that.
--
-- 0066's own header already argued this, about read state:
--
--   "messages carry `seq`, one global AUTO_INCREMENT ... it never turns on a
--    TIMESTAMP TIE or on the ordering of a random id suffix."
--
-- The table has carried a monotonic, tie-free ordering source since birth.
-- Read state used it and inbox ordering did not, and that inconsistency is
-- what this closes. Two conversations can never share a newest message, so
-- last_message_seq cannot tie at all: the comparator reaches its fallbacks
-- only for conversations nobody has spoken in yet.
--
-- Nullable, matching last_message_at, so "no messages yet" stays one idea
-- expressed one way, and the ORDER BY keeps its `(x IS NULL)` lead.
ALTER TABLE `conversations`
  ADD COLUMN `last_message_seq` bigint NULL AFTER `last_message_at`;

-- Backfilled from the source, not left for the boot audit to notice. An audit
-- that has to repair every row on first run cannot tell a real drift from a
-- migration that declined to do its job.
UPDATE `conversations` c
  SET c.`last_message_seq` = (SELECT MAX(m.`seq`) FROM `messages` m WHERE m.`conversation_id` = c.`id`);
