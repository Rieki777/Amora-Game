-- 0066: the messaging substrate. N-party conversations with names,
-- membership, messages, and per-member read state. Direct messages are the
-- two-party case of this table, never a separate path.
--
-- Written deliberately as a platform primitive rather than inside the module
-- that first wanted it. The sibling game hit this from the other side: its
-- conversations schema was genuinely N-party, but the list procedure returned
-- a singular otherUser and the UI rendered around that, so the first feature
-- that needed a named group thread had to pay for a messaging rework it had
-- not budgeted for.
--
-- Four shape decisions carry weight:
--
--   Ids are varchar(64) like every other id in this schema. users.id is
--   varchar(64), so an integer author_id would not join to it at all.
--
--   messages carry `seq`, one global AUTO_INCREMENT, beside their id. Read
--   state is a single integer comparison against it, so an unread count costs
--   the same at ten messages and ten thousand, and it never turns on a
--   timestamp tie or on the ordering of a random id suffix.
--
--   direct_key is NOT NULL and UNIQUE. A MySQL unique index exempts NULLs, so
--   a nullable dedupe column would admit unlimited duplicate direct threads
--   between the same two people. Direct rows key on the sorted member pair;
--   every other row keys on its own conversation id, which is already unique,
--   so one index serves both without a sentinel that could collide.
--
--   The kind enum ships COMPLETE, 'crew' included, because a live enum ALTER
--   is the forbidden migration class here. Crew threads move onto this table
--   later as data, with no DDL.
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` varchar(64) NOT NULL,
  `kind` enum('direct','group','crew') NOT NULL DEFAULT 'direct',
  -- NULL for direct threads: their title is the other person's name, resolved
  -- per viewer, so there is nothing true to store here.
  `name` varchar(120) NULL,
  -- 'quest' when a crew thread; the quest id rides in context_id.
  `context_type` varchar(40) NULL,
  `context_id` varchar(100) NULL,
  `created_by` varchar(64) NOT NULL,
  `direct_key` varchar(160) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A CACHE, on the token_balances rule: recomputed from messages after every
  -- insert, never incremented. auditLastMessageAt() re-derives it wholesale.
  `last_message_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversations_direct_uq` (`direct_key`),
  KEY `conversations_context_idx` (`context_type`, `context_id`)
);

CREATE TABLE IF NOT EXISTS `conversation_members` (
  `conversation_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `role` enum('owner','member') NOT NULL DEFAULT 'member',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Read state, per member: the highest message seq this person has seen.
  -- 0 means they have read nothing here yet. Advances monotonically, so a
  -- late request carrying an older seq can never rewind someone's inbox.
  `last_read_seq` bigint NOT NULL DEFAULT 0,
  `muted` tinyint(1) NOT NULL DEFAULT 0,
  `left_at` timestamp NULL,
  PRIMARY KEY (`conversation_id`, `user_id`),
  KEY `conversation_members_user_idx` (`user_id`, `left_at`)
);

CREATE TABLE IF NOT EXISTS `messages` (
  `id` varchar(64) NOT NULL,
  -- AUTO_INCREMENT has to lead an index, which is what the unique key below
  -- is for; the primary key stays the varchar id like every sibling table.
  `seq` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` varchar(64) NOT NULL,
  `author_id` varchar(64) NOT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` timestamp NULL,
  -- Soft delete: a tombstone, never a hole. The row keeps its seq, so read
  -- state stays meaningful across a deletion and nobody's unread count jumps
  -- because someone else removed a line.
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `messages_seq_uq` (`seq`),
  KEY `messages_conversation_idx` (`conversation_id`, `seq`),
  KEY `messages_author_idx` (`author_id`)
);

-- Every thread inherits a report path. Both key columns are NOT NULL so
-- report-once-per-person actually holds (see the direct_key note above for
-- what a nullable unique column does here).
--
-- Deliberately NOT the forum's auto-hide-at-N-reporters rule: that rule reads
-- a community's judgement off a public thread, and a private conversation has
-- no community to read. These rows go to a human.
CREATE TABLE IF NOT EXISTS `message_reports` (
  `id` varchar(64) NOT NULL,
  `conversation_id` varchar(64) NOT NULL,
  `message_id` varchar(64) NOT NULL,
  `reporter_id` varchar(64) NOT NULL,
  `reason` varchar(500) NULL,
  `status` enum('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  `resolved_by` varchar(64) NULL,
  `resolved_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_reports_once_uq` (`message_id`, `reporter_id`),
  KEY `message_reports_status_idx` (`status`, `created_at`)
);
