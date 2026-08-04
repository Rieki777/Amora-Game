-- 0054: the links between seats and circles that a village names for itself.
--
-- Peerdom lets an organisation define its own relationship types instead of
-- shipping an enum, and that is the right call: a village will ask for deputy,
-- mentor, successor, prerequisite and two more nobody predicted, and each one
-- as its own column or table is six migrations for one idea.
--
-- ENDPOINTS ARE NODES, NEVER PEOPLE. A relation joins a seat or a circle to
-- another seat or circle, and there is deliberately no `user` endpoint kind.
-- "Ada mentors Bo" is a statement about two people that would then have to be
-- kept out of the public export by filtering, and filtering is how leaks
-- happen. "The Water Steward seat is deputised by the Gate Steward seat" says
-- the useful part, survives both holders leaving, and is safe to publish
-- BY CONSTRUCTION rather than by remembering.
--
-- `is_cover` is what stops this being a table nobody reads. The health
-- dashboard already reports seats with no second holder; a seat with a named
-- deputy is a different risk from one without, and this flag is how the read
-- can tell. A village that renames or deletes the deputy type keeps that
-- meaning, because the flag rides on the type rather than on its label.
CREATE TABLE IF NOT EXISTS `org_relation_types` (
  `id` varchar(64) NOT NULL,
  `label` varchar(80) NOT NULL,
  -- What the link reads as from the OTHER end. For a symmetric type this is
  -- the same words, and the column still carries them so every read can print
  -- a direction without branching.
  `inverse_label` varchar(80) NOT NULL,
  `symmetric` tinyint(1) NOT NULL DEFAULT 0,
  -- Does holding this link mean somebody else can carry the seat?
  `is_cover` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `org_relations` (
  `id` varchar(64) NOT NULL,
  `type_id` varchar(64) NOT NULL,
  `from_kind` enum('org_role','circle') NOT NULL,
  `from_id` varchar(64) NOT NULL,
  `to_kind` enum('org_role','circle') NOT NULL,
  `to_id` varchar(64) NOT NULL,
  `note` varchar(280) NULL,
  `created_by` varchar(64) NULL,
  `is_example` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One link of one type between one pair. Saying the same thing twice is a
  -- double-click, not a second relationship.
  UNIQUE KEY `org_relations_uq` (`type_id`, `from_kind`, `from_id`, `to_kind`, `to_id`),
  -- Both directions are read constantly: every seat page asks "what points at
  -- me" as well as "what do I point at".
  KEY `org_relations_from` (`from_kind`, `from_id`),
  KEY `org_relations_to` (`to_kind`, `to_id`)
);
