# Where the documentation lives

The handoff guide that used to sit here was written in March 2026, for a
version of this project that no longer exists. It described site content and
form submissions living in JSON files under `data/`, sixteen page routes, and
"no database needed for MVP". All of that was true then. Since then the whole
platform moved to MySQL, grew sixteen modules, a ledger, a payments spine and
a module framework, and became a template other villages fork rather than one
village's website.

It was removed rather than updated for two reasons. A stale map is worse than
no map — it sends people confidently to the wrong place. And it printed an
admin password in plain text, in a repository meant to be cloned.

Nothing here has been lost. Everything the old guide covered now lives in a
file that is kept current as the code changes:

| If you want to… | Read |
| --- | --- |
| Understand how the system fits together | `docs/ARCHITECTURE.md` |
| Get oriented before changing code | `CLAUDE.md` — reading order, gates, invariants, traps |
| Stand up a new village, or set env vars and secrets | `docs/FORK_RUNBOOK.md` |
| Know what a specific module promises | `docs/modules/` |
| Change the feedback relay | `docs/FEEDBACK_HUB_CONTRACT.md` |
| See what is built, planned, or blocked | `docs/V2_PLAN.md` |

**Passwords and keys are not written down in this repository.** Every secret
is either an environment variable or set from Admin → Integrations, where it
is stored write-only and read back masked to its last four characters. If you
need to change the admin password, change `ADMIN_PASSWORD` where the
deployment sets it — do not record the new value in a file here.
