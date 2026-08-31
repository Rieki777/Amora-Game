# Changelog

What changed in each release of the village platform, in plain language for
the people who run villages.

Every release is one container image, built once and published under its own
version number. A published version never changes afterwards, so a village
that pins a version keeps running exactly the software that was tested for
it. `ops/RELEASES.md` explains the version channels, how to pin one, and how
to pull the image if you host your own village.

## 1.1.0 (2026-08-31)

The first release you can name and pin.

Before this, there was one way to run a village: deploy whatever was newest
in the source repository at that moment. Two villages deployed on different
days were running different software, and neither could say which. From here
on, each release is packaged once, proved to start before it is published,
and kept available under its own number for as long as anyone needs it.

### What a steward gets

- **A version number.** Your village runs 1.1.0. Its `/health` page reports
  the exact commit inside that release, so the version and the running
  software can always be checked against each other.
- **An image anyone can pull.** `ghcr.io/rieki777/village-os:1.1.0`. It is
  public. A village that hosts itself needs no account, no invitation to the
  source repository, and no access token to run it.
- **A release that was started before it was published.** Every release is
  built, started against an empty database, and asked to serve three real
  pages of the village. A release that cannot do all three is never
  published, so a broken build stops at the workshop door instead of
  reaching thirteen villages.
- **A way to hold still.** A village can stay on the version it is on while
  the rest of the fleet moves. `ops/RELEASES.md` has the two ways to do
  that, one for ReGen-hosted villages and one for self-hosted ones.
- **A shutdown that finishes what it started.** The image runs the server
  under a small supervisor so that a restart asks the server to stop and
  waits for it, rather than cutting it off mid-request.

### What is inside 1.1.0

This is the first packaged release, so the image carries everything the
platform has grown so far. The number is 1.1.0 rather than 1.0.0 because the
platform has been announcing itself as 1.1.0 to other villages for a while
already, on three of its own endpoints. Starting the tags at 1.0.0 would have
meant two different answers to "which version is this", which is the exact
confusion version numbers exist to prevent.

The 1.1.0 contract, which is what other villages and the hub read, adds three
public documents to what 1.0.0 offered:

- `/.well-known/village.json`, the discovery document.
- `/api/public/org.json`, the org structure as data.
- `/org/**.md`, the same structure as readable pages.

Nothing that another village already read changed shape, so a peer written
against 1.0.0 keeps working.

### For operators

- `Dockerfile` at the repository root builds the image. It re-derives the
  server's real runtime dependency list from the built bundle on every build
  and fails if any of it is unresolvable, so the list cannot go stale.
- `.github/workflows/release.yml` publishes it. Pushing an annotated tag
  `v1.1.0` cuts release 1.1.0. The workflow refuses to publish any commit
  that has not already passed the full test suite.
- `railway.toml` now carries a health check, so a deployment that cannot
  serve `/health` is marked failed and the previous deployment keeps serving.
  The timeout is 900 seconds because a first boot applies every migration
  before it listens, which was measured at 228 seconds against a cold
  database.
- `ops/roll.mjs` rolls a release across the fleet in ring order and halts at
  the first village that does not come back healthy. `ops/README.md` has the
  full procedure.
