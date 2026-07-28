-- 0039: a charge can exist without a member behind it.
--
-- S69 opened checkout to people who are not signed in -- a fee, a donation,
-- a deposit, a waitlist place. Those are exactly the purchases a stranger
-- makes, and exactly the ones most likely to be disputed. But `user_id` was
-- NOT NULL, so the settle path had to skip recordFiatCharge for them, and
-- fiat_charges is the ONLY table mapping a Stripe payment intent back to an
-- order. An anonymous purchase was therefore structurally irreversible: a
-- chargeback arrived, matched nothing, and the alert said only "matched no
-- known charge" while the purchase sat marked paid forever.
--
-- Nullable user_id closes that. The per-member spend caps are unaffected:
-- they aggregate WHERE user_id = ?, and a NULL never matches, which is the
-- correct answer -- an anonymous charge belongs to no member's cap.
ALTER TABLE `fiat_charges`
  MODIFY COLUMN `user_id` varchar(64) NULL;
