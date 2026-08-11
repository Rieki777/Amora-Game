-- 0071: the mint rules, and the two columns gratitude was missing.
--
-- There is no `ledger_events` table here and no second token registry, on
-- purpose. `token_ledger` has been the one ledger since 0005 and it is
-- double-entry with conservation re-proven at every boot; `tokens` has been
-- the one registry since 0006. A second append-only ledger that mints from
-- NULL would sit outside `checkLedgerInvariants`, and the doctrine this build
-- exists to enforce says one ledger, every token. So the new tokens register
-- in `tokens`, mints post from named faucets through `postTransfer`, and each
-- faucet's negative balance is the issued supply the Mint reads.
--
-- What is genuinely new is the RULES: which trigger mints which token, how
-- much, up to what ceiling, and from which cycle a change counts.

ALTER TABLE `tokens`
  -- A key into the shared glyph library, never a path. The Mint's token editor
  -- picks from the same library the map's flow media use.
  ADD COLUMN `glyph` varchar(64) NOT NULL DEFAULT '',
  -- Separate from `transferable` because they answer different questions.
  -- Hearts are neither: recognition is not tradeable and not spendable, it is
  -- held. Stay and library credits are both. The village voice token is
  -- earned and is neither, until it is claimed to Hypha.
  ADD COLUMN `spendable` tinyint(1) NOT NULL DEFAULT 0,
  -- Where this token's real home is, when it has one elsewhere. The village
  -- voice token accrues here and settles on Hypha, and this is the mirror.
  ADD COLUMN `external_ref` varchar(255) NULL;

-- Recognition and the village voice are held, never spent. Set here rather
-- than in a seed so a fork inherits the posture instead of relying on somebody
-- remembering to seed it.
--
-- `spendable` ONLY. `transferable` is left exactly as each token already has
-- it: it has been live policy on `gratitude` since 0006, the stays and library
-- modules re-assert their own every boot, and this build has no business
-- changing what an existing token is allowed to do. The new column starts at
-- the honest answer for these two kinds and nothing else moves.
UPDATE `tokens` SET `spendable` = 0 WHERE `kind` IN ('recognition', 'voice');

CREATE TABLE IF NOT EXISTS `mint_rules` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- What happened in the world. One of a closed set the engine knows:
  -- quest.completed, gratitude.given, role.cycle, journey.stage_reached,
  -- welcome_aboard.quest, library.contributed, stay.work_exchange.
  -- A varchar rather than an enum because a village adds triggers by shipping
  -- code, and an enum widening migration per trigger is the trap 0006 named.
  `trigger` varchar(64) NOT NULL,
  `token_slug` varchar(32) NOT NULL,
  -- NULL means "read the amount from the source", e.g. the hearts a quest was
  -- posted with. A fixed number means exactly that number.
  `amount` decimal(18,4) NULL,
  -- The hard cap on any from_source amount. NOT nullable-as-unlimited: a rule
  -- that mints an amount somebody else typed, with no ceiling, is an open
  -- faucet with a form in front of it.
  `ceiling` decimal(18,4) NOT NULL DEFAULT 0,
  -- Who receives it. 'claimant', 'receiver', 'holder', 'member'.
  `recipient` varchar(32) NOT NULL DEFAULT 'claimant',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `note` varchar(280) NULL,
  -- The cycle this rule's CURRENT numbers start counting from. An edit stamps
  -- the next cycle, never this one, so a rule cannot be raised, paid against,
  -- and lowered again around a settlement. The settlement reads rules as of
  -- the cycle it is closing.
  `effective_from_cycle` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The natural key. Seeds upsert against it, so re-running a seed never
  -- doubles a rule, and an admin's edited amount is never clobbered by a
  -- redeploy because the seed inserts only when the row is absent.
  UNIQUE KEY `mint_rules_natural` (`village_id`, `trigger`, `token_slug`),
  KEY `mint_rules_trigger_idx` (`village_id`, `trigger`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gratitude already has a table: `gratitude_log` since 0001, with sender,
-- recipient, amount, message, cycle and context. These are the four things the
-- character sheet needs that it never recorded.
ALTER TABLE `gratitude_log`
  ADD COLUMN `village_id` varchar(64) NOT NULL DEFAULT 'local',
  -- What the thanks was for, in the village's own words.
  ADD COLUMN `tag` varchar(64) NULL,
  -- Where it happened, as a structure key. The map and the sheet then tell the
  -- same story about the same moment.
  ADD COLUMN `structure_key` varchar(64) NULL,
  -- A quiet gift is still a real gift. It shows publicly as "someone,
  -- quietly", and the giver's name never leaves the two of them.
  ADD COLUMN `quiet` tinyint(1) NOT NULL DEFAULT 0,
  -- The client's own key for one tap of the give button. Nullable, because
  -- every row written before this column existed has no nonce and MySQL's
  -- NULL exemption is what lets them coexist under the unique index. New
  -- writes always carry one.
  ADD COLUMN `client_nonce` varchar(120) NULL;

ALTER TABLE `gratitude_log`
  ADD UNIQUE KEY `gratitude_log_nonce` (`village_id`, `client_nonce`);
