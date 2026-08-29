-- 0106: nobody grants themselves power alone (round 6, lane MINT).
--
-- QA-2 measured what `docs/FOUNDATION_HANDOFF_2026-08-11.md` section 3b
-- recorded as specified and unbuilt eighteen days earlier: a single admin
-- self-granted 25 and took their own balance from 20 to 45, granted 101 in one
-- call, and minted 500 of each of four other platform tokens to themselves in
-- the same lunation. Every guard on that route was real. None of them looked
-- at WHO the tokens were going to, and none of them asked anybody else.
--
-- The sharp edge is `village-voice`. Under `governance.weight_mode = token`
-- that balance IS voting weight, so the scaffolding could mint itself the
-- electorate. The ballot freeze means it cannot be done to a ballot already
-- open. Nothing stopped it the minute before one opened.
--
-- TWO RULES, AND THEY ARE DELIBERATELY DIFFERENT SHAPES.
--
-- A SELF-GRANT IS REFUSED, flat, at any amount, with no dial and no ceremony.
-- It needs no table and no second party, it cannot be turned off, and there is
-- nothing in it to game. The cost is narrow and worth naming: the only admin in
-- a village can no longer mint to themselves. They can still mint to every
-- other member, and to the treasury through the exchange, so no village is shut
-- out of its own token system. What no rule here can stop is an admin who
-- registers a second account and mints to that. It leaves a trail, the tokens
-- land on a different member id, and this table is honest about not catching it.
--
-- A GRANT OVER `ledger.admin_mint_cosign_over` WAITS FOR A SECOND STEWARD, and
-- that is what these rows are. The threshold is a dial the village sets, the
-- same shape as `library.intake_dual_signoff_over`, which is the one place in
-- this codebase where a second signature was already built and which this
-- follows rather than inventing a scheme.
--
-- WHY A ROW AND NOT A FLAG. An approval that does not pin the amount is an
-- approval of nothing. The row holds the token, the recipient, the amount and
-- the reason as they were when the grant was asked for, and the approval reads
-- every one of them from HERE and never from the approver's request body. So
-- the second steward agrees to a specific number of a specific token going to a
-- specific person, and no later edit of the request can change what they said
-- yes to.
--
-- No CHARSET clause, deliberately: `to_user_id`, `requested_by` and
-- `decided_by` all join `users`.`id`, and a table that pins its own collation
-- cannot be joined across the era split (0078's header). No foreign keys, house
-- norm. `--` comments sit on their own lines and never end in `;` (the 0015
-- trap: the runner splits statements on line-final `;`).

-- ── WHAT EACH COLUMN IS FOR ────────────────────────────────────────────────
--
-- `status` is `pending`, `approved` or `declined`, and the transition out of
-- `pending` is claimed with `UPDATE ... WHERE status = 'pending'` so two
-- stewards pressing at once produce one decision and one refusal, never two
-- mints. The ledger row the approval writes carries `admin_mint:req:<id>` as
-- its idempotency key, so even a retry that got past the claim cannot double.
--
-- `decided_by` and `decided_at` are the answer to "who was the second, and
-- when". They stay NULL while the grant is waiting, which is the difference
-- between nobody having agreed yet and somebody having agreed to nothing.
--
-- `amount` is `bigint` to match `token_ledger`.`amount`. A cap is a village
-- dial and a village may set it high.
--
-- A PENDING ROW IS SPOKEN FOR. The mint route counts pending amounts against
-- `ledger.admin_mint_cycle_cap` alongside what has actually been minted.
-- Without that, an admin who cannot mint over the cap in one call could raise a
-- hundred requests just under it and hold a hundred times the cap, each needing
-- one signature. `idx_amr_open` is the index that read uses: status first
-- because it is the selective column, then the token.

CREATE TABLE IF NOT EXISTS `admin_mint_requests` (
  `id` varchar(64) NOT NULL,
  `token_slug` varchar(64) NOT NULL,
  `to_user_id` varchar(64) NOT NULL,
  `amount` bigint NOT NULL,
  `reason` varchar(500) NOT NULL,
  `requested_by` varchar(64) NOT NULL,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `decided_by` varchar(64) NULL,
  `decided_at` timestamp NULL,
  `decision_note` varchar(500) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_amr_open` (`status`, `token_slug`)
);
