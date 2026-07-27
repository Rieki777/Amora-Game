-- 0034 (Wave 1, B10): featured badges — self-presentation as OPT-IN data.
--
-- A member picks which of their own badges ride their byline (capped by
-- badges.max_featured). Nothing is shown that the member did not choose to
-- show: chips are self-presentation, not surveillance, and a member who
-- features nothing has a clean byline. Warnings can never be featured —
-- they are excluded at the route, but the principle is worth a comment.
ALTER TABLE `badge_awards`
  ADD COLUMN `featured` tinyint(1) NOT NULL DEFAULT 0;
