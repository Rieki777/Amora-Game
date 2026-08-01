# Fixes to Make — 2026-08-01 — Roles & Circles Site Update

This document continues from `FIXES_TO_MAKE_2026-07-17_FOUNDATION_LEVERS.md`.

**Source material:**
- *Amora Roles — Notes for Rieki* (Jessica Filkins, July 30, 2026) — the authoritative, most recent feedback
- *Amora Foundation Blueprint — Build the Team That Will Build the Team* (working draft, July 2026)
- Sociocracy circle structure chart (with corporate acronyms)

**Rye's decisions (2026-08-01):** apply both renames; rebuild Circles page to the real structure; Membership & Onboarding lives inside **Outreach & Growth** (one circle guides the whole journey in, sales included); Business Development Steward = **Partially Filled** (Ky interim, seeking full-time); leave Campground/"landlady" seat **Open**; leave Victoria/Maria/Adriana **off** the Team page for now; make all cards **easily editable in Admin** including who holds each role.

---

## What shipped — 2026-08-01 session

### The big one: the org chart is now DATA, editable in Admin

The public **/roles**, **/circles**, and **/team** pages no longer hardcode their content.
They render from three content sections (`roles`, `circles`, `team`) served by the existing
content API and edited in **Admin → Content → Roles Page / Circles Page / Team Page**:

- **Role cards**: name, circle/group, seat status (Open Seat / Filled / Partially Filled / Forming — a dropdown), **who holds it (one name per line)**, optional holder note, aim, domain, accountabilities, why-it-matters. Add / remove / reorder with buttons. Cards with the same group appear together on the page, in card order.
- **Circle cards**: name, subtitle, stage (**today** = current team circle, **future** = "As the Village Matures" section), description, domain, who's in it, focus areas.
- **Team cards**: name, role title, circle, photo URL, bio.
- Raw JSON stays available under "advanced edits" — unknown fields survive the form untouched.
- Saving goes live immediately on the public pages. This is the "easy to edit going forward" requirement, done — and it's the natural integration surface for Sera (`GET/PUT /api/content/roles|circles|team`).

The current structure ships as a seed (`server/seeds/org-chart-2026-08.json`) applied **once**
by a `runOnce` data migration at the first boot after deploy; from then on the admin editor is
the source of truth (later deploys never overwrite team edits).

### Content changes applied (all coded, pending deploy)

| # | Fix | Status |
|---|-----|--------|
| 1 | Marketing Steward → **Open Seat** (Nikita left) | CODED |
| 2 | Team page: Nikita, Victoria, Maria, Adriana removed; Jessica → **Visionary Lead & Founder**; Kyleen → **Finance Lead**; page now links to open seats | CODED |
| 3 | **Sales Lead** added (Open) inside the new **Outreach & Growth Circle**; Membership & Onboarding Steward moved into the same circle, kept as its own seat; **Social Media Steward** added (Filled, note that a second may join) | CODED |
| 4 | Renames: **Land Steward → Project Manager** (Filled — Christian); **Rancho Renovation Manager → Land Steward** (Filled, held off-land — fine, nobody lives on the land this year) | CODED |
| 5 | **Website & Backend/AI** role added (Filled — Eric, web; Rick, Sera/backend AI) | CODED |
| 6 | **Chief of Staff / Executive Assistant** added (Open; Lexi not named publicly — candidate, not holder) | CODED |
| 7 | **Governance, People & Team Coherence** added as a Forming sub-circle under the Community Circle, with an explicit independent escalation path for grievances | CODED |
| 8 | **Business Development Steward** → Partially Filled — "Ky (interim)", note seeking full-time; future finance hire may free the seat for investor relations | CODED |
| 9 | Social media "may need a second" reflected on the card | CODED |
| 10 | Campground & Events Steward left **Open** (per Rye; "landlady" unconfirmed) | DONE |
| 11 | Circles page rebuilt: **5 team circles today** (General Coordinating, Outreach & Growth, Community, Development, Finance & Business) + the 8 aspirational councils under **"As the Village Matures"** | CODED |
| 12 | Governance page circle list aligned to the same 5 circles; "Land Circle/Community Circle" example fixed; only remaining "CEO" reference is in the Project History archive (left as history) | CODED |
| 13 | Legal split confirmed as-is: entity/trust/investor legal → Finance & Business (Entity & Land Trust Steward card notes it); permitting/construction legal → Development | DONE |
| 14 | Sera / new-website integration | **Rye doing the call in a few days — will upload the transcript here; integration work continues from that.** The content API above is the ready-made surface for it. |

### Files changed

- `client/src/pages/Roles.tsx` — data-driven, groups from cards, holders + Partially Filled badge
- `client/src/pages/Circles.tsx` — data-driven, today/future sections, consent + double-link copy
- `client/src/pages/Team.tsx` — data-driven from `team` section, links to open seats
- `client/src/pages/Governance.tsx` — circle list + example aligned
- `client/src/pages/Admin.tsx` — Roles/Circles/Team card editors: status & stage dropdowns, holders lines, reorder buttons, add-card defaults
- `server/index.ts` — `org-chart-2026-08` runOnce + seed path
- `server/seeds/org-chart-2026-08.json` — NEW: the full current org structure
- `server/seeds/content-seed.json` — roles/circles/team sections updated for fresh forks
- `scripts/brand-refs-baseline.json` — ratchet burn-down locked in (388 → 339)
- `docs/FORK_RUNBOOK.md` — seed line appended

### Verification (all four gates + live smoke)

- `pnpm check` ✔ · `pnpm build` ✔ · `pnpm test` ✔ (125 passed; DB suites skip without `TEST_DATABASE_URL`, as designed) · `node scripts/check-brand-refs.mjs` ✔ (count DOWN, baseline updated)
- Booted the built `dist/index.js` against a scratch MySQL: migrations ✔, seeds ✔, `org-chart-2026-08` applied ✔
- API smoke: 24 role cards / 13 circles / 2 team members served with the right groups, statuses, holders
- **Admin round-trip**: founder-authed `PUT /api/admin/content/roles` filled a seat, public API reflected it instantly, revert clean; unauthenticated PUT → 401
- Browser smoke (Chromium): `/roles`, `/circles`, `/team`, `/governance` all render the new structure; no page errors; removed team members confirmed absent

---

## Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Command / Where |
|---|------|-------------|-----------------|
| R1 | Review the changes (files listed above are already on your disk) | Your site, your call | Open the repo; `git diff` shows everything |
| R2 | Commit & push, approve the Railway deploy | Git + Railway access | `git add -A && git commit -m "Org chart 2026-08: data-driven roles/circles/team + admin editors" && git push` |
| R3 | After deploy: confirm boot log shows `[MIGRATION] applied org-chart-2026-08`, then spot-check /roles, /circles, /team | Railway dashboard access | Railway logs + the live site |
| R4 | Show the team **Admin → Content → Roles Page** — that's where they add/remove people in roles from now on | Human handoff | 2-minute walkthrough |
| R5 | Do the Sera call with Rick and Eric, upload the transcript here | Jessica asked you directly | Point them at `GET/PUT /api/content/roles\|circles\|team` as the integration surface |
| R6 | Optional: full DB-backed test run locally (`TEST_DATABASE_URL` in `.env`) if you want the loop e2e green before pushing | Railway DB reachable only from your machine | `pnpm build && pnpm test` |

### CLAUDE CODE — already done or can be done without you

| # | Task | Status |
|---|------|--------|
| C1 | Fixes 1–13: all content + page + admin-editor + server work | CODED / VERIFIED (see gates above) |
| C2 | Fixes doc updated (this file) | DONE |
| C3 | Sera integration work after the call transcript arrives | WAITING ON R5 |

### WAITING ON YOU before Claude Code can proceed

- **R2/R3** — nothing goes live until you push and the deploy boots (the runOnce applies the new structure on that boot).
- **R5** — Sera integration design waits on the call transcript.
- Still open from Jessica's side (site shows the safe default meanwhile): whether the "landlady" fills Campground & Events (card stays Open), and whether Victoria/Maria/Adriana return to the Team page (add them back in Admin → Team Page in seconds if so).
