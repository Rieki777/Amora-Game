-- 0029 (S58): Exchange v2 — the internal swap engine.
--
-- A swap is TWO transfers between a member and sys:treasury, posted in ONE
-- transaction by the keystone's postTransferPair. It mints nothing, it
-- touches no faucet, and it has no provider. The order row is the receipt.
--
-- NO enum ALTER (0019's forbidden migration class): a settled swap is
-- status='paid' with paid_at set, and the reader renders kind='swap' plus
-- 'paid' as "completed".
--
-- token_slug/quantity/price_minor_each keep meaning the RECEIVE side, so
-- receipts, the member order list, the admin list, exchangeOpenState() and
-- exit.ts's open-state read all keep working unchanged. The pay_* columns
-- are new. amount_minor is the PAY-side fiat valuation: a number for the
-- receipt and the caps, NEVER a charge. No swap ever enters payments.ts.
ALTER TABLE `exchange_orders`
  ADD COLUMN `kind` enum('fiat_purchase','swap') NOT NULL DEFAULT 'fiat_purchase' AFTER `user_id`,
  ADD COLUMN `pay_token_slug` varchar(64) NULL AFTER `kind`,
  ADD COLUMN `pay_quantity` int NULL AFTER `pay_token_slug`,
  ADD COLUMN `pay_price_minor_each` int NULL AFTER `pay_quantity`,
  -- The exact currency_prices rows the rate came from. Denormalized on
  -- purpose: a receipt must survive later price posts unchanged.
  ADD COLUMN `pay_price_row_id` varchar(64) NULL,
  ADD COLUMN `receive_price_row_id` varchar(64) NULL,
  ADD COLUMN `spread_bps` int NULL,
  -- net_minor is the RECEIVE-side valuation. amount_minor - net_minor is
  -- the village's take (spread + whole-unit rounding), printed to the
  -- member BEFORE they confirm. We do not hide dust.
  ADD COLUMN `net_minor` int NULL,
  -- Member-supplied double-submit guard, scoped to the member: a global
  -- unique key would let one member's key collide into another's order.
  ADD COLUMN `client_key` varchar(80) NULL,
  ADD UNIQUE KEY `exchange_orders_client_key_uq` (`user_id`, `client_key`),
  ADD KEY `exchange_orders_kind_idx` (`kind`, `status`, `created_at`);
-- provider_ref stays UNIQUE and stays NULL for swaps (MySQL permits many
-- NULLs in a UNIQUE index). A swap has no provider, ever — boot-asserted.

-- Fail-closed caps and the halt switch. NO new listing flag: `swappable`
-- remains THE switch, exactly as 0022 promised. 0 means ZERO, not
-- unlimited: the act that opens a market states its size in the same breath.
ALTER TABLE `token_exchange_settings`
  ADD COLUMN `max_swap_out_per_cycle` int NOT NULL DEFAULT 0,
  ADD COLUMN `max_swap_out_per_member_per_cycle` int NOT NULL DEFAULT 0,
  -- Halt is unilateral and instant. Resume needs a note, not a ceremony.
  ADD COLUMN `swap_halted_at` timestamp NULL,
  ADD COLUMN `swap_halted_by` varchar(64) NULL,
  ADD COLUMN `swap_halt_reason` varchar(255) NULL;

-- CONTRACT COLUMN, engine deferred (the `swappable` pattern). A price post
-- may cite the decision thread that authorized it, and the rate history
-- renders it when present. NOTHING enforces it in v2 — this is the landing
-- pad for governance-executed price changes, and it costs one nullable
-- column now instead of a migration later.
ALTER TABLE `currency_prices`
  ADD COLUMN `decision_ref` varchar(64) NULL,
  ADD KEY `currency_prices_decision_idx` (`decision_ref`);

-- The faucet firewall scans by sender. Give it an index.
ALTER TABLE `token_ledger`
  ADD KEY `token_ledger_faucet_idx` (`from_account`, `token_type`);
