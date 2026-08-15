# Open, 2026-08-14: two defects that outlived their worklist

`FIXES_TO_MAKE_2026-08-03_PUBLISH_SURFACE.md` was deleted on 2026-08-11 by
`2069f32` ("Twelve finished worklists come out"), under the rule *delete records
of COMPLETED work, keep anything FORWARD-LOOKING*.

Most of that list really was finished, and the deletion was mostly right.
Verified against `main` at `28dace2` on 2026-08-14:

| Item | State |
|---|---|
| `/api/network` serving `SELECT s.*` joined to `users.name` anonymously | FIXED |
| `regenEntries` leaking `recorded_by` user ids | FIXED, now `recordedByName` |
| `unclaimedSeatingsFor` / `claimSeating` not filtering `is_example` | FIXED |
| The six write-only `org_roles` scorecard columns | surfaced, now read |
| **`anonymizeMember` never touches `org_role_assignments`** | **STILL OPEN** |
| **`replaceAll` resets `circles.created_at` on every edit** | **STILL OPEN** |

This file exists so those last two are not lost with the document that carried
them. It holds nothing that is finished.

---

## 1. A member who exercised deletion keeps their org seat

**Verified 2026-08-14 against `server/index.ts` on `main`.** The
`anonymizeMember` body is 5,842 characters, contains one reference to
`roleHoldersRepo` (the PERMISSION plane) and **zero** to
`org_role_assignments` (the ORG plane).

So deletion ends somebody's capability groups and leaves their seat on the org
chart, under their real `user_id`. `/api/org` then republishes their name to
anyone holding `map.viewPeople`, and that capability's stage floor is `guest`,
whose rule is `{type: "account"}` — so any self-registered account has it.

A **documented** holder is worse. `display_name` is a real person's name, often
somebody who never had an account to delete, and nothing anywhere scrubs it.

The public export at `/api/public/org.json` cannot leak either of them, because
it carries no names at all. That is a different door, not a mitigation.

**Fix:** end live `org_role_assignments` for the target inside
`anonymizeMember`, the same way permission holdings are already ended, and add
the case to the exit test. Ending rather than deleting is the right shape here:
invariant 13 says value rows are never deleted, and a seat's history is the
point of the table.

## 2. Every admin circle edit resets every circle's birth date

**Verified 2026-08-14.** `created_at` is absent from the `circlesRepo`
`dbCollection` spec (`server/index.ts:942`), and `replaceAll` is a DELETE-all
plus a re-INSERT of exactly the spec'd columns. So every save re-inserts every
row with a fresh `CURRENT_TIMESTAMP` default.

Anything that reads a circle's birth date is reading the timestamp of the last
unrelated admin edit. Nothing reads it today, which is why this is quiet rather
than harmless: the next feature that wants "how long has this circle existed"
will get a plausible wrong answer.

Two related properties of the same call, worth knowing together:

- `replaceAll` does `DELETE FROM circles` with **no WHERE**, then re-inserts
  what the caller read moments earlier. A circle inserted by another writer in
  between is lost. `role_holders` needed an in-process mutex for exactly this
  class; `circles` has none.
- It swaps the in-memory cache **after** its own commit, so a circle write is a
  point of no return inside any multi-table apply.

**Fix:** add `created_at` to the spec, and let a `dbCollection` join a caller's
transaction. The second half touches every repo built on it, so it wants its own
review.

**Read this before extending structural drafts to cover circles.** Drafts
(`server/lib/orgDrafts.ts`, 0056) deliberately cover seats and their holders and
NOT circles, and this is the reason: a circle write cannot join the draft's
transaction and cannot be rolled back once it returns.
