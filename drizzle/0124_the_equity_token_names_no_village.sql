-- 0124: the platform's equity token stops carrying one village's name, and
-- the slug it gets instead is the one it keeps forever.
--
-- WHAT WAS WRONG. 0006 seeded the equity mirror with the founding village's
-- own name in BOTH columns: slug and display name. Every fork inherits that
-- seed, so thirteen founders each boot with another village's word on the
-- token that represents ownership of their land. The display name is the part
-- a member reads. The slug is worse, because the slug is what every ledger
-- row, balance row and repeat-protection key is written against.
--
-- WHY IT IS SAFE TO MOVE THE SLUG TODAY, AND NEVER AGAIN. Measured against a
-- freshly migrated schema on 2026-08-31, before a line of this file was
-- written: of the 969 string columns in the schema, exactly two hold that
-- word, and both are in `tokens` itself. token_ledger, token_balances and
-- onchain_balances are empty. The founder confirmed the same of the live
-- instance: nothing has been issued. So this is the one moment when the
-- equity token can be re-keyed without orphaning a balance. After the first
-- mint it is a one-way door, which is why the application layer refuses a
-- slug edit from here on and says out loud why.
--
-- THE ROW IS FOUND BY WHAT IT IS, NOT BY WHAT IT WAS CALLED. `governance =
-- 'hypha' AND kind = 'equity'` is the seeded Base mirror, and it is unique by
-- construction: POST /api/admin/tokens forces governance to 'platform', so no
-- admin can make a second one, and only a migration ever seeds a hypha row.
-- Naming the old slug in these statements would weld one village's name into
-- platform code, which is the bug this file exists to remove. Were a fork ever
-- to hold two such rows, the scalar subqueries below fail loudly rather than
-- pick one.
--
-- THE NAME IS THE VILLAGE'S TO KEEP (Rye, 2026-08-30). A village may
-- legitimately call its equity token after itself: that is a choice living in
-- its own record, and this migration leaves it standing. The name moves to the
-- platform default only where it is NOT already this village's own name, read
-- from the brand document. A fresh instance has no brand row yet, so the
-- thirteen get "Village Equity". On an instance whose founder has named the
-- village and whose token carries that name, only the slug moves.
--
-- IDEMPOTENT BY CONSTRUCTION. Every statement is keyed on a subquery that
-- EXCLUDES the destination slug, so once the rename has run that subquery
-- returns NULL, every predicate below is NULL, and a second run matches zero
-- rows. Proven by running the file twice against a fresh schema and diffing
-- the whole database.
--
-- EVERY COMPARISON CARRIES ITS OWN COLLATION, and that is not decoration.
-- Seven migrations pin `CHARSET=utf8mb4` on their tables and thirty-five let
-- the schema default decide, so on a fork whose database default is not the
-- character set's default the two eras end up in DIFFERENT collations. Four of
-- the carries below cross that line (mint_rules, voice_claims, events,
-- event_seat_charges are pinned; tokens is not), and the first version of this
-- file died on all four with "Illegal mix of collations
-- (utf8mb4_uca1400_ai_ci,IMPLICIT) and (utf8mb4_general_ci,IMPLICIT)". It
-- passed every other suite, because every other suite provisions on the
-- default. server/db/collation.test.ts is the one that provisions
-- utf8mb4_general_ci deliberately, and it caught this.
--
-- So each comparison states its collation explicitly rather than inheriting
-- one: an EXPLICIT collation outranks both operands' implicit ones, which
-- makes the comparison legal whatever era either table came from. utf8mb4_bin
-- is the right choice for a slug, which is lowercase ASCII by the create
-- route's own pattern, and it removes any question of accent folding. The one
-- comparison against a human-typed NAME lowercases both sides first, so a
-- village that capitalised its own name differently in two places still
-- matches itself.
--
-- THE ONE WAY THIS FAILS, AND WHY THAT IS THE RIGHT FAILURE. If a village has
-- already created a platform token of its own under the slug `equity`, the
-- final statement hits the primary key and the boot stops with "Duplicate
-- entry 'equity' for key 'tokens.PRIMARY'". Skipping instead would leave that
-- village alone with another village's name on its equity token and nothing
-- said, which is the bug this file exists to end. The fix is one rename by
-- that village's own hand before the image goes up. No fresh instance can be
-- in this state: a fresh registry holds four rows and none of them is it.
--
-- EXPAND, NEVER CONTRACT. No DDL: this is data alone, and the release before
-- it reads the same columns at the same types. A rolled-back image finds an
-- equity token under a slug it does not name, which shows an empty on-chain
-- block rather than failing to boot.

-- Carry every reference forward FIRST, while the registry still holds the old
-- slug. All of these are provably empty of it on a fresh schema. They run
-- anyway, because a table that "cannot" hold such a row is exactly the one
-- that orphans a village's history when it turns out it did.

-- token-doc: ignore
UPDATE `token_ledger` SET `token_type` = 'equity'
 WHERE `token_type` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `token_balances` SET `token_type` = 'equity'
 WHERE `token_type` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `onchain_balances` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `hypha_token_bindings` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `hypha_village_reads` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `admin_mint_requests` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `mint_rules` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `voice_claims` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `currency_prices` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `token_exchange_settings` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `exchange_orders` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `exchange_orders` SET `pay_token_slug` = 'equity'
 WHERE `pay_token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `payment_products` SET `token_slug` = 'equity'
 WHERE `token_slug` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `accommodation_prices` SET `token_type` = 'equity'
 WHERE `token_type` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `event_seat_charges` SET `token_type` = 'equity'
 WHERE `token_type` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `events` SET `seat_token` = 'equity'
 WHERE `seat_token` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `stays` SET `rate_snapshot_token` = 'equity'
 WHERE `rate_snapshot_token` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `gratitude_distributions` SET `pool_token` = 'equity'
 WHERE `pool_token` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- token-doc: ignore
UPDATE `ballots` SET `weight_token` = 'equity'
 WHERE `weight_token` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- The two settings that name a token by slug instead of holding a balance in it.
-- token-doc: ignore
UPDATE `game_variables` SET `value` = 'equity'
 WHERE `config_key` IN ('gratitude.pool_token', 'governance.weight_token')
   AND `value` = CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin;

-- The four columns that store a unit as `token:<slug>` rather than a bare slug
-- (TOKEN_UNIT, server/lib/resources.ts).
-- token-doc: ignore
UPDATE `circle_budgets` SET `unit` = 'token:equity'
 WHERE `unit` = CONCAT('token:', CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin);

-- token-doc: ignore
UPDATE `funding_sources` SET `unit` = 'token:equity'
 WHERE `unit` = CONCAT('token:', CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin);

-- token-doc: ignore
UPDATE `regen_entries` SET `unit` = 'token:equity'
 WHERE `unit` = CONCAT('token:', CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin);

-- token-doc: ignore
UPDATE `spending_rules` SET `unit` = 'token:equity'
 WHERE `unit` = CONCAT('token:', CONVERT((SELECT `slug` FROM `tokens` WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity') USING utf8mb4) COLLATE utf8mb4_bin);

-- And LAST, the registry row itself. The name moves only where it is not
-- already this village's own name; the slug moves always, and this is the
-- final time it ever may.
-- token-doc: as-if UPDATE `tokens` SET `name` = 'Village Equity', `slug` = 'equity' WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity'
UPDATE `tokens`
   SET `name` = CASE
         WHEN LOWER(TRIM(`name`)) = CONVERT(LOWER(TRIM(COALESCE(
                (SELECT JSON_UNQUOTE(JSON_EXTRACT(`value`, '$.project.name'))
                   FROM `app_config` WHERE `config_key` = 'brand'), ''))) USING utf8mb4) COLLATE utf8mb4_bin
           THEN `name`
           ELSE 'Village Equity'
       END,
       `slug` = 'equity'
 WHERE `governance` = 'hypha' AND `kind` = 'equity' AND `slug` <> 'equity';
