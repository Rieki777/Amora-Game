-- 0122: one counter per collection, so a whole-table write can tell whether
-- the snapshot it is writing back is still current.
--
-- WHAT WAS WRONG. `server/repos/store-db.ts` exposes `dbCollection`, whose
-- `replaceAll` is a DELETE of the whole table followed by a re-INSERT of a
-- snapshot the caller has been holding. Every caller reads with `all()`,
-- mutates, and writes back, with `await` points in between and no lock across
-- the gap. Two writers therefore both read the same state and the second one
-- to commit erases everything the first one did, with both requests answering
-- 200. Reproduced against a real MySQL before this landed: a steward's rename
-- of a tool, erased by the daily `tools-link-check` job writing back a
-- snapshot it took before the rename; and a tool the steward created
-- mid-flight, deleted outright by the same job's DELETE-all. Nine tables use
-- `dbCollection` (submissions, milestones, training_modules, investor_docs,
-- stage_events, roles, role_holders, circles, tools), and several of them are
-- edited by stewards in the admin panel while background jobs also write them.
--
-- WHAT THIS TABLE IS. One row per collection, holding a counter that is
-- incremented inside the same transaction as every write to that collection.
-- `all()` stamps the rows it hands out with the counter they were read at, and
-- `replaceAll` compares that stamp against this table under `SELECT ... FOR
-- UPDATE`. Equal means nothing happened in between and the write proceeds
-- exactly as it always did. Not equal means the snapshot is stale, and the
-- write is rebased onto the current rows instead of overwriting them.
--
-- WHY IT IS A TABLE AND NOT A NUMBER IN MEMORY. An in-process counter would
-- close the race inside one container and see nothing at all during a Railway
-- deploy, where two containers serve the same database for a few seconds. The
-- counter has to live where the data lives, and its row is also the lock: two
-- concurrent whole-table writes now serialise on it instead of interleaving.
--
-- EXPAND, NEVER CONTRACT. This adds a table and touches nothing that exists,
-- so the release before it runs unchanged against the migrated schema: the
-- previous code never reads or writes this table, and its absence of writes
-- simply leaves the counters where they are. Rolling back is safe.
--
-- `version` is unsigned and starts at 0. It only ever moves forward, and a
-- collection with no row yet is read as version 0, which is why the row is
-- created lazily rather than seeded here: the set of collections is decided in
-- code, not in SQL, and a name list in a migration would rot the first time a
-- table was added.
CREATE TABLE IF NOT EXISTS `collection_versions` (
  `collection` varchar(64) NOT NULL,
  `version` bigint unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`collection`)
);
