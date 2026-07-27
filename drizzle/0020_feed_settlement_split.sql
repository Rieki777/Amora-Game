-- 0020 (S27-S29): the settlement report splits channels. Hearts and
-- acknowledgments are different signals — a tap on a post and a written
-- appreciation — and the founders carry this report to Hypha, so the two
-- must never blend silently (plan: S27-S29).
ALTER TABLE `gratitude_distributions`
  ADD COLUMN `received_hearts` int NOT NULL DEFAULT 0 AFTER `received`,
  ADD COLUMN `received_acks` int NOT NULL DEFAULT 0 AFTER `received_hearts`;
