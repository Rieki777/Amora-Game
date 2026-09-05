-- THE QUORUM BASE FREEZES AT OPEN, so the denominator cannot be moved under a
-- ballot that is already running.
--
-- WHAT WAS BROKEN
--
-- The snapshot law (Ring 0, and 20.8 asking for it to be proved) says a vote is
-- counted against the day it opened. `ballot_electorate` froze the roll and its
-- weights on day one. 19G then made part of that roll sit OUTSIDE the quorum
-- fraction: a seat speaking for a being is excluded unless the village says
-- otherwise, and when it is included, weight that provably cannot answer leaves
-- the denominator too.
--
-- Which seats those are, and the two dials that decide it, were read at CLOSE:
--
--   `governance.nonhuman_in_quorum`  read through `stringVar` in
--                                    `quorumFactsFor`, at the close.
--   `governance.absent_cycles`       the same.
--   `roles.represents_being`         probed by `seatFacts`, at the close.
--
-- `governance.nonhuman_in_quorum` is an ordinary open-ring dial, so an admin
-- could flip it through `PUT /api/admin/variables/:key` while a ballot ran and
-- change whether that ballot reached quorum, with the frozen roll unchanged and
-- nothing on the ballot recording that the base had moved. Seating a being's
-- representative mid-ballot did the same thing without touching a dial at all.
-- Both moved a bar after people had already voted against it.
--
-- WHAT THIS DOES
--
-- The answer is stamped at open, inside the same transaction that writes the
-- roll, and every later reader reads the stamp.
--
--   `ballots.quorum_base_weight`        the denominator, in the same units and
--                                       the same type as `total_weight`.
--   `ballots.quorum_nonhuman_included`  the dial as it stood at open.
--   `ballots.quorum_seats_known`        whether the roles plane could answer at
--                                       open. "Could not tell" is a different
--                                       fact from "no seat speaks for a being"
--                                       and both surfaces render it that way.
--   `ballot_electorate.quorum_exclusion` per seat, WHY its weight sits outside
--                                       the count, or NULL for a seat inside
--                                       it. The numerator needs the same set
--                                       the denominator was built from, so it
--                                       is frozen beside the weight it belongs
--                                       to rather than recomputed later.
--
-- The two `ballots` columns are the audit record a village can read back: this
-- vote was counted against this base, under this setting. The per-seat column
-- is what the arithmetic replays.
--
-- SAFE ON A LIVE VILLAGE
--
-- Additive and nullable, so no boot-time rewrite of a table that carries every
-- decision a village ever made. A ballot opened before this migration carries
-- NULL in all four, which reads as "nothing frozen was excluded, and the Game
-- could not tell": the same answer the live probe gave every village that has
-- named no beings, which is every village today. It is also a FROZEN answer, so
-- from this migration forward no ballot's denominator moves for any reason,
-- including the ones already resting.

ALTER TABLE `ballots` ADD COLUMN `quorum_base_weight` decimal(18,4) NULL;
ALTER TABLE `ballots` ADD COLUMN `quorum_nonhuman_included` tinyint(1) NULL;
ALTER TABLE `ballots` ADD COLUMN `quorum_seats_known` tinyint(1) NULL;

ALTER TABLE `ballot_electorate` ADD COLUMN `quorum_exclusion`
  enum('speaks_for_a_being','cannot_vote') NULL;
