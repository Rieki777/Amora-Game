-- 0101: the meter (round 5, lane METER).
--
-- R58c, the founder: "let's leave it all $ReGen awards to all modules based on
-- usage and making them all free to use for any villages as a default."
--
-- Nothing in this platform measured module usage. `module_events` is lifecycle,
-- config and listing. `integration_health` records whether the LAST call worked
-- and carries no count. `tool_clicks` counts clicks on cards inside one module.
-- `assistant_usage` counts tokens. So a pool that pays "based on usage" had no
-- usage to read, and `shared/modulePool.ts` says in its own header that it
-- deliberately does not know whether a village runs a module. These two tables
-- are the smallest thing that makes the ruling arithmetic instead of intent.
--
-- No CHARSET clause, deliberately: `user_id` joins `users`.`id`, and a table
-- that pins its own collation cannot be joined across the era split (0078's
-- header, and the collation-split trap). No foreign keys, house norm. `--`
-- comments sit on their own lines and never end in `;` (the 0015 trap: the
-- runner splits statements on line-final `;`).

-- ── THE UNIT OF ACCOUNT IS THE MEMBER-CYCLE, NEVER THE REQUEST ──────────────
--
-- One member, one module, one lunar cycle counts exactly 1, however many times
-- they open it and however much they write in it. That single choice is what
-- makes the measure hard to game, and it defeats the two failure modes the
-- founder named in one stroke:
--
--   A module that rewards PAGE VIEWS rewards noise. A panel that refreshes
--   itself every thirty seconds would out-earn a module a village opens once a
--   month and trusts completely. Here the five-hundredth view of the cycle
--   adds zero.
--
--   A module that rewards WRITES rewards nagging. A daily check-in prompt
--   would out-earn the module holding the village's land agreements, and any
--   module can multiply its score by splitting one action into six rows. Here
--   the thirtieth write of the cycle adds zero.
--
-- The only way to score is to be opened by MORE DIFFERENT PEOPLE, which is the
-- one thing a module cannot manufacture without actually being wanted.
--
-- It is also why this is cheap. A saturating count does not need a counter on
-- every request: it needs a presence bit that is written once and then never
-- again. `server/lib/moduleUsage.ts` holds the bits it has already written in
-- memory, so after a member's first touch of a module in a cycle, every later
-- request costs zero writes. Worst case for a village of four hundred active
-- members across twenty-three modules is about nine thousand inserts per lunar
-- month, which is the write amplification objection answered rather than
-- deferred.

-- ── WHY THE MARKS ARE TEMPORARY AND THE AGGREGATE IS FOREVER ────────────────
--
-- Distinct-counting needs to know WHO, and knowing who is exactly the shape the
-- founder refused: "usage counts must not become a way to see what an
-- individual member did." So the identity lives only while the cycle is open.
-- The rollup in `server/lib/moduleUsage.ts` seals a closed cycle into
-- `module_usage_cycles` and DELETES its marks in the same pass. History is
-- aggregate, always, and there is no longitudinal record of any member's module
-- habits for anyone to read, subpoena or leak.
--
-- A salted hash of `user_id` was considered here and dropped on purpose. The
-- salt would have to live beside the data, so it defends against nobody who can
-- read the table, and the only real property it buys is unlinkability across
-- cycles. Deleting the rows at seal already buys that, completely, so the hash
-- would have been ceremony that reads as protection. What is true, and is all
-- that is claimed: during an open cycle this table says which members opened
-- which modules, to anyone holding the database. `health_events` already
-- records the same fact with a timestamp and a sentence, so this adds no reach
-- an operator did not have. After the seal it says nothing about anybody.
--
-- All three key columns are NOT NULL because they are a dedupe key, and MySQL
-- UNIQUE indexes exempt NULLs: one nullable column here would admit infinite
-- duplicate marks and quietly inflate the module's reach.

-- NO SECOND INDEX. Every read of this table filters on `cycle_id` first, and
-- `cycle_id` is the leftmost column of the primary key, so the primary key
-- already serves them. A separate `KEY (cycle_id)` would never be chosen by the
-- planner and every single mark insert would pay to maintain it, on the one
-- table in this pair that is written on the request path.

CREATE TABLE IF NOT EXISTS `module_usage_marks` (
  `cycle_id` varchar(24) NOT NULL,
  `module_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `first_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cycle_id`, `module_id`, `user_id`)
);

-- ── THE DURABLE AGGREGATE ───────────────────────────────────────────────────
--
-- `members_reached` is how many distinct members opened this module in this
-- cycle. `active_members` is how many distinct members opened ANY module in it,
-- and it is the denominator that makes a small village legible: three members
-- of four is 0.75 and three of four hundred is 0.0075, which is the founder's
-- own example and the reason a raw count would have been wrong.
--
-- The denominator is ACTIVE members and never registered members. A village of
-- four hundred where four people show up should measure its modules against the
-- four who were there; otherwise a sleepy village drags every module it runs
-- toward zero and no module can earn anything in it, which would pay builders
-- for a village's health rather than for their own work.
--
-- `active_members` is denormalised onto every module's row rather than kept in a
-- table of its own. One writer fills every row for a cycle in a single pass, so
-- the copies cannot disagree, and a row that carries its own denominator is a
-- row the hub can read and check without a join or a second fetch.
--
-- A module nobody opened gets no row. That is honest: zero reach and no row are
-- the same fact, and a cycle in which nothing at all was opened has nothing to
-- distribute.
--
-- A ROW HERE ONLY EVER EXISTS SEALED, which is why `sealed_at` is NOT NULL.
-- The open cycle is never written here: its counts are read live off the marks
-- by `openCycleUsage`, so there is exactly one copy of a number that is still
-- moving and no second place for it to go stale. The pool may only ever be
-- computed from a sealed cycle, because distributing an open one pays out an
-- amount that changes after it is paid.

CREATE TABLE IF NOT EXISTS `module_usage_cycles` (
  `cycle_id` varchar(24) NOT NULL,
  `module_id` varchar(64) NOT NULL,
  `members_reached` int NOT NULL DEFAULT 0,
  `active_members` int NOT NULL DEFAULT 0,
  `sealed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cycle_id`, `module_id`)
);
