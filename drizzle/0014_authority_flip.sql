-- 0014 (S12): the authority flip's two schema gaps.
--
-- 1. Abuse-guard state moves to MySQL. The in-memory sliding windows reset on
--    every deploy and never survived a restart — a redeploy was a rate-limit
--    amnesty. One narrow table holds every bucket's hits; readers COUNT a
--    window, writers INSERT one row, and stale rows are swept opportunistically.
CREATE TABLE IF NOT EXISTS `rate_hits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  -- "login:1.2.3.4", "assistant:2026-07-26" — the guard key, verbatim.
  `bucket` varchar(120) NOT NULL,
  `at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `rate_hits_bucket_idx` (`bucket`, `at`)
);

-- 2. submissions carried the submitting member (S-era attribution) as loose
--    JSON-record fields the table never grew; converting without them would
--    orphan every proposal from the member it belongs to.
ALTER TABLE `submissions`
  ADD COLUMN `user_id` varchar(64) NULL AFTER `rewarded`,
  ADD COLUMN `user_name` varchar(255) NULL AFTER `user_id`;
