-- 0024 (S41-S46): the material library. ZERO ledger DDL — library credits
-- are a registered platform token moving through postTransfer between the
-- four accounts seeded below. Conservation is inherited, not reinvented.
--
--   sys:library-mint    faucet — intake awards and grants issue from here;
--                       its negative balance IS the outstanding credit supply.
--   sys:library-escrow  NOT a faucet — deposits held while a loan is open.
--                       INVARIANT (boot-asserted): its balance equals the sum
--                       of unsettled loans' escrow_credits, to the credit.
--   sys:library-pool    NOT a faucet — usage fees land here; later spent on
--                       repairs and steward rewards (compute deferred).
--   sys:library-sink    NOT a faucet — retired credits (burns) rest here.

INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:library-mint', 'system', NULL, 'Library credit mint', 1),
  ('sys:library-escrow', 'system', NULL, 'Library loan escrow', 0),
  ('sys:library-pool', 'system', NULL, 'Library usage-fee pool', 0),
  ('sys:library-sink', 'system', NULL, 'Library retired credits', 0);

CREATE TABLE IF NOT EXISTS `library_categories` (
  `id` varchar(64) NOT NULL,
  `label` varchar(120) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `library_items` (
  `id` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text NULL,
  `category_id` varchar(64) NULL,
  `photo_url` varchar(500) NULL,
  -- intake_pending: appraised above the dual-sign-off line, awaiting the
  -- SECOND steward. No credits move until it clears.
  `status` enum('intake_pending','available','checked_out','written_off') NOT NULL DEFAULT 'available',
  -- Condition in basis points (10000 = mint). Bookkeeping v1; wear classes deferred.
  `health_bp` int NOT NULL DEFAULT 10000,
  -- The appraised replacement value in library credits: escrow and the
  -- supply-vs-backing flag both read it.
  `credit_value` int NOT NULL DEFAULT 0,
  `min_stage` varchar(64) NULL,
  `requires_role` varchar(64) NULL,
  `donor_user_id` varchar(64) NULL,
  `intake_signed_by` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `library_items_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `library_loans` (
  `id` varchar(64) NOT NULL,
  `item_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- Live: reserved -> pickup_pending -> active -> return_pending.
  -- Terminal (ALL through settleLoan, the single terminal): closed |
  -- expired | cancelled | disputed.
  `status` enum('reserved','pickup_pending','active','return_pending','closed','expired','cancelled','disputed') NOT NULL DEFAULT 'reserved',
  `escrow_credits` int NOT NULL DEFAULT 0,
  `due_on` date NULL,
  `wear_fee` int NULL,
  `damage_fee` int NULL,
  -- Stamped by settleLoan in the same claim, for cycle-scoped reporting.
  `settled_cycle_id` varchar(64) NULL,
  `settled_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `library_loans_item_idx` (`item_id`, `settled_at`),
  KEY `library_loans_user_idx` (`user_id`, `status`)
);

-- Provenance: who did what to which item, forever. Append-only.
CREATE TABLE IF NOT EXISTS `library_item_events` (
  `id` varchar(64) NOT NULL,
  `item_id` varchar(64) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `detail` varchar(500) NULL,
  `actor_user_id` varchar(64) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `library_item_events_item_idx` (`item_id`, `at`)
);
