-- 0040: regen entries retract by superseding, never by disappearing.
--
-- The health module's contract says these are append-only with a supersedes
-- pointer, "nothing is ever edited or deleted". The route did a hard DELETE.
--
-- That matters more here than the wording suggests. These rows are the land's
-- measured record -- trees planted, soil carbon, water retained -- and the
-- village carries the totals outward to funders and to Hypha. A number that
-- can vanish without trace is a number nobody outside can audit, and the one
-- time it would be quietly deleted is the one time it was inconvenient.
--
-- Superseding keeps both readings and says which one replaced which. A
-- correction becomes visible history instead of a silent edit.
ALTER TABLE `regen_entries`
  ADD COLUMN `superseded_by` varchar(64) NULL,
  ADD COLUMN `retracted_at` timestamp NULL,
  ADD COLUMN `retracted_by` varchar(64) NULL,
  ADD COLUMN `retraction_note` varchar(500) NULL;

-- Readers want the live set, which is every entry nobody has retracted.
CREATE INDEX `regen_entries_live_idx` ON `regen_entries` (`metric_key`, `retracted_at`);
