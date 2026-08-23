-- 0096: the Hypha module's own two tables — what the chain SAID, and who said yes to it.
--
-- Two facts the platform had nowhere to keep, and both of them are the same
-- kind of fact: something read off Base, with the moment it was true attached.
--
--   1. A token binding. `tokens.equity_address` and `tokens.voice_address` are
--      plain text variables an admin types or a lookup fills in, and nothing
--      anywhere records what the CONTRACT calls itself. Base is already
--      declared the source of truth for those names and a collision guard
--      enforces it, so the platform enforces a rule about a name it has never
--      read. This table is where the chain's own answer lives: name(),
--      symbol() and decimals() read at the moment a human confirmed the
--      binding, with who confirmed it and when.
--
--   2. A village-level read. `onchain_balances` is keyed per user, so every
--      chain number the platform holds is one member's holding. Total supply
--      and what the treasury address holds are facts about the VILLAGE, and
--      "see our data from Base" means those before it means anybody's personal
--      balance.
--
-- NULL ON RPC FAILURE, NEVER ZERO, inherited exactly from server/lib/base-reads.ts
-- and enforced the same way: nothing here is written on a failed read, so a row
-- means the chain answered and `fetched_at` says when. A caller that finds no
-- row shows nothing rather than a zero. The rule is worth more here than on a
-- member balance, because a zero total supply reads as "this DAO issued
-- nothing" and that is a statement about the village's whole cap table.
--
-- No charset or collation is named, deliberately, for the reason 0079 gives:
-- 28dace2 removed the seven pins that disagreed with the database default, and
-- a literal here would reintroduce that split for forks whose database default
-- is not utf8mb4_0900_ai_ci.

-- One row per bound token slug. The slug is the primary key because a village
-- binds one contract per role: one equity token, one voice token, and a second
-- contract claiming the same role is a rebinding rather than a second row.
--
-- `contract_address` is stored lowercase and the checksummed form is derived at
-- the edge. Two spellings of one address that compare unequal is how a rebind
-- silently becomes a duplicate.
CREATE TABLE IF NOT EXISTS `hypha_token_bindings` (
  `token_slug` varchar(32) NOT NULL,
  `contract_address` varchar(42) NOT NULL,
  -- Base mainnet is 8453. Recorded rather than assumed so a binding made
  -- against a testnet RPC can never be mistaken for a mainnet fact later.
  `chain_id` int NOT NULL DEFAULT 8453,
  -- What the CONTRACT says it is called. Read from name() and symbol() at
  -- confirm time, never typed. A blank here would mean the read failed, and a
  -- failed read never gets to write a row at all.
  `chain_name` varchar(190) NOT NULL,
  `chain_symbol` varchar(64) NOT NULL,
  -- decimals() is read per contract and never assumed 18. Same rule as the
  -- balance cache: raw uint256 stays raw and formatting is string math.
  `decimals` int NOT NULL,
  -- When the chain answered. The provenance half of "the displayed name is the
  -- chain's": a name with no read time behind it is a name somebody typed.
  `read_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- DISCOVERY PROPOSES, A HUMAN CONFIRMS. A founder's wallet holds airdropped
  -- junk and scam tokens deliberately mimic real names, so no lookup result
  -- ever becomes a binding on its own. This column is the record that somebody
  -- looked at the address and said yes; it is NOT NULL because a binding
  -- nobody confirmed is a binding that must not exist.
  `confirmed_by_user_id` varchar(64) NOT NULL,
  `confirmed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_slug`),
  KEY `hypha_token_bindings_contract_idx` (`contract_address`)
) ENGINE=InnoDB;

-- Village-level chain facts, one row per (token, metric).
--
-- `metric` is a short enum-in-a-varchar rather than a column per fact: total
-- supply and treasury balance are the two that exist today and a third (a
-- holder count, a quorum threshold) is a row rather than a migration.
--
-- `raw_value` is DECIMAL(65,0) for the same reason `onchain_balances` is: a
-- uint256 does not fit anything narrower, and truncating a supply figure into a
-- BIGINT is a misstatement about how much of the village exists.
CREATE TABLE IF NOT EXISTS `hypha_village_reads` (
  `token_slug` varchar(32) NOT NULL,
  `metric` varchar(32) NOT NULL,
  `raw_value` decimal(65,0) NOT NULL,
  `decimals` int NOT NULL,
  -- The address the figure is about, for metrics that are about one. Total
  -- supply is about the contract itself and leaves this blank; a treasury
  -- balance names the treasury it read. Empty string rather than NULL so the
  -- primary key below never meets MySQL's NULL exemption.
  `subject_address` varchar(42) NOT NULL DEFAULT '',
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_slug`, `metric`, `subject_address`)
) ENGINE=InnoDB;
