# Module design: Crowdpool Commitments Dashboard (slides 43-45) — post-campaign capital inventory, commitment ledger, and fulfillment fan-out

> Produced by the 13-agent design workflow, 2026-07-26, from the 2020 village-demo deck (slides + speaker notes),
> the AMORA_FOUNDATION_UPGRADE_PLAN constraints, and the live codebase. Reconciled by MODULES_MASTER_PLAN.md —
> where this file and the master plan disagree, **the master plan wins** (it applies the two critique passes).

**After a crowdpool campaign passes on regen-civics, this module becomes its home in the village: every pledge (money, land, materials, labor, skills, connections) tracked across the 8 forms of capital from pledged to fulfilled, with evidence, nudges, and fan-out that turns fulfilled pledges into material-library items, quests, and treasury history.**

Estimated sessions: 9

## Improvements over the 2020 slide concept

- The 2020 slides were three wizard questions with no data model. This design pairs slide 44 (needs) with slide 45 (gives) as first-class tables, so the dashboard shows needs-vs-committed-vs-fulfilled GAP bars per capital type — the village can see what is still missing, not just what was promised.
- Quantification the slides lacked: every commitment carries amount + unit (USD, hours, acres, items) plus an optional admin-entered estValueUsd used for display-only aggregate totals — explicitly never an exchange rate, preserving the closed-loop legal posture.
- A full fulfillment lifecycle (pledged -> scheduled -> fulfilled -> released, plus withdrawn/declined) with evidence attachments and an append-only event log. The slides stopped at 'give'; this makes the promise auditable and honours F13's instrument-now rule.
- Fan-out into the live game, which the deck never connected: a fulfilled material pledge becomes a draft material-library item, a labor/skill pledge becomes a suggested quest (v2: drafted by Maia via a new PROPOSAL_KIND), a money pledge becomes a treasury receipt. A pledge stops being a spreadsheet row and becomes playable work.
- By-email linking: pledgers usually are not platform members yet. Commitments key on lowercase email; when that email registers, the pledge auto-links and greets them ('your pledge to the village is waiting') — turning the crowdpool into an onboarding funnel.
- Privacy posture consistent with F3's recognition rules: aggregates public by default, names optional per game variable, amounts NEVER public. The 2020 deck displayed balances everywhere; DAO/cohousing research says posted numbers poison social capital.
- A hard legal/Hypha firewall the deck did not have: fulfilling a money pledge records a fiat receipt (manual or Stripe URL), never mints a token. Anything equity-like is a deep link to the village's Hypha DHO with the proposal URL recorded on the commitment. Optional Gratitude acknowledgment is bounded by a game variable (default 0/off) and idempotent through the one ledger.
- Follow-through mechanics: capped, audited nudge emails via the existing Resend plumbing (max per pledge, min gap days, every send logged as an event), so unfulfilled pledges do not silently rot — the deck had no post-pledge process at all.
- Import provenance as a real integration spec: CSV batches with dry-run preview and reversibility, plus a versioned webhook/pull contract for regen-civics with HMAC signing and idempotent externalRef upserts — replacing the deck's implicit same-platform assumption.
- Fully white-label: module ships OFF, capital-type display labels/icons overridable via config, nudge email copy templated on project name, zero Amora-specific copy in platform files — hundreds of forks inherit it.

## Data model

All tables MySQL/Drizzle in `server/db/schema.ts`, string PKs varchar(64) matching house style. Until Phase 1b cutover reaches this domain, the same shapes can ship as `data/crowdpool-*.json` with seeds in `server/seeds/` + `ensureDataFiles()` entries — but this module should land AFTER the commitments domain is DB-backed (see risks).

### crowdpool_campaigns
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| slug | varchar(80) UNIQUE | public URL /commitments/:slug |
| title | varchar(255) NOT NULL | |
| description | text | |
| source | enum('manual','csv','regen-civics') default 'manual' | |
| sourceRef | varchar(160) | regen-civics campaign id / URL |
| status | enum('tracking','completed','archived') default 'tracking' | campaign already PASSED elsewhere; here we only track fulfillment |
| passedAt | timestamp | when it passed on regen-civics |
| hyphaProposalUrl | varchar(500) | deep link if ratified on the village's DHO |
| createdAt / updatedAt | timestamp | |

### crowdpool_needs  (slide 44 made queryable)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| campaignId | varchar(64) NOT NULL FK | |
| capitalType | enum('financial','material','living','intellectual','experiential','social','cultural','spiritual') | 8 forms; display labels config-driven (financial=money, living=land/water/plants, experiential=labor/time, intellectual=skills...) |
| title | varchar(255) NOT NULL / description text | |
| targetAmount | decimal(14,2) / unit varchar(48) | |
| priority | int / sortOrder int | |
| status | enum('open','partially-met','met') default 'open' | derived helper, admin-overridable |

### crowdpool_commitments  (the heart)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| campaignId | varchar(64) NOT NULL FK | |
| needId | varchar(64) NULL FK | optional match to a need |
| userId | varchar(64) NULL | linked platform member; NULL until email links |
| pledgerName | varchar(255) NOT NULL | |
| pledgerEmail | varchar(255) NOT NULL | lowercase-normalized; the linking key; indexed |
| capitalType | same enum as needs | |
| title | varchar(255) NOT NULL | e.g. "Kubota tractor", "$5,000", "20hrs/wk carpentry x 3mo" |
| description | text | |
| amount | decimal(14,2) NULL / unit varchar(48) | quantified pledge |
| estValueUsd | decimal(12,2) NULL | display-only normalization for totals; never a price |
| status | enum('pledged','scheduled','fulfilled','released','withdrawn','declined') default 'pledged' | |
| scheduledFor | date NULL | pledger's delivery promise |
| fulfilledAt timestamp / fulfilledBy varchar(64) | | admin stamp |
| releasedAt | timestamp NULL | fan-out executed |
| evidenceUrl varchar(1000) / evidenceNote text | | photos, receipts, links |
| isAnonymousPublic | boolean default false | pledger opt-out of the named wall |
| fanout | json | {materialItemId?, questId?, treasuryReceiptId?, ledgerEntryId?} — idempotency record for fan-out |
| externalRef | varchar(160) NULL UNIQUE | regen-civics pledge id; webhook upsert key |
| importBatchId | varchar(64) NULL | |
| nudgeCount int default 0 / lastNudgedAt timestamp | | cap enforcement |
| createdAt / updatedAt | timestamp | |

### crowdpool_commitment_events  (append-only audit, F13-compliant)
| column | type |
|---|---|
| id varchar(64) PK, commitmentId varchar(64) NOT NULL FK | |
| type enum('created','linked','unlinked','status_change','evidence_added','nudge_sent','fanout','note') | |
| fromStatus / toStatus varchar(24) NULL | |
| actorId varchar(64) NULL (NULL = system/webhook) | |
| note text, at timestamp | |

### crowdpool_import_batches
id PK, campaignId FK, source enum('csv','regen-civics'), filename varchar(255), rowCount/createdCount/updatedCount/skippedCount int, errors json, importedBy varchar(64), at timestamp. Deleting a batch removes only its still-'pledged' rows (reversibility guard).

### treasury_receipts  (seed of the future economics/treasury history; deliberately module-neutral name)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| source | varchar(64) NOT NULL | 'crowdpool.commitment' here; other modules later |
| sourceRef | varchar(120) NOT NULL | commitmentId; multiple receipts per commitment allowed (installments) |
| amount decimal(12,2) / currency varchar(8) default 'USD' | | fiat only |
| method | enum('manual','stripe','wire','cash','in-kind') | |
| receiptUrl varchar(1000) / note text | | Stripe receipt or scan |
| recordedBy varchar(64) / receivedAt timestamp / createdAt | | |
| UNIQUE(source, sourceRef, receiptUrl) | | double-entry guard |

Ledger touchpoint: the ONLY write to `token_ledger` this module ever makes is the optional Gratitude acknowledgment, `source='crowdpool'`, `idempotencyKey='crowdpool:recognition:{commitmentId}'` — re-release credits nothing twice. Amora/Voice are never written, per the Hypha boundary.

## Endpoints

- `GET /api/crowdpool/campaigns — public list; aggregate totals by capitalType only (respects crowdpool.public_wall)`
- `GET /api/crowdpool/campaigns/:slug — campaign detail: needs + gap bars, totals, named wall (names + capital type, never amounts) when public_wall='names', anonymized rows respected`
- `GET /api/crowdpool/mine — authed member's own commitments, full detail (auto-matched by userId OR verified email)`
- `POST /api/crowdpool/commitments/:id/schedule — pledger sets scheduledFor + note on own pledge`
- `POST /api/crowdpool/commitments/:id/evidence — pledger attaches evidenceUrl/note on own pledge (does NOT change status; admin still marks fulfilled)`
- `POST /api/crowdpool/commitments/:id/withdraw — pledger withdraws own pledge with reason (audit event)`
- `GET /api/admin/crowdpool/commitments?campaignId=&status=&capitalType=&q= — full table for admin`
- `POST /api/admin/crowdpool/campaigns + PUT /api/admin/crowdpool/campaigns/:id — campaign CRUD (archive, never hard-delete)`
- `POST /api/admin/crowdpool/needs + PUT /api/admin/crowdpool/needs/:id — needs CRUD`
- `POST /api/admin/crowdpool/commitments — manual entry (v1 primary import path)`
- `PUT /api/admin/crowdpool/commitments/:id — edit fields`
- `POST /api/admin/crowdpool/commitments/:id/status — guarded transition; body {to, note}; stamps actor; writes event row`
- `POST /api/admin/crowdpool/commitments/:id/fulfill — {evidenceUrl, evidenceNote, receipt?:{amount, method, receiptUrl}}; financial pledges create treasury_receipts row here`
- `POST /api/admin/crowdpool/commitments/:id/release — runs fan-out (material item / quest draft / recognition), idempotent via fanout json keys`
- `POST /api/admin/crowdpool/import/csv?dryRun=1 — CSV upload with column mapping; dry-run returns preview + row errors; real run creates batch`
- `DELETE /api/admin/crowdpool/import/batches/:id — reverses a batch (only rows still 'pledged')`
- `POST /api/admin/crowdpool/commitments/:id/nudge + POST /api/admin/crowdpool/nudge — single or bulk Resend nudge, cap-checked server-side`
- `POST /api/admin/crowdpool/relink — re-run email linking across all users (also runs automatically inside the existing registration route)`
- `GET /api/admin/crowdpool/export.csv — full export`
- `POST /api/webhooks/regen-civics/crowdpool — v2; HMAC (X-RegenCivics-Signature, sha256 over raw body, env REGEN_CIVICS_WEBHOOK_SECRET); events campaign.passed | pledge.created | pledge.updated | pledge.withdrawn; payload {v:1, event, deliveryId, sentAt, campaign?, pledge?}; idempotent on externalRef + deliveryId`
- `SPEC FOR THE REGEN-CIVICS REPO (v2 pull fallback): expose GET /api/public/crowdpool/campaigns/:id/export?since=<cursor> with Bearer token auth returning {v:1, campaign:{id,slug,title,description,passedAt,goals:[{capitalType,title,targetAmount,unit}]}, pledges:[{id,email,name,capitalType,title,description,amount,unit,estValueUsd?,status,createdAt,updatedAt}], nextCursor} — cursor-paged so Amora can poll without a webhook`

## Surfaces

**Pages (mounted only when crowdpool.enabled):**
- `/commitments` — `client/src/pages/CrowdpoolDashboard.tsx`: "Village Capital" view. Eight capital tiles (icon + committed/fulfilled counts), campaign selector, needs-vs-committed-vs-fulfilled progress bars per capital type, recent-fulfillments strip (fed by Village Pulse entries), and a CTA: "Made a pledge? Sign in with the email you pledged with to see it." This IS slide 43's 'count up all the capital you hold', but live.
- `/commitments/:slug` — `client/src/pages/CampaignDetail.tsx`: campaign story, needs list with gap bars (slide 44), contributor wall (names + capital type chips, no amounts, anonymity respected), and the authed member's own pledge panel with schedule/evidence/withdraw actions.
- Profile / GameDashboard: `MyCommitmentsCard.tsx` — own pledges with status chips; unfulfilled pledge surfaces as a suggested next action (v2: a `pledge-unfulfilled` NextActionRule `when` value).

**Components:** `CapitalTypeBadge.tsx` (icon + config-driven label), `CommitmentStatusChip.tsx`, `NeedGapBar.tsx`, `CommitmentTimeline.tsx` (event log renderer).

**Nav:** one entry "Village Capital" -> /commitments contributed to the main nav and `client/src/config/mobileNav.ts` only when the module is on; label overridable in config.

**Admin:** new tab `crowdpool` in `client/src/pages/Admin.tsx` following the existing activeTab pattern — `AdminCrowdpoolTab.tsx` with sub-sections: Campaigns, Commitments (filterable table + status actions + evidence), Needs, CSV Import (mapping + dry-run preview + batch history with reverse), Nudges (queue showing who is cap-eligible), Settings pointers to the Crowdpool game variables.

**Mobile:** tiles go 2-col, tables collapse to cards, status actions in a bottom sheet (ui/sheet.tsx is installed and unused — free scaffolding per the plan).

## Mechanics

**State machine** (server-enforced, every transition writes a crowdpool_commitment_events row):
pledged -> scheduled (pledger or admin, sets scheduledFor) -> fulfilled (ADMIN ONLY, evidence encouraged, fulfilledBy stamped) -> released (ADMIN ONLY, runs fan-out). withdrawn (pledger/admin, from pledged|scheduled) and declined (admin, from pledged|scheduled) are terminal. No transition ever runs on a timer — regen-civics' "nothing mutates on a timer" rule holds; fan-out and nudges are explicit admin acts.

**Email linking:** commitments store pledgerEmail lowercase. On registration (existing route) and on POST /relink, unlinked commitments matching user.email get userId set + a 'linked' event + a welcome touch ("your pledge is waiting"). Linking grants VIEW/self-service rights only — it never releases value. Admin can unlink (event logged).

**Fulfillment of financial pledges:** admin records a treasury receipt (amount, method manual/stripe/wire/cash/in-kind, receiptUrl). Multiple receipts per commitment = installments; admin UI shows "received $3,500 of $5,000". Marking fulfilled is a human judgment, assisted by that sum — never automatic. NO token is minted. The treasury_receipts table doubles as the first real rows of the future economics-section treasury history.

**Release fan-out (each leg idempotent via the fanout json — a key already present is never re-created):**
- material/living -> creates a DRAFT material-library item with donorCommitmentId back-ref, only if the material-library module is enabled (feature-detected; otherwise the leg is hidden). Records fanout.materialItemId.
- experiential/intellectual (labor/skills) -> "Create quest from pledge" button pre-fills the existing quest form (v1). v2: new Maia PROPOSAL_KIND 'commitment-activation' in the existing PROPOSAL_KINDS map drafts the quest text from the pledge description — reusing the injection-guarded, rate-capped assistant plumbing, no second AI path. Value still releases only through the existing quest consent gate; a fulfilled labor pledge never auto-credits.
- financial -> receipt already exists from fulfill; release optionally posts the bounded Gratitude acknowledgment (crowdpool.fulfill_recognition > 0) through token_ledger with idempotencyKey crowdpool:recognition:{id}. This is Gratitude paying at SEND semantics — a one-time grant, not a pool, not a second payment path.
- Anything equity-like (e.g. "$50k for future equity") -> the platform records it and shows a deep link "Propose recognition on Hypha" using the admin-configured DHO URL; hyphaProposalUrl saved on the commitment. Read-and-display + link-out only.
- Every release emits addActivity('crowdpool', "...fulfilled their pledge of {title}") — name suppressed when isAnonymousPublic, amount never included (F3 posture).

**Nudges:** admin-triggered (no scheduler exists yet). Eligible = status pledged|scheduled AND (now - max(createdAt,lastNudgedAt)) >= nudge_min_gap_days AND nudgeCount < nudge_max_per_pledge AND (scheduledFor null or past). Sends via existing sendResendEmail with templated copy ({{projectName}}, {{pledgeTitle}}, {{dashboardLink}} — no hardcoded Amora copy). Each send: nudgeCount++, lastNudgedAt, 'nudge_sent' event. v2: route through Phase 3 insertNotification with dedupeKey crowdpool:nudge:{commitmentId}:{n}, inheriting the 20-emails/user/day ceiling.

**Gating:** extends shared/capabilities.ts with 'crowdpool.manage' (role-grant only, no stage unlock — so a village can appoint a Campaign Steward role without admin credentials). Members act on own rows via userId match; admins bypass per the existing hasCapability isAdmin rule. One gate, no bypass.

**Aggregation:** per-campaign totals = GROUP BY capitalType over commitments, split committed (pledged+scheduled) / fulfilled (fulfilled+released); need gaps = targetAmount minus matched fulfilled amounts (same-unit only; mixed units show counts, honesty over false precision). estValueUsd totals shown publicly only when crowdpool.show_est_values.

## Game variables

- crowdpool.enabled: false (boolean) — module master switch; OFF by default per platform rule; controls routes, nav, admin tab
- crowdpool.public_wall: 'aggregate-only' (choice: aggregate-only | names) — what non-members see; 'names' shows contributor names + capital type, never amounts
- crowdpool.show_est_values: false (boolean) — show USD-normalized totals on the public dashboard; admin always sees them
- crowdpool.nudge_after_days: 21 (1-365, days) — how long a pledge sits untouched before it becomes nudge-eligible
- crowdpool.nudge_min_gap_days: 14 (1-180, days) — minimum spacing between nudges to the same pledge
- crowdpool.nudge_max_per_pledge: 3 (0-10) — lifetime nudge cap per pledge; 0 disables nudging entirely
- crowdpool.fulfill_recognition: 0 (0-10000, Gratitude) — Gratitude granted once when a pledge is released; 0 = off (default); posts through the one ledger, idempotent
- crowdpool.allow_self_pledge: false (boolean) — v2: members may create standing offers in-platform between campaigns; off because regen-civics is the intake
- crowdpool.webhook_enabled: false (boolean) — v2: accept signed regen-civics webhook deliveries
- crowdpool.hypha_dho_url: '' (text, https URL) — this village's Hypha DHO base URL for the equity deep-link (may already exist platform-wide; reuse if so rather than duplicating)

## Admin controls

Admin tab "Crowdpool" (existing Admin.tsx tab pattern): campaign CRUD with archive; needs editor; commitments table with filters (campaign/status/capitalType/search), inline status transitions with required-note prompts, evidence URL+note attach, fulfilledBy auto-stamped; financial fulfill dialog that records a treasury receipt (amount/method/receiptUrl) and shows installment progress; release panel with per-leg fan-out buttons (create material item — only when that module is on; create quest from pledge; send Gratitude acknowledgment — with a visible warning that recognizing fiat with tokens is a legal-review item and the variable defaults to 0); CSV import with column mapping, mandatory dry-run preview, batch history and batch-reverse; nudge queue showing cap-eligibility per pledge with single/bulk send; re-run email linking; unlink; CSV export; Hypha proposal URL field per campaign and per commitment. All tunables live in the existing Game Mechanics variables editor under category "Crowdpool" — the tab links there rather than duplicating controls.

## Dependencies

- Phase 1b repository layer for this domain (build DB-first; commitments are exactly the kind of concurrent-write data JSON loses)
- token_ledger + server/lib/ledger.ts (exists) — sole path for the optional Gratitude acknowledgment
- shared/capabilities.ts (exists) — add 'crowdpool.manage' capability key
- shared/gameVariables.ts + server/lib/variables.ts (exists) — fail-loud registry, category 'Crowdpool'
- sendResendEmail (exists) — nudges and pledge-linked welcome
- addActivity Village Pulse (exists) — fulfillment announcements
- Admin.tsx tab pattern (exists)
- Material Library module (SOFT — fan-out leg feature-detected, hidden when off; coordinate the item-draft shape + donorCommitmentId back-ref with that module's design)
- Phase 3 notification spine + scheduler (SOFT, v2 — routes nudges through insertNotification dedupe and daily caps; v1 is admin-triggered only)
- Maia assistant PROPOSAL_KINDS (SOFT, v2 — 'commitment-activation' kind; extends, never duplicates, the AI plumbing)
- regen-civics repo (v2 — must implement the webhook + export contract specified in endpoints)

## v1 (ship first, useful alone)

Ships alone and is useful alone: the six tables (campaigns, needs, commitments, events, import_batches, treasury_receipts) with Drizzle migrations; manual admin entry + CSV import with dry-run and reversible batches; email linking at registration + relink tool; the full status machine with evidence and append-only events; financial fulfill -> treasury receipts with installment view; material fulfill -> draft library item when that module exists, plain record otherwise; "create quest from pledge" pre-fill button; /commitments dashboard with capital tiles, need gap bars, and aggregate-only public wall; /commitments/:slug detail; MyCommitmentsCard on the profile; admin tab; manual cap-checked Resend nudges; Pulse entries; 'crowdpool.manage' capability; all ten game variables registered; module OFF by default with nav/routes/admin-tab contributed only when on. Acceptance: an admin imports a passed campaign's 40 pledges from CSV, a non-member pledger registers with their pledge email and sees their pledge, admin fulfills a $5k pledge against two Stripe receipts, releases a tool pledge into a draft material item, and the public page shows totals but no amounts against names.

## v2 (the full slide vision)

The full slide vision plus the integration: signed regen-civics webhook (campaign.passed auto-creates the campaign; pledge events upsert on externalRef) and the cursor-paged pull endpoint spec implemented in that repo; Maia 'commitment-activation' proposal kind drafting quests from labor/skill pledges as suggestions in a review queue; standing offers (crowdpool.allow_self_pledge) so the capital inventory stays alive between campaigns — slide 43 as a permanent 'what does the village hold' snapshot aggregating fulfilled commitments across all campaigns; partial fulfillment amounts for non-money pledges (hours logged against hours pledged); needs matching UI (drag a commitment onto a need); nudges routed through the Phase 3 notification spine with dedupe keys and the daily email ceiling, plus an auto-proposed weekly nudge queue once the scheduler exists (suggestions, not actions); 'pledge-unfulfilled' NextActionRule; per-member commitment history on the full member profile; Hypha equity deep-link flow polished with proposal status read-back.

## Risks

- LEGAL (flag for real review): any pattern where fiat comes in and tokens go out can look like a security or money transmission. Mitigated: recognition defaults to 0/off, is Gratitude-only (closed-loop, non-withdrawable), equity anything is Hypha deep-link only, estValueUsd is display-only — but the admin warning copy and the default must survive future edits; add an invariant test that crowdpool never writes tokenType 'amora'|'voice'.
- Email-linking to the wrong person: registration email is asserted, not verified, so someone registering with a pledger's email sees that pledge's details. Mitigated: linking grants view/self-service only (never value release) and admin can unlink — but consider requiring email verification before auto-link, or gating link behind admin confirmation for financial pledges.
- estValueUsd drift into a de-facto price: if aggregate USD totals ever sit next to Gratitude or Amora numbers, it implies an exchange rate (the exact F2 posted-price trap). Keep them on separate surfaces; never render both on one card.
- Double fan-out / double receipts under retry: guarded by fanout json keys, ledger idempotencyKey, and the treasury_receipts unique constraint — but the fan-out must be written transactionally per leg once the DB cutover lands; do not build it on JSON files.
- No scheduler exists: v1 nudges are manual; any UI copy promising automatic reminders would be another promise published ahead of its mechanism (the exact failure Revision 2 calls out).
- regen-civics contract drift: the webhook/export payloads are versioned (v:1) and the importer must reject unknown versions loudly rather than guessing; the contract spec should land in the regen-civics repo as a doc before v2 starts.
- CSV garbage-in: mandatory dry-run, per-row errors, batch reversal limited to still-'pledged' rows so a bad import cannot delete fulfillment history.
- Coordination risk with the Material Library module (designed in parallel): the draft-item shape and back-ref field must be agreed before either module freezes its schema.

## Open questions

- Is regen-civics always the pledge intake, or should members eventually create standing offers in-platform (crowdpool.allow_self_pledge)? Default is off; Rye's call.
- Does regen-civics' crowdpool data model already carry capital types and amount+unit, or should the contract spec in this design drive that build? If its pledges are money-only today, the multi-capital import will start as CSV.
- Who enters estValueUsd — the pledger during the campaign, or the admin at import/fulfill? Recommend admin-at-import to keep the campaign UX simple and the number curated.
- Should email linking require verified email (safer) or match-at-registration (frictionless, current design)? Depends on whether Phase 3 adds email verification anyway.
- Is treasury_receipts the agreed seed of the economics section's fiat history (build order step 10), or does that phase want its own table it backfills from? Naming/ownership should be settled before migration ships.
- Nav placement: top-level 'Village Capital' vs a card inside the steward/founder command centre (build order step 11)? Recommend top-level while campaigns are active, since it is also an investor-facing transparency surface.
- When a labor pledge becomes a quest, should the pledger be auto-suggested (not auto-assigned) as the first claimant? Recommended yes — but it needs the claim flow to accept a suggested claimant, a small change to the existing quest system.
