-- 0068: a quest carries its story, not only its ask.
--
-- The board grew out of a job list: title, what it asks for, reward, done.
-- That shape holds up for claiming work and releasing value, and it stays
-- untouched here. What it never had is the layer a member reads BEFORE
-- deciding: why this work matters to the village, the first small step,
-- how to actually do it, and what to share at the end. The sibling game
-- (regen-civics) learned that lesson across three quest-page redesigns.
-- Every column below is nullable so an existing board keeps working and a
-- quest with no story simply renders without one.
--
--   subtitle    one line under the title, the quest's own voice
--   story       why this quest matters, written to the member, prose
--   first_step  one small act that starts the quest, fifteen minutes or less
--   steps       JSON array of strings, the path through the work
--   deliverable what the member shares when they submit
--   tips        JSON array of strings, hard-won advice
--   image_url   optional poster an admin sets; absent, the client paints a
--               scene from the quest's circle
ALTER TABLE `quests`
  ADD COLUMN `subtitle` varchar(160) NULL AFTER `title`,
  ADD COLUMN `story` text NULL AFTER `impact`,
  ADD COLUMN `first_step` varchar(400) NULL AFTER `story`,
  ADD COLUMN `steps` json NULL AFTER `first_step`,
  ADD COLUMN `deliverable` varchar(400) NULL AFTER `steps`,
  ADD COLUMN `tips` json NULL AFTER `deliverable`,
  ADD COLUMN `image_url` varchar(500) NULL AFTER `tips`;
