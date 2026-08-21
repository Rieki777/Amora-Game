-- 0086: Intents and introductions (round 4, lane L7).
--
-- Three tables. A member says in plain words what they seek or could offer;
-- the matcher proposes an introduction as an OPPORTUNITY both people accept
-- separately; a mutual yes opens one Messages thread. Nothing here is a
-- ledger and nothing applies itself: every acceptance column is written only
-- by the accepting member's own request.
--
-- Suggested offers are computed on read and never stored: an unconfirmed
-- offer has no row, which is what "never auto-published" means.
--
-- No CHARSET clause on any table, deliberately: they inherit the database's
-- collation, because user_id is joined to users.id in every one of them and
-- the mixed-collation join fails loudly on MySQL 8 (see 0078's header).

CREATE TABLE IF NOT EXISTS `member_intents` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `kind` enum('seek','offer') NOT NULL,
  -- The member's own words. Blanked to '[expired]' by the retention sweep
  -- once the row is expired and old, the sweepContactBodies shape.
  `text` varchar(500) NOT NULL,
  `why` varchar(300) NULL,
  -- public: on the board for anyone the module admits. members: the board
  -- for signed-in members. incognito: matched, never rendered to anyone but
  -- the owner. private: notes to self, never matched and never listed.
  `tier` enum('public','members','incognito','private') NOT NULL DEFAULT 'members',
  `lifecycle` enum('active','paused','fulfilled','expired') NOT NULL DEFAULT 'active',
  -- JSON list of short topic strings, the member's own labels.
  `topics` json NOT NULL,
  -- For a confirmed suggested offer: JSON list of {source, label} naming the
  -- village facts the suggestion came from (seat, badge, skill, quest).
  -- NULL for an intent the member composed from nothing.
  `inferred_from` json NULL,
  -- One reminder at expiry, then the sweep expires the row a week later.
  `expires_at` timestamp NULL,
  `reminded_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- "my intents" and the erasure path.
  KEY `member_intents_user_idx` (`user_id`, `lifecycle`),
  -- The board (tier + lifecycle) and the matcher's candidate read.
  KEY `member_intents_pool_idx` (`lifecycle`, `tier`, `updated_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `intent_opportunities` (
  `id` varchar(64) NOT NULL,
  -- The SORTED pair: user_a < user_b by string order, and intent_a belongs
  -- to user_a. Sorting is what makes the unique key below mean "this pair of
  -- intents has one opportunity, ever", whichever side the matcher ran for.
  `user_a` varchar(64) NOT NULL,
  `user_b` varchar(64) NOT NULL,
  `intent_a_id` varchar(64) NOT NULL,
  `intent_b_id` varchar(64) NOT NULL,
  -- The deterministic score the pair surfaced at. double, because BM25 is
  -- fractional and rounding it would hide why one pair beat another.
  `score` double NOT NULL DEFAULT 0,
  `method` enum('deterministic','llm') NOT NULL DEFAULT 'deterministic',
  -- JSON list of {text, source, subject, hidden?}: every sentence shown to
  -- either person, templated from data, each naming the member it is about.
  -- Blanked to [] by the retention sweep.
  `reasons` json NOT NULL,
  `status` enum('proposed','a_accepted','b_accepted','opened','declined','expired') NOT NULL DEFAULT 'proposed',
  -- Written ONLY by acceptOpportunity, only for the acting member's own
  -- column. A grep test holds that promise (server/intents.harm.test.ts).
  `a_accepted_at` timestamp NULL,
  `b_accepted_at` timestamp NULL,
  `declined_by` varchar(64) NULL,
  -- The Messages thread a mutual yes opened.
  `conversation_id` varchar(64) NULL,
  -- NULL means HELD: the row exists, nobody has seen it, and the sweep will
  -- try again when the recipient caps allow. Held is never dropped.
  `surfaced_at` timestamp NULL,
  `reminded_at` timestamp NULL,
  `expires_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `intent_opportunities_pair_uq` (`intent_a_id`, `intent_b_id`),
  -- Per-recipient day counts and each member's inbox, one index per side.
  KEY `intent_opportunities_a_idx` (`user_a`, `surfaced_at`),
  KEY `intent_opportunities_b_idx` (`user_b`, `surfaced_at`),
  -- The sweep's reads: what is open, what is due to expire.
  KEY `intent_opportunities_sweep_idx` (`status`, `expires_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `member_intent_policies` (
  `user_id` varchar(64) NOT NULL,
  -- The consent sentence, dated. NULL means the matcher reads none of this
  -- member's seats, badges, skill tags, quests or joined_at, and suggests no
  -- offers. Withdrawing sets it back to NULL and pauses every intent;
  -- nothing is deleted.
  `consent_at` timestamp NULL,
  -- The member's own ration. Enforced while this row exists.
  `max_per_week` int NOT NULL DEFAULT 2,
  -- JSON list of topic strings, or NULL for "anything".
  `topics` json NULL,
  `paused_until` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB;
