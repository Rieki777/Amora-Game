-- 0032 (S69): payment products — every payment a land project issues or
-- receives, as admin-defined DATA riding the one Stripe trio.
--
-- A product is something the village asks money for: an application fee, a
-- donation, a deposit, a waitlist seat, a recurring membership, a token
-- pack. The admin defines it; the platform sells it through the SAME
-- webhook/dedupe/reversal spine stays and the exchange already trust.
-- Fiat flows IN only, as everywhere: a product can GRANT tokens (from
-- treasury stock, conservation intact), it can never buy them back.
CREATE TABLE IF NOT EXISTS `payment_products` (
  `id` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `kind` enum('fee','donation','deposit','waitlist','membership','token_pack') NOT NULL,
  -- NULL amount = the giver chooses (donations); floor guards against
  -- sub-fee micro amounts. Fixed-amount kinds require amount_minor.
  `amount_minor` int NULL,
  `min_amount_minor` int NOT NULL DEFAULT 100,
  `recurring` enum('none','month','year') NOT NULL DEFAULT 'none',
  -- Optional token grant on settle: treasury -> buyer, refused loudly when
  -- stock is short. Recurring products grant per paid period.
  `token_slug` varchar(64) NULL,
  `token_amount` int NULL,
  -- stripe = checkout here; zeffy = the village's Zeffy form link (X2: no
  -- Zeffy API exists, reconciliation is manual); manual = instructions text.
  `provider` enum('stripe','zeffy','manual') NOT NULL DEFAULT 'stripe',
  `zeffy_url` varchar(500) NULL,
  `manual_instructions` varchar(1000) NULL,
  `audience` enum('public','members') NOT NULL DEFAULT 'public',
  `active` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_by` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `products_active_idx` (`active`, `audience`, `sort_order`)
);

-- One row per purchase intent; the webhook flips it paid. A waitlist IS the
-- paid rows of a waitlist product ordered by paid_at — no second table.
CREATE TABLE IF NOT EXISTS `product_purchases` (
  `id` varchar(64) NOT NULL,
  `product_id` varchar(64) NOT NULL,
  -- Nullable: fees and waitlists are often paid by people who are not
  -- members yet. Email is how the village reaches a memberless payer.
  `user_id` varchar(64) NULL,
  `payer_email` varchar(200) NULL,
  `amount_minor` int NOT NULL,
  `receipt_no` int NOT NULL,
  `status` enum('pending','paid','reversed','cancelled') NOT NULL DEFAULT 'pending',
  `provider_ref` varchar(120) NULL,
  `stripe_subscription_id` varchar(120) NULL,
  -- Recurring bookkeeping: how many periods have actually settled.
  `periods_paid` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_purchases_provider_uq` (`provider_ref`),
  KEY `product_purchases_list_idx` (`product_id`, `status`, `paid_at`),
  KEY `product_purchases_user_idx` (`user_id`, `created_at`)
);
