-- 0125: holding a seat stops paying Gratitude by default, and quests and seats
-- start paying Village Credits.
--
-- Rye, 2026-08-30: "Quests, roles, and contributions of any type should be
-- able to pay any combination of any tokens (the defaults being village voice
-- and village credits)", and "if they want to connect quests and roles to the
-- gratitude system they can have this be one of the tokens issued but that is
-- a change they can add not the defaults we're going to ship with."
--
-- ── WHAT THIS FILE DOES NOT DO, SAID FIRST ────────────────────────────────
--
-- IT DOES NOT STOP A QUEST PAYING GRATITUDE. Read the title again: it names
-- seats, and only seats. A confirmed quest's Gratitude has never been a mint
-- rule and there is nothing here for this file to switch off. It is minted
-- directly by the consent route in `server/index.ts`, from the range the quest
-- itself advertises in `quests.gratitude`, at an amount the consenting steward
-- types, and the route REFUSES a consent of less than 1 unless
-- `quest.allow_zero_consent` is on. On the shipped default of
-- `quest.consent_cap_mode = 'posted'` it also refuses any quest whose
-- advertised range it cannot read, so a quest that advertises nothing cannot
-- be consented at all.
--
-- Gratitude for a quest is therefore the consent transaction itself and not a
-- default among tokens. Removing it is a change to that route and to what the
-- quest board advertises, which is a larger piece of work than a migration,
-- and it is written up rather than half-done here. What this file changes is
-- the seat payout, where Gratitude really was a default.
--
-- ── WHY A MIGRATION AND NOT JUST THE SEED ─────────────────────────────────
--
-- `server/lib/economySeed.ts` carries the new defaults and runs at every boot,
-- but it inserts mint rules IF ABSENT and never updates them. That rule is
-- load-bearing and is not being relaxed: these rows are money, and a redeploy
-- that "restored the defaults" would silently undo a governance decision a
-- village had already taken, with nobody finding out until a settlement paid
-- the wrong number.
--
-- The consequence is that the seed change reaches a village created after this
-- release and cannot reach one created before it. Amora already has
-- `rule-role.cycle-gratitude` enabled at 20 from an earlier boot. So the seed
-- alone would ship thirteen founder instances on the new defaults and leave
-- the founding village on the old one, which is the reverse of what was asked.
--
-- A migration is the right instrument for that: one dated, auditable act,
-- rather than a permanent loosening of the never-update rule.
--
-- ── THE GUARD, WHICH IS THE WHOLE FILE ────────────────────────────────────
--
-- This only touches a rule THAT HAS NEVER PAID ANYBODY. The founder's word on
-- 2026-08-30 was "Token balance and ledger are empty for Amora we haven't done
-- anything", and this file does not take that on trust: it asks the ledger.
--
-- The NOT EXISTS subquery is against `token_ledger`, which is the only place a
-- role-cycle payout can have landed (every mint in this build goes through
-- `postTransfer`; there is no second set of books, by design). If a single
-- gratitude row was ever issued by a settlement, the rule stays exactly as it
-- is and this migration does nothing at all. A village that has been paying
-- its seat holders in Gratitude for three moons keeps paying them, and its
-- founder gets to make that change themselves.
--
-- So on Amora and on any un-launched instance this disables one unused row. On
-- a village with history it is a no-op. There is no third case.
--
-- ── OFF, NOT DELETED ──────────────────────────────────────────────────────
--
-- `enabled = 0`, and the row survives. There is no route in this build that
-- CREATES a mint rule: `PATCH /api/admin/economy/rules/:id` edits amount,
-- ceiling and enabled on an existing row, and the governed path after launch
-- (`shared/mintRuleKeys.ts`) offers the same three fields on the same rows.
-- Deleting the row would therefore remove the village's ability to pay
-- Gratitude for holding a seat, permanently and with no way back. The ruling
-- asked for a default that omits it, not a capability that refuses it.
--
-- Nothing is dropped, no column changes, and the previous release reads and
-- writes this table unchanged: a rollback finds a disabled rule, which is a
-- state it already understands and already renders.

-- compat-ok: data-only. No DDL. One UPDATE against `mint_rules.enabled`,
-- guarded on the rule having never issued a ledger row. The prior release
-- reads this table with no change: a disabled rule is a state it already
-- handles (`rulesFor` filters `enabled = 1`, and the Mint panel renders the
-- toggle off), so rolling back over this leaves a working village.

UPDATE `mint_rules`
   SET `enabled` = 0
 WHERE `trigger` = 'role.cycle'
   AND `token_slug` = 'gratitude'
   AND `enabled` = 1
   -- Never paid. `source = 'role_cycle'` is the tag `runSettlement` writes on
   -- every seat-holder mint, so this is the exact question "has this rule ever
   -- moved value", asked of the ledger rather than assumed.
   AND NOT EXISTS (
     SELECT 1 FROM `token_ledger`
      WHERE `token_type` = 'gratitude'
        AND `source` = 'role_cycle'
   );

-- The two credit rules the new defaults add, for a village that already
-- seeded and so will never see them from `economySeed.ts` again.
--
-- INSERT IGNORE and the same `rule-<trigger>-<token>` id the seed uses, so
-- this is the same row by the same name: a village created after this release
-- gets it from the seed at first boot and this statement finds it already
-- there. Amounts and ceilings match the seed exactly; if they ever diverge,
-- the seed is the source of truth and this file is history.
--
-- Enabled, because these ARE the new defaults and a default that ships off
-- pays nobody. A village that dislikes the number changes it; a village that
-- dislikes the token disables the rule. Both are one PATCH before launch and
-- one vote after.
--
-- Guarded on the village never having issued a credit, for the same reason as
-- the UPDATE above: switching on a new payout under a village that is already
-- running its economy is a decision for that village, not for a deploy.
--
-- ONE VILLAGE PER INSTANCE, which is why the GROUP BY is safe. `mint_rules`
-- carries a `village_id` and a unique key on (village_id, trigger,
-- token_slug), but the id these rows take is `rule-<trigger>-<token>` with no
-- village segment, and `villageId()` is the constant 'local'
-- (server/lib/economy.ts). So one instance holds one village's rules, and the
-- GROUP BY produces exactly one row. This inherits `economySeed.ts`'s own id
-- scheme rather than inventing a second one; the day this platform serves two
-- villages from one schema, that scheme is what has to change, here and there
-- together.
INSERT IGNORE INTO `mint_rules`
  (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`)
SELECT 'rule-quest.completed-credits', `village_id`, 'quest.completed', 'credits', 25, 250, 'claimant', 1
  FROM `mint_rules`
 WHERE `trigger` = 'quest.completed' AND `token_slug` = 'village-voice'
   AND NOT EXISTS (SELECT 1 FROM `token_ledger` WHERE `token_type` = 'credits')
 GROUP BY `village_id`;

INSERT IGNORE INTO `mint_rules`
  (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`)
SELECT 'rule-role.cycle-credits', `village_id`, 'role.cycle', 'credits', 25, 250, 'holder', 1
  FROM `mint_rules`
 WHERE `trigger` = 'role.cycle' AND `token_slug` = 'village-voice'
   AND NOT EXISTS (SELECT 1 FROM `token_ledger` WHERE `token_type` = 'credits')
 GROUP BY `village_id`;
