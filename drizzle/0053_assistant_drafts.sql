-- 0053 — Assistant drafts.
--
-- Renumbered from 0050, which main claimed first. See 0052's header.
--
-- The `role` kind writes to the `roles` table, which is the PERMISSION-GROUP
-- carrier feeding the one capability gate. Main's 0049 added `org_roles` for
-- the org chart (seats with an aim, a domain and a holder) and states plainly
-- that it leaves `roles` alone. So these two mean different things, and an
-- `org_role` draft kind is its own piece of work.
--
-- The assistant writes DRAFTS and never a domain table. A human opens a queue,
-- edits, and accepts, and the accept calls the same creation function the admin
-- form calls, so every invariant and every gate is inherited instead of
-- reimplemented. One table, one queue, N object types.
--
-- `escalations` is the load-bearing column: the capabilities a proposed role
-- asks for that NO existing role already grants. Each one is confirmed
-- individually in the review UI, and anything left unticked is stripped from
-- the role that gets created. A single Accept button on a role quietly carrying
-- exchange.manage is how this goes wrong.
--
-- `capability_ceiling` records what the PROPOSER held at draft time. It is
-- audit, not enforcement: hasCapability short-circuits to true for admins, so a
-- ceiling measured against the accepter would constrain nothing.
--
-- See docs/MAIA_BRAIN_SPEC.md section 5.

CREATE TABLE IF NOT EXISTS `assistant_drafts` (
  `id` varchar(64) NOT NULL,
  `batch_id` varchar(64) NOT NULL,
  `kind` varchar(32) NOT NULL,
  `payload` json NOT NULL,
  `rationale` text NOT NULL,
  `cites` json NULL,
  `status` enum('proposed','accepted','rejected','superseded') NOT NULL DEFAULT 'proposed',
  `proposed_by` varchar(64) NOT NULL,
  `proposed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `capability_ceiling` json NOT NULL,
  `escalations` json NULL,
  `decided_by` varchar(64) NULL,
  `decided_at` timestamp NULL,
  `decided_note` text NULL,
  `created_ref` varchar(64) NULL,
  PRIMARY KEY (`id`),
  KEY `drafts_queue_idx` (`status`, `kind`, `proposed_at`),
  KEY `drafts_batch_idx` (`batch_id`)
);
