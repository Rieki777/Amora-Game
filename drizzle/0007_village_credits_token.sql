-- 0007: the default value token for the gratitude cycle pool.
--
-- Rye's directive (2026-07-26): gratitude economics follow the ReGen Civics
-- model — recognition is the signal, and VALUE arrives at cycle close, when an
-- admin-sized pool of a separate platform token distributes in proportion to
-- recognition received. This seeds that pool's default token. Per-deployment
-- data (Gate D): villages rename it or point gratitude.pool_token elsewhere as
-- they configure their modules.

INSERT IGNORE INTO `tokens` (`slug`, `name`, `kind`, `governance`, `transferable`, `sort_order`) VALUES
  ('credits', 'Village Credits', 'credit', 'platform', 0, 4);
