-- 0056: a reorganisation you can read before it is true.
--
-- Peerdom lets a structural change exist as a draft, be discussed, and then
-- publish. The reason it matters here is that a village's org chart is edited
-- live, one field at a time, by whoever has the admin page open: there is no
-- moment where the whole shape of a proposed change is visible, and no way to
-- say "this is what we would become" without becoming it first.
--
-- SCOPE IS THE ORG PLANE ONLY: seats, their circle assignment, and their
-- holders. Creating or deleting a CIRCLE is deliberately not draftable, and
-- that is a real constraint rather than an oversight. `circles` is written
-- through a dbCollection whose `replaceAll` opens its OWN transaction on its
-- OWN connection and swaps the in-memory cache after committing, so a circle
-- write cannot join anybody else's transaction and cannot be rolled back once
-- it returns. A draft that promised atomicity across both planes would be
-- lying about the half it cannot undo. `org_roles` and `org_role_assignments`
-- are raw SQL with no cache, so they CAN commit together, and that is what
-- this table promises and nothing more.
--
-- The prior values live in `before_json` on each change row, which is what
-- makes revert a read rather than a guess. The change journal cannot serve
-- that purpose: `recordEvent` swallows its own errors by design, so it is
-- lossy and an archive may not be.
CREATE TABLE IF NOT EXISTS `org_drafts` (
  `id` varchar(64) NOT NULL,
  `title` varchar(200) NOT NULL,
  `rationale` text NULL,
  -- open: still being edited. published: applied. reverted: undone.
  -- withdrawn: abandoned without applying.
  `status` enum('open','published','reverted','withdrawn') NOT NULL DEFAULT 'open',
  -- The forum decision this reorganisation belongs to, when there is one. A
  -- draft can exist without one, because a village that has not turned the
  -- forum on still deserves to see a change before it happens.
  `thread_id` varchar(64) NULL,
  `created_by` varchar(64) NULL,
  `published_by` varchar(64) NULL,
  `published_at` timestamp NULL,
  `reverted_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `org_drafts_status_idx` (`status`, `created_at`)
);

CREATE TABLE IF NOT EXISTS `org_draft_changes` (
  `id` varchar(64) NOT NULL,
  `draft_id` varchar(64) NOT NULL,
  `op` enum('create_seat','update_seat','rest_seat','seat_holder','end_holding') NOT NULL,
  -- The seat this touches. For create_seat it is the id the seat WILL have,
  -- which is why the id is chosen when the change is drafted and not at apply
  -- time: a later change in the same draft has to be able to name it.
  `org_role_id` varchar(64) NOT NULL,
  `payload` json NULL,
  -- Captured at APPLY time, not at draft time, so a revert undoes what was
  -- actually there rather than what somebody saw a fortnight ago.
  `before_json` json NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `org_draft_changes_draft_idx` (`draft_id`, `sort_order`)
);
