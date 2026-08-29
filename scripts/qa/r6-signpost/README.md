# Lane SIGNPOST's three probes, round 6

Run from the repo root. Each prints its two numbers first, so a run that
found nothing is distinguishable from a run whose walk broke.

```
node scripts/qa/r6-signpost/signposts.mjs [--dump]   # every empty state and gate that renders a sentence
node scripts/qa/r6-signpost/link-targets.mjs         # every internal link target, resolved against the router
node scripts/qa/r6-signpost/zero-as-absence.mjs      # a real zero drawn as an absence
```

Measured at `b5bed01`:

| probe | examined | defective |
|---|---|---|
| signposts (empty state, gate, refusal that renders a sentence) | 218 | 8 |
| internal link targets | 147 | 0 dangling, 7 self-pointing and all 7 correct |
| absence literals reachable by a bare falsiness guard | 25 of 196 | 0 |

`signposts.mjs` reports what it DROPPED as well as what it kept, because an
emptiness test used for arithmetic, for a `disabled=`, or for a `join(", ")`
fallback is not a signpost, and counting those would have inflated the class.

**What these do not cover**, so the next lane does not read a clean run as a
clean codebase:

- Empty states guarded on `!data` or on a null field rather than on `.length`.
- Refusal sentences the server builds and the client only relays.
- Anything the reader sees but the DOM does not hold. `/village-health`'s
  clipped labels passed every text assertion in this repository; the check
  that catches that class is `client/src/lib/doughnutLayout.test.ts`, which
  is arithmetic on the label geometry.
- `link-targets.mjs` cannot tell a page's own route from a shared component
  rendered on other pages. `FirstWalkInvite` is exported from
  `pages/FirstWalk.tsx`, links to `/first-walk`, and renders on
  `/map/circles`, so it reads as a self-link and is not one.
