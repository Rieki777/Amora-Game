# Releases, channels, and pinning a version

One release is one container image. It is built once, started and checked
before it is published, and then never changed. Two villages running the same
version are running the same software, byte for byte.

**Which version is current: the newest heading in `CHANGELOG.md`.** That file
is the record of what each release contains, written for stewards. This file
is about how to get a release and how to stay on one.

## The image

```
ghcr.io/rieki777/village-os
```

The package is **public on purpose**. A village that leaves the fleet keeps
its source, its images, and its security advisories, and loses only the
guarantee that someone else is watching. A private package plus per-village
access tokens would turn "you may leave" into "you may leave and be
stranded", so the package is open and no token is needed to pull it.

The image bakes in no secrets. Every secret arrives as an environment
variable at run time, which is what makes publishing it safe.

## The three channels

| Tag | What it points at | Who should use it |
|---|---|---|
| `:1.1.0` and every other `:<version>` | One exact release, forever | Any village that wants to know what it is running |
| `:stable` | The newest full release | A village that wants the current release without naming it |
| `:edge` | The newest commit on `main` that passed the full test suite | The platform team. Never a village. |

A prerelease (`:1.2.0-rc1`) publishes its own version tag and does not move
`:stable`.

## Running a release, if you host your own village

You need Docker and a MySQL database. Nothing else, and no account anywhere.

```
docker pull ghcr.io/rieki777/village-os:1.1.0

docker run -d --name village -p 3000:3000 \
  -e DATABASE_URL='mysql://user:password@your-database-host:3306/village' \
  -e AUTH_TOKEN_SECRET="$(openssl rand -hex 32)" \
  -v village-data:/app/data \
  ghcr.io/rieki777/village-os:1.1.0
```

`DATABASE_URL` is the only variable the server refuses to start without. It
applies every pending migration itself on the way up, so an empty database is
a fine starting point. `AUTH_TOKEN_SECRET` is optional and should be set
anyway: without it the server picks a random secret each time it starts,
which logs everyone out on every restart. The volume is where uploaded files
live, and without it they disappear with the container.

The first start is slow, because it runs every migration before it begins
serving. Measured against an empty database on a cold server: 228 seconds.
Give it fifteen minutes before deciding something is wrong, and read
`docker logs village` while you wait.

`docs/PROVISIONING.md` is the full walkthrough for standing up a village,
including the domain, email, and the parts only you can do.

## Asking a village what it is running

```
curl https://your-village.example/health
```

```json
{ "status": "ok", "build": "2026-07-28-wave1-6de6629", "database": { "ok": true } }
```

The last seven characters of `build` are the exact commit inside the release.
`ops/roll.mjs` compares that value and nothing else, because a tag can be
moved and a commit cannot.

## Pinning: how a village holds still

Pinning means staying on a version while other villages move on. There are
two ways, depending on who runs the village.

### A village ReGen Civics hosts

Add a `pin` block to that village's entry in `ops/fleet.json`:

```json
"pin": {
  "version": "1.1.0",
  "reason": "why, in a sentence the steward would recognise",
  "pinnedAt": "2026-08-31T00:00:00Z",
  "expiresAt": "2026-09-20T00:00:00Z"
}
```

A pinned village is skipped by every rollout, never touched, and never
counted as a failure. Pins have a maximum length (`maxPinDays`, 30 by
default) and `roll.mjs` refuses to load a manifest that breaks it. A village
held back for months collects every change that shipped while it sat still,
and clearing the pin then means one jump no canary ever rehearsed. Short pins
keep that jump small. `ops/README.md` has the unpinning procedure.

### A village that hosts itself

Name the version in your own deploy and leave it there:

```
ghcr.io/rieki777/village-os:1.1.0
```

That is the whole pin. Nothing moves it until you change that line. Using
`:stable` instead means you move whenever a new release is published, which
is the right default for a village that does not want to think about it.

Read `CHANGELOG.md` before you move, and move one version at a time where you
can. `docs/SECURITY_ADVISORIES.md` is where anything urgent is posted, and it
stays readable to a village that has left the fleet.

## Cutting a release, for the platform team

1. Get the commit green. `.github/workflows/ci.yml` has to have passed on the
   exact commit you are about to tag. The release workflow asks GitHub
   whether it did and refuses to publish if it did not.
2. Add the entry to `CHANGELOG.md`, written for a steward.
3. Set `version` in `package.json` to the same number.
4. Tag and push:

   ```
   git tag -a v1.1.0 -m "village-os 1.1.0"
   git push origin v1.1.0
   ```

5. Watch `.github/workflows/release.yml`. It builds the image, starts it
   against an empty database, checks that `/health` reports the tagged
   commit, checks that three real pages answer 200, and only then pushes to
   the registry. A failure here is the system working.
6. Roll it out with `ops/roll.mjs`, `plan` first. `ops/README.md` has the
   procedure and what to do when a ring halts.

The version number tracks `PLATFORM_VERSION` in `server/lib/identity.ts`,
which is the contract other villages and the hub read. Bump the minor for an
additive change, the major for anything a peer could break on, and keep
`package.json` and the git tag on the same number so a village never gets two
answers to one question.
