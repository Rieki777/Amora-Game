-- 0058: give `membershipGranted` somewhere to live.
--
-- The field was read as a gate (`hasMembership`, server/index.ts) and written
-- by a boot migration, and `usersRepo.COLUMNS` never carried it, so every
-- write went into the in-memory record and was dropped by the UPDATE that
-- followed. A steward could not grant membership, and the migration that was
-- supposed to freeze existing email-matched members into explicit grants
-- before the hole closed logged a count and saved nothing.
--
-- `freezeEmailMatchedMemberships` is deliberately NOT re-run. Its runOnce key
-- is recorded on every deployment, and replaying it today would convert every
-- self-typed email match accumulated since into a permanent grant, which is
-- the exact hole that change closed. It froze a moment, and that moment has
-- passed. What is fixed here is the field: it can be written, it survives, and
-- the "explicit steward grant" the gate documents can actually exist.
ALTER TABLE `users`
  ADD COLUMN `membership_granted` tinyint(1) NOT NULL DEFAULT 0;
