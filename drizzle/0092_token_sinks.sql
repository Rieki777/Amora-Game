-- 0092: somewhere for the pool token to go.
--
-- The cycle pool pays real value in whatever token `gratitude.pool_token`
-- names, which defaults to `credits`. Nothing in the build spent that token:
-- the four member-debiting paths were stay credits, library escrow, the
-- exchange (off by default) and voice claims (settled off-platform). Do work,
-- get thanked, receive a number, and the loop ended there.
--
-- Gratitude itself is a ROUTING SIGNAL and stays exactly as it is. What this
-- migration adds is three sinks for the token gratitude routes:
--
--   1. A night can be priced in the village's own credits, alongside stay
--      credits. `stays.rate_snapshot_token` records which token a stay was
--      activated in, next to the rate it was activated at.
--   2. A gathering can ask for a seat fee. `events.seat_price` /
--      `events.seat_token`, held in escrow per place in `event_seat_charges`.
--   3. Members can send credits to each other, which needs the credit-kind
--      tokens to actually be transferable.
--
-- No new ledger. Every movement below rides `postTransfer` between accounts
-- that already exist plus the one seeded here, so conservation is inherited.

-- The token a stay pays its nights in, snapshot at activation beside the rate.
--
-- DEFAULT 'stay-credit' rather than NULL: every stay that exists today pays
-- stay credits, and a nullable column would make every reader answer "what
-- does a null mean" for a question that has one true answer already.
ALTER TABLE `stays`
  ADD COLUMN `rate_snapshot_token` varchar(32) NOT NULL DEFAULT 'stay-credit' AFTER `rate_snapshot_credits`;

-- What a seat costs, and in what. 0 means free, which is what every gathering
-- that exists is, and `seat_token` is NULL until somebody prices one.
ALTER TABLE `events`
  ADD COLUMN `seat_price` int NOT NULL DEFAULT 0,
  ADD COLUMN `seat_token` varchar(32) NULL;

-- Escrow, not a faucet: a seat fee is held between the moment somebody takes a
-- place and the moment the gathering is over. Its balance equals the sum of
-- every `held` row in `event_seat_charges`, and the reconciliation route
-- re-proves that.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:event-escrow', 'system', NULL, 'Gathering seat escrow', 0);

-- One row per place held, whether that place is a seat or a queue position.
--
-- Paying to QUEUE is deliberate. Promotion off a waitlist writes a `going`
-- answer with nobody present to consent to a charge, so the alternative was a
-- queue that silently bills you when your turn comes. You pay when you take
-- your place, and you get it back whole if that place never becomes a seat.
--
-- `status` is the terminal, claimed atomically the way library loans claim
-- theirs: exactly one settle ever writes it, and a retry repairs from what is
-- stored instead of deciding again.
CREATE TABLE IF NOT EXISTS `event_seat_charges` (
  `id` varchar(64) NOT NULL,
  `event_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `occurrence_key` varchar(10) NOT NULL DEFAULT '',
  `token_type` varchar(32) NOT NULL,
  -- Snapshot at the moment the place was taken. A host who re-prices the
  -- gathering afterwards never re-rates somebody who already paid.
  `amount` int NOT NULL,
  -- held: in escrow. released: refunded to the member. kept: the gathering
  -- happened and the village has it.
  `status` enum('held','released','kept') NOT NULL DEFAULT 'held',
  -- Which charge on this place we are on. Leaving a queue and rejoining it is
  -- an ordinary sequence, and it has to charge a SECOND time; one row per place
  -- plus a counter gives every leg a distinct ledger key without a second row
  -- competing for the unique index below. The ledger keeps the history, which
  -- is the book that matters.
  `charge_seq` int NOT NULL DEFAULT 1,
  `settled_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One charge per person per evening. This is the dedupe that stops a double
  -- tap paying twice, and all three columns are NOT NULL because MySQL exempts
  -- NULLs from a unique key.
  UNIQUE KEY `event_seat_charges_one_per_place` (`event_id`, `user_id`, `occurrence_key`),
  KEY `event_seat_charges_open_idx` (`event_id`, `status`),
  KEY `event_seat_charges_user_idx` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- RECOGNITION IS NEVER SENDABLE, and it has been marked sendable since 0006.
--
-- 0006 seeded `gratitude` with transferable = 1. Nothing read the column,
-- because no send surface existed, so the wrong value sat there harmlessly for
-- eighty-five migrations. The send surface in this change reads it, and would
-- have made the recognition token peer-to-peer transferable on the first boot
-- of every existing deployment. Recognition is a signal about what happened;
-- moving it between members by hand is exactly the forgery the signal/value
-- separation exists to prevent.
--
-- Written as a kind sweep rather than `WHERE slug = 'gratitude'` so a fork that
-- named its recognition token something else is covered too. A boot invariant
-- (`checkLedgerInvariants`) now refuses to start a server where this is false,
-- so the value cannot drift back without somebody hearing about it.
UPDATE `tokens` SET `transferable` = 0 WHERE `kind` IN ('recognition', 'equity', 'voice');

-- The village's own credits become sendable: this is the farmers-market case,
-- one member paying another for a jar of honey.
--
-- Scoped to `kind = 'credit'` and `governance = 'platform'`, and the two module
-- vouchers are held out by name. A stay credit is a claim on a specific night
-- and a library credit is a deposit against a specific shelf; both modules
-- re-assert `transferable: false` at every boot, and `stay.credits_transferable`
-- is refused at the variables route with a written legal reason. Sweeping them
-- in here would silently overturn a decision somebody already took in writing.
--
-- Example tokens are held out because they hold no ledger rows at all.
UPDATE `tokens` SET `transferable` = 1
  WHERE `kind` = 'credit'
    AND `governance` = 'platform'
    AND `is_example` = 0
    AND `slug` NOT IN ('stay-credit', 'library-credit');
