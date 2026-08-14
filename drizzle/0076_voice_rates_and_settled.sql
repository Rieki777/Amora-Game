-- 0076: the voice rates a village actually holds, and an account that means something.
--
-- Two corrections to what 0071/0072 seeded, both found by an adversarial pass
-- over the claim work rather than by anything failing.

-- ── 1. The rates ────────────────────────────────────────────────────────────
--
-- `seedEconomy` writes mint_rules with INSERT IGNORE against the natural key,
-- deliberately, so an amount a village edited is never restored to a platform
-- default by a redeploy. That is the right rule and it is not changing here.
--
-- The consequence nobody costed: raising the seeded voice rates from 0.1/0.5 to
-- 10/50 in the source only reaches a database that has NEVER run the seed. Every
-- village already booted keeps 0.1 voice per confirmed quest, while
-- `economy.voice_claim_threshold` is a NEW dial and therefore takes its new
-- default of 100 everywhere at once. A member would have needed a thousand
-- confirmed quests to claim, and the Mint panel would have told them the
-- threshold was ten quests' work.
--
-- Scoped to rows STILL HOLDING THE OLD SEEDED VALUES. A village that has
-- deliberately set its own number keeps it: this repairs a default that was
-- never chosen, and it is not a licence to overwrite a choice.
UPDATE `mint_rules`
   SET `amount` = 10, `ceiling` = 100
 WHERE `trigger` = 'quest.completed'
   AND `token_slug` = 'village-voice'
   AND `amount` = 0.1
   AND `ceiling` = 1;

UPDATE `mint_rules`
   SET `amount` = 50, `ceiling` = 200
 WHERE `trigger` = 'role.cycle'
   AND `token_slug` = 'village-voice'
   AND `amount` = 0.5
   AND `ceiling` = 2;

-- ── 2. An account whose balance can be checked ──────────────────────────────
--
-- 0072 left confirmed voice at `sys:voice-bridge` for ever, described as the
-- truthful record of voice that settled somewhere else. It is truthful and it is
-- useless: the bridge balance then equals (voice held against open claims) plus
-- (every claim ever confirmed), which is a number nothing can be compared
-- against. The one account whose label says exactly what it holds was the one
-- account in this ledger with no checkable meaning.
--
-- Splitting them makes an invariant available that would catch nearly every way
-- this module can go wrong:
--
--     balance(sys:voice-bridge) == SUM(amount) of voice_claims in 'requested'
--
-- A stranded claim, a refund that silently failed, a debit posted twice: all of
-- them break that equality, and none of them break conservation on their own.
--
-- NOT a faucet, for the same reason the bridge is not: this voice came from a
-- member. A faucet here would let a settlement create the voice it settles.
--
-- Safe to run before the dispatch exists: no claim has ever been confirmed on
-- any deployment, because nothing can raise a proposal yet, so there is no
-- historical balance to move.
INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES
  ('sys:voice-settled', 'system', NULL, 'Voice that settled on Hypha', 0);
