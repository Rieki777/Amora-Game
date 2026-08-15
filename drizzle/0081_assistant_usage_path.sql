-- 0081: which route produced an answer, so a cheap answer can be counted.
--
-- 0078 wrote down what a call cost and answered "what does one answer cost"
-- honestly for as long as every answer took the same road. It no longer does.
-- An organize question can now be answered three ways: straight from a reader
-- with no model in the loop at all, from one POST that already carries the
-- reader's result, or from the original two-POST tool loop. Those three cost
-- roughly nothing, about half, and full price, and every one of them writes a
-- row here.
--
-- Without this column the three are indistinguishable and the only measurement
-- of the saving would be the average drifting down, which says a saving
-- happened and never says how often. The question a single biller actually
-- asks is the ratio: what fraction of questions this village asked were
-- answered without buying anything. That is a GROUP BY, and it needs the road
-- written on the row.
--
-- A deterministic row carries zeros in all four token columns and 0 in
-- `iterations`, which is the honest count of upstream POSTs behind it. It is
-- still a row, because a metric that is computed and never written is a metric
-- nobody can check later.
--
-- DEFAULT 'loop' and not 'unknown': every row that exists when this runs was
-- written by the two-POST tool loop or by a mode that declares no tools, and
-- both of those are the loop road. Backfilling them as unknown would throw
-- away a true fact about history to avoid stating it.
--
-- No CHARSET clause on an ALTER, for the reason 0078 gives at length: seven
-- earlier migrations pinned one and every cross-era join died on it.

ALTER TABLE `assistant_usage` ADD COLUMN `path` varchar(16) NOT NULL DEFAULT 'loop';

-- "what fraction of answers cost nothing, over a window". The ratio is this
-- lane's whole measurement, so it gets the index rather than a table scan that
-- is fine today and quietly is not at a hundred villages.
ALTER TABLE `assistant_usage` ADD KEY `assistant_usage_path_idx` (`path`, `created_at`);
