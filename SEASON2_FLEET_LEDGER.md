# Season 2 Fleet Ledger

Single source of truth for the Season 2 program: take game-amora from one village to a
13-instance fleet, then continue lanes to raise every audit dimension to A.

**Base ref for every lane: `052d0422b5fbeea86e4309822bdc31a0c8b41f72` (main, 2026-08-30).**

Read this before acting. Write to it after landing. Never wholesale-rewrite it; edit by hunk.

## 0 - Program shape (Ruling R1)

13 community founders each get their own instance in about 3 weeks. They are DESIGNING, not
running live communities; real members arrive months later. That sets the priority:

1. A founder must be able to stand an instance up.
2. A founder instance must look like theirs, not like Amora.
3. We must be able to push improvements to all 13 continuously without breaking their work.
4. Member-safety work lands before real members arrive, not before the founders do.

Distribution model: one codebase, one container image, many single-tenant instances.
Nobody forks. Self-host and ReGen-hosted are the same image with a different operator.

## 1 - Rulings register (append only, founder words verbatim in brackets)

- **R1** 2026-08-30. Launch shape. [It's 13 community founders taking the tool to start
  designing their own! They're not going to go live into their community for several months
  as we build it out and improve the code/game together.]
- **R2** 2026-08-30. Hosting split. [Genuine mix, both must be solid] Both the self-host
  path and the ReGen-hosted path ship at launch quality.
- **R3** 2026-08-30. Game shape. [Mostly reskins, 2-3 want more] Reskins ship first;
  game-design-as-data opens right after launch for the outliers.
- **R4** 2026-08-30. Language. [Not at launch, but soon after] Land the cheap half now
  (message keys so new prose stops freezing into English-only history); full extraction after.
- **R5** 2026-08-30. Fork promise. A village may always take the code and its data. What it
  loses by leaving is the guarantee of tested, rolled-out, supported updates. It does NOT
  lose access to source, images, or security advisories, which stay public.

## 2 - Lane registry

Every lane: base ref above, its own worktree, its own branch, commits with `git add -p`,
does NOT push until told. Scratch goes in the lane own subdirectory, never a shared one.

| Lane | Worktree | Branch | Owns (exclusive) | Effort |
|---|---|---|---|---|
| release | `../s2-release` | `wt/s2-release` | `Dockerfile`, `.github/workflows/release.yml`, `railway.toml` | full |
| safety | `../s2-safety` | `wt/s2-safety` | `.github/workflows/ci.yml`, `scripts/check-migration-*.mjs` | full |
| backup | `../s2-backup` | `wt/s2-backup` | `.github/workflows/db-backup.yml`, backup docs section | cheap |
| neutral | `../s2-neutral` | `wt/s2-neutral` | `shared/gameConfig.ts`, `client/src/index.css`, `server/seeds/*` | cheap |
| kit | `../s2-kit` | `wt/s2-kit` | `README.md`, `.env.example`, `.gitignore`, `scripts/fork-init.mjs`, `docs/PROVISIONING.md` | cheap |
| fleet | `../s2-fleet` | `wt/s2-fleet` | `ops/**` (new directory) | cheap |
| ops | `../s2-ops` | `wt/s2-ops` | `server/index.ts`, `server/lib/errors.ts` | full |
| tokens | `../s2-tokens` | `wt/s2-tokens` | `client/src/**` except `index.css` | cheap |
| gates | `../s2-gates` | `wt/s2-gates` | `scripts/*.test.mjs`, `vitest.config.ts`, `server/db/provisioningReport.ts` | cheap |

### Shared-file ownership (the expensive mistake)

- `server/index.ts` is owned by **ops alone**. Brand strings inside it (submission email
  heading, DEFAULT training copy) belong to ops, NOT neutral, even though they are brand work.
- `.github/workflows/ci.yml` is owned by **safety alone**. Any lane needing a CI step files
  the request in the Blocker list below; safety applies it.
- `client/src/index.css` is owned by **neutral alone**; tokens owns every other client file.
- `docs/FORK_RUNBOOK.md` is append-only this round. backup and kit both append; each adds its
  own dated section and neither edits the other lines.

## 3 - Resource registry

- **Migration numbers.** Highest taken across all local refs, remote refs and 140+ worktrees:
  **0120**. Next free: **0121**. Gaps at 0111 and 0115-0119 are BURNED, never reuse them
  (the applied-ledger keys on filename and would replay).
- **Claim a number here before creating the file.** No number is claimed yet this round.
- **Reserved fork band.** Proposal: village-local migrations use `9000+`. Owned by safety.
- **Ports.** Test MySQL is 127.0.0.1:3307 (local, not production). Preview servers pick
  their own; record any long-lived port here.

## 4 - Gate set

**Enumerate `.github/workflows/` yourself, never trust a count in a brief.** Read at
2026-08-30 from the directory, not from one file: `ci.yml`, `db-backup.yml`,
`module-intake.yml`, `module-review-agent.yml`.

`ci.yml` runs on push to every branch AND on pull_request. Its 20 steps, in order:

```
pnpm install --frozen-lockfile
pnpm check
npx tsc -p tsconfig.tests.json --noEmit
node scripts/check-brand-refs.mjs
node scripts/check-voice.mjs
node scripts/check-hyphen-dash.mjs
node scripts/check-auth-fetch.mjs
node scripts/check-admin-reach.mjs
node scripts/check-save-honesty.mjs
node scripts/check-repo-payloads.mjs
node scripts/check-mirror-annotations.mjs
node scripts/check-upload-strip.mjs
node scripts/check-artifact-budget.mjs
node scripts/check-doc-links.mjs
node scripts/check-route-reachability.mjs
node scripts/check-map-routes.mjs
node scripts/check-image-budget.mjs
pnpm build
pnpm test
pnpm audit --prod --audit-level high
```

**Two path-gated PR workflows become REQUIRED checks** for any change touching
`shared/modules.ts`, `shared/capabilities.ts`, `shared/draftKinds.ts`, `server/lib/modules.ts`,
`server/lib/secrets.ts`, `scripts/enable-all-modules.mjs`, or `docs/modules/**`.
Any lane touching `server/lib/secrets.ts` inherits both.

### Measured baseline (2026-08-30, at 052d042, this machine)

- `node_modules` in the MAIN checkout is EMPTY (0 packages). `pnpm check`, `pnpm build` and
  `pnpm test` therefore cannot run there. **Every lane runs `pnpm install --frozen-lockfile`
  in its own worktree first.** A gate result from a tree without install is not a measurement.
- Dependency-free guards measured GREEN on pristine trunk: brand refs (52 legacy refs against
  a 63 baseline), hyphen-dash (0), doc links (41 references across 6 documents).
- **Canary measured 2026-08-30:** `pnpm install --frozen-lockfile` succeeds in a fresh
  worktree in ~51s, and `pnpm check` then exits 0 (GREEN) at 052d042. So typecheck has a
  known-good baseline; the earlier red was missing dependencies, not code.
- Build, test and the remaining guards have NO measured baseline yet. Landing criterion is
  **no worse than baseline**, not "green". Measure your own control in your own session.

## 5 - Landing queue

Order matters where noted; everything else lands when green.

1. **safety** first among CI-touching lanes. It owns `ci.yml`; other lanes CI steps queue behind it.
2. **release** may land in parallel with safety (disjoint files) but the release workflow is
   not useful until the safety compatibility gate exists. Ship both before any rollout.
3. **fleet** depends on release having published at least one tagged image. It may BUILD first
   and land first; it cannot be exercised until an image exists.
4. **neutral**, **kit**, **backup**, **tokens**, **gates** are independent; land when green.
5. **ops** touches the 32k-line monolith. Land it alone, never alongside another
   `server/index.ts` change, and rebase it last.

## 6 - Blocker list

| What | On whom | Since | Notes |
|---|---|---|---|
| Repo is PUBLIC with unencrypted DB dumps as downloadable artifacts | founder (GitHub admin) | 2026-08-30 | Verified live: `visibility: PUBLIC`, unexpired `db-backup-*` artifacts. Code-side hardening proceeds in the backup lane; visibility change and secret rotation are human-only. |
| Secret rotation after the exposure | founder | 2026-08-30 | Stripe keys, all `app_config` integration secrets, village signing key, legacy-hash password resets. |
| `data/uploads/` volume has no backup of any kind | ops (owns `server/index.ts`) | 2026-08-30 | backup lane cannot reach a Railway volume from a GitHub Action; `railway ssh` is interactive-only and this repo's own history shows it run by hand, never headless. Full spec for an authenticated `GET /api/admin/backup/uploads-archive` (route, `BACKUP_EXPORT_TOKEN` header auth, streamed tar, canary-file manifest) is written up in `docs/FORK_RUNBOOK.md`, "Backup encryption, the uploads volume gap..." section, 2026-08-30. Not half-built; needs the lane that owns `server/index.ts`. |
| New repo secrets needed for backup encryption: `BACKUP_GPG_PUBLIC_KEY`, `BACKUP_DRILL_GPG_PUBLIC_KEY`, `BACKUP_DRILL_GPG_PRIVATE_KEY` | founder (GitHub secrets) | 2026-08-30 | `db-backup.yml` now fails closed (refuses to dump) until these exist. Generation commands and which secret holds which half are in `docs/FORK_RUNBOOK.md` same section. The drill keypair is CI-only test material and safe to generate and hand over; the production public key's private half must be generated and held by the founder offline, never in this repo or CI. |

## 7 - What I got wrong (coordinator errors, recorded at the same prominence as findings)

- **2026-08-30. My own baseline harness reported a false green.** I captured the exit status
  after piping a gate through `tail`, so I read the status of `tail`. `pnpm check` exited 1
  while my log said the check exited 0. This is the silent-zero class the skill names,
  committed by the coordinator in the very act of measuring the baseline. Fixed by capturing
  exit codes with no pipe. Every lane: do not pipe a gate into anything before reading status.

## 7a - Wave 1 dispatch (2026-08-30)

All nine lanes dispatched concurrently off 052d042, disjoint file zones per the registry above.
Full effort on the three that judge (release, safety, ops); cheap models on the six mechanical
lanes (backup, neutral, kit, fleet, tokens, gates).

## 7b - backup lane landed (2026-08-30, on `wt/s2-backup`, not yet merged to main)

`db-backup.yml` now bundles dump.sql.gz + manifest.txt and GPG-encrypts to two recipients
before upload (production key, private half never in CI; a separate CI-only drill key that
lets `restore-drill` prove decrypt+restore on every run without ever holding the real key).
Both the backup job and both drill jobs fail closed if their required secret is unset, rather
than silently skipping. Added `restore-drill-negative-control`: corrupts a copy of the real
ciphertext and asserts GPG's own integrity check refuses it, so a green `restore-drill` means
something. Mechanism verified locally with a throwaway keypair before landing (see commit):
correct bundle decrypts with the drill key alone, a 32-byte-corrupted copy is refused with
`gpg: WARNING: encrypted message has been manipulated!`, exit 2. Uploads volume: NOT covered,
spec for the real fix (an authenticated export endpoint) written up precisely rather than
half-built; see blocker list above and `docs/FORK_RUNBOOK.md`. Three new secrets needed before
this runs green for real: see blocker list. Gate results at the landing commit are in that
commit's own message.

Cross-lane contracts fixed at dispatch, so two lanes cannot invent different names:

- Image: `ghcr.io/rieki777/village-os`, tags `:<semver>` plus moving `:stable` and `:edge`.
  Provided by release, consumed by fleet.
- Rollout probe: `GET /health` reports the build SHA stamped by `scripts/build-server.mjs`.
  Made honest by ops, polled by fleet, exposed as `healthcheckPath` by release.
- CI steps: `.github/workflows/ci.yml` has ONE owner (safety). tokens and gates each need a
  step added and were told to file the request in the Blocker list below rather than edit it.

Every brief carried: re-verify every claim (the numbers are timestamped measurements, a lane
that corrects the coordinator is the lane working), run each new gate once against a
deliberately broken input and prove it goes red, capture exit codes without piping, commit
with `git add -p`, and do not push.

## 7b - Wave 2 dispatch (2026-08-30, founder approved)

Three lanes, all cut off the same base 052d042 while wave 1 runs. Overlap was MEASURED, not
assumed, before dispatch.

| Lane | Worktree | Branch | Owns (exclusive) | Effort |
|---|---|---|---|---|
| secrets | `../s2-secrets` | `wt/s2-secrets` | `server/lib/secrets.ts` | full |
| constitution | `../s2-constitution` | `wt/s2-constitution` | `shared/ballotSubjects.ts`, `server/lib/exchange.ts`, `server/lib/governanceWeights.ts` | full |
| brochure | `../s2-brochure` | `wt/s2-brochure` | the shopfront page and component files, plus its OWN new seed file | cheap |

### server/index.ts is now split by HUNK, and ops has been told

`server/index.ts` was assigned to ops alone in wave 1. It is now shared with constitution on
VERIFIED disjoint hunks, measured 2026-08-30 at 052d042:

- **ops keeps**: 4742 and 7483 and 20577 (submission email html), 5791 (module invariant
  asserts), 7347 (the /health route), 32355 (the startServer catch), 1085 (DEFAULT training
  copy).
- **constitution takes**: 13495 and 15185 (the launch electorate floor), 18466 (the exchange
  stock route), and the admin token-create route just below it near 18560.

Closest approach between the two sets is about 2000 lines. Neither lane may edit outside its
listed hunks in that file. This was relayed to the ops lane directly at dispatch time, not
merely recorded here: a correction the corrected party has not been told is half a correction.

### Other measured non-collisions (so they are not re-litigated)

- The legal and brochure pages carry almost no colour literals (ResidentRights.tsx has 1,
  WhyCostaRica.tsx and ProjectHistory.tsx have none), and the tokens lane is working in admin
  panels and components, so brochure and tokens do not collide in practice. The single hex
  literal in ResidentRights.tsx belongs to TOKENS, not brochure.
- `server/lib/exchange.ts`, `shared/ballotSubjects.ts` and `server/lib/secrets.ts` are held by
  no wave 1 lane.
- `server/seeds/content-seed.json` belongs to NEUTRAL. brochure may not touch it and must
  create its own new seed file instead.

### Migration numbers

Next free is still **0121**. brochure is the only wave 2 lane likely to need one. Claim it in
section 3 of this ledger BEFORE creating the file. Gaps at 0111 and 0115-0119 stay burned.

## 7c - The control worktree (lanes: this exists, do not build your own)

`C:/Users/taren/Desktop/Amora/s2-control` is a PRISTINE detached worktree at 052d042 with
dependencies installed. It exists so the coordinator can measure a real baseline for build and
test, because the landing criterion is NO WORSE THAN BASELINE rather than "green", and a
remembered green is a sample and not a proof.

It is announced here on purpose. A previous program cut a pristine baseline worktree, never
told the lanes, and one lane built its own and broke its dependencies doing it.

Rules for it: read from it freely, never write to it, never commit in it. If you need a clean
comparison run, use it rather than resetting your own tree.

## 8 - Changelog

- 2026-08-30. Ledger created. Nine worktrees cut off 052d042. Gate set enumerated from the
  workflows directory. Migration registry established (next free 0121). Baseline measured for
  the three dependency-free guards; rest unmeasurable until per-worktree install.
