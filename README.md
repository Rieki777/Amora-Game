# game-amora

A white-label village-coordination platform. One codebase runs every
instance; each village gets its own database, domain and environment, never
its own copy of the code (`docs/ARCHITECTURE.md`).

Pick the door that matches why you are here.

## Standing up your own village

Read **`docs/PROVISIONING.md`**. It is the ordered walkthrough from nothing
to a running instance with your own name on it, for both self-hosting and
having ReGen Civics host it for you.

Never used a terminal before? Paste **`docs/FOUNDER_SETUP_PROMPT.md`** into
your own Claude session instead and let it walk you through
`docs/PROVISIONING.md` step by step.

## Operating an existing instance

Read **`docs/FORK_RUNBOOK.md`**. It is the living reference for every
environment variable, seed, provisioning step and operational trap this
platform has, in the order they were learned. `docs/PROVISIONING.md` is
distilled from it; this is where the full reasoning lives.

## Building or changing the platform

Start with **`CLAUDE.md`** at the repository root, then
**`docs/ARCHITECTURE.md`** for the system map. Adding a module has its own
guide at **`docs/modules/START_HERE.md`**.
