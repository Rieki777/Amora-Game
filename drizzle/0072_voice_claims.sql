-- 0072: carrying accrued voice to Hypha.
--
-- Voice accrues in this ledger like every other token and settles on Hypha.
-- The bridge between them is a claim, and the claim is a ROW because the
-- alternative is trusting a callback to tell us who claimed what. Village,
-- member, token and amount are all read back from here at reconcile time and
-- never from the payload: a receiver that believes its input is a mint with a
-- webhook in front of it.
--
-- The lifecycle, and which way each door swings:
--
--   requested  the voice is already debited, held against this claim
--   confirmed  Hypha executed it. TERMINAL. Cancel and stale are illegal
--              after this, or a member is refunded voice they also received.
--   rejected   Hypha voted no. TERMINAL, and refunded: nothing is ever
--              confiscated for losing a vote. The voice re-accrues and can be
--              claimed again next season.
--   canceled   the member changed their mind. Refunded.
--   stale      nobody acted and the window closed. Refunded.
--
-- Every refund is a REVERSAL of the debit, not a fresh mint, so it inherits
-- every guard the debit passed and cannot become a way to make voice.

-- The accounts the village voice moves between. System accounts must EXIST
-- before anything posts to them: `postTransfer` materialises `mem:` accounts on
-- first touch and refuses an unknown `sys:` id outright, because a typo'd
-- system account is a bug to hear about rather than an account to invent.
--
-- The mint is a faucet, so its negative balance IS the voice issued to date,
-- which is the number the Mint's supply feed reads. The bridge is NOT a
-- faucet: voice held against an open claim has to have come from somebody, and
-- a faucet there would let a claim create the voice it claims.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:voice-mint', 'system', NULL, 'Village voice mint', 1),
  ('sys:voice-bridge', 'system', NULL, 'Voice held for an open claim', 0);

CREATE TABLE IF NOT EXISTS `voice_claims` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  `user_id` varchar(64) NOT NULL,
  `token_slug` varchar(32) NOT NULL,
  `amount` decimal(18,4) NOT NULL,
  `state` enum('requested','confirmed','canceled','stale','rejected') NOT NULL DEFAULT 'requested',
  -- The ledger row that took the voice out of the member's hands at request
  -- time. The refund reverses THIS id, which is why it is recorded rather
  -- than recomputed: a refund that has to go looking for its debit will one
  -- day find the wrong one.
  `debit_key` varchar(160) NOT NULL,
  -- The key the bridge dispatched under, and the key the callback is matched
  -- on. UNIQUE, so a retried dispatch reuses the existing Hypha proposal
  -- instead of raising a second one for the same claim.
  `intent_key` varchar(160) NOT NULL,
  -- What Hypha called it once it existed there. NULL until the proposal is
  -- raised, so it cannot be part of the dedupe.
  `hypha_ref` varchar(255) NULL,
  `hypha_space` varchar(120) NULL,
  -- Set when the claim leaves `requested`, with the reason in the state.
  `settled_at` timestamp NULL,
  `note` varchar(280) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `voice_claims_intent` (`intent_key`),
  UNIQUE KEY `voice_claims_debit` (`debit_key`),
  -- The two reads: "does this member already have one open" and "which claims
  -- is the poller still waiting on".
  KEY `voice_claims_open_idx` (`village_id`, `user_id`, `state`),
  KEY `voice_claims_state_idx` (`village_id`, `state`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
