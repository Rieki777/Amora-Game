# Accepted advisories

`pnpm audit --prod --audit-level high` is a **blocking** CI step. It was
advisory for a long time, behind a note saying "revisit before Block 6
(fiat)" — fiat shipped, three funds-bearing modules went live, and the note
stayed. It blocks now.

Blocking only works if the list of exceptions is short, reasoned, and dated.
Anything on this page is an advisory with **no upstream fix available** that
we have then checked for reachability in this codebase. An advisory with a fix
is never listed here; it is fixed.

The allowlist lives in `package.json` under `pnpm.auditConfig.ignoreGhsas`.
Adding an entry there without adding it here is not allowed — an unexplained
suppression is worse than no audit, because it looks like diligence.

## Currently accepted

### GHSA-37ch-88jc-xwx2 — `path-to-regexp` ReDoS

- **Reached through:** `express@4.21.2 > path-to-regexp@0.1.12`
- **No fix:** Express 4 pins this version. The fix lives in Express 5, which
  is a framework upgrade touching every route in `server/index.ts`, not a
  dependency bump.
- **Why it is not reachable here:** the vulnerability is in compiling a route
  *pattern*, and every route pattern in this codebase is a string literal we
  wrote. Nothing accepts a route pattern from a request, a database row, or an
  admin field. An attacker can choose the URL they send; they cannot choose the
  pattern it is matched against.
- **What would change this:** any feature that lets an admin or a fork define
  URL patterns at runtime. If that is ever built, this entry must come off the
  list and Express 5 becomes urgent.
- **Accepted:** 2026-07-28. Revisit when Express 5 is on the table anyway.

### GHSA-r5fr-rjxr-66jc — `lodash` code injection via `_.template`

- **Reached through:** `streamdown > mermaid > lodash@4.17.21` and
  `recharts > lodash@4.17.21`
- **No fix:** 4.17.21 is the newest lodash there is. The advisory has no
  patched version because the answer upstream is "do not pass untrusted input
  to `_.template`", not a code change.
- **Why it is not reachable here:** we never call lodash — it is not a direct
  dependency and appears in no import anywhere in `server/`, `client/src` or
  `shared/`. Neither mermaid nor recharts exposes `_.template` to callers; both
  use lodash internally for utility functions on data we hand them.
- **What would change this:** taking a direct dependency on lodash, or a chart
  or diagram library growing a "render this template string" feature.
- **Accepted:** 2026-07-28.

## Removed rather than accepted

`axios` was a direct dependency carrying **thirteen** high-severity advisories
— proxy credential leaks, prototype pollution, ReDoS, a full
man-in-the-middle. It was imported by nothing: not one file in `server/`,
`client/src`, `shared/` or `scripts/` referenced it. Removing it took the
repository from 66 advisories to 34, and from 16 highs to 3.

Worth remembering as a class: **the cheapest security fix is a dependency you
were not using.** Before accepting an advisory, check whether the package is
load-bearing at all.
