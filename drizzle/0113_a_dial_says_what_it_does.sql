-- 0113 (lane DIALS, R79): the feedback switch stops being stored as a number.
--
-- `platform.feedback_relay` was declared `integer`, range 0 to 1, unit
-- "on/off". `shared/gameVariables.ts` now declares it `boolean` with a default
-- of "true". This file brings the ONE stored row into the same spelling.
--
-- ── THIS MIGRATION CHANGES NO BEHAVIOUR, AND THAT IS THE POINT ──────────────
--
-- The boolean parser in `parseVariable` already reads "1" as true and anything
-- else as false, so the flip needs no data rewrite to keep working. Measured
-- on the live village's public mechanics route on 2026-08-29: it stores the
-- string "0" for this key, one of only two non-default rows there, and it
-- reads as OFF before this file and OFF after it.
--
-- What the rewrite buys is what a HUMAN sees. Admin draws a boolean as a
-- select with two options, "true" and "false". A select holding "0" matches
-- neither, so the founder's one tuned dial would render as an empty control.
-- The public amendment ledger has the same problem in the other direction: its
-- only row today reads `1 -> 0`, which is exactly the decoding R79 is about.
--
-- ── BOTH DEPLOY ORDERS ARE SAFE, SO THIS DOES NOT HAVE TO RACE THE DEPLOY ───
--
-- Migration first, old code still running: the integer parser reads "false" as
-- `Number("false") || 0`, which is 0, which is off. Same answer.
-- Deploy first, migration later: the boolean parser reads "0" as false. Same
-- answer. Nothing flips in either window.
--
-- ── NO AMENDMENT ROW IS WRITTEN, ON PURPOSE ────────────────────────────────
--
-- `mechanics_changes` is the record of the village changing its own rules. The
-- village did not change anything here, the platform changed how it spells a
-- value it already held. Writing a row would put a sentence on a public ledger
-- that no human act stands behind.

UPDATE game_variables SET value = 'false'
 WHERE config_key = 'platform.feedback_relay' AND value = '0';

UPDATE game_variables SET value = 'true'
 WHERE config_key = 'platform.feedback_relay' AND value = '1';

-- `game_variables` holds DELTAS ONLY: `setVariable` deletes the row when the
-- value equals the platform default. "true" is now that default, so a row
-- holding it is no longer a delta and the village goes back to inheriting.
-- Under the old integer default of "1" such a row could not be written by the
-- admin route at all; it is cleared here so a hand-seeded or imported one
-- cannot freeze this village on today's default forever.
DELETE FROM game_variables
 WHERE config_key = 'platform.feedback_relay' AND value = 'true';
