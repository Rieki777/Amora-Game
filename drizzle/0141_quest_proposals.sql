-- 0141: a proposed quest is its own table, because a quest cannot be a draft.
--
-- ── WHY THIS CANNOT BE A STATUS VALUE ON `quests` ────────────────────────
--
-- It is worth stating as three facts, because each one alone is enough and
-- together they mean a `status = 'draft'` row would be live work.
--
--   GET /api/quests is `res.json(await questsRepo.all())`. Public, unfiltered,
--   every row (server/routes/quests.ts).
--
--   The board renderer never reads status. A draft would paint exactly like
--   an open quest.
--
--   POST /api/game/quests/:id/claim never reads status either. It checks the
--   example flag, the stage floor and the role gate, and then writes a claim.
--
-- So a row inserted as a draft would sit publicly on the board and be
-- claimable by any member, and consenting to that claim mints recognition
-- from the faucet. A proposal must therefore live somewhere the quest board
-- cannot see, and that is a different table rather than a different value.
--
-- ── THE LINE BETWEEN WHAT A MACHINE MAY WRITE AND WHAT A HUMAN MUST ──────
--
-- THE REWARD AND THE GATE COLUMNS ARE NOT IN THIS TABLE. That is the whole
-- design and it is why this file is short.
--
-- `quests.gratitude` is the advertised label, verbatim, and under the default
-- cap mode the advertised label IS the payout contract: writing that column
-- sets what the faucet will pay. `stay_credit_reward` releases the other
-- currency. `min_stage` and `requires_role` are the two gates the claim route
-- actually enforces. A vendor that could write any of the five would be
-- setting the price of work and who may do it.
--
-- The obvious design is to carry them here and refuse a vendor write. This
-- table does the stronger thing: the columns DO NOT EXIST, so there is no
-- write to refuse and no future route that can forget to refuse it. The
-- accept route takes the reward and the gates from the request body, which
-- means a human typed them into a form, and hands them to `questsRepo.add`
-- with the prose from this row.
--
-- `gratitude_min` and `gratitude_max` are absent for a different reason: they
-- are DERIVED from the label by shared/questRewards.ts inside the repository's
-- own save path and are never authored anywhere, including by admins.
--
-- ── ACCEPT CALLS `questsRepo.add`, THE SAME FUNCTION THE ADMIN FORM CALLS ─
--
-- Not a second insert. Every invariant that path carries, including the
-- reward-range parse and the calendar write for a quest with a window, is
-- inherited rather than reimplemented. This is the same rule the assistant
-- draft queue follows and it is the reason neither queue is a second write
-- path into the domain.
--
-- ── DEDUPE, SAME SHAPE AS 0140 ──────────────────────────────────────────
--
-- NOT NULL and unique, because MySQL unique indexes exempt NULLs and a
-- nullable dedupe column admits unlimited duplicates. Computed from the
-- proposal's own content, never from a vendor timestamp.

CREATE TABLE IF NOT EXISTS `quest_proposals` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL,

  -- The integration that proposed it, for the same revocation reason as 0140.
  -- 'local' for a proposal the village's own assistant wrote.
  `module_id` varchar(64) NOT NULL DEFAULT 'local',
  `batch_id` varchar(64) NOT NULL,
  `correlation_id` varchar(64) NULL,

  -- The row in `external_proposals` this came in on, when it came from
  -- outside. Nullable and not a foreign key: the landing row may be pruned
  -- long before the quest it became is retired.
  `source_proposal_id` varchar(64) NULL,

  -- ── THE PROSE LAYER, WHICH A MACHINE MAY FILL ──────────────────────────
  -- Every one of these is words on a page. None of them gates anything and
  -- none of them moves value.
  `title` varchar(200) NOT NULL,
  `subtitle` varchar(300) NULL,
  `description` text NULL,
  `impact` text NULL,
  `story` text NULL,
  `first_step` text NULL,
  `steps` json NULL,
  `deliverable` text NULL,
  `tips` json NULL,
  `tags` json NULL,
  `duration` varchar(80) NULL,
  `difficulty` varchar(40) NULL,
  `circle` varchar(120) NULL,
  `icon` varchar(80) NULL,

  -- `role_required` is the free-text display prose ("Requires: green thumb"),
  -- which is enforced by nothing and is therefore safe for a machine to write.
  -- Its structured sibling `requires_role` IS enforced and is deliberately
  -- absent from this table. The two have confusingly similar names in
  -- `quests`, so the difference is written down here rather than assumed.
  `role_required` varchar(200) NULL,

  -- Why this quest, in the proposer's own words, plus the evidence behind it.
  -- Same rule as everywhere else: a claim a member will read carries a
  -- verbatim quote and an anchor or it stays with the steward.
  `rationale` text NULL,
  `quote` text NULL,
  `source_ref` varchar(400) NULL,

  `dedupe_key` char(64) NOT NULL,
  `status` enum('proposed','accepted','rejected','superseded') NOT NULL DEFAULT 'proposed',

  -- Nullable, unlike assistant_drafts.proposed_by, because a vendor has no
  -- member account and must never be given one. `proposed_by_kind` says
  -- which sort of proposer it was without inventing an account for it.
  `proposed_by` varchar(64) NULL,
  `proposed_by_kind` varchar(24) NOT NULL DEFAULT 'agent',

  `decided_by` varchar(64) NULL,
  `decided_at` timestamp NULL,
  `decided_note` text NULL,

  -- The quest id this became.
  `created_ref` varchar(64) NULL,

  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `quest_proposals_dedupe_uq` (`dedupe_key`),
  KEY `quest_proposals_queue_idx` (`status`, `batch_id`, `received_at`),
  KEY `quest_proposals_module_idx` (`module_id`, `status`)
);
