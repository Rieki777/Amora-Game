-- 0098: the village holds a power, and the gate knows it (round 5, lane G-B).
--
-- R54, the founder's ruling: "these villages are meant to be taken over by
-- the electorate to run the game and put the admins out of a full time job."
--
-- Until this table existed no power could leave the admin panel, in any form.
-- `if (ctx.isAdmin) return true;` was the first line of the one gate, so
-- every capability answered "yes" for an admin before anything else was
-- consulted, and every surface that said the village held something was
-- describing a role grant that an admin passed straight over. The handover
-- had no substrate. This is the substrate: one row per power, naming who
-- holds it, and the gate reads it live.
--
-- WHAT A ROW MEANS. "This village has taken this power on. An admin no
-- longer passes this gate by being an admin." An admin who holds the role
-- still acts, and acts AS the holder. An admin who holds nothing has to
-- break the glass in the open, which writes a public event and notifies the
-- village, because a ceiling with no witness is a speed bump.
--
-- WHAT A ROW IS NOT. It is not a lock. Transfer is reversible on purpose:
-- the platform ships to forks whose operator did not choose any of this and
-- may not be able to pull a redeploy, so losing the ability to unwind a
-- capture would be the platform failing a village it is custodian of. The
-- witness is what makes it real, never the irreversibility.
--
-- No CHARSET clause, deliberately: this table inherits the database's
-- collation because `holder_role_id` joins `roles`.`id` and `moved_by_user_id`
-- joins `users`.`id` (0078's header, and the collation-split trap). No
-- foreign keys, house norm. `--` comments sit on their own lines and never
-- end in `;` (the 0015 trap: the runner splits statements on line-final `;`).

-- ── WHY THE CAPABILITY IS THE PRIMARY KEY ───────────────────────────────────
--
-- A power has one holder. Two rows for `library.keep` would be a question
-- with two answers on the page a member opens to ask who looks after the
-- library, and the gate would have to pick one, which is a coin toss wearing
-- a permission check. The village can seat several PEOPLE in the holding
-- role; that is the role's business and it is what `seats` is for.
--
-- `moved_by_ballot_id` is nullable because the first writer is an admin route
-- (a village cannot vote to take a power before there is anything to take,
-- and lane G-C's transfer ballot needs something to act on). A row with a
-- ballot id is a power the village voted itself; a row without one is a power
-- an admin handed over. Both are real, and the difference is worth reading
-- off the record a year later, so it is a column and not a shrug.

CREATE TABLE IF NOT EXISTS `capability_holding` (
  `capability` varchar(64) NOT NULL,
  `holder_role_id` varchar(64) NOT NULL,
  `moved_by_ballot_id` varchar(64) NULL,
  `moved_by_user_id` varchar(64) NULL,
  `moved_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(500) NULL,
  PRIMARY KEY (`capability`),
  KEY `idx_capability_holding_role` (`holder_role_id`)
);
