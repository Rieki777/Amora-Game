-- 0011 (S9): the manual-mint faucet. Admin minting is its own issuance
-- channel, so it gets its own faucet account — mixing it into
-- sys:gratitude-pool or sys:cycle-pool would blur each faucet's negative
-- balance, which is the issued-to-date figure the reconciliation panel
-- reports per channel.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:mint', 'system', NULL, 'Manual mint faucet (admin, capped per cycle)', 1);
