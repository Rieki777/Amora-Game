-- 0022 (S33-S35): Exchange v1, buy-only. The exchange owns ZERO ledger DDL:
-- stock is minted sys:mint -> sys:treasury, sales move sys:treasury -> buyer,
-- and an empty treasury FAILS a settlement loudly (out of stock is a fact,
-- not a mint opportunity).

-- Satellite of `tokens`, keyed by slug: which tokens the exchange lists.
-- Both flags default OFF; purchasable is v1, swappable is the v2 contract.
CREATE TABLE IF NOT EXISTS `token_exchange_settings` (
  `token_slug` varchar(64) NOT NULL,
  `purchasable` tinyint(1) NOT NULL DEFAULT 0,
  `swappable` tinyint(1) NOT NULL DEFAULT 0,
  `min_stage_to_buy` varchar(64) NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_slug`)
);

-- APPEND-ONLY price history: every posted price is a row with a REQUIRED
-- human note and the admin who set it. The current price is simply the
-- latest row; nothing is ever updated or deleted.
CREATE TABLE IF NOT EXISTS `currency_prices` (
  `id` varchar(64) NOT NULL,
  `token_slug` varchar(64) NOT NULL,
  `price_minor` int NOT NULL,
  `note` varchar(500) NOT NULL,
  `set_by` varchar(64) NULL,
  `effective_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `currency_prices_token_idx` (`token_slug`, `effective_at`)
);

-- Orders through the fiat trio. receipt_no is a human-friendly sequential
-- number claimed under SELECT ... FOR UPDATE at creation.
CREATE TABLE IF NOT EXISTS `exchange_orders` (
  `id` varchar(64) NOT NULL,
  `receipt_no` int NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `token_slug` varchar(64) NOT NULL,
  `quantity` int NOT NULL,
  `price_minor_each` int NOT NULL,
  `amount_minor` int NOT NULL,
  `provider_ref` varchar(160) NULL,
  `stripe_payment_intent_id` varchar(191) NULL,
  `status` enum('pending','paid','failed','cancelled','refunded','disputed','reversed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `exchange_orders_receipt_uq` (`receipt_no`),
  UNIQUE KEY `exchange_orders_provider_ref_uq` (`provider_ref`),
  KEY `exchange_orders_user_idx` (`user_id`, `status`),
  KEY `exchange_orders_pi_idx` (`stripe_payment_intent_id`)
);
