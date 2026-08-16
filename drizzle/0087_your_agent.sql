-- 0087: Your agent. The harness in every profile (round 4, lane L6).
--
-- Seven tables, all member-owned, none of them a ledger. Two credential
-- kinds live here and they are held differently on purpose:
--
--   agent_tokens.token_hash is a SHA-256 of a `vat_` token that carries 32
--   random bytes. The value is shown once at mint and never stored; the hash
--   is enough to verify. No salt: a salt defends a guessable secret against
--   a rainbow table, and 256 bits of entropy is not guessable, so a per-row
--   salt would only cost the unique index that makes lookup O(1).
--
--   member_llm_keys.ciphertext is AES-256-GCM under MEMBER_SECRETS_KEY with
--   the iv and the auth tag beside it. The plaintext is a third party's API
--   key that the member typed for their own use; it is decrypted only on the
--   way to that provider and no route returns more than last4.
--
-- No CHARSET clause on any table, deliberately: they inherit the database's
-- collation, because user_id is joined to users.id in every one of them and
-- the mixed-collation join fails loudly on MySQL 8 (see 0078's header).
--
-- The MySQL UNIQUE-exempts-NULL trap: every dedupe column below is NOT NULL.

CREATE TABLE IF NOT EXISTS `agent_tokens` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- The member's own label ("laptop Claude Code", "phone Hermes").
  `name` varchar(80) NOT NULL,
  -- sha256 hex of the full token. Unique, NOT NULL, and the only lookup key.
  `token_hash` char(64) NOT NULL,
  -- `vat_` plus the first 6 characters after it, so the member can tell
  -- which token a row is without the value ever being shown again.
  `prefix` varchar(12) NOT NULL,
  -- JSON list from the closed scope vocabulary in server/lib/agentTokens.ts.
  `scopes` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_tokens_hash_uq` (`token_hash`),
  -- "how many live tokens does this member hold" and the panel's list.
  KEY `agent_tokens_user_idx` (`user_id`, `revoked_at`, `expires_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `agent_inboxes` (
  `id` varchar(64) NOT NULL,
  -- One inbox per member. The unique key IS the rule.
  `user_id` varchar(64) NOT NULL,
  `url` varchar(2048) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  -- Ten in a row disables the inbox and tells the member; a success resets it.
  `consecutive_failures` int NOT NULL DEFAULT 0,
  `disabled_reason` varchar(255) NULL,
  `last_delivery_at` timestamp NULL,
  -- The last HTTP status or refusal, for the panel. Never a body.
  `last_status` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_inboxes_user_uq` (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `agent_deliveries` (
  `id` varchar(64) NOT NULL,
  `inbox_id` varchar(64) NOT NULL,
  -- test | week_ahead | weekly_digest | opportunity. varchar, not enum: a new
  -- kind is a sentence in agentInbox.ts and never a migration.
  `kind` varchar(32) NOT NULL,
  `payload` json NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `next_attempt_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` timestamp NULL,
  -- Set when the fifth attempt fails. Dropped rows stay for the panel.
  `dropped_at` timestamp NULL,
  `last_error` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- The drain's only read: due, undelivered, not dropped.
  KEY `agent_deliveries_due_idx` (`delivered_at`, `dropped_at`, `next_attempt_at`),
  KEY `agent_deliveries_inbox_idx` (`inbox_id`, `created_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `member_llm_keys` (
  -- One key per member; replacing it overwrites the row.
  `user_id` varchar(64) NOT NULL,
  `provider` enum('anthropic','openai_compatible') NOT NULL,
  -- Only the openai_compatible provider reads these. Https, guarded at write.
  `base_url` varchar(512) NULL,
  -- The member's own model name for that endpoint (OpenRouter and Ollama
  -- name models differently and this platform's Anthropic id means nothing
  -- to either). Null for anthropic, which uses the platform's model.
  `model` varchar(128) NULL,
  -- AES-256-GCM: ciphertext, 12-byte iv and 16-byte tag, all base64.
  `ciphertext` text NOT NULL,
  `iv` varchar(32) NOT NULL,
  `tag` varchar(32) NOT NULL,
  -- The only part of the key that ever goes back to a browser.
  `last4` varchar(4) NOT NULL,
  `set_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `member_drafts` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  -- event_rsvp today. varchar so the next kind is a sentence, not a migration.
  `kind` varchar(32) NOT NULL,
  `payload` json NOT NULL,
  -- Who proposed it: the in-app assistant, or the member's own token.
  `source` enum('assistant','token') NOT NULL,
  `status` enum('proposed','confirmed','rejected','expired') NOT NULL DEFAULT 'proposed',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` timestamp NULL,
  -- What the confirm produced (an rsvp row id, an intent id).
  `created_ref` varchar(64) NULL,
  PRIMARY KEY (`id`),
  -- "what is waiting for this member's yes"
  KEY `member_drafts_user_idx` (`user_id`, `status`, `created_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `agent_profiles` (
  `user_id` varchar(64) NOT NULL,
  -- The member's own note to their agent. Theirs to write, theirs to clear.
  `about_me` text NULL,
  -- private: nobody but the member. assistant: the in-app assistant may read
  -- it when this member asks. members: other members' agents may read it
  -- through the directory. Default is the tightest.
  `about_tier` enum('private','assistant','members') NOT NULL DEFAULT 'private',
  -- The consent sentence, ticked or not. Matching without it never runs.
  `matching_consent` tinyint(1) NOT NULL DEFAULT 0,
  -- JSON list of {statementId, text, at}: what the member said the assistant
  -- got wrong, kept beside the note so a future prompt can carry it.
  `corrections` json NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `assistant_statements` (
  `id` varchar(64) NOT NULL,
  -- The person the sentence is ABOUT, who is the only one who may correct it.
  `subject_user_id` varchar(64) NOT NULL,
  `mode` varchar(24) NOT NULL,
  `text` text NOT NULL,
  -- JSON list of reader keys or note ids the sentence was built from.
  `sources` json NULL,
  `status` enum('active','corrected','withdrawn') NOT NULL DEFAULT 'active',
  -- The member's own words, when they corrected it.
  `correction` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `assistant_statements_subject_idx` (`subject_user_id`, `status`, `created_at`)
) ENGINE=InnoDB;
