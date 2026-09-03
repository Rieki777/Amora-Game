-- 0130: name which integration did it, and where an org draft came from.
--
-- ── PART ONE: `health_events.origin_module_id` ───────────────────────────
--
-- 0052 added `actor_kind enum('human','agent','system','peer')` and said in
-- its own comment why: so that the first time a village dislikes something an
-- agent did, someone can name which integration it was and revoke exactly
-- that one.
--
-- Half of that sentence was never true. `actor_kind` answers "a machine did
-- this" and stops. There is no column naming WHICH machine, and revocation
-- works on the module id, because turning a module off is the lever a village
-- actually has. So an audit trail carrying `actor_kind = 'agent'` on rows
-- from three different integrations cannot tell a steward which one to turn
-- off, which is the only question that row was written to answer.
--
-- The other half was not true either, and it is a smaller and stranger gap:
-- `actor_kind` has been WRITTEN since 0052 and READ by nothing. `EventRow` in
-- server/lib/events.ts omitted the field and both readers named their columns
-- explicitly, so the value went into the table on every write and could not
-- reach a screen. Only the tests ever saw it, through raw SQL. That is fixed
-- in the same pass as this column, in code rather than here.
--
-- NULL means unattributed, and it is the honest default for every row already
-- stored: those were written before anything could name a module, and a
-- backfill would be inventing an origin for them.
--
-- ── PART TWO: `org_drafts` PROVENANCE AND CITES ──────────────────────────
--
-- `org_drafts` (0056) is the most complete machinery in the repository: draft,
-- preview, publish in one transaction, revert from `before_json` captured at
-- publish time. What it has never had is any record of WHO OR WHAT WROTE IT.
-- `created_by` is a member id and nothing else, so a draft an outside service
-- proposed is indistinguishable from one a founder typed, and the whole
-- confirm-then-own architecture rests on being able to tell those apart.
--
-- `cites` is the same column `assistant_drafts` already carries and for the
-- same reason: a proposal a member will read carries a verbatim quote and a
-- source anchor or it is held to a steward-only audience. A draft with no
-- cites is not refused, it is simply not evidenced, and the review surface
-- says so rather than implying an authority the draft does not have.
--
-- ── WHY `source_kind` IS varchar AND `source_module_id` IS NOT A KEY ─────
--
-- Same argument as 0127. An unknown provenance must be refusable in code on
-- the day it appears, not after a migration reaches thirteen instances. And a
-- foreign key onto the module registry would make a draft undeletable-by-
-- proxy once its module was removed, which inverts what the column is for.
--
-- ── EXPAND, NEVER CONTRACT ───────────────────────────────────────────────
--
-- All four are new columns. `source_kind` is NOT NULL with a DEFAULT because
-- the true answer for every draft already in the table is 'human': every one
-- of them was typed by a founder in the admin panel, since nothing else has
-- ever been able to write here. The other three are nullable, where NULL
-- means nobody said. `org_drafts` is raw SQL rather than a dbCollection, so
-- the DEFAULT applies on a write from the previous release.

ALTER TABLE `health_events`
  ADD COLUMN `origin_module_id` varchar(64) NULL;

-- "Show me everything this integration did" is the query revocation is
-- decided from, and it is the only reason this column exists.
CREATE INDEX `health_events_origin_idx` ON `health_events` (`origin_module_id`, `at`);

ALTER TABLE `org_drafts`
  ADD COLUMN `source_kind` varchar(24) NOT NULL DEFAULT 'human';

ALTER TABLE `org_drafts`
  ADD COLUMN `source_module_id` varchar(64) NULL;

-- The row in `external_proposals` this draft was built from, when there was
-- one. Not a foreign key, for the reason 0127 gives about landing tables.
ALTER TABLE `org_drafts`
  ADD COLUMN `source_proposal_id` varchar(64) NULL;

-- The evidence, as a JSON array of strings. Same column and same job as
-- `assistant_drafts.cites`.
ALTER TABLE `org_drafts`
  ADD COLUMN `cites` json NULL;

CREATE INDEX `org_drafts_source_idx` ON `org_drafts` (`source_module_id`, `status`);
