-- 0009 (S7): the ledger keystone — accounts, transfer rows, balance cache.
--
-- The JSON-era ledger was single-entry: "credit N to member X" with no origin
-- account, which means issuance is invisible — you cannot ask "how much has
-- the platform ever minted" without trusting that every row was a mint. The
-- keystone shape is double-entry-lite: every movement is a TRANSFER from one
-- account to another, amount strictly positive, direction explicit. Ordinary
-- accounts can never overdraft; designated FAUCET accounts may run negative,
-- and their negative balance IS the issuance-to-date figure, visible in the
-- same query as everyone else's balance. Conservation becomes a checkable
-- invariant: for every token, SUM(balance) over all accounts ≡ 0.
--
-- System accounts the platform is born knowing:
--   sys:gratitude-pool  faucet — recognition issuance (quest consent, sends)
--   sys:cycle-pool      faucet — the ReGen value pool paid at cycle close
--   sys:treasury        NOT a faucet — an ordinary vault for module economies;
--                       it must be funded before it can spend, by design.

CREATE TABLE IF NOT EXISTS `ledger_accounts` (
  -- 'mem:<userId>' for members, 'sys:<slug>' for system accounts.
  `id` varchar(80) NOT NULL,
  `kind` varchar(16) NOT NULL,
  `user_id` varchar(64) NULL,
  `label` varchar(120) NOT NULL,
  -- Faucets may run negative; their balance is "issued to date", negated.
  `faucet` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ledger_accounts_user_unique` (`user_id`)
);

INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:gratitude-pool', 'system', NULL, 'Recognition faucet', 1),
  ('sys:cycle-pool', 'system', NULL, 'Cycle value pool faucet', 1),
  ('sys:treasury', 'system', NULL, 'Treasury', 0);

-- Every existing member gets an account; members who appear only in ledger
-- history (deleted accounts keep their rows — history is shared) get one too.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`)
  SELECT CONCAT('mem:', `id`), 'member', `id`, LEFT(`name`, 120), 0 FROM `users`;
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`)
  SELECT DISTINCT CONCAT('mem:', `user_id`), 'member', `user_id`, CONCAT('former member ', `user_id`), 0
  FROM `token_ledger`;

-- token_ledger becomes transfer rows. Every legacy row was an issuance credit
-- (opening balances, quest consent, gratitude sends, cycle pool), so each one
-- is re-read as a transfer out of the matching faucet.
ALTER TABLE `token_ledger`
  ADD COLUMN `from_account` varchar(80) NULL AFTER `id`,
  ADD COLUMN `to_account` varchar(80) NULL AFTER `from_account`;

UPDATE `token_ledger`
  SET `from_account` = CASE WHEN `source` = 'gratitude_pool' THEN 'sys:cycle-pool' ELSE 'sys:gratitude-pool' END,
      `to_account` = CONCAT('mem:', `user_id`)
  WHERE `from_account` IS NULL;

ALTER TABLE `token_ledger`
  MODIFY COLUMN `from_account` varchar(80) NOT NULL,
  MODIFY COLUMN `to_account` varchar(80) NOT NULL,
  -- 191 keeps the unique index inside utf8mb4's 767-byte prefix limit while
  -- giving composite keys more room than 0005's 160.
  MODIFY COLUMN `idempotency_key` varchar(191) NOT NULL,
  -- Transfers are directional and positive; "negative credit" corrections are
  -- expressed as a transfer in the other direction, never as signed amounts.
  ADD CONSTRAINT `token_ledger_amount_positive` CHECK (`amount` > 0);

-- user_id is now derivable from to_account/from_account; keeping it would be
-- a second source of truth that member-to-member transfers make ambiguous.
ALTER TABLE `token_ledger` DROP INDEX `token_ledger_user_token_idx`;
ALTER TABLE `token_ledger` DROP COLUMN `user_id`;
ALTER TABLE `token_ledger`
  ADD INDEX `token_ledger_from_idx` (`from_account`, `token_type`),
  ADD INDEX `token_ledger_to_idx` (`to_account`, `token_type`);

-- The balance CACHE: recomputed inside every posting transaction, never
-- incremented (plan rule: a wrong cache is fixed by recomputation, not by
-- hand-patching a number nobody can explain).
CREATE TABLE IF NOT EXISTS `token_balances` (
  `account_id` varchar(80) NOT NULL,
  `token_type` varchar(32) NOT NULL,
  `balance` bigint NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`, `token_type`)
);

INSERT INTO `token_balances` (`account_id`, `token_type`, `balance`)
  SELECT t.`account_id`, t.`token_type`, SUM(t.`delta`) FROM (
    SELECT `to_account` AS `account_id`, `token_type`, `amount` AS `delta` FROM `token_ledger`
    UNION ALL
    SELECT `from_account`, `token_type`, -`amount` FROM `token_ledger`
  ) t
  GROUP BY t.`account_id`, t.`token_type`
ON DUPLICATE KEY UPDATE `balance` = VALUES(`balance`);
