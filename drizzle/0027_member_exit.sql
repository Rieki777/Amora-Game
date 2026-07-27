-- 0027 (S52): member exit — F12, "exit from the get-go".
-- An exit is a PROCESS ROW, never a delete: enumeration of open state,
-- settlement through each domain's own terminal paths, then the existing
-- anonymize tombstone. Value rows are never deleted; conservation holds
-- through every departure.
CREATE TABLE IF NOT EXISTS `exits` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `kind` enum('voluntary','involuntary') NOT NULL DEFAULT 'voluntary',
  -- One non-terminal exit per member, enforced in code (MySQL cannot
  -- express a partial-unique): open -> settling -> resolved | cancelled.
  `status` enum('open','settling','resolved','cancelled') NOT NULL DEFAULT 'open',
  `opened_by` varchar(64) NOT NULL,
  `notice_ends_at` timestamp NULL,
  -- Restorative flow: a POINTER to an agreement, NEVER its content. The
  -- content of a repair conversation reaches only its participants (F12
  -- hard rule); the record holds the fact of an agreement and its status.
  `agreement_ref` varchar(255) NULL,
  `resolution` text NULL,
  `opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `exits_user_idx` (`user_id`, `status`)
);

-- Where a leaver's positive balances are swept at settlement (an explicit
-- admin act, idempotent per token). NOT a faucet: it can only hold what
-- members actually carried out the door.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:exit-settlement', 'system', NULL, 'Exit settlement holding', 0);
