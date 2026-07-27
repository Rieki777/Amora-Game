-- 0033 (Wave 1, B4+B5): the member-rights columns the badge system owed.
--
-- A warning badge suspends capabilities. Two facts about that were
-- invisible: WHEN a warning expired (nothing told the member their
-- standing was restored), and HOW OFTEN it had been re-issued (re-award
-- overwrites the row, so an admin could re-issue forever with no trail —
-- indefinite silencing with no record is a rights hole, not a feature gap).
ALTER TABLE `badge_awards`
  -- Incremented on every overwrite of an existing award; 0 = first issue.
  ADD COLUMN `reissue_count` int NOT NULL DEFAULT 0,
  -- Set by the expiry sweep after the member is told; NULL = not yet swept.
  -- Re-awarding clears it, so a fresh warning gets a fresh expiry story.
  ADD COLUMN `expiry_notified_at` timestamp NULL;
