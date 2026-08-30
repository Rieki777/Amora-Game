-- WHAT A CARRIED ROLE DECLARATION HAS TO CREATE (R90, lane STEWARD).
--
-- R90, in the founder's words: "eventually a village will be able to vote the
-- 'Game Steward' role or choose to not vote for this role at all ... they can
-- optionally vote in a steward role and give various powers to this steward to
-- immediately act."
--
-- A village that votes a role into existence has typed two things: what the
-- role is called and what it is for. `ballots` has room for neither. Its
-- `subject_ref` is one 64-character column and it already carries the role id,
-- and the only other place the words appear is the frozen document, which is
-- prose written for members to read.
--
-- WHY NOT PARSE THE DOCUMENT. `parseTransferRef` says why in its own header:
-- putting two facts in the ref rather than the document exists so that "the
-- executor" never has to be "parsing prose to decide a permission". A role
-- name recovered from a heading is a value invented by a regular expression,
-- and a fallback that invents a value is worse than a crash: it would name a
-- role something the village never typed and the record would read as though
-- they had.
--
-- So the payload gets a row of its own, written by the route that opens the
-- ballot and read by the executor that closes it. One row per declaration
-- ballot, keyed on the ballot, so a second close finds the same words and a
-- ballot with no row is a state the executor can name instead of guess at.
--
-- No FK constraints, house norm. `role_id` is not unique: a village whose
-- first declaration failed to carry can ask again, and both asks keep their
-- own record.
CREATE TABLE IF NOT EXISTS `role_declarations` (
  `ballot_id` varchar(40) NOT NULL,
  `role_id` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `purpose` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ballot_id`),
  KEY `role_declarations_role_idx` (`role_id`)
) ENGINE=InnoDB;
