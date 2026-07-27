-- 0025 (S47): wallet verification challenges + the on-chain read cache.
-- The platform READS Base balances for display and never writes the chain.
-- users.wallet_address / wallet_verified_at exist since 0003; this adds the
-- signed-message challenge (nonce per user) and the last-known-balance cache
-- the "null on RPC failure, never zero" rule reads from.

CREATE TABLE IF NOT EXISTS `wallet_challenges` (
  `user_id` varchar(64) NOT NULL,
  `nonce` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`user_id`)
);

-- Fixed point, verbatim: raw uint256 + the token's own decimals(), never a
-- pre-divided number. A zero row exists ONLY when the chain returned zero.
CREATE TABLE IF NOT EXISTS `onchain_balances` (
  `id` varchar(120) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `token_slug` varchar(32) NOT NULL,
  `raw_balance` decimal(65,0) NOT NULL,
  `decimals` int NOT NULL,
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `onchain_user_token_uq` (`user_id`, `token_slug`)
);
