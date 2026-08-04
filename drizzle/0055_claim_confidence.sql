-- 0055: how the person doing the work thinks it is going.
--
-- Peerdom puts a confidence signal on goals, and the reason it is worth one
-- column here is the shape of the failure it catches. A quest sits in
-- `claimed` for six weeks and looks identical whether the holder is halfway
-- through it or quietly stuck: the retrospective can already see "claimed,
-- never consented", but only AFTER the season ends, which is exactly too late
-- to help.
--
-- Self-reported and unprompted, on purpose. Nobody is asked to justify a
-- rating and nothing is computed from it, because a confidence score that
-- feeds a reward is a score people learn to inflate. NULL is the honest
-- default and stays the common case: it means nobody has said, which is
-- different from saying it is fine.
--
-- Not on `quests`. The quest is the offer; the CLAIM is somebody's attempt at
-- it, and two people can be having very different weeks on the same quest.
ALTER TABLE `quest_claims`
  ADD COLUMN `confidence` enum('on_track','at_risk','stuck') NULL,
  ADD COLUMN `confidence_note` varchar(280) NULL,
  ADD COLUMN `confidence_at` timestamp NULL;

-- The one query this exists to make cheap: open claims that need a look,
-- worst first. Status leads because every read starts by excluding the
-- settled ones.
ALTER TABLE `quest_claims`
  ADD KEY `quest_claims_confidence_idx` (`status`, `confidence`);
