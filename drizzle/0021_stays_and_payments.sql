-- 0021 (S30-S32): Stays v1 + the PLATFORM payment tables the fiat trio owns.
-- Stays owns ZERO ledger DDL: stay credits are a registered platform token,
-- minted/burned through postTransfer, outstanding supply = -balance(sys:mint).
CREATE TABLE IF NOT EXISTS `accommodations` (
  `id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  `capacity` int NOT NULL DEFAULT 1,
  `photo_url` varchar(500) NULL,
  `visit_type_id` varchar(64) NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- Two posted numbers, never an FX rate: a room posts a stay-credit price and
-- (optionally) a USD price, per audience. Member row missing → guest fallback.
CREATE TABLE IF NOT EXISTS `accommodation_prices` (
  `id` varchar(64) NOT NULL,
  `accommodation_id` varchar(64) NOT NULL,
  `token_type` varchar(32) NOT NULL,
  `audience` enum('guest','member') NOT NULL DEFAULT 'guest',
  -- Cents for usd; whole credits for stay-credit.
  `amount_minor` int NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accommodation_prices_uq` (`accommodation_id`, `token_type`, `audience`)
);

CREATE TABLE IF NOT EXISTS `stays` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `accommodation_id` varchar(64) NOT NULL,
  `status` enum('requested','active','ended','cancelled') NOT NULL DEFAULT 'requested',
  `arrive_on` date NULL,
  `autopay` tinyint(1) NOT NULL DEFAULT 1,
  -- Rate + audience SNAPSHOT at activation (critique): catch-up posting is
  -- deterministic; price edits mid-stay take effect only on admin re-rate.
  `rate_snapshot_credits` int NULL,
  `audience_snapshot` enum('guest','member') NULL,
  `last_posted_on` date NULL,
  `notes` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stays_user_idx` (`user_id`, `status`),
  KEY `stays_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `stay_purchases` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `accommodation_id` varchar(64) NULL,
  `nights` int NULL,
  `amount_minor` int NOT NULL DEFAULT 0,
  `credits_granted` int NOT NULL DEFAULT 0,
  `provider` enum('stripe','manual') NOT NULL DEFAULT 'stripe',
  `provider_ref` varchar(160) NULL,
  `stripe_payment_intent_id` varchar(191) NULL,
  `status` enum('pending','paid','failed','cancelled','refunded','disputed','reversed') NOT NULL DEFAULT 'pending',
  `recorded_by` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stay_purchases_provider_ref_uq` (`provider_ref`),
  KEY `stay_purchases_user_idx` (`user_id`, `status`),
  KEY `stay_purchases_pi_idx` (`stripe_payment_intent_id`)
);

-- ── Platform payment tables (the trio owns these; every fiat module shares) ──

-- One row per successful settle, across ALL modules: the substrate the
-- cross-module per-member purchase limits aggregate over. Limits that only
-- see one module are theater.
CREATE TABLE IF NOT EXISTS `fiat_charges` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `module` varchar(64) NOT NULL,
  `order_id` varchar(64) NOT NULL,
  `amount_minor` int NOT NULL,
  `currency` varchar(8) NOT NULL DEFAULT 'usd',
  `stripe_payment_intent_id` varchar(191) NULL,
  `status` enum('paid','reversed') NOT NULL DEFAULT 'paid',
  `paid_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fiat_charges_order_uq` (`module`, `order_id`),
  KEY `fiat_charges_user_idx` (`user_id`, `paid_at`),
  KEY `fiat_charges_pi_idx` (`stripe_payment_intent_id`)
);

-- A dispute or chargeback auto-suspends purchasing until an admin lifts it.
CREATE TABLE IF NOT EXISTS `payment_suspensions` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `order_ref` varchar(128) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lifted_by` varchar(64) NULL,
  `lifted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `payment_suspensions_user_idx` (`user_id`, `lifted_at`)
);

-- The ops rider: every payment-path event, success or failure, with the
-- Stripe event id as event-level dedupe. Failures alert admins.
CREATE TABLE IF NOT EXISTS `payments_log` (
  `id` varchar(64) NOT NULL,
  `stripe_event_id` varchar(191) NULL,
  `direction` enum('out','in') NOT NULL DEFAULT 'in',
  `module` varchar(64) NULL,
  `order_id` varchar(64) NULL,
  `type` varchar(64) NOT NULL,
  `outcome` enum('ok','sig_fail','no_handler','no_order','settle_error','duplicate') NOT NULL,
  `latency_ms` int NULL,
  `detail` varchar(500) NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payments_log_event_uq` (`stripe_event_id`),
  KEY `payments_log_at_idx` (`at`)
);

-- Work-exchange (F2 firewall): a quest may carry a stay-credit reward in a
-- SEPARATE column, released in the same consent transaction as recognition —
-- two currencies, one human gate, never blended.
ALTER TABLE `quests`
  ADD COLUMN `stay_credit_reward` int NULL AFTER `gratitude_max`;
