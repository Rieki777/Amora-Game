# The Admin session

You own Admin: the screens a founder uses to make a village theirs and to run it.

Everything below was measured on `main` on 2026-09-03, not read off a document.
Re-measure before acting; files moved a great deal that day. **Rye will add
issues he has hit himself when he briefs you, and those outrank this list**,
because they are what actually bit a person rather than what a scan found.

---

## Why this matters more than it looks

Thirteen founders stand up an instance in the next few weeks. None of them will
read the code. Admin **is** the product for them: it is where a village gets its
name, its tokens, its rules and its shape. A defect here does not annoy a
developer, it stops a founder from making the thing theirs, and they will assume
the fault is theirs rather than yours.

---

## What is measured, and true

### 1. `Admin.tsx` is 10,608 lines

There are 16 components under `client/src/components/admin/`, and then one file
of 10,608 lines. This is the same shape `server/index.ts` had before it was cut
from 31,082 to 28,429 lines by extraction, and that extraction is worth reading
as the pattern: it was proved behaviour-preserving by comparing 568 method and
path pairs, diffing the flattened registration order, and dumping what the built
server actually registered at runtime.

Do the same kind of thing here, and be honest about the difference: a route move
is provable by enumeration, a React extraction is not. So pick your seams by
**cohesion**, move without rewriting, and prove each move by exercising the panel
in a browser rather than by reading the diff.

**Do not do this first.** Read the rest of this file, because two of the items
below are things a founder hits today, and a refactor that delays them is the
wrong order.

### 2. The identity guard's last pending key has no screen

`project.fiatCurrency` defaults to `CRC` and **has no field anywhere in
`client/src`**. Not in the setup steps, not on any admin panel. Verified:

    grep -rn "fiatCurrency" client/src --include=*.tsx --include=*.ts   ->   nothing

That is not a cosmetic gap. `scripts/check-identity-keys.mjs` holds a pending
list that started at five keys and is now **one**, and that last entry's own
stated exit condition is that the founder sets it in Admin. So the guard is
waiting forever on a screen that does not exist, every village ships declaring
Costa Rican colones, and the list can never reach zero.

Build the field. Then the pending list goes to zero, `PENDING_CEILING` goes to
zero, and per that script's own header, `KNOWN_PENDING` and `PENDING_CEILING`
get deleted and the plain rule is left behind. Finishing that guard is a real
milestone and it is one field away.

### 3. Every admin save is silent to a screen reader

Across all 16 admin components there is **not one `role="alert"` or
`role="status"`**. A founder using a screen reader presses Save and is told
nothing: not that it worked, not that it failed, not why.

The pattern to copy is already in the repo. `client/src/pages/Login.tsx` carries
three `role="alert"` regions, and a fix landed on the signup error banner on
2026-09-03 with helpers and round-trip tests beside it. Follow that rather than
inventing one, and mind the distinction: `role="alert"` is assertive and
interrupts, so it is for errors; `role="status"` is the polite equivalent for a
save that succeeded. A panel that shouts on every success is as unusable as one
that is silent.

### 4. Modals do not trap or restore focus

Thirteen files carry a `fixed inset-0` overlay. **Four** have any key handler at
all. **Two** restore focus when the overlay closes.

So a keyboard user tabbing inside an admin dialog walks straight out of it into
the page behind, and when the dialog closes their focus is wherever the browser
last left it. Escape frequently does nothing. This is the single most common
accessibility defect in hand-rolled dialogs and it is entirely fixable with one
shared hook: trap Tab within the overlay, close on Escape, remember the element
that had focus when the dialog opened and give it back on close.

Build the hook once and adopt it everywhere, rather than patching thirteen files
in thirteen ways.

### 5. Two admin tables show the same numbers at different scales

`client/src/components/admin/TokensTab.tsx` line 479 renders grant amounts as
`{Number(g.amount).toLocaleString()} {g.tokenName}`: a raw ledger figure. The
LedgerTab in the same area got an explicit `(ledger units)` column header on
2026-09-03 to make that deliberateness legible. TokensTab did not.

So two admin tables show the same scale and one says so. Either divide it with
`formatTokenAmount` from `client/src/lib/tokenAmount.ts`, or label it. Do not
leave them disagreeing.

**Know why this matters more than it looks.** Village Voice has 3 decimals today,
so a raw figure reads 1000x too large. Rye has ruled that **all tokens move to 4
decimals**, after which every undivided surface is wrong by 10,000x. A wallet
shipped reading 1000x too large this week for exactly this reason, and the fix
for it made one surface WORSE before it was caught: the card divided the balance
it displayed and left the input beside it posting minor units, so a member saw
"You hold 10", typed 1, and moved 0.001. **A surface that divides on one half of
a pair and not the other is worse than one that divides on neither, because both
raw at least agree.**

---

## What to do, in this order

1. **The `fiatCurrency` field.** Smallest, and it finishes a guard that has been
   counting down for three days. It also unblocks money formatting everywhere,
   because nothing can render a price correctly while the currency is a default
   nobody chose.
2. **Announcements on save.** Every admin panel, using the existing pattern.
   This is a founder-facing correctness fix, not a nicety.
3. **The focus hook**, adopted across all thirteen overlays.
4. **TokensTab**, divided or labelled, decided and consistent.
5. **Then, and only then, the extraction of `Admin.tsx`**, by cohesion, moving
   without rewriting, each move exercised in a browser.

---

## How to prove anything here

**Read the rendered output, not the diff.** Two defects this week were visible
only in what a person actually saw. Get the dev server up and drive the real
panels with the browser tools, reading the accessibility tree rather than the
source. If you cannot get it running, say so plainly and say that your evidence
is static analysis instead.

**A test proves a behaviour is INTENDED, never that it is correct.** This program
has paid for that five times. The worst case was a test named "pays a confirmed
quest in voice and credits" that asserted on four columns of a config table and
never read a balance; it was green for the entire life of a bug that cost every
village its first payout. Whatever you add must read the OUTCOME, and you must
prove it fails when your fix is removed.

**Ratchets only turn down.** `check-tailwind-gray` and `check-theme-literals`
both refuse to rise, so use design tokens rather than literals or colour classes.
`check-file-lines` and the image budget behave the same way. If one blocks you,
the answer is to remove, not to raise.

---

## Working here

- **Your own worktree, at a SHORT path.** From `C:/Users/taren/Desktop/Amora/hotfix`:
  `git worktree add -b wt/admin C:/Users/taren/Desktop/Amora/ADMIN main`, copy
  `.env` into it, then `pnpm install`. A deep path breaks `git show <rev>:<path>`
  on Windows and the migration guard then reports nonsense.
- **Copy `.env` or your green means nothing.** Without it about a third of the
  suite skips. An unfiltered run with no database now exits 1 and says so.
- **`main` is production.** A push auto-builds on Railway and applies migrations
  at boot. Commit on your branch and hand it to the coordinator to land.
- **Stage by name, never `git add -A`.** Other sessions share these trees.
- **Rebuild after any client change** or the freshness guard refuses to run the
  suite, correctly, because the e2e tests boot the built bundle.
- **Exit codes after a pipe are the pipe's**: `cmd > /tmp/out.txt 2>&1; echo "RC=$?"`.
  And keep a check and a push in the SAME condition, not separated by a
  semicolon. That mistake pushed a red tree twice on 2026-09-03.
- **Gates**, enumerated from the workflows DIRECTORY and never from memory:
  `grep -hoE "node scripts/check-[a-z0-9-]+\.mjs" .github/workflows/*.yml | sort -u`

---

## Where this fits

`PLAN_TO_A.md` on `main` grades eleven dimensions and says what stands between
each and an A. **Client is graded B**, and it is the one dimension whose
improvement lane produced nothing, so it is roughly where it started. Items 3 and
4 above are its two named critical gaps. Claim that row so nobody builds it
twice; three lanes landed the same work by accident this week.

`docs/ECONOMICS.md` is the source of truth for the token model, including why a
raw ledger figure on a screen is a defect and not a rounding preference.

One thing on the horizon that will reshape every panel you touch: after the Game
launches, the admin screen becomes public to all players, and a set of edits
becomes a single proposal that has to pass before it takes effect. A separate
session is building that. You are not building it, but a panel you extract or
restructure now is a panel that has to survive it, so prefer changes that make a
panel's edits enumerable over changes that bury them in a component.
