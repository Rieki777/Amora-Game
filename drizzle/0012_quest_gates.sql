-- 0012 (S10): the quests table predates progression gating (revision 2 step
-- 3) and never grew the STRUCTURED gate fields — minStage (stage floor) and
-- requiresRole (role gate). The JSON store carried them loosely; converting
-- without these columns silently un-gates every gated quest, which the loop
-- test caught on the first run. `role_required` (0001) stays what it always
-- was: display-only prose. The enforced field is `requires_role`.
ALTER TABLE `quests`
  ADD COLUMN `min_stage` varchar(64) NULL AFTER `role_required`,
  ADD COLUMN `requires_role` varchar(64) NULL AFTER `min_stage`;
