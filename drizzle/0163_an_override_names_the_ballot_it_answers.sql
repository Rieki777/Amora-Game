-- AN OVERRIDE NAMES THE BALLOT IT ANSWERS, so a payout a steward stopped has a
-- door back.
--
-- ── WHAT WAS BROKEN ────────────────────────────────────────────────────────
--
-- 19D lets a seated steward fail a TOKEN SEND by voting no at the close. 19E
-- lets the village bring the same decision back, pass it at the highest tier it
-- has set for itself, and land it whatever any steward says. Between those two
-- sentences there was no door at all.
--
-- The override was keyed on `mechanics_proposals.supersedes_proposal_id`, and
-- `isOverride` opened with "does this subject have a proposal row?". A
-- `token_send`, a `quest_payout` and a `founding_allocation` have no proposal
-- row: they are the three subjects the steward's no can fail, and they were the
-- three the override could never be asked about. A payout blocked by a steward
-- was blocked forever, at every tier, with nothing the village could pass to
-- answer it.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
--
-- The key moves onto the BALLOT, which every subject type has. Two columns, the
-- same pair `mechanics_proposals` has carried since 0144 and the same three
-- words: `supersedes_ballot_id` names the decision this one comes back from and
-- `supersedes_relation` says how it relates to it. The relation stays explicit
-- for the reason 0144 gave: a renewal and a withdraw-and-rewrite clone also
-- point backwards, and neither is the village answering a veto at its highest
-- bar.
--
-- Both doors now read one pair. `recordVeto` asks it before it lets a steward
-- stop a row inside the window, and the steward's no vote asks it before it
-- fails a payout at the close, so the two doors cannot end up with two
-- different rules about the same resubmission.
--
-- ── SAFE ON A LIVE VILLAGE ─────────────────────────────────────────────────
--
-- Additive and nullable. Every ballot already resting carries NULL in both,
-- which reads as "this one comes back from nothing", and that was true of every
-- one of them: until this migration no ballot could say otherwise.

ALTER TABLE `ballots` ADD COLUMN `supersedes_ballot_id` varchar(64) NULL;
ALTER TABLE `ballots` ADD COLUMN `supersedes_relation`
  enum('renews','overrides','replaces') NULL;

-- Read in one direction only, from the resubmission to the decision it answers,
-- and once per veto attempt. The index is here for the other direction: "what
-- came back from this one", which the record of a stopped decision wants beside
-- the reason it was stopped.
CREATE INDEX `ballots_supersedes_idx` ON `ballots` (`supersedes_ballot_id`);
