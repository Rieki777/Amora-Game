-- 0079: what an integration last DID, as opposed to when its key was typed.
--
-- `secretStatus.setAt` is the timestamp of a human typing a credential into a
-- form. Nothing anywhere records whether that credential has ever worked, so a
-- revoked or expired key reads as connected forever, and any diagnosis built on
-- that field would confidently tell a village its credential is fine about a
-- dead one. That is the most common way an integration dies and the field fails
-- in the worst possible direction on it.
--
-- One row per (module, operation), written by the driver wrapper in
-- server/lib/integrations.ts on every outbound call and by nothing else. Same
-- discipline as `peer_instances`, which already carries last_sync_at and
-- last_error written from the one sync job rather than by each caller: a new
-- listing inherits the record and cannot forget to keep it.
--
-- Deliberately CURRENT STATE, overwritten in place. The per-call incident log
-- generalising `payments_log` is a separate landing; this table answers "is it
-- working" and that log will answer "what happened at 14:02". The correlation
-- id is kept here anyway, because it is what makes the later log checkable
-- against the vendor's own records.
--
-- Nothing here is a payload and nothing here is member content: a status, a
-- short detail, timestamps and an id. A row you would be willing to show the
-- vendor it describes.
--
-- No charset or collation is named, deliberately. 28dace2 removed the seven
-- pins that disagreed with the database default and made every table inherit
-- it; a literal here would reintroduce exactly that split for forks whose
-- database default is not utf8mb4_0900_ai_ci.
CREATE TABLE IF NOT EXISTS `integration_health` (
  `module_id` varchar(64) NOT NULL,
  `operation` varchar(64) NOT NULL,
  `last_success_at` timestamp NULL,
  `last_failure_at` timestamp NULL,
  `last_failure_status` varchar(32) NULL,
  `last_failure_detail` varchar(500) NULL,
  `last_correlation_id` varchar(64) NULL,
  `consecutive_failures` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`module_id`, `operation`)
);

-- The tier a village is ON is stamped into module_settings.config when a module
-- is enabled, together with the contract version it was accepted under, so a
-- later tier change is a re-acceptance an admin reads instead of a silent
-- rewrite of their support arrangement. That acceptance deserves its own event
-- kind: reusing 'config' would bury it among ordinary category edits, and the
-- one question this table exists to answer forever is who agreed to what.
ALTER TABLE `module_events`
  MODIFY COLUMN `kind` enum('lifecycle','config','listing') NOT NULL;
