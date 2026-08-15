-- 0082: the synthesis batch ledger.
--
-- Call synthesis is the most token-expensive call in the product: up to 400
-- transcript segments against a 2000-token reply cap. When a human is waiting
-- on it that cost is the price of an answer now, and the admin route keeps
-- paying it. When nobody is waiting, the same work can go through the Message
-- Batches API at half the token price, and the only thing spent instead is
-- time: results usually inside an hour, at most 24.
--
-- Two tables because a batch and its requests fail separately. A batch can end
-- while one request inside it errored, expired or was canceled, and the reply
-- to each request is addressed by `custom_id` and arrives in ANY order. Keying
-- on arrival position would silently attach one recording's synthesis to
-- another recording.
--
-- `custom_id` is the recording id. It is an identity OUR record already owns,
-- so a poll can always find its way home; a timestamp or a sequence number
-- would be a second name for the same thing and a second thing to get wrong.
--
-- No CHARSET clause, deliberately. Seven earlier migrations ended a CREATE
-- TABLE with a bare DEFAULT CHARSET=utf8mb4, which on MySQL 8 takes the
-- character set's own default collation and not the database's, and every join
-- across that boundary died with ER_CANT_AGGREGATE_2COLLATIONS. These inherit,
-- because `recording_id` is joined to `recordings.id` on every poll.

CREATE TABLE IF NOT EXISTS `synthesis_batches` (
  -- The id Anthropic assigns (msgbatch_...). Ours to read, never to mint.
  `batch_id` varchar(64) NOT NULL,
  -- The upstream processing_status verbatim: in_progress, canceling, ended.
  -- varchar and not enum, so a new upstream state is a log line and not a
  -- migration standing between the village and its results.
  `status` varchar(24) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Set once, when the batch first reports ended. The poll skips ended batches
  -- from then on, so results are read exactly once.
  `ended_at` timestamp NULL,
  `request_count` int NOT NULL DEFAULT 0,
  -- The four upstream request_counts, mirrored so an operator can read what
  -- happened without a network call.
  `succeeded` int NOT NULL DEFAULT 0,
  `errored` int NOT NULL DEFAULT 0,
  `expired` int NOT NULL DEFAULT 0,
  `canceled` int NOT NULL DEFAULT 0,
  `last_polled_at` timestamp NULL,
  -- The last upstream refusal, kept in full. A batch that never ends is a
  -- question somebody has to answer with evidence.
  `last_error` text NULL,
  PRIMARY KEY (`batch_id`),
  -- "which batches are still open" — the poll's only read.
  KEY `synthesis_batches_open_idx` (`status`, `created_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `synthesis_batch_items` (
  `batch_id` varchar(64) NOT NULL,
  -- The recording id, echoed back by the results endpoint.
  `custom_id` varchar(64) NOT NULL,
  `recording_id` varchar(64) NOT NULL,
  -- pending -> written | errored | expired | canceled | failed.
  -- `written` is the terminal success state and it is claimed, not assumed:
  -- the poll flips pending to written with a conditional UPDATE and writes the
  -- synthesis only when affectedRows says it won. A re-poll of the same batch
  -- loses that claim and writes nothing.
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  -- 1 on first submission, 2 on the one retry a failed request is allowed. A
  -- third does not exist: an item that fails twice is marked failed and left
  -- for a person, because a timer that retries forever is a timer that spends
  -- forever.
  `attempt` int NOT NULL DEFAULT 1,
  -- The role ids the prompt actually offered this request, frozen at
  -- submission. The answer arrives up to a day later and the evidence rule
  -- nulls any role outside the candidate set, so validating against a set
  -- recomputed at poll time would let a role created in the meantime
  -- launder a hallucination into a real assignment. The model is judged
  -- against the choices it was given.
  `role_candidate_ids` json NULL,
  -- Frozen for the same reason: these are the deterministic chapter marks the
  -- request carried, and they are the fallback when the model returns none.
  `chapter_marks` json NULL,
  -- The upstream result envelope for this request, success or error, kept for
  -- the operator who has to explain a missing synthesis.
  `result_json` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- THE DEDUPE KEY. Both columns NOT NULL, which is the whole point: a MySQL
  -- UNIQUE index exempts NULLs, so a nullable column in a dedupe key admits
  -- infinite duplicates. As the primary key it is also the only way in.
  PRIMARY KEY (`batch_id`, `custom_id`),
  -- "has this recording been through a batch before, and how many times" —
  -- the read that bounds the retry.
  KEY `synthesis_batch_items_recording_idx` (`recording_id`, `created_at`)
) ENGINE=InnoDB;
