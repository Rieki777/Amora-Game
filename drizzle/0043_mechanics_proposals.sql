-- Mechanics proposals: propose-on-the-page (Game Mechanics initiative).
--
-- A proposal is an immutable CHANGE-SET (JSON array of {key, from, to})
-- captured at creation time, plus the human story around it. The lifecycle
-- this phase can honestly run:
--
--   draft         a member below the proposer bar wrote it; it opens when a
--                 qualified member sponsors it (the on-ramp, not a wall)
--   open          gathering in-game support (the sensing step)
--   withdrawn     the proposer or an admin closed it unactioned
--   to_hypha      taken to the DAO for the binding vote (the copy step today,
--                 the bridge handoff next phase)
--   passed_claimed the proposer says it passed and left the Hypha reference,
--                 awaiting verification -- HUMAN verification this phase,
--                 the Alchemy webhook when the bridge lands
--   applied       an admin (later: the verified webhook) applied the set;
--                 every applied key also writes a mechanics_changes row with
--                 source 'governance' and this proposal's reference
--
-- The change_set column is append-only in spirit: nothing ever edits it
-- after creation. A changed mind is a withdrawal and a new proposal, so the
-- record of what was voted on can never drift from what was proposed.
--
-- Supports and sponsorships live in their own keyed table (not JSON on the
-- row) so two members backing at once is two INSERT IGNOREs, never a lost
-- read-modify-write. PK covers (proposal, user, kind): one support and one
-- sponsorship per member per proposal, idempotent by construction.
-- House rule: no comment line in this file may end with a semicolon
CREATE TABLE IF NOT EXISTS `mechanics_proposals` (
  `id` varchar(64) NOT NULL,
  `title` varchar(200) NOT NULL,
  `rationale` text NOT NULL,
  `change_set` json NOT NULL,
  `proposer_user_id` varchar(64) NOT NULL,
  `status` enum('draft','open','withdrawn','to_hypha','passed_claimed','applied') NOT NULL DEFAULT 'open',
  `hypha_ref` varchar(500) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `mechanics_proposals_status_idx` (`status`, `created_at`),
  KEY `mechanics_proposals_proposer_idx` (`proposer_user_id`, `created_at`)
);

CREATE TABLE IF NOT EXISTS `mechanics_proposal_backers` (
  `proposal_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `kind` enum('support','sponsor') NOT NULL,
  `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`proposal_id`, `user_id`, `kind`)
);
