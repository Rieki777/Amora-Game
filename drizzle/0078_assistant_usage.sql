-- 0078: what each assistant call actually cost.
--
-- Token counts cannot be reconstructed from `rate_hits`. That table counts
-- events in a bucket: it knows a mode was called forty times today, and
-- nothing at all about whether those forty calls read a hundred tokens each
-- or a hundred thousand. The two questions a single biller has to answer,
-- "what does one past-tense answer cost" and "which village is the spend",
-- are both invisible to a counter. Anthropic returns the real numbers in
-- every response body and nothing has ever written them down.
--
-- Append-only operations data. It is not the ledger: no row here is a token,
-- nothing in it moves value, and no boot invariant reads it.
--
-- `village_id` comes from instanceIdentity(), minted once at first boot and
-- deliberately not configurable, so a rollup across a library of villages
-- keys on something no deployment can spoof from its own config. It and
-- `user_id` are the two columns that cannot be backfilled, which is why they
-- go in ahead of the billing work that will read them.
--
-- No CHARSET clause, deliberately. Seven earlier migrations ended their
-- CREATE TABLE with a bare `DEFAULT CHARSET=utf8mb4`, which on MySQL 8 takes
-- the character set's own default collation and NOT the database's, and every
-- join across that boundary died with ER_CANT_AGGREGATE_2COLLATIONS. The
-- other thirty-five name nothing and inherit. This one inherits, because
-- `user_id` gets joined to `users.id` the first time anyone asks who spent
-- what.

CREATE TABLE IF NOT EXISTS `assistant_usage` (
  `id` varchar(64) NOT NULL,
  `village_id` varchar(64) NOT NULL,
  -- varchar and not enum: seven modes exist today and the vendor work adds
  -- more. A new mode must never need a migration before it can be measured.
  `mode` varchar(24) NOT NULL,
  `model` varchar(64) NOT NULL,
  -- 'village' or 'platform'. A borrowed key spends someone else's money and
  -- the rollup has to be able to separate the two.
  `key_source` varchar(16) NOT NULL,
  -- NULL on the public surfaces, where nobody is signed in.
  `user_id` varchar(64) NULL,
  -- All four, deliberately. `input_tokens` is the UNCACHED remainder only, so
  -- summing it alone under-reports the moment anyone turns prompt caching on.
  `input_tokens` int NOT NULL DEFAULT 0,
  `output_tokens` int NOT NULL DEFAULT 0,
  `cache_creation_input_tokens` int NOT NULL DEFAULT 0,
  `cache_read_input_tokens` int NOT NULL DEFAULT 0,
  -- Upstream POSTs behind one answer. A tool-using turn is 2 or more, which
  -- is what makes a per-mode daily budget readable as real calls.
  `iterations` int NOT NULL DEFAULT 1,
  `stop_reason` varchar(24) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- "what did each mode cost today"
  KEY `assistant_usage_day_idx` (`mode`, `created_at`),
  -- "which member is the spend, and is a ceiling worth enforcing"
  KEY `assistant_usage_user_idx` (`user_id`, `created_at`),
  -- "the cross-village rollup the single biller reads"
  KEY `assistant_usage_village_idx` (`village_id`, `created_at`)
) ENGINE=InnoDB;

-- No dedupe column. A nullable column in a MySQL UNIQUE key admits infinite
-- duplicates, and there is no honest NOT NULL key to build one from: two
-- identical calls a second apart are two real costs, never a replay.
