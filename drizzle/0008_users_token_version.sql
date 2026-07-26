-- S6: users domain moves from JSON to MySQL. Two fields the JSON store grew
-- after the table was first defined:
--
--   token_version — S1 session revocation: the auth token carries `v`, a
--   mismatch kills every session minted before the bump.
--
--   journeys — per-journey step progress ({ journeyId: [stepId, ...] });
--   training completion reads journeys.training, which gates stage
--   computation, so losing it would silently demote members.
ALTER TABLE `users`
  ADD COLUMN `token_version` INT NOT NULL DEFAULT 0 AFTER `handle`,
  ADD COLUMN `journeys` JSON AFTER `quests`;
