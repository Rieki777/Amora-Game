-- On-chain verification lands in the proposal lifecycle (bridge phase).
--
-- Two new statuses. `passed_verified` means the pass was confirmed by the
-- governance hub's signed callback (the ReGen hub runs ONE Alchemy listener
-- on Base for every fork and relays outcomes) -- as distinct from
-- `passed_claimed`, which is only the proposer's word. `failed` is the
-- verified other outcome. MODIFY with a superset enum is safe on populated
-- tables: every existing value remains representable.
--
-- verified_at / tx_hash record WHEN and by WHICH transaction the outcome was
-- confirmed -- the amendment ledger points at the proposal, the proposal
-- points at the chain.
-- House rule: no comment line in this file may end with a semicolon
ALTER TABLE `mechanics_proposals` MODIFY `status` enum('draft','open','withdrawn','to_hypha','passed_claimed','passed_verified','failed','applied') NOT NULL DEFAULT 'open';

ALTER TABLE `mechanics_proposals` ADD COLUMN `verified_at` timestamp NULL;

ALTER TABLE `mechanics_proposals` ADD COLUMN `tx_hash` varchar(100) NULL;
