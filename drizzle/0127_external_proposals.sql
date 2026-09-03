-- 0127: where a vendor's proposals land, before a human has looked at them.
--
-- WHAT THIS IS FOR. An outside service extracts structure from a village's own
-- meetings and emails, and proposes it: roles, circles, tasks, observed risks.
-- Nothing it sends is a fact about this village until a steward has read it,
-- edited it and accepted it. This table is the inbox that makes that sentence
-- true, and it is inert by construction: nothing here is read by any renderer
-- a member sees, and the only way a row becomes real is a human pressing a
-- button that calls the same creation function the admin form calls.
--
-- ── WHY NOT `assistant_drafts`, WHICH IS ALREADY AN INBOX ────────────────
--
-- Four reasons, and the first three are enough on their own.
--
-- `DRAFT_KINDS` in shared/draftKinds.ts is `["role","circle"]` and is what
-- `checkDraft` admits, so a `task.proposed` in that queue is treated as a
-- circle. Its payload validator rejects unknown keys outright, which is
-- correct for the assistant and wrong for a vendor whose envelope carries
-- evidence and provenance the assistant has never had. `proposed_by` is
-- varchar(64) NOT NULL and both its routes refuse a draft with no named human
-- proposer, which a vendor does not have and must not be given one of.
--
-- The fourth is smaller and worth writing down because it is the one a reader
-- checks first and finds untrue: `assistant_drafts.kind` is already
-- varchar(32) rather than an enum. So widening the VOCABULARY would not have
-- needed a migration. Widening the SHAPE would have needed all three of the
-- above, which is the actual argument.
--
-- ── `kind` IS VARCHAR AND NOT AN ENUM, DELIBERATELY ──────────────────────
--
-- This is the load-bearing choice in the file. This repository names a live
-- enum ALTER as its forbidden migration class, because thirteen founder
-- instances apply drizzle/*.sql at boot, fail-loud, with no approval step.
-- An enum here would mean that the day a vendor sends a kind we have not seen,
-- the receiver cannot even REFUSE it without shipping a migration first. A
-- varchar plus a server-side allowlist refuses an unknown kind in code, on the
-- day it arrives, and the allowlist grows in a pull request rather than in
-- the schema. `trust_tier` is varchar for exactly the same reason.
--
-- `evidence` and `status` ARE enums, and the difference is who owns the
-- vocabulary. Those two are ours: `absent`/`anchored`/`quoted` is the house
-- evidence rule and `proposed`/`accepted`/`rejected`/`superseded` is the same
-- four values `assistant_drafts.status` already carries. A vendor cannot
-- widen either by sending something new, so an enum costs nothing.
--
-- ── `dedupe_key` IS NOT NULL AND UNIQUE, AND IS COMPUTED HERE ────────────
--
-- MySQL unique indexes exempt NULLs: two rows with a NULL in the key are
-- always distinct, so a nullable column inside a unique key admits unlimited
-- duplicates and the index reads as protection while providing none. CLAUDE.md
-- names this trap by name. NOT NULL is what makes the uniqueness real.
--
-- IT IS NEVER THE VENDOR'S OWN IDENTIFIER. A re-extraction of the same
-- source emits the same fact under a new page id and a new timestamp, so a key
-- derived from either stores the same claim forever. It is a sha256 over
-- (module_id, kind, source_ref, normalized_claim), with the literal string
-- `none` standing in for any part that is absent, so that a missing source_ref
-- and a source_ref of the empty string cannot hash to different rows.
-- server/lib/externalProposals.ts holds the one implementation.
--
-- ── `identity_key` IS THE OTHER HALF, AND WITHOUT IT SUPERSEDE CANNOT WORK
--
-- `dedupe_key` answers "have I seen this exact claim". Superseding asks a
-- different question: "have I seen a DIFFERENT claim about the same thing".
-- Those cannot be the same key, because a mutated payload must produce a new
-- dedupe_key by definition or the mutation would be swallowed as a duplicate.
-- So `identity_key` is the same hash with the claim left out: sha256 over
-- (module_id, kind, source_ref), same `none` sentinel. A landing row marks
-- every open row sharing its identity_key as superseded, and the two keys
-- together give both halves of the acceptance test.
--
-- It is NOT NULL and NOT unique, which is the correct pairing: several rows
-- share an identity over time and exactly one of them is open.
--
-- ── THE SIX COLUMNS THAT CAN NEVER BE BACKFILLED ─────────────────────────
--
-- `village_id`, `batch_id`, `correlation_id`, `received_at`, `subject_ref` and
-- `trust_tier` are all facts about the MOMENT a record arrived. There is no
-- later query that can recover which instance a row was meant for, which batch
-- a steward should have reviewed it inside, which of our calls it answered,
-- when it landed, who it is about, or how sure the vendor was. Every one of
-- them is here now because adding it later means adding a column full of
-- nulls for everything already stored.
--
-- ── `confidence` IS NULLABLE AND NULL IS NOT ZERO ────────────────────────
--
-- Same shape as `village_land.centre_lat` in 0123. A vendor that does not
-- score its output has said nothing, and a DEFAULT 0 would render as "this
-- vendor is certain this is wrong", which is a different and much stronger
-- claim than the one it made. Readers print "not stated" for NULL.
--
-- ── NO FOREIGN KEYS ──────────────────────────────────────────────────────
--
-- `module_id`, `subject_ref` and `created_ref` all name things in other
-- tables, and none of them is a foreign key. A new UNIQUE index or FOREIGN
-- KEY on an existing table is on this repository's never-in-the-same-release
-- list, and beyond that the point of a landing table is that it accepts a
-- reference to something that does not exist and keeps the row: the row
-- survives with the reference nulled, so a steward can see what the vendor
-- believed rather than losing the record to a constraint.

CREATE TABLE IF NOT EXISTS `external_proposals` (
  `id` varchar(64) NOT NULL,

  -- Which instance this was meant for, from instanceIdentity().instanceId.
  -- A village that restores another village's backup must be able to tell the
  -- two apart, and after the fact there is nothing to read it off.
  `village_id` varchar(64) NOT NULL,

  -- WHICH INTEGRATION SENT IT. This is the grain revocation actually works
  -- on: turning a module off is the lever a village has, so every row that
  -- module produced has to be findable by that id alone.
  `module_id` varchar(64) NOT NULL,

  -- One id per proposal batch, so a steward reviews a set together and a bad
  -- batch is rejected as a batch rather than forty times.
  `batch_id` varchar(64) NOT NULL,

  -- Ours when the call originated here, theirs otherwise. Written by
  -- callVendor's correlation id in server/lib/integrations.ts.
  `correlation_id` varchar(64) NULL,

  -- See the note above: varchar so that an unknown kind can be REFUSED
  -- without shipping a migration first.
  `kind` varchar(64) NOT NULL,
  `payload` json NOT NULL,

  -- ── THE EVIDENCE BLOCK ─────────────────────────────────────────────────
  -- The house rule is that anything a member will read carries a verbatim
  -- quote, a source anchor and a time, or it is held to a steward-only
  -- audience. These three columns are what that rule reads.
  `quote` text NULL,
  `source_ref` varchar(400) NULL,

  -- datetime and not timestamp, on purpose. This is the vendor's clock, not
  -- ours: it is when the thing actually happened, which for a historical
  -- import can be a meeting in 1998 or a commitment dated past 2038. timestamp
  -- covers 1970 to 2038 and would refuse or wrap both. `received_at` below IS
  -- our clock and is a timestamp like every other one in this schema.
  `source_occurred_at` datetime NULL,

  -- An opaque reference to a person, issued by us. NEVER an email address and
  -- never our internal member id.
  `subject_ref` varchar(200) NULL,

  -- extracted_unreviewed | machine_confirmed | human_reviewed. Three values
  -- rather than two: a record a vendor's own extraction marked confirmed
  -- because a transcript recorded a decision is a different thing to a steward
  -- than a record a human approved. varchar for the reason in the header.
  `trust_tier` varchar(40) NOT NULL DEFAULT 'extracted_unreviewed',

  -- The vendor's own score for how much this matters, and how sure it is.
  -- Both nullable, and NULL means not stated. See the header: zero is a
  -- claim and silence is not.
  `significance` decimal(6,3) NULL,
  `confidence` decimal(6,3) NULL,

  -- How well evidenced, computed here from the block above and never taken
  -- from the wire. Ours, so an enum costs nothing.
  `evidence` enum('quoted','anchored','absent') NOT NULL DEFAULT 'absent',

  -- Who may ever see this. Defaults to steward, which is what the evidence
  -- rule requires of a record with no verbatim quote behind it.
  `audience` enum('steward','member') NOT NULL DEFAULT 'steward',

  -- See the header. Both NOT NULL; only the first is unique.
  `dedupe_key` char(64) NOT NULL,
  `identity_key` char(64) NOT NULL,

  `status` enum('proposed','accepted','rejected','superseded') NOT NULL DEFAULT 'proposed',
  `decided_by` varchar(64) NULL,
  `decided_at` timestamp NULL,
  `decided_note` text NULL,

  -- What the accept created, so a steward can walk from the proposal to the
  -- thing it became. Same column and same job as assistant_drafts.created_ref.
  `created_ref` varchar(64) NULL,

  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `external_proposals_dedupe_uq` (`dedupe_key`),
  KEY `external_proposals_identity_idx` (`identity_key`, `status`),
  KEY `external_proposals_queue_idx` (`status`, `batch_id`, `received_at`),
  KEY `external_proposals_module_idx` (`module_id`, `status`),
  KEY `external_proposals_village_idx` (`village_id`, `received_at`)
);

-- ── WHAT WAS DROPPED, COUNTED RATHER THAN SILENT ───────────────────────────
--
-- A record carrying an email address in any field is dropped whole and never
-- stored, because storing it to report it would be the leak. A record whose
-- kind is not on the allowlist is refused the same way. Neither can leave a
-- row in the table above by definition, so the only honest place for the
-- count is its own table: without it the receiver's drop rate is a number that
-- exists for one request and then does not exist at all, and a steward reading
-- "nothing arrived today" cannot tell that apart from "everything arrived and
-- all of it was refused".
--
-- One row per (module, day, reason), incremented. It holds no vendor content:
-- a reason and a count, which is exactly what makes it safe to keep for a
-- record we refused to store.
CREATE TABLE IF NOT EXISTS `external_proposal_drops` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL,
  `module_id` varchar(64) NOT NULL,
  `on_day` date NOT NULL,

  -- Why it was refused: 'contained_an_email', 'unknown_kind', and whatever
  -- else the receiver learns to refuse. varchar for the same reason `kind` is.
  `reason` varchar(64) NOT NULL,
  `dropped` int unsigned NOT NULL DEFAULT 0,
  `last_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `external_proposal_drops_day_uq` (`module_id`, `on_day`, `reason`),
  KEY `external_proposal_drops_day_idx` (`on_day`)
);
