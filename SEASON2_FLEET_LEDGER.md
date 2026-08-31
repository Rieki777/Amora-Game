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

- **R6** 2026-08-31. Coordinator ratification of the ops lane quarantine scope. The ops lane
  asked whether quarantining the `library` module on an escrow reconciliation failure was too
  permissive, since it is a value statement rather than a mechanical one. RULING: the lane is
  right, keep it. Its reasoning holds - a dead process repairs no escrow and takes every other
  module down with it, while switching the library off is the one act that actually stops
  library credits moving. Village-wide ledger conservation and migrations stay fatal, which is
  what the brief asked to protect. This is per-module quarantine working as intended.

- **R7** 2026-08-31. Coordinator ratification of a lane REFUSING part of its brief, with
  evidence. My brief told the ops lane to quarantine four per-module boot assertions. The lane
  refused one: `assertCapabilityHoldingInvariants` has no module to quarantine, and
  `villageHeldCapabilities` already filters every row through TRANSFERABLE before granting
  anything, which the repo's own test at `server/lib/capabilityHolding.test.ts:119-121` proves
  yields an empty list for a bad row. So a bad row grants nothing and locks nobody out, and
  refusing an entire village over it is all cost and no protection. It now records loudly and
  serves. RULING: accepted. The refusal measured something and found my premise wrong, which is
  the behaviour every brief in this program asks for.

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
- **secrets lane, 2026-08-30: claimed nothing, 0121 is still free.** Encryption at rest for
  the village integration secrets needs NO numbered SQL migration and must not have one.
  MySQL cannot do AES-256-GCM and must never be handed the key, so the conversion runs in
  `loadSecrets` at boot: it seals any plaintext entry in place and writes the document back
  once. Proved idempotent against the real local MySQL, not reviewed: the row is
  byte-identical after the second and third runs (a re-seal would change the ciphertext,
  since the iv is fresh per call, so equality is what proves nothing ran).
- **Reserved fork band. DECIDED AND ENFORCED (safety, `c551f70`).** Village-local migrations
  use `9000+`. `scripts/check-migration-numbers.mjs` fails this repo's CI if any file here
  reaches 9000, which is upstream keeping its half; a fork adding its own runs the same script
  with `--village`. The band works because the runner sorts BY FILENAME, so `9001_` sorts after
  every upstream number that will ever exist and a village migration always runs last.
- **Burned numbers: the register is now redundant, and it was incomplete.** Measured across all
  local refs and worktree HEADs: 0111 and 0115-0119 never existed as files in ANY ref, and
  0064, 0065, 0080, 0094, 0100, 0103 and 0107 are gaps of the same kind that the register does
  not name. The gate enforces the general rule instead: a migration added since the base ref
  must be numbered above every number that ref already has. Only forward, no list to maintain.
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

### THE BASELINE (definitive, 2026-08-31, at 052d042, pristine control worktree)

Completed run, dependencies installed, test env present, real local MySQL on 127.0.0.1:3307:

    pnpm test  ->  exit 0
    Test Files   203 passed (203)
    Tests       3057 passed (3057)
    Duration    2331.50s

**ZERO skipped. ZERO failed.** This is the number every lane and every integration is judged
against. The landing criterion is NO WORSE THAN THIS, not "green".

The same tree WITHOUT the test env, measured on the same machine, exits 0 while reporting
135 files passed / 68 skipped and 1979 tests passed / 1078 skipped. That gap of 1078 tests is
the silent-skip trapdoor, and it is the DEFAULT state of any fresh clone of this repository,
because `.env` is gitignored. The gates lane has since made that condition fail loudly under CI.

Also measured on this baseline: `pnpm build` exits 0 in about 27s, and S15 in
`server/loop.e2e.test.ts` PASSES, which settles the failure one lane saw under contention.

### Earlier partial measurements (superseded, kept for the record)



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
| Repo is PUBLIC with unencrypted DB dumps as downloadable artifacts | founder (GitHub admin) | 2026-08-30 | **CORRECTION, backup lane, 2026-08-30 later same day, via `gh api repos/Rieki777/Amora-Game`: the repo is now `"private":true, "visibility":"private"`, not public.** `pushed_at` is 2026-08-30T16:57:30Z, `updated_at` (repo settings, not code) is 2026-08-31T03:21:16Z, after the push, consistent with the founder having already flipped visibility. Collaborators now list only `Rieki777`. **This does not close the exposure window that already happened**, and it does NOT make the 29 currently unexpired `db-backup-*` artifacts (dated 2026-08-02 through 2026-08-29, still unencrypted, still downloadable by anyone with current repo read access, expiring on their own only by late September) safe to leave in place, only safer than while public. Recommend the founder delete those 29 artifacts by hand once the encrypted workflow (this lane's commit `0aa1f71`) is confirmed producing encrypted ones; deleting them was not done here since it is destructive and outside this lane's asked-for deliverables. |
| `PROD_DATABASE_URL` secret is rejected by MySQL as of the 2026-08-30T14:26 UTC scheduled run | founder / whoever holds Railway access | 2026-08-30, found by backup lane | `mysqldump: Got error: 1045: Access denied for user 'root'@'100.64.0.17' (using password: YES)`, failing in 7s, a NEW failure mode distinct from the prior week's runs (2026-08-25 through 2026-08-29 all failed later, at `restore-drill`'s scratch-MySQL service with `ERROR 2013 Lost connection`, which is CI service-container flakiness, not a credential problem; the `backup` job itself succeeded on all of those). The timing (same day the exposure was escalated) is consistent with the production DB password having already been rotated without `PROD_DATABASE_URL` being updated to match. Until this is fixed, `db-backup.yml` cannot dump anything, encrypted or not, independent of the encryption work in commit `0aa1f71`. |
| Secret rotation after the exposure | founder | 2026-08-30 | Stripe keys, all `app_config` integration secrets, village signing key, legacy-hash password resets. |
| `VILLAGE_SECRETS_KEY` must reach `.env.example`, `docs/PROVISIONING.md` and `scripts/fork-init.mjs` | kit (owns all three) | 2026-08-30, filed by secrets lane | New required variable: 32 bytes as 64 hex (`openssl rand -hex 32`), SEPARATE from `MEMBER_SECRETS_KEY`. Without it Admin, Integrations refuses every save with "this deployment has no village-secrets key; ask your operator", so all 13 founder instances need it set before anyone types a Stripe key. Documented in full in `docs/FORK_RUNBOOK.md`, section "`VILLAGE_SECRETS_KEY`: your integration secrets at rest (2026-08-30, secrets lane)". A hosted village must not share one key value with another village. |
| Two admin routes in `server/index.ts` need a 3-line pre-check before `putSecret` | ops (owns `server/index.ts`) | 2026-08-30, filed by secrets lane | `putSecret` now THROWS when `VILLAGE_SECRETS_KEY` is absent, which is the fail-closed behaviour and is correct. Under Express 4 an async throw from a route handler is an unhandled rejection, not a 500, so the request HANGS. Nothing is written either way, but the founder gets no answer. Fix, matching the member-key route already at `server/index.ts:6995`: `if (!villageSecretsConfigured()) return res.status(503).json({ error: NO_VILLAGE_SECRETS_KEY_SENTENCE });` before the `putSecret` calls near lines 19475 (email-config passthrough) and 19632 (`PUT /api/admin/integrations/:key`). Both names are exported from `server/lib/secrets.ts`. Also note the boot legacy-key move near line 1556 calls `putSecret` inside `initStores`, so on the one deployment class that still holds a legacy `resend_api_key`/`assistant_api_key` in the email-config document, a missing key refuses the BOOT rather than serving. Documented in FORK_RUNBOOK; ops may prefer to make that move tolerant. |
| Admin, Integrations should render the two new status fields | tokens (owns `client/src/**`) | 2026-08-30, filed by secrets lane | `SecretStatus` now carries `atRest: "sealed" \| "plaintext" \| null` and `unreadable: boolean`. Both are additive and the panel renders correctly today without them, but `plaintext` is a finding a founder should see (that row is in every dump until the next boot with a key set) and `unreadable` is the only thing that distinguishes a rotated key from a lost credential. Server side is done and shipped; this is display only. |
| The village's ed25519 SIGNING key is still plaintext in `app_config` | whoever takes `server/lib/villageExport.ts` | 2026-08-30, found by secrets lane | `ensureSigningKey` stores `privateKeyPem` in the clear under `config_key = 'village-signing-key'`, so it rides in the same dumps the integration secrets used to. Deliberately NOT fixed in the secrets lane: it is a different file, a different credential class (identity, not payment, so outside this lane's harm metric), and it has a real bootstrapping problem the integration store does not, since it is MINTED at first boot and fail-closed there would refuse to boot a fresh instance with no key set. Needs its own decision about what happens on a fresh install. |
| A workflow_dispatch CI job to run `ops/roll.mjs apply` with the paging webhook and per-village deploy secrets in scope | safety (owns `ci.yml`) | 2026-08-30 | Not urgent: `ops/roll.mjs` runs fine by hand today and the release lane has not published an image yet (landing queue item 3), so there is nothing real to roll out to. File this when release lands so a human is not the only way to kick off a rollout. fleet lane does not touch `.github/workflows/**` itself. |
| `data/uploads/` volume has no backup of any kind | ops (owns `server/index.ts`) | 2026-08-30 | backup lane cannot reach a Railway volume from a GitHub Action; `railway ssh` is interactive-only and this repo's own history shows it run by hand, never headless. Full spec for an authenticated `GET /api/admin/backup/uploads-archive` (route, `BACKUP_EXPORT_TOKEN` header auth, streamed tar, canary-file manifest) is written up in `docs/FORK_RUNBOOK.md`, "Backup encryption, the uploads volume gap..." section, 2026-08-30. Not half-built; needs the lane that owns `server/index.ts`. |
| New repo secrets needed for backup encryption: `BACKUP_GPG_PUBLIC_KEY`, `BACKUP_DRILL_GPG_PUBLIC_KEY`, `BACKUP_DRILL_GPG_PRIVATE_KEY` | founder (GitHub secrets) | 2026-08-30 | `db-backup.yml` now fails closed (refuses to dump) until these exist. Generation commands and which secret holds which half are in `docs/FORK_RUNBOOK.md` same section. The drill keypair is CI-only test material and safe to generate and hand over; the production public key's private half must be generated and held by the founder offline, never in this repo or CI. |
| A CI step for `scripts/check-theme-literals.mjs` | safety (owns `ci.yml`) | 2026-08-30, tokens lane | New ratchet, same shape as the existing `check-brand-refs.mjs` / `check-image-budget.mjs` steps. Exact step to add, right after `check-image-budget.mjs` (both are dependency-free, no-DB, colour/asset budget gates, so they belong next to each other, before the Build step): `- name: Theme literals` then `run: node scripts/check-theme-literals.mjs`. No env, no extra permissions, no new secret. Committed baseline (`scripts/theme-literals-baseline.json`) is at 162 as of commit `4892c97` on `wt/s2-tokens`; `--update-baseline` refuses to write a total above the one already committed (verified by hand: a staged regression fails the gate at exit 1, then `--update-baseline` against that same regression also exits 1 and leaves the baseline file on disk untouched; see 7e for the full transcript). |
| Three CI steps for the guards' own regression tests | safety (owns `ci.yml`) | 2026-08-30, gates lane | `scripts/check-brand-refs.test.mjs`, `scripts/contribution-scan.test.mjs`, `scripts/intake-classify.test.mjs` all exist, all pass standing alone, and no workflow runs any of them today (`intake-classify.mjs` and `contribution-scan.mjs`, the code they test, ARE invoked, only their tests are dead). Verified: this repo's own notes record the brand guard reporting two different answers for the same commit on two machines, which is exactly the failure a dead regression test cannot catch. Belongs in `ci.yml`, not `module-intake.yml`: that workflow is `paths`-gated on `shared/modules.ts` / `shared/capabilities.ts` / etc, and none of those paths cover `scripts/intake-classify.mjs` or `scripts/contribution-scan.mjs` themselves, so a change to the classifier's own logic would never trigger its own test under that workflow. `ci.yml` runs on every push and PR unconditionally, which is what a guard-of-a-guard needs. Recommend placing them right before the existing `node scripts/check-brand-refs.mjs` step, so a broken guard test fails before the guard it is testing is trusted; all three are plain Node, no DB, sub-second each: `- name: Guard regression test, brand refs` / `run: node scripts/check-brand-refs.test.mjs`, then the same shape for `- name: Guard regression test, contribution scan` (`contribution-scan.test.mjs`) and `- name: Guard regression test, intake classifier` (`intake-classify.test.mjs`). No env, no new secret, no new permission. Each verified standing alone at `7976b29` on `wt/s2-gates`: brand refs 9/9 checks passed exit 0, contribution scan 24/24 assertions exit 0, intake classifier 13/13 assertions exit 0. |

## 7 - What I got wrong (coordinator errors, recorded at the same prominence as findings)

- **2026-08-30. I dispatched twelve lanes at ONE MySQL and asked each to run a two-hundred-file
  suite against it.** My pristine control run measured 38 to 46 seconds PER FILE on
  database-backed suites under that load. Two costs: every lane full-suite run burns 20-plus
  minutes, and the numbers reflect machine load rather than code. The tokens lane duly reported
  `server/loop.e2e.test.ts` S15 failing in files it never touched; that test PASSES on pristine
  control at 052d042, so it was contention, not a regression. Corrected mid-round: lanes now run
  typecheck, build, their guards, and ONLY the suites covering their own files. The coordinator
  runs the full suite serially at integration and compares it against the control. This is the
  skill's own paired-reps warning (a dozen agents sharing one box) arriving as a bill.

- **2026-08-30. My brief to the tokens lane carried three wrong numbers, and the lane caught all
  three.** I said about 554 hex literals (real count 573), about 176 in Admin.tsx (real count
  213), and I named a second teal `#4A7C7C` that DOES NOT EXIST anywhere in the repository. Root
  cause of the Admin.tsx gap: my method counted matching LINES, and a single line can carry two
  literals. The lesson is the one already in every brief and it applies hardest to me: a number
  in a brief is a measurement with a timestamp and a method, and the method is the part that
  silently lies. The lane counting for itself before fixing is exactly the behaviour the briefs
  ask for.

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
this runs green for real: see blocker list.

Gate results at `0aa1f71` (this worktree, after `pnpm install --frozen-lockfile`), each read
directly with no pipe: `node scripts/check-doc-links.mjs` exit 0 (41 refs, 6 docs, unchanged;
FORK_RUNBOOK.md is not in that script's own DOCS list so the append could not have broken it
either way), `node scripts/check-hyphen-dash.mjs` exit 0 (0 found), `node scripts/check-voice.mjs`
exit 0 (668 files, 2 pre-existing waivers, unchanged; neither touched file is in that script's
SCAN_ROOTS), `pnpm check` exit 0 (tsc --noEmit, matches the section 4 baseline). `pnpm build` and
`pnpm test` were not run for this lane; nothing here touches application code, only a workflow
file and an appended doc section. A manual scan for em/en-dash characters (U+2013/U+2014) inside
the newly appended FORK_RUNBOOK.md section specifically (not just the whole file, which carries
73 pre-existing ones from before this round) found zero.

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

## 7d - fleet lane landed (2026-08-30, on `wt/s2-fleet`, not yet merged to main)

Built the whole control plane in `ops/**`, nothing touched outside it:

- `ops/fleet.json.example`: the manifest schema. Per village: id, name, hosting
  (`"regen"` or `"self"`, modeled explicitly, not inferred), ring, domain, healthUrl,
  steward, and either `deploy.{stopCommand,startCommand}` (regen) or `notify.{method,target}`
  (self). Pins carry `version`, `reason`, `pinnedAt`, `expiresAt`. No real `ops/fleet.json` is
  committed; there is no real per-village data yet (no founder onboarded), and the file design
  never holds a literal secret regardless (commands reference `$ENV_VARS`, resolved by the
  shell at run time), so a real one is safe to commit later without a `.gitignore` line.
- `ops/roll.mjs`: `plan` (default, pure reads, never runs a command), `apply` (the real thing,
  requires the word), `check` (the same health-wait loop aimed at one URL, used for both
  preflight and the proofs below). Walks rings strictly in the declared order, one village at a
  time (never parallel within a ring, on purpose: the harm metric is "the FIRST unhealthy
  village", and parallelizing blurs which one that was). Halts and pages on the first failure;
  never touches a later village or ring after a halt.
- `ops/README.md`: how to run a rollout, pin/unpin (hand-edit the JSON, capped by
  `maxPinDays`), what a halt means and what to do about it, and the two proof commands below.

**Cross-lane contract, re-verified myself, not just trusted from section 7b:** read
`server/index.ts` directly. `GET /health` (line 7347) returns
`{ status, build: BUILD_MARKER, timestamp, uploads }`; `GET /api/platform/info` (line 13243)
also exists and separately returns `version: PLATFORM_VERSION` (currently `"1.1.0"`,
`server/lib/identity.ts:33`) alongside the same `build`. `BUILD_MARKER` (line 792) is
`` `${BUILD_LABEL}-${sha||"dev"}` ``, and `BUILD_LABEL` (`"2026-07-28-wave1"`) itself contains
hyphens, so `roll.mjs` extracts the SHA as the LAST hyphen-delimited segment, not by splitting
on the first hyphen. Confirmed the same convention independently in
`docs/FORK_RUNBOOK.md:639-641` ("`/health` -> ok, and its `build` reads `<label>-<git sha>`").
`scripts/build-server.mjs` stamps it from `RAILWAY_GIT_COMMIT_SHA` / `GITHUB_SHA` /
`SOURCE_VERSION`, sliced to 7 chars, falling back to a local `git rev-parse` and then to `""`
(reads as `"dev"`), never a guess.

**Stop then start, confirmed before designing anything.** `server/repos/store-db.ts:21`: "One
process per deployment (Railway) is what makes the cache sound." `apply` runs `stopCommand` to
completion (checked exit code) before it ever runs `startCommand`, and the manifest requires
both fields separately rather than one `redeploy` command, precisely so a blue/green primitive
can't be dropped in as a single-field shortcut. `ops/README.md` says outright that this script
can only enforce the ordering between the two commands, not what happens inside them, and that
a `stopCommand` which returns before the old process has actually exited defeats the design.

**Why the deploy adapter is an opaque shell command, not a Railway API client.** The brief's
contract only fixes the image and its tags; how a given village actually gets redeployed is not
committed to Railway specifically anywhere in code I could find, and `docs/FORK_RUNBOOK.md:41`
names Railway, Fly and Render as valid targets for a fork in the same breath (`TRUSTED_PROXY_HOPS`
guidance). Hardcoding a Railway GraphQL mutation I could not verify against a live token felt
worse than the honest alternative: `deploy.stopCommand` / `deploy.startCommand` are plain shell
strings with `{{TAG}}` substitution, run with the operator's own environment already in scope.
`ops/fleet.json.example` ships these as `echo FILL_IN_...` placeholders since no real per-village
deploy target exists yet (release lane has not published railway.toml or a Dockerfile in this
worktree; confirmed by their absence).

**The central risk, addressed and proven, not just asserted.** `probeOnce()` in `roll.mjs` has
exactly one path back to `ok:true`: an HTTP 200 whose body has `status:"ok"` AND a `build` field
whose trailing SHA equals the one being rolled. Every other outcome, unreachable, timeout,
non-200, unparseable JSON, `status` not `"ok"`, no `build` field, a `build` field that doesn't
end in a recognizable SHA, or a SHA that doesn't match, returns `ok:false` with a named reason.
Proved both required failure modes with the same `check` subcommand real `apply` calls
internally:

```
$ node ops/roll.mjs check --url http://village-that-does-not-exist.invalid.test/health --sha 0000000 --timeout-ms 6000 --interval-ms 2000
CHECK   adhoc  http://village-that-does-not-exist.invalid.test/health  expecting sha 0000000  timeout 6000ms  interval 2000ms
  attempt 1: unreachable (fetch failed)
  ...
RED     adhoc  never became healthy at the expected sha: unreachable (fetch failed), 4 attempt(s)
$ echo $?
1
```

```
$ node -e "require('http').createServer((_,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({status:'ok',build:'2026-07-28-wave1-deadbee'}))}).listen(8843)" &
$ node ops/roll.mjs check --url http://127.0.0.1:8843/health --sha 1234567 --timeout-ms 6000 --interval-ms 2000
  attempt 1: sha_mismatch (got deadbee, want 1234567)
  ...
RED     adhoc  never became healthy at the expected sha: sha_mismatch (got deadbee, want 1234567), 4 attempt(s)
$ echo $?
1
```

A control run against the same fake server with `--sha deadbee` (the SHA it actually serves)
returned `GREEN ... healthy at 2026-07-28-wave1-deadbee after 1 check(s)`, exit 0, so the logic
demonstrably can pass, it just never passes without a positive match.

**A real bug caught by my own testing before commit, not by the coordinator.** First draft's
pin-skip check (`isActivelyPinned`) read an EXPIRED pin as no-longer-pinned and rolled the
village straight through, exactly the silent accumulated-migration jump the fleet rules exist to
forbid, and directly contradicted what the README I had already written claimed it did. Caught it
by testing an expired-but-still-in-cap pin against `plan` and watching it print `WOULD REDEPLOY`
instead of `SKIP`. Fixed: renamed to `isPinned`, now `!!v.pin` with no expiry check at all,
expiry only ever feeds the loud `stalePins()` warning (`plan` and `apply` both print it every
run). Re-ran the same case after the fix: `SKIP founder-wave1-a pinned ... ` plus the warning
line, confirmed. Also confirmed the pin cap itself is enforced at manifest LOAD time, not just
observed at runtime: a pin window of 285 days against `maxPinDays: 30` makes `roll.mjs` refuse
to run at all (exit 2), for either `plan` or `apply`, before touching any village.

**Nothing in the brief was wrong.** Both endpoint names, the SHA-stamping mechanism, and the
single-process cache constraint checked out exactly as briefed, against the code, not against
the brief's description of it.

Gate results at `052d0422b5fbeea86e4309822bdc31a0c8b41f72` (this worktree, after
`pnpm install --frozen-lockfile`), each read directly with no pipe: `node scripts/check-doc-links.mjs`
exit 0 (41 refs, 6 docs, unchanged; `ops/README.md` is not in that script's DOCS list), `node
scripts/check-hyphen-dash.mjs` exit 0 (0 found; that script only scans `client/src` anyway),
`pnpm check` (`tsc --noEmit`) exit 0. Also ran, as extra diligence beyond the three named gates
since `ops/**` lands in a HARD-CLEAN zone for it: `node scripts/check-brand-refs.mjs` exit 0
("hard-clean zones are clean"). `pnpm build` and `pnpm test` were not run; nothing in `ops/**` is
imported by server or client code, and the lane is scoped cheap.

## 7e - tokens lane landed (2026-08-30, on `wt/s2-tokens`, not yet merged to main)

**Brief numbers re-verified, mixed result.** The brief's rough count (roughly 554 hex literals,
roughly 331 of them two teals) was close but wrong in one specific way worth recording: there is
only ONE legacy teal, not two. `#2D5A5A` appears 331 times across 35 files, matching the brief
almost exactly; `#4A7C7C`, the brief's second teal, was searched for case insensitively across
the whole repo (not just `client/src`) and appears NOWHERE, not in a single file. Did not touch
anything on the strength of that claim. Also: Admin.tsx carried 213 raw hex occurrences before
this lane touched it (211 of them `#2D5A5A`), not the brief's "roughly 176"; the brief's own
counting method undercounted by measuring matching LINES instead of occurrences, which
undercounts any line carrying more than one literal (Admin.tsx has plenty, e.g.
`"bg-[#2D5A5A] text-white border-[#2D5A5A]"` is one line, two hits).

**What shipped:**

- `scripts/check-theme-literals.mjs` + committed `scripts/theme-literals-baseline.json`: a
  ratchet on theme-bypassing colour literals in `client/src/**/*.tsx`, modelled on
  `check-brand-refs.mjs` (per-file baseline, so moving literals to a new file cannot stay green)
  and, per this round's explicit instruction, `check-image-budget.mjs`'s refusal to ever let
  `--update-baseline` write a total higher than the one already committed (`check-brand-refs.mjs`
  does not refuse that; this one does). Strips every `var(...)` span, fallback argument included,
  before counting, so the platform's own established `var(--tone-brand, #157f7d)` pattern
  (CircleScene.tsx, MoonGlyph.tsx, YearWheel.tsx) costs nothing. Proof of the refusal, run by
  hand at `2a527b9`: staged a literal in a previously clean file, the gate failed at exit 1;
  `--update-baseline` against that same regression also exited 1 and the baseline file on disk
  was confirmed byte-identical afterward. Reverted the test literal before the real commit.
- Retired `#2D5A5A` everywhere: all 331 occurrences across 35 files were the identical
  `-[#2D5A5A]` Tailwind arbitrary-value fragment (verified before touching anything, so a single
  mechanical `-[#2D5A5A]` to `-teal-deep` pass covers every one with no partial-class risk), plus
  Admin.tsx's two `hover:bg-[#234747]` sites folded into the existing `teal-deep-dark` hover
  token. `teal-deep` and `teal-deep-dark` were already load-bearing tokens used in 129 other
  files before this lane touched anything, not new invented names.
- `MobileTabBar.tsx` and `MobileFab.tsx`, the two highest-visibility mobile shell surfaces (tab
  bar and floating action button, both `client/src/components/mobile/`), fully routed off
  hardcoded teal/amber/cream hex through `teal-band`, `teal-deep`, `amber`, `cream`, or a
  `var(--tone-*, <original literal>)` fallback where the exact original shade mattered. The focus
  scrim moved from a one-off `#062322` to `bg-black/45`, the same convention nine other
  dialog/drawer/sheet/overlay surfaces already use.
- Six more near-duplicate literals swept once the ratchet surfaced them: `ResidentRights.tsx`'s
  `#2e5a58` and `InvestorJourney.tsx`'s `#1f7a78` are both within a couple of RGB units of an
  existing token and snapped to it; `InvestorJourney.tsx`'s two `#3d6e4a` are an EXACT match for
  the already-defined `--color-sage` token.
- Nine genuine false positives waived with `theme-ok: <reason>`, not silently dropped: three
  colour-input defaults/placeholders in `LookPanel.tsx` (the seed-colour wizard itself, which
  necessarily shows hex text before a founder has picked one), two more of the same shape in
  `MapSkinPanel.tsx`, one placeholder in `EventsAdminPanel.tsx`, and one CSS attribute-selector
  string in `components/ui/chart.tsx` that MATCHES recharts' own hardcoded `#ccc`/`#fff` to
  override them with token classes, rather than applying either hex itself.

**Baseline: 162** (down from 573 raw hex occurrences in `client/src/**/*.tsx` measured before any
fix in this lane, by plain grep; the two numbers are not directly comparable, since the ratchet
gate also counts non-var `rgb()`/`hsl()`/`oklch()` literals the raw hex grep did not, and
correctly excludes literals living inside a `var(...)` fallback that the raw grep could not tell
apart from a real bypass). Measured the same way at the end: 225 raw hex occurrences remain,
nearly all inside `var(...)` fallbacks or the two remaining hard cases below.

**What the ratchet deliberately does NOT cover, and why left alone:**

- Tailwind's own default palette classes: `text-gray-*` alone measures EXACTLY 1,287 across
  `client/src`, matching the brief's figure precisely. These are not LITERALS in the sense this
  ratchet gates (no hex, no rgb/hsl function), they are Tailwind's own built-in colour scale, a
  separate and much larger problem with a different fix shape (swap to semantic tokens like
  `text-muted-foreground`, not a mechanical find-replace). Flagging as a follow-up, not folding
  into this ratchet's number, since conflating the two would make one gate measure two different
  kinds of debt with two different fix shapes.
- `client/src/components/crowdpool/PoolPieces.tsx` (73 literals) and its sibling
  `Crowdpool.tsx`/`CrowdpoolCampaign.tsx` pages (35 more): a "sepia treasure map" art style for
  one specific game feature, deliberately NOT the village's brand palette. Left alone on
  purpose, not as debt.
- `power/DecideLens.tsx` (10) and `governance/QuorumField.tsx` (6): colourblind-safe (Okabe-Ito
  style) palettes distinguishing decision-making methods and speaking/silent states from each
  other. These need to stay visually distinct from each other regardless of a village's brand
  colour, which is an accessibility requirement in tension with, not solved by, tokenisation.
  Counted, not waived, since they are still literals a founder's colour cannot reach; flagging
  the tension rather than resolving it by fiat.
- `pages/Characters.tsx` (4): discrete skin-tone swatch options offered to the player, not brand
  chrome.
- `components/ManusDialog.tsx` (7): appears to be a vendored/example dialog component (the name
  matches no other identifier in this codebase); left alone rather than guessing at a rewrite.

**Gate results at `4892c97`** (this worktree, after `pnpm install --frozen-lockfile`), each read
directly with no pipe: `pnpm check` exit 0, `node scripts/check-hyphen-dash.mjs` exit 0 (0
found), `node scripts/check-brand-refs.mjs` exit 0 (unchanged: 52 legacy refs against a 63
baseline, 7 waivers), `node scripts/check-theme-literals.mjs` exit 0 (162 of a 162 baseline),
`pnpm build` exit 0 (`dist/index.js built @ 4892c97`), `node scripts/check-dist-budget.mjs` exit
0 (5768 KB of the 6600 KB block-charged ceiling, byte-identical to the pre-lane measurement in
this same worktree, so this lane's pure className/style-string edits did not move it). `pnpm
test`, run with the coordinator's corrected `.env` / `TEST_DATABASE_URL`, exit 1: **202
of 203 test files passed, 3056 of 3057 tests passed** (2497.75s, real MySQL round trips, not
mocked). The ONE failure is `server/loop.e2e.test.ts` > "S15: the tools hub rides the framework,
lifecycle posture end to end", asserting an SSRF guard on `PUT /api/admin/tools/:id` returns 200
and getting 500 instead (line 1484). Confirmed before writing this down, not assumed: grepped for
every file this lane touched against `server/loop.e2e.test.ts` and `server/index.ts` (the two
files that own this test and the route it exercises) and found zero overlap; this lane edited only
`client/src/**/*.tsx` and `scripts/check-theme-literals.mjs`, neither of which that test imports
or could affect. `server/**` is the ops lane's, not this one's, to fix. Recording this as a
PRE-EXISTING failure this lane observed, not one it caused, and leaving it for ops rather than
touching a file outside this lane's ownership.

**CI step requested, not applied** (this lane does not own `ci.yml`): filed in section 6.

## 7e - Landed lanes (verified by the coordinator, not self-reported)

Status ladder: CODED means the lane committed and its own gates were green at a named SHA.
VERIFIED means the coordinator confirmed it. Nothing here is merged to main yet.

| Lane | SHA | State | Note |
|---|---|---|---|
| backup | `0aa1f71` | CODED | GPG encryption to two recipients, fail-closed on missing secrets, plus a negative-control job that corrupts the ciphertext and asserts refusal. Proved red locally before landing. Spec'd the uploads endpoint rather than half-building it in a file it does not own. |
| fleet | `a980d0b` | CODED | Manifest plus ring roller; self-hosted villages modeled as notify, never redeploy. Proved red on an unreachable village AND on a wrong SHA, and green on a correct one. Caught a bug in its own draft where an expired pin read as unpinned. |
| tokens | `4892c97` | CODED | Theme-literal ratchet that refuses to raise its baseline; 331 occurrences of the legacy teal retired to tokens. Corrected three of my numbers. Dist budget byte-identical at 5768 KB of 6600 KB. |

### Corrections these lanes made to the coordinator, all verified

- The repository is now PRIVATE (flipped 2026-08-31T03:21Z). My blocker entry saying otherwise
  was stale. Verified directly with `gh repo view`.
- **29 unexpired, unencrypted `db-backup-*` artifacts remain** in the repository, dated
  2026-08-02 to 2026-08-29. Going private does not retroactively protect them.
- **The daily backup has been FAILING since 2026-08-28.** Runs on 08-29 and 08-30 both failed
  with access denied for user root. Consistent with the database password having been rotated
  without updating the `PROD_DATABASE_URL` repository secret. Verified with `gh run list`.

## 7g - Integration state, seven lanes (coordinator-run)

`wt/s2-integration` now carries main plus SEVEN lanes, merged in this order:

    backup -> fleet -> tokens -> ops -> constitution -> kit -> neutral

One conflict in the whole set, exactly where predicted: `docs/FORK_RUNBOOK.md`, where backup
and kit both appended dated sections. Resolved by keeping BOTH and stripping only the markers,
never picking a side. Verified afterwards that both sections survive.

The ops-versus-constitution hunk split in `server/index.ts` HELD. They merged clean. Worth
recording that the ops lane measured its nearest hunk at about 530 lines from a constitution
zone, not the roughly 2000 I estimated, so my margin was three times thinner than I claimed. It
still held, but the lesson is that the coordinator's estimate was the loose number.

GATES ON THE SIX-LANE TREE at **485ab2f**, exit codes captured with no pipe, in a worktree with
dependencies installed and a test env present. ALL GREEN:

    install 0 | pnpm check 0 | pnpm build 0 (dist/index.js built @ 485ab2f)
    brand-refs 0 | voice 0 | hyphen-dash 0 | doc-links 0 | auth-fetch 0 | admin-reach 0
    save-honesty 0 | repo-payloads 0 | mirror-annotations 0 | upload-strip 0
    artifact-budget 0 | route-reachability 0 | map-routes 0 | image-budget 0
    theme-literals 0 | dist-budget 0

Sixteen guards plus typecheck and build. The two migration gates are NOT in that list because
they live on the safety branch, which had not merged at that point.

Neutral merged after that run, at a3f4829, and its gates are re-run as part of the next pass.

STATE REMAINS "CODED, COORDINATOR-VERIFIED LOCALLY". GitHub CI has still never run on any of
this. The founder has since authorised pushing to main (the Amora village is not in use), so
the push will happen after the full suite runs serially against a completed control baseline.

## 7f - Integration branch (coordinator-run, not pushed)

`wt/s2-integration` in `../s2-integration` carries main plus the three landed lanes, merged in
this order with no conflicts at any step, ledger sections included:

    main ffb3199 + wt/s2-backup -> 57f1fb8 + wt/s2-fleet -> ec94684 + wt/s2-tokens -> 80a874c

GATES RUN BY THE COORDINATOR on the integrated tree at **80a874c**, exit codes captured with no
pipe, in a worktree with dependencies installed and a test env present:

    install 0 | pnpm check 0 | pnpm build 0 (dist/index.js built @ 80a874c)
    check-brand-refs 0 | check-voice 0 | check-hyphen-dash 0 | check-doc-links 0
    check-image-budget 0 | check-theme-literals 0 | check-dist-budget 0

Theme-literal guard reports 162 literals across 14 files against a baseline of 162, 7 waivers.

STATE IS "CODED, COORDINATOR-VERIFIED LOCALLY". It is NOT the ladder's VERIFIED state, which
requires CI green on that exact SHA. Nothing has been pushed, so GitHub CI has never run on any
of this. Pushing `main` in this repository deploys production, so the push is a founder
decision and is deliberately not the coordinator's to take.

The full test suite has NOT been run on the integrated tree. It will be, serially, once the
lanes stop competing for the one local MySQL, and compared against the pristine control.

## 7g - gates lane landed (2026-08-30, on `wt/s2-gates`, not yet merged to main)

Objective: no gate in this repo can report success without having actually run, and the
guards that protect the fleet are themselves tested. Three commits, `scripts/*.test.mjs`,
`vitest.config.ts`, `server/db/provisioningReport.ts` only, per the lane's boundary; did not
touch `server/db/testDb.ts`, `ci.yml`, or `scripts/brand-refs-baseline.json`.

**Brief re-verified, one number corrected downward in confidence, nothing else wrong.** The
brief's "roughly 44 database-backed test suites" undercounts the literal call sites: every
`describe.skipIf(` in this tree gates on `testDbConfigured()` (confirmed, zero exceptions),
and there are 133 of them across 79 files, not ~44. The 44 in the brief traces to a different,
correct number already in the tree's own comments (`provisioningReport.ts`: "44 provisions per
full run"), which counts scratch schemas per full suite run, not `skipIf` call sites; the two
numbers measure different things and both are real. The fix now reports the live 133 rather
than either fixed number, so it cannot go stale either way.

**What shipped:**

- `server/db/provisioningReport.ts`: `teardown()` now throws when `process.env.CI` is set and
  zero suites provisioned a schema (`noteProvision` recorded nothing). The message names a
  live count of `describe.skipIf(` call sites read from the tree at failure time, not a
  hardcoded guess. Local runs (no `CI` env var) are untouched by design.
- `vitest.config.ts`: `include` widened from `client/**/*.test.ts` to `client/**/*.test.{ts,tsx}`.
  Zero `.tsx` tests exist today; the gap was that one written tomorrow would never run and
  `pnpm test` would stay green throughout.
- `scripts/check-brand-refs.mjs`: `--update-baseline` now refuses to write a per-file count
  higher than the one already committed, matching `check-image-budget.mjs`'s ratchet discipline
  (ported per-file, not per-total, since the gate itself enforces `count > baseline[file]` one
  file at a time). `--force` is the explicit escape hatch for a deliberate raise, and it still
  prints every file that rose. `scripts/brand-refs-baseline.json` itself was never touched
  (neutral lane's file); the refusal logic was proven against an isolated fixture tree, not the
  real baseline.

**Proof each gate goes red, run at commit `7976b29` on `wt/s2-gates`:**

1. **The trapdoor, reproduced against the real repo, not a fixture.** With `.env` moved aside
   (no `TEST_DATABASE_URL`) and no `CI` set: `pnpm test` exits 0, `135 files passed | 68 skipped
   (203)`, `1979 tests passed | 1078 skipped (3057)`. Same tree, same missing env, `CI=true`:
   `pnpm test` now fails at startup with `[provisioningReport] CI is set and zero DB-backed
   suites provisioned a schema this run ... every one of the 133 describe.skipIf(...) suites
   ... silently skipped`, exit 1. Restored `.env` afterward and reran the no-CI case: identical
   `135 passed | 68 skipped`, exit 0, confirming the fix changes nothing locally. (These exact
   numbers, 135/68 and 1979/1078, were independently measured by the coordinator on pristine
   trunk before this lane finished; matched exactly.)
2. **check-brand-refs.mjs, isolated fixture (real repo baseline never touched).** Baseline said
   1 reference; raised the fixture file to 3. Plain gate: fails, exit 1, `3 brand reference(s),
   baseline allows 1`. `--update-baseline` without `--force`: refuses, exit 1, baseline file on
   disk byte-identical to before. `--update-baseline --force`: succeeds, exit 0, prints
   `baseline RAISED for 1 file(s) ... 1 -> 3`, baseline now reads 3. Lowered the fixture back to
   1 and ran `--update-baseline` with no force: succeeds normally, baseline back to 1. All four
   outcomes as designed.
3. **vitest.config.ts, the `.tsx` gap.** A deliberately failing `_fixture_tsx_pickup.test.tsx`
   under `client/src/lib/`: under the NEW `include` pattern, vitest collects it and reports it
   failed (`expected 1 to be 2`), exit 1. Under the OLD pattern (`client/**/*.test.ts`) run in
   isolation against the same file: `No test files found, exiting with code 1` (glob simply does
   not match the extension). Fixture removed before commit; real client suite reran clean after,
   `40 files passed (40)`, `491 tests passed (491)`.
4. **The three guard regression tests, standing alone (none are wired into any workflow yet;
   see the Blocker list, section 6):** `node scripts/check-brand-refs.test.mjs` (9/9 checks),
   `node scripts/contribution-scan.test.mjs` (24/24 assertions), `node
   scripts/intake-classify.test.mjs` (13/13 assertions), all exit 0. Confirmed each is a real
   gate, not a script that always exits 0, by reading the source: `check-brand-refs.test.mjs`
   uses uncaught `assert.strictEqual` (throws, non-zero exit, on any failure); the other two
   explicitly `process.exit(failures === 0 ? 0 : 1)`.

**Targeted, not full-suite, per the coordinator's protocol change mid-lane.** Ran: `pnpm check`
(exit 0), `npx tsc -p tsconfig.tests.json --noEmit` (exit 0), `pnpm build` (exit 0, `dist/index.js
built @ 052d042` then re-verified after each commit), `node scripts/check-brand-refs.mjs` (real
gate, unmodified baseline: unchanged, `52 legacy reference(s) ... baseline 63`), `node
scripts/check-hyphen-dash.mjs` (0 found), `node scripts/check-voice.mjs` (clean across 668
files, extra check not in the brief's required list), `npx vitest run client` (`40 passed |
491 tests passed`, the one test-file subtree this lane's `vitest.config.ts` change touches),
plus the three `.test.mjs` guard tests above and the trapdoor reproduction, which is a stronger
proof than any single targeted test file since it exercises the real global teardown against
the real tree. Did not run the DB-backed `server/**` suite at full scale; no file this lane
changed has a dedicated DB-backed test, and the machine is shared across twelve lanes on one
MySQL (38 to 46s per DB-backed file under this round's contention, confirmed once before the
protocol changed).

**All en/em dashes swept from own diff before each commit** (found and fixed 5 during work: 3 in
`check-brand-refs.mjs`/`provisioningReport.ts` comments, 3 in this ledger section's first
draft, later reduced to 0; counts verified with a Node Unicode scan, not a `grep -P` which
silently returned a false clean pass on this machine's locale, i.e. the exact silent-failure
class this whole lane exists to catch, caught in its own tooling).

**CI steps requested, not applied** (this lane does not own `ci.yml`): filed in section 6, one
row for the three guard regression tests.

## 7h - Landings, second batch, and what the lanes corrected

| Lane | SHA | Headline |
|---|---|---|
| ops | `e726e5a` | Boot alert reaches a real collector with no database involved; `/health` proven red four ways (cut, refused, blackholed, restored) and not latching; per-module quarantine; uploads gauge no longer walks the volume per request. |
| kit | `3725007` | README, `.env.example` with 27 documented variables, `fork-init.mjs`, `PROVISIONING.md`, and the founder-facing Claude setup prompt. |
| neutral | `452ab2b` | Neutral palette computed and contrast-checked, blank logo and favicon falling through to the platform mark, seed links stripped, 8 orphaned Amora images deleted, image budget ratcheted down 2216 to 2117 KB. |
| gates | `7976b29` | The silent-skip trapdoor now FAILS under CI; brand baseline refuses to raise; vitest picks up `.test.tsx`. |
| brochure | `fe3f3e1` | 22 jurisdiction-specific legal and tax claims out of compiled JSX into runtime content, with honest placeholders on a fresh instance. |

### Corrections the lanes made to me, all of which I accepted

- **gates:** my "about 44 database-backed suites" was wrong. There are **133** `describe.skipIf` call sites across 79 files. 44 is a real but different number (scratch-schema provisions per run). The thrown message now counts them live so it cannot go stale.
- **gates, and this one may affect other lanes:** `grep -P` returned a FALSE CLEAN on this machine when scanning for em dashes, matching nothing while the true count was three. The authoritative check is `node scripts/check-hyphen-dash.mjs`, which is Node-based. A grep-based self-check is not a check here.
- **brochure:** found a whole class I never briefed. **Twelve** occurrences of US 508(c)(1)(a) tax-deductibility claims, promising the reader a deduction on their own tax return, on the page collecting their money. False for any fork outside the US. Arguably a sharper harm than the Costa Rica land-law claims I did brief.
- **brochure:** `Housing.tsx` does not render `WhyCostaRica` as my brief assumed, but carries its own independent tax-free claim, so the check was right by a different mechanism.
- **neutral:** my brief named `content-seed.json`, which turns out to be DEAD DATA (the journey pages hold their own copy). The three seed files it did not name (`quests`, `roles`, `site-content`) are the live ones.
- **neutral:** reported honestly that it did NOT fully meet its objective, leaving `project.name` and `memberName` as Amora with a reasoned argument, rather than rounding up. A follow-up identity lane was dispatched for that plus the `Amora Admin` over `game.amora.cr` header in the admin panel.

## 7j - The two constitutional exploits, reproduced then closed

Both were REPRODUCED end to end over HTTP against the built `dist/index.js` at 052d042 before
any fix, then refused afterwards with the exploit conditions unchanged. This is evidence, not
an argument.

**Exploit 1, a founder carrying the launch vote alone.** Founder set `weight_mode=custom`,
allocated weight 1 to self and nothing to the other two members. `/api/admin/launch` reported
`onTheRoll: 3, tooFew: null`. The ballot opened with `unity_pct=100, quorum_pct=100,
electorate_count=3, total_weight=1`. The founder's single yes closed it as **outcome passed**,
`app_config.game-start` was written, the frozen document told the village *"100% participation
and 100% agreement"* and *"3 people hold a voice today"*, and a token mint then returned 200.
AFTER: the launch route refuses in plain language, propose returns 409, ZERO rows land in
`ballots`, and game-start stays null.

**Exploit 2, the governance token bought with a card.** Created `assembly-voice` (kind voice,
governance platform), listed it purchasable, priced it at 5.00, and stocked **100 voice minted
out of `sys:mint` into the treasury**. A member's buy reached the LAST gate (card payments not
configured), meaning kind, governance, one-seller, price, stock and stage had all passed. The
founder then pointed `governance.weight_token` at it in token mode. AFTER: listing 409, stock
409 with a measured `COUNT(*) = 0` in `token_ledger`, buy 404, and ordinary credits still work.

**A second hole the coordinator never named:** `equity` was refused only via
`governance === 'hypha'`, which held by ACCIDENT of the 0006 seed. A platform-governed equity
token traded freely. The positive test (only credit-kind trades) closes it and fails closed for
any kind a future migration invents.

**Boot sweep proven with a false-positive control**, which is the part that makes it a check:
a pre-existing bad row makes boot exit 1 naming the token; the same row with `weight_mode=equal`
boots fine, because the dial is inert and refusing would brick a village for a reason that is
not true.

**Residual, disclosed and not fixed:** a launch can still carry on one yes and two abstentions.
That is R74 plus the engine's documented abstain rule, it takes three people choosing to
answer, and changing it means editing `governanceEngine.ts`. Recorded rather than silently left.

## 7k - TWO intermittent tests, both resolved against the control, and I caused the condition

Two lanes independently reported a failing test. Neither is a regression. Both PASSED in the
definitive control run at 052d042, which finished 203/203 files and 3057/3057 tests with ZERO
failures and zero skips:

    server/loop.e2e.test.ts  S15 tools hub                          PASSED  422ms
    server/governance.routes.e2e.test.ts  (9 tests)                 PASSED  31710ms

- The constitution lane saw S15 fail once, then did the right thing rather than assuming: it
  checked out the base ref in its own worktree, rebuilt, ran the control at 70/70 green, and
  re-ran its own branch at 70/70 green.
- The kit lane saw the governance advisory notification assertion fail and correctly refused to
  touch a file outside its zone, flagging it instead.

**THE CONDITION WAS MINE.** Twelve lanes were running full suites against ONE local MySQL
because of my dispatch. That is not a state this repository is ever in normally, and it is the
same coordinator error already recorded above. So "flaky" here means "flaky under a contention
level the coordinator manufactured", which is a weaker claim than "flaky in CI".

**But it should not be dismissed**, for one specific reason. S15 writes through the JSON-backed
`toolsRepo`, and the original architecture audit independently flagged
`dbCollection.replaceAll` as a DELETE-then-reinsert of a caller-held snapshot with no per-row
upsert and no version guard, naming the tools link-check job as a live lost-update window. A
contention race there is exactly the shape that finding predicts, and a Railway deploy that
briefly overlaps two containers is a real-world instance of the same condition. It belongs on
the improvements list, not in the bin.



Two lanes independently saw `server/loop.e2e.test.ts` S15 fail (`PUT /api/admin/tools/:id`
returning 500). The constitution lane did the right thing rather than assuming: it checked out
052d042 in its own worktree, rebuilt, ran the control at **70/70 green**, then re-ran its own
branch at **70/70 green**. So it is intermittent on this machine and belongs to nobody's change.

The plausible cause is worth carrying into the improvements list: that route writes through the
JSON-backed `toolsRepo`, and the original architecture audit flagged `dbCollection.replaceAll`
as a DELETE-then-reinsert of a caller-held snapshot with no per-row upsert and no version guard,
with the tools link-check job named as a live lost-update window. A file or row contention race
under twelve concurrent lanes is exactly the shape that finding predicts.

## 7l - The container image is UNEXECUTED, and why that is acceptable for this push

`docker` is not installed on this machine (`command not found`, verified). So the release
lane's `Dockerfile` has never actually been built or booted anywhere. It is reviewed code, not
demonstrated code, and the report must say so rather than implying an image exists.

The Dockerfile itself is well made. Its last RUN re-derives the server's real runtime
dependency list FROM THE BUILT BUNDLE and fails the build if any of it is unresolvable, so
nobody maintains that list by hand. It names the two dependencies that reading the source
misses: `sharp` arrives through a dynamic import, and `dotenv` through a side-effect import
with no from clause.

WHY THIS DOES NOT BLOCK THE PUSH, and the distinction matters:

- Pushing `main` deploys Amora through the EXISTING nixpacks path in `railway.toml`. That path
  is unchanged by this work and has deployed this village many times.
- The image is only built by `.github/workflows/release.yml`, which triggers on a pushed SEMVER
  TAG. No tag is being pushed. So the container work is additive and dormant.
- The release workflow boots the image and checks its health BEFORE publishing to the registry,
  so the first real exercise of the Dockerfile fails in CI rather than reaching a village.

CONSEQUENCE FOR THE FLEET PLAN: the fleet roller cannot be exercised end to end until a tag is
cut and the first image publishes. That is the next milestone after this push, and it should be
done deliberately, watched, and on a scratch target before Amora.

## 9 - Post-deploy actions (queued, not yet done)

1. **Apply `server/seeds/brochure-legal-seed.json` to Amora's live content document.** Amora already has a `content` row, so the boot-time seed-on-empty path will not touch it, and Amora's own legal wording would render as placeholders until this is applied. One authenticated admin PUT to `/api/admin/content/legal`. Coordinator to run after deploy.
2. Verify the Railway deploy reaches SUCCESS and that `/health` reports the pushed SHA.
3. Live QA across the deployed instance, then fix what it finds.

### Needs a human decision (not a lane's call)

- `InvestorJourney.tsx` carries an **accredited-investor self-certification gate**, a US securities-law concept that gates the investor-pack request form. It is a functional compliance control, not prose. The brochure lane deliberately did not touch it and escalated it. Real legal judgement required.
- One background-check step claims the check itself is tax deductible, which looks like a copy-paste artifact. Preserved verbatim as data rather than silently corrected.

## 7i - safety lane landed (2026-08-30, on `wt/s2-safety`, not yet merged to main)

(Numbered 7i, not 7g: the section letters have already collided three times in this file. There
are two `7b`, two `7e` and two `7g` headings as of this write. Nobody's text was touched to fix
that, since each belongs to the lane that wrote it, but a reader following a cross-reference
will land on the wrong one, and the changelog's "See 7g for full detail" means the GATES lane's
7g at line 619.)

Branch `wt/s2-safety`, six commits off 052d042, head **`c551f70`**.

**`scripts/check-migration-numbers.mjs`.** Four rules, all working-tree cheap: every `.sql` in
`drizzle/` matches the runner's OWN discovery regex (a file that does not is a migration nothing
will ever apply, on any instance, silently); no number is used twice; nothing sits at 9000 or
above unless `--village`; and a migration added since the base ref is numbered above every
number that ref already reached. Watched RED six ways: duplicate number, undiscoverable
filename, 9000-band file without `--village`, a burned gap reused with no duplicate, and an
unresolvable base ref. `--village` on the same 9000-band file goes green, and a correctly
numbered `0121` goes green.

**`scripts/check-migration-compat.mjs`.** Four phases, each with its own count in the log so
none can hide behind another's success: (1) git-only immutability of shipped files, (2) a
destructive-statement scan for things the schema diff structurally cannot see, (3) the new
migrations applied to SEEDED ROWS on the real MySQL after the base ref's migrations, (4) an
information_schema contract diff. Both snapshots come from one server, so MariaDB-vs-MySQL-8
dialect cancels. One escape hatch, `-- compat-ok: <reason>`, which waives phases 2 and 4 and
never waives 1 or 3.

**The proof that phase 3 is the load-bearing one.** The historical LPAD collapse (LPAD truncates
as well as pads, so a rename put two ids on one value) passes reading, passes the destructive
scan because it carries a WHERE, and changes no column, type or constraint, so phase 4 sees
nothing at all. Against seeded rows: `Duplicate entry 'comp' for key 'PRIMARY'`, exit 1. Against
empty tables the byte-identical file exits 0. Measured both ways in the same session.

**A real defect the gate caught in my own probe.** A widening probe converted `quests.gratitude`
to bigint. That column reads like an int and has been `varchar(64)` since 0004, because every
quest advertises a range like "50-100". `pnpm check`, reading and every other gate here pass
that change; this one refuses it. On thirteen instances it would have erased the reward label.

Also watched RED: dropped column, dropped table, TRUNCATE, DELETE and UPDATE with no WHERE,
nullable tightened to NOT NULL, new NOT NULL with no default, new UNIQUE index, new FOREIGN KEY,
narrowed varchar, edited shipped file, deleted shipped file, a `splitStatements` copy drifting
from `server/db/migrate.ts`, and new migrations with no `TEST_DATABASE_URL`. Watched GREEN:
additive-only, `varchar(32)->varchar(64)`, `int->bigint`, `varchar->text`.

### Corrections to the coordinator, with evidence

- **Duplicate migration numbers are not hypothetical here; they have happened three times.**
  `git log --all --diff-filter=A` over `drizzle/*.sql`: 0062, 0063 and 0090 each carried two
  different files. Two of those pairs were added on `main`. The renumbering is its own commit,
  `d0e09b9`, "Renumber 0062-0065 to 0063-0066, around a collision on main". A person caught it.
- **The stated mechanism for burned numbers is backwards.** Section 3 said a reused filename
  "would replay". It does the opposite: `_migrations_applied` keys on filename, so an instance
  that already ran that name SKIPS the new body. Not replayed, skipped, silently, and every
  later migration then assumes a schema that instance does not have. That is the worse failure
  and it is why the band and the only-forward rule matter.
- **The gate-set step count in section 4 is stale and was undercounted even for its own day.**
  Enumerated with a YAML parser, not by eye. At 052d042: **24 steps total, 21 `run` steps, 3
  action steps.** The recorded 20 omitted `Bundle budget` (a multi-line `run: |`) and all three
  `uses:` steps. On `wt/s2-safety` at `c551f70`: **30 total, 27 `run`, 3 action.**
- **`check-hyphen-dash.mjs` cannot see anything outside `client/src`.** Line 42 is
  `for (const f of walk("client/src"))`. It is a real gate for client copy and it is NOT the
  authoritative dash check for scripts, docs or workflows, so a green from it says nothing about
  those files. My own content was scanned with a Node Unicode pass over eight dash code points
  (U+2012, U+2013, U+2014, U+2015, U+2212, U+FE58, U+FE63, U+FF0D) across 1486 lines: 0 found.
  Worth noting for the gates lane's `grep -P` finding: `grep -P` on this machine does not return
  a false clean so much as refuse to run, exiting 2 with "supports only unibyte and UTF-8
  locales", which reads as a failure and not as a pass. Either way, Node is the reliable tool.
- **`ops/roll.mjs` workflow_dispatch (section 6) NOT wired, on purpose.** `ops/` does not exist
  on main or on this branch (it is on `wt/s2-fleet`), no image has been published, and the
  request itself says to file it when release lands. A rollout job also belongs in its own
  workflow file rather than in `ci.yml`, which runs on every push. Redispatch it after release
  and fleet are on main.

### CI wiring (safety owns `ci.yml`; every request in section 6 is now answered)

`fetch-depth: 0` on the checkout, because both migration guards resolve the previous release
from git and the default single-commit clone cannot see `origin/main`. Steps added: `Migration
numbers` and `Migration compatibility` after the typechecks; the gates lane's three guard
self-tests before `Brand guard`; the tokens lane's `Theme literals` after `Image budget`.

The three guard self-tests were verified as genuinely unrun before wiring, not taken on report:
`vitest.config.ts` includes only `server/**/*.test.ts`, `shared/**/*.test.ts` and
`client/**/*.test.ts`, so those three `.mjs` files under `scripts/` are excluded by two separate
rules at once.

### Gates at `c551f70`, exit codes read with no pipe

    pnpm check 0 | tsc -p tsconfig.tests.json 0 | pnpm build 0 (dist/index.js built @ c551f70)

    check-migration-numbers 0   check-migration-compat 0    check-brand-refs.test 0
    contribution-scan.test 0    intake-classify.test 0      check-brand-refs 0
    check-voice 0               check-hyphen-dash 0         check-auth-fetch 0
    check-admin-reach 0         check-save-honesty 0        check-repo-payloads 0
    check-mirror-annotations 0  check-upload-strip 0        check-artifact-budget 0
    check-doc-links 0           check-route-reachability 0  check-map-routes 0
    check-image-budget 0        check-dist-budget 0         check-theme-literals 1

`check-theme-literals` is 1 BY DESIGN on this branch: the script and its baseline are on
`wt/s2-tokens`, not here. It goes green when the two land together. It is wired hard rather than
guarded with a skip-if-missing, because a step that quietly does nothing when its script is
absent is the exact failure the rest of that file exists to stop.

Per the no-full-suite protocol, one targeted suite: **`server/db/harness.test.ts`, 1 file passed,
6 tests passed, 0 skipped, 0 failed, 75.6s.** It is the suite closest to this lane's domain (it
asserts a cloned scratch schema is column-for-column identical to one that ran the migrations
itself). Nothing else was run, and nothing needed to be: this branch changes five files, none of
them application code, none of them imported by any test.

`drizzle/` was verified byte-identical to `origin/main` after roughly twenty throwaway probe
migrations: 107 files, zero tracked diffs, zero untracked.

## 8 - Changelog

- 2026-08-30. Ledger created. Nine worktrees cut off 052d042. Gate set enumerated from the
  workflows directory. Migration registry established (next free 0121). Baseline measured for
  the three dependency-free guards; rest unmeasurable until per-worktree install.
- 2026-08-30. fleet lane landed on `wt/s2-fleet` (not yet merged): `ops/fleet.json.example`,
  `ops/roll.mjs`, `ops/README.md`. Proved the halt-on-unreachable and halt-on-wrong-SHA paths
  live (both RED, exit 1); caught and fixed a real bug in its own pin-expiry check before commit.
  See 7d for full detail. Filed a non-urgent CI blocker for safety (workflow_dispatch wiring),
  section 6.
- 2026-08-30. secrets lane landed on `wt/s2-secrets` (not yet merged), 3 commits `a911b42`,
  `dac1449`, `a7c8673`. Village integration secrets are now AES-256-GCM at rest under a new
  `VILLAGE_SECRETS_KEY`, reversing the 2026-07-27 plaintext decision whose own written revisit
  condition (backups leaving the trust boundary) had fired. New `server/lib/sealedBox.ts` is
  the platform's ONE cipher, extracted from `memberSecrets.ts` unchanged rather than copied,
  so the member store and the village store cannot drift. Fail closed: a write with no key
  throws, clearing still works without one. Dual read for one release behind
  `ACCEPT_LEGACY_PLAINTEXT`, with both sides of the flip already under test. NO migration
  number claimed and none needed (see section 3). Filed three blockers in section 6 (kit:
  provisioning variable; tokens: two new status fields; unowned: the ed25519 signing key is
  still plaintext in the same table). Gates at `a7c8673`: `pnpm check` 0, tests-tsconfig 0,
  `pnpm build` 0, doc-links 0, hyphen-dash 0, check-voice 0, module-facts 0, every other
  dependency-free guard in `ci.yml` 0, `pnpm audit --prod --audit-level high` 0,
  `validate-module --all --diff=origin/main` 0 (was 1 before per-line waivers). Targeted
  suites: `secrets.test.ts` 9/9 passed 0 skipped, `memberSecrets` + `agentInbox` +
  `externalCalendars` 30/30 passed 0 skipped, `loop.e2e` 70/70 passed 0 skipped (needed
  `pnpm build` first, since the e2e suites spawn `dist/index.js`). Final commit `a2a04e0` adds
  a fourth: `addExternalCalendar` asks for the key rather than throwing, since a calendar
  address is stored through the same store. Filed a fourth blocker for ops in section 6.

- 2026-08-30. tokens lane landed on `wt/s2-tokens` (not yet merged): new ratchet gate
  `scripts/check-theme-literals.mjs` + `scripts/theme-literals-baseline.json` (162, refuses to
  raise, proven by hand). Retired the `#2D5A5A` regen-civics teal everywhere (331 occurrences,
  35 files; the brief's second teal, `#4A7C7C`, does not exist anywhere in the repo). Routed
  `MobileTabBar.tsx` and `MobileFab.tsx`, the two highest-visibility mobile shell surfaces,
  fully onto tone tokens. Six more near-duplicate literals swept once the ratchet surfaced them.
  See 7e for full detail, including what the ratchet deliberately does not cover (Tailwind's own
  default palette classes, ~1,287 `text-gray-*` alone, flagged as a separate follow-up rather
  than folded into this number) and the CI step filed for safety in section 6.
- 2026-08-30. gates lane landed on `wt/s2-gates` (not yet merged), three commits: CI now fails
  (not just skips) when zero DB-backed suites provisioned a schema, closing the silent-skip
  trapdoor in `server/db/provisioningReport.ts`; `vitest.config.ts` picks up `client/**/*.test.tsx`,
  not only `.test.ts`; `check-brand-refs.mjs --update-baseline` refuses to raise a file's
  count without `--force`. Reproduced the trapdoor against the real repo (not a fixture): local
  135 passed / 68 skipped, exit 0 unchanged; `CI=true` with the same missing env now fails at
  exit 1 naming a live count (133) of gated suites instead of passing silently. Corrected the
  brief's "~44 suites" to 133 literal `describe.skipIf` call sites (both numbers are real; 44
  counts scratch-schema provisions per run, a different thing already documented in the same
  file). Three guard regression tests verified passing standing alone; none wired into any
  workflow yet, filed as one CI blocker row in section 6 for safety. See 7g for full detail,
  including the four red/green proofs and the false-clean `grep -P` this lane's own dash check
  hit on this machine before switching to a Node Unicode scan.
- 2026-08-30. safety lane landed on `wt/s2-safety` (not yet merged) at `c551f70`:
  `scripts/check-migration-numbers.mjs` and `scripts/check-migration-compat.mjs`, both wired
  into `ci.yml` along with `fetch-depth: 0` and every outstanding CI-step request in section 6
  (gates lane's three guard self-tests, tokens lane's theme-literal ratchet). The village
  migration band is decided and enforced at `9000+`; the expand/contract rule is written up in
  `CLAUDE.md` under "Writing a migration" and in `docs/FORK_RUNBOOK.md` for a village writing
  its own. Watched RED on 19 deliberately broken inputs and GREEN on 5 correct ones, including
  the proof that matters: the historical LPAD collapse exits 1 against seeded rows and 0 against
  empty tables, byte-identical file. Caught a real defect in its own probe (`quests.gratitude`
  has been varchar since 0004, not int). Corrected four coordinator claims with evidence: three
  duplicate-number collisions HAVE happened here (0062, 0063, 0090; fixed by hand in `d0e09b9`),
  the burned-number mechanism is backwards (a reused filename is silently SKIPPED, not
  replayed), the section 4 step count was 24/21/3 rather than 20, and `check-hyphen-dash.mjs`
  only walks `client/src` so it is not the authoritative dash check for scripts or docs. See 7i.
