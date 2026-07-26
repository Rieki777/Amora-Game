-- 0005: the token ledger, and `hearts_balance` becomes `recognition_balance`.
--
-- THE RENAME. "Hearts" was Amora's early name for its in-site currency. It is now
-- called Gratitude, and a village inheriting this foundation may call theirs
-- Seeds, Thanks, or anything else. A platform column must not carry one project's
-- brand: `recognition_balance` names the KIND of currency it holds (recognition,
-- as against compensation and voice, per the levers spec taxonomy) rather than
-- any village's word for it. The display name already lives in
-- shared/gameConfig.ts, which is the only place a brand name belongs.
--
-- THE LEDGER. Until now a balance was one mutable number incremented in two
-- places across two non-atomic file writes, with no record of why it moved. The
-- ledger makes every movement an append-only row, and the balance column becomes
-- a derived cache that is always RECOMPUTED from SUM(amount), never incremented.
--
-- `token_type` is fixed at three values on day one on purpose. Only `gratitude`
-- is ever written here; `amora` (equity) and `voice` (governance weight) live on
-- Base under Hypha and are read-only to this platform. They are in the enum
-- anyway because widening a live MySQL enum later is precisely the migration
-- regen-civics refused to do, and the fossil is still in their schema.

ALTER TABLE `users`
  CHANGE COLUMN `hearts_balance` `recognition_balance` int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `token_ledger` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `token_type` enum('gratitude','amora','voice') NOT NULL DEFAULT 'gratitude',
  -- Signed: negative entries are legitimate corrections and reversals. A ledger
  -- that cannot go backwards forces destructive edits to fix a mistake.
  `amount` int NOT NULL,
  `source` varchar(64) NOT NULL,
  `source_ref` varchar(120),
  `description` varchar(500),
  -- 160 not 128: ids here are varchar(64) strings like `usr-1784...-a1b2`, not
  -- INTs, so composite keys such as `gratitude_dist:328:usr-1784...-a1b2` run
  -- far longer than they do in regen-civics.
  `idempotency_key` varchar(160) NOT NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The dedupe itself. A retried request, a double-clicked button or a re-run job
  -- credits exactly once because this write fails, not because a flag was checked.
  UNIQUE KEY `token_ledger_idempotency_unique` (`idempotency_key`),
  KEY `token_ledger_user_token_idx` (`user_id`, `token_type`),
  KEY `token_ledger_source_idx` (`source`)
);
