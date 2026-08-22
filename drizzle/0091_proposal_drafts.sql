-- 0090: Wizard drafts, held by the server (round 5, lane G2, GOV_DESIGN section 4).
--
-- The harvest flagged exactly one upgrade over Hypha's wizard: their drafts
-- live in localStorage, so a half-written proposal dies with the browser that
-- typed it. This table is that upgrade. A draft is one member's unfinished
-- proposal: which wizard it belongs to, everything typed so far, and the step
-- they walked away from, so Continue reopens where they stopped rather than at
-- the beginning.
--
-- Drafts are private to their author, capped per member, and deleted on
-- publish. Nothing here is a proposal: a draft has no supports, no ballot and
-- no standing, and it never appears on a governance surface anyone else reads.
--
-- No CHARSET clause, deliberately: the table inherits the database's collation
-- because user_id joins users.id (0078's header, and the collation-split trap).
-- No FK constraints, house norm. `--` comments sit on their own lines and never
-- end in `;` (the 0015 trap: the runner splits statements on line-final `;`).

CREATE TABLE IF NOT EXISTS `proposal_drafts` (
  `id` varchar(40) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- Which wizard: role_application | mechanics | agreement | badge_grant | quest_payout.
  -- A varchar rather than an enum, because the type list is the wizard config's
  -- to grow and a proposal type is not a schema change.
  `wizard_type` varchar(24) NOT NULL,
  -- Everything typed so far, as the wizard's own shape. Read back only by the
  -- wizard that wrote it, so no column here mirrors a field.
  `payload` json NOT NULL,
  -- The step the author walked away from. Continue reopens here.
  `step_index` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The one read this table serves: my drafts, most recently touched first.
  KEY `proposal_drafts_user_idx` (`user_id`, `updated_at`)
) ENGINE=InnoDB;
