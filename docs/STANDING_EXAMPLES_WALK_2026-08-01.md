# Standing examples: the per-module walk, 2026-08-01

Every module that seeds examples was driven end to end against a live
instance, and each module's seed, seeder branch and page were read together.
Eleven bugs are FIXED (commit 3251166). What follows is everything found and
NOT taken: improvements that need a judgement call, or that touch pages owned
by other in-flight work.

Verdict per module, as a founder meeting it for the first time:

| module | teaches what it is for? |
|---|---|
| forum | YES |
| feed | PARTLY |
| network | YES |
| library | PARTLY |
| stays | YES |
| commerce | PARTLY |
| exchange | NO |
| badges | PARTLY |
| health | NO |
| tools | YES |
| automation | PARTLY |

---

## forum

**Improvements**

- Stamp real times into the seed. Add createdAt/replyAt offsets (thread 4 days back, replies at +18h and +26h) and have the forum branch of examples.ts write created_at and last_reply_at from them. This fixes the zero-second conversation, gives the list a deterministic order, and costs three lines.
- Render an event block in ThreadView from meta the way decisions get one: date range, location, and the ctaLabel/ctaUrl as a button. Otherwise delete endsAt/location/ctaLabel/ctaUrl from the seed, because seeded fields no page reads are a silent promise that the module supports something it does not show.
- Seed a fourth thread as kind 'announcement' in 'projects' and a fifth question in 'questions', and pin one. That covers the fourth composer kind, empties no default category under the banner, and is the only way the Pin icon and the pinned-first ordering at server/index.ts:4841 ever get demonstrated.
- Indent replies by parentReplyId in Forum.tsx:333, or drop the nesting from the seed. Right now the module supports threading and the example proves the opposite.
- Show refusals in red next to the control that was pressed, and keep 'Done.' teal. A refusal that reads like a confirmation teaches the founder that the button worked.

**Evidence from the walk:** Read examples-seed.json:189-256 (forum block), examples.ts:402-424 (forum seeder branch), Forum.tsx in full, server/index.ts:4782-5200 (forum routes), drizzle/0019_forum.sql, shared/modules.ts:140-169. Content judgement: the three threads are genuinely good — a discussion with a real trade-off and a costed counter-argument, a decision that names who pays for it, an event with a voice. As a founder I would understand discussion, decision-with-outcome and lock immediately. The gap is that everything structural around the copy (event fields, reply nesting, pinning, timestamps, the example label itself) does not survive to the page.

## feed

**Improvements**

- Fix or delete the events block. Cheapest honest fix: in the feed route only (server/index.ts:4697-4701), relax the filter to include is_example rows when modulesWithExamples() contains 'feed' — the Pulse and health.ts keep excluding them, which is what docs/STANDING_EXAMPLES.md:286 actually asked for. If that is unwanted, delete `feed.events` from the seed and the health_events branch from examples.ts, because dead seed data that the seeder counts is worse than an absent feature.
- Write staggered created_at values for the feed posts (frost this morning, pump fixed yesterday, road grading two days ago — the copy already implies an order that the data destroys).
- Render each post's tags as chips under the body, clicking one setting the tag filter. That makes the filter box discoverable and shows a founder what tags are for in the same gesture.
- Show the refusal inline where the heart was tapped, not in the composer. A per-item message slot, or disable the heart on example rows with a title explaining why.
- Seed one kind:'event' post inside the feed block. Today the date chip at Feed.tsx:186-190 only ever fires on the forum's example event, so a village that enables the feed without the forum never sees it.
- Name the retire-together cost in docs or in the banner: examples.ts:786-796 retires feed whenever a real forum thread is posted in ANY category, so a founder who tries the forum first loses the feed's examples permanently before ever opening the Feed page.

**Evidence from the walk:** Read examples-seed.json:258-298 (feed block), examples.ts:426-445 (feed seeder branch), Feed.tsx in full, server/index.ts:4626-4770 (feed route and heart), server/lib/events.ts:67-81, server/lib/health.ts:63, shared/gameVariables.ts:658-712 (feed.category_slug default 'village-life' matches the seed — checked, not a bug), docs/STANDING_EXAMPLES.md:275-312. Body lengths measured (max 189 chars, well under feed.max_post_length 600), so the truncation path is not implicated.

## network

**Improvements**

- Have the network branch of examples.ts stamp last_sync_at a few hours back so the peer reads 'heard Jul 31'. One column, and it turns the page's most confusing line into the line that explains federation.
- Let members see closed items dimmed rather than filtering them out — Network.tsx:131 already has the opacity-50 treatment and the 'closed' tag ready. Otherwise the open/closed lifecycle is admin-only knowledge and the third example is wasted on most viewers.
- Guard the peer DELETE with isExampleRow exactly like the share PUT, and point the founder at the admin clear endpoint instead. Deleting the example peer today destroys half the demo through a path that was never meant to touch examples.
- Compute the peer cache items' createdAt at seed time (now minus 18 days, now minus 10 days) instead of hard-coding 2026 dates that will age badly in every later fork.
- Render an 'example' chip per row from the is_example already present in the payload. This page mixes village-authored items with peer-authored items, so a banner alone leaves the founder unsure which half the label covers.
- Show the peer's base_url and version in the member view, and give 'Sync now' a result line ('Heard from 0 villages'). Both are one-line changes and both are the parts of the federation story the examples currently gesture at without showing.

**Evidence from the walk:** Read examples-seed.json:653-718 (network block), examples.ts:568-583 (network seeder branch), Network.tsx in full, server/lib/network.ts, server/index.ts:6758-6910 (network routes), drizzle/0031_network.sql. Content judgement: this is the strongest of the three blocks. The need names what it can offer in return and what it wants to come out with; the offers ask for something honest back ('tell us in a year how many made it'). A founder would understand needs, offers, contacts and the peer cache from one screen. Every finding above is about plumbing around good copy, not the copy.

## library

**Improvements**

- Render data.categories on Library.tsx as section headings or a filter chip row. The seeded shelves already exist and cost nothing more; right now they are pure waste.
- Add photoUrl to the three example items so the card layout reads as a catalog rather than three paragraphs.
- Seed a fourth item with status 'checked_out' and no loan row (escrowReconciliation in server/lib/library.ts:551-570 reads library_loans only, so an item row alone posts nothing and holds no escrow). It is the cheapest way to show 'out on loan', the greyed pill and the suppressed Borrow button.
- Either filter example categories out of the intake select in Admin.tsx:4835, or have retireExamples NULL out library_items.category_id for surviving rows before deleting the categories. Today the founder's first donation is quietly orphaned.
- Surface health_bp as a condition label on the card ('condition 85%'), so the wear-and-deposit story is legible before someone borrows.
- Seed one item with requiresRole — but note Library.tsx:136 renders only minStage, so the role gate would need a render line too.

**Evidence from the walk:** Read server/seeds/examples-seed.json (library block), server/lib/examples.ts:459-475 + 63 + 690-705, client/src/pages/Library.tsx (all 166 lines), server/index.ts:7875-7899 (GET /api/library), :7990-8014 (intake + retirement trigger), :7967 (admin cats unfiltered), client/src/pages/Admin.tsx:4833-4858, drizzle/0024_library.sql:27-48, server/lib/library.ts:88-111 + 248-252 (escrowFor, 25% default from shared/gameVariables.ts:864-874, so drill = value 40 / deposit 10).

## stays

**Improvements**

- Add photoUrl to the three rooms. Everything else about this block is the strongest of the four modules and the missing image is what makes it look unfinished.
- Render capacity on the card ('sleeps 2'). The field is seeded, returned and free.
- Give one example quest a stayCreditReward and the 'work-exchange' tag, add stay_credit_reward to the quests seeder branch (server/lib/examples.ts:392-398), and let the stays earn list include example quests when the stays module is itself showing examples — the current blanket `!q.isExample` at server/index.ts:5884 is correct for a real village but silently guts the page for a new one.
- Seed a fourth room with a stay-credit price and NO usd price. Stay.tsx:144-145 and the checkout guard (server/index.ts:5944) both have that branch, and it is how a village with no Stripe actually operates; no example exercises it.
- Consider one room with `active: false` so the founder learns rooms can be retired without deletion — though note listAccommodations filters it out of /api/stays, so this only teaches on the admin page.

**Evidence from the walk:** Read server/seeds/examples-seed.json (stays block: 3 rooms x 4 prices, both token types, both audiences, all complete), server/lib/examples.ts:477-491, client/src/pages/Stay.tsx (all 221 lines), server/index.ts:5849-5896 (GET /api/stays, stayAudienceFor), :5931-5976 (checkout + example guard), :6013-6025 (create + retirement trigger), :6078-6086, server/lib/stays.ts:25 (STAY_CREDIT === 'stay-credit', matches the seed) and :97-122, drizzle/0021_stays_and_payments.sql:4-29. Prices, audiences and the member-rate pill (Stay.tsx:146) all resolve correctly: a signed-in member sees 2 credits / $30.00, a guest 3 / $45.00.

## commerce

**Improvements**

- Seed one `provider: "manual"` product with manual_instructions (bank transfer / pay a steward), and add manual_instructions + zeffy_url to the seeder branch at server/lib/examples.ts:493-503. A manual product is the only one a brand-new village can render as fully alive: no Stripe, no disabled button, and pressing it yields the clean example refusal instead of an amber integration warning. Right now the page's stated thesis (Contribute.tsx:1-10, 'which rail carries it') is contradicted by a seed that only knows one rail.
- Add a `deposit` and a `waitlist` example so all six kinds and the KIND_LABEL map earn their keep.
- Add token_slug/token_amount to the seeder branch and seed a token_pack granting Village Credits. That fires the grantsToken render path and — usefully — gives the exchange module something the commerce module visibly points at.
- Mark one example `audience: "members"` so the signed-out/signed-in difference on this page is visible.
- If nothing else changes, at minimum reorder so the donation (which needs no fixed price) leads, since 'you choose' with a working amount input is the one card that still reads as functional when Stripe is absent.

**Evidence from the walk:** Read server/seeds/examples-seed.json (commerce block: 3 products, all stripe, all public), server/lib/examples.ts:493-503 (the 12-column insert), client/src/pages/Contribute.tsx (all 191 lines), server/index.ts:6526-6545 (GET /api/products) and :6551-6560 (checkout + is_example refusal at :6553), :6693-6709 (admin create + retirement trigger), server/lib/payments.ts:35-37, drizzle/0032_payment_products.sql:10-36. Copy itself is good and the fields that ARE seeded all render correctly (recurring pill, 'you choose' + '5 or more' placeholder from minAmountMinor 500, $25.00/month).

## exchange

**Improvements**

- Add `note` (the latest price note) to the listing payload at server/index.ts:8570-8578 and render it under the price on Wallet.tsx. The append-only-with-a-reason design is the most distinctive thing about this module and the seed already wrote the sentence that explains it.
- Add `isExample: s.isExample` to the same payload (it already exists on the settings object, server/lib/exchange.ts:71) and have Wallet.tsx replace the 'out of stock' chip with 'example listing, nothing is for sale' for those rows. Refusing the sale is correct; wording it as an inventory shortfall is not.
- Seed a second listing so the exchange looks like a market, and give one of them a minStageToBuy so the stage gate is visible.
- Write the swap caps in the seeder branch and seed a swappable pair, so SwapCard (the module's most complex surface) can actually be seen. Without the caps this is impossible no matter what the JSON says.
- Pair this with the commerce token_pack suggestion: a commerce product granting Village Credits plus an exchange listing for Village Credits is the one place two example modules would visibly teach each other.

**Evidence from the walk:** Read server/seeds/examples-seed.json (exchange block: one listing for 'credits', one price), server/lib/examples.ts:585-609, client/src/pages/Wallet.tsx (all 238 lines), server/index.ts:8560-8640 (GET /api/exchange) and :8643-8700 (buy + example refusal), server/lib/exchange.ts:76-83, 111-167 (tradingProblem — 'credits' from drizzle/0007 is kind 'credit', governance 'platform', so the listing is legal and survives the boot firewalls), :248-292 (upsertSettings — the shared-primary-key trap is already handled with is_example=0 on both halves, no bug there), :302-320, :333-344, :433-441, drizzle/0022_exchange.sql:8-31, drizzle/0029_exchange_swap.sql:41-46, client/src/components/SwapCard.tsx:235-255, client/src/pages/Admin.tsx:4438.

## badges

**Improvements**

- Add a fourth example of kind `self` (e.g. 'Chainsaw certified' / 'First aid trained') so the "That's me" flow renders and the member's own declaration is demonstrated. It is the cheapest fix here: self badges are validated to carry no capabilities (badges.ts:111-113), so nothing can go wrong.
- Give the `granted` badge a real capability, e.g. `capabilities: ["quest.consent"]` on ex-badge-first-harvest, so 'Grants: quest.consent' renders opposite 'Suspends: forum.post'. The pairing IS the badges module. It is safe: assertBadgeInvariants skips examples (badges.ts:141), the earned engine skips them (badges.ts:322-323), the self-claim route refuses them (index.ts:8315) and the award route refuses them (index.ts:8469), so no award row can ever exist to carry the grant into the gate.
- Rewrite the `_note` at examples-seed.json:502-509. Its boot-refusal rationale no longer holds and it is what is keeping the capability lists empty.
- Mark examples in the admin definitions list from the isExample the payload already carries, and disable Deactivate on them rather than letting the click fail.
- Consider one `active: false` example so the admin list's inactive styling (Admin.tsx:4552, opacity-60) and the Reactivate path teach as well.

**Evidence from the walk:** Read server/seeds/examples-seed.json:500-543, server/lib/examples.ts:505-515, server/lib/badges.ts (full), shared/capabilities.ts (full), client/src/pages/Badges.tsx (full), server/index.ts:8195-8420 and 8463-8530, client/src/pages/Admin.tsx:4471-4600, drizzle/0023_badges.sql.

## health

**Improvements**

- Decide the snapshots question one way or the other. Either let the series carry example points while `lunationsCollected` keeps counting only real closed cycles (so 'trends unlock at 3' stays honest and the tiles still draw), or delete the whole `snapshots` block from the seed and stop writing 15 rows no code path can read. The current middle is the worst of the three.
- Same call for regenTotals. The exclusion has a real justification in its own comment (health.ts:290-292: 'this total is the number a village carries to funders'), so the honest fix is a separate example-scoped total the page renders inside the banner's scope, not a silent zero that renders as 'Nothing recorded yet.'
- Open the `<details>` at VillageHealth.tsx:126 by default while examples are showing. The seeded notes ('Counted at planting, not at survival; the honest survival number comes next dry season.') are the best writing in this block and they are one unclicked triangle away from invisible.
- VillageHealth.tsx:131 prints `{e.value} {e.unit}` with no metric label; the admin version (Admin.tsx:5086) does print the label. Match them, or the member reads '180000 liters' with no idea it is water under protection.
- Add food_produced_kg and carbon_sequestered_kg entries so all five regen tiles teach once the totals question is settled.

**Evidence from the walk:** Read server/seeds/examples-seed.json:545-579, server/lib/examples.ts:517-535, server/lib/health.ts (full), shared/healthMetrics.ts (full), client/src/pages/VillageHealth.tsx (full), server/index.ts:7668-7770 and 1474-1489, client/src/pages/Admin.tsx:4955-5097, drizzle/0026_health_snapshots_and_regen_entries.sql, drizzle/0046_standing_examples.sql. Grepped every server reference to health_snapshots: only examples.ts and health.ts touch it.

## tools

**Improvements**

- Add a fourth example with `visibility: "roles"` and `roleIds` pointing at an id that actually exists — 'steward-circle' from server/seeds/roles-seed.json, NOT an `ex-role-*` id (progression examples never seed on a fork that ships roles-seed.json; see the automation findings). Note the seeder currently hardcodes `role_ids: null` at examples.ts:452, so it would need to write `t.roleIds` for this to work — that is a seeder field gap waiting for the seed to use it.
- Auto-expand `description` and `gettingStarted` for example cards. On first paint the founder reads only name, purpose and CTA (ToolsHub.tsx:148-151); the strongest teaching line in the whole block ('Chat scrolls away and nobody reads back') sits behind the 'More' toggle at ToolsHub.tsx:162-169.
- Seed one tool in the `governance` category (shared/modules.ts:374). It is the first category in the default config and it renders empty forever when no Hypha DHO is configured, since ToolsHub.tsx:131 filters out categories with no tools.
- Mark examples in the admin table and disable Edit/Remove there once the server guard exists, matching how the member page already labels them.

**Evidence from the walk:** Read server/seeds/examples-seed.json:300-353, server/lib/examples.ts:447-457, client/src/pages/ToolsHub.tsx (full), shared/toolsVisibility.ts (full), shared/modules.ts:361-394, server/index.ts:5654-5842 and 3007-3041, client/src/pages/Admin.tsx:3416-3560, drizzle/0016_tools_hub.sql. Cross-checked the guard inventory by grepping isExampleRow/EXAMPLE_REFUSAL across server/index.ts.

## automation

**Improvements**

- Repoint the two roleIds at ids that exist on a real fork — 'steward-circle' and 'practitioners' from server/seeds/roles-seed.json — and render the role NAME with a fallback in Admin.tsx:5514 so a missing role reads as unassigned rather than as a raw slug.
- Add isExample to RecordingRow/rowToRecording (server/lib/recordings.ts:16-38) and to the syntheses/tasks payloads (server/index.ts:7188-7247) — every one of those tables already has the column (drizzle/0046:32-34) — then mount an ExamplesBanner at the top of CallsAdminTab. Automation is the only seeded module with examples and no label anywhere; that is the highest-value fix in this whole review.
- Render `decisions` and `chapters` in the detail view. The seed already proves they are the reason to read a synthesis, and today they teach nobody.
- Show the transcript, even collapsed, so quote + timestamp is checkable against its source. Without it the evidence rule is an assertion rather than a demonstration.
- Disable Publish / Save edit / Accept / Dismiss on example rows once the flag reaches the client, so the guards stop being discovered as errors.
- Consider seeding a SECOND recording in `ingested` status with a transcript and no synthesis, so the 'Synthesize' button (Admin.tsx:5466-5469) and the pipeline's first step are visible too — right now the founder only ever sees the end state.

**Evidence from the walk:** Read server/seeds/examples-seed.json:581-651 and 95-133, server/lib/examples.ts:537-566 and 220-238/344-366/650-666, server/lib/recordings.ts (full), client/src/pages/Admin.tsx:5289-5539, server/index.ts:7129-7247, 7349-7463, 1033-1044, 1474-1489, 3679, drizzle/0028_automation_pipeline.sql, drizzle/0046_standing_examples.sql. Grepped the entire client for ExamplesBanner mounts: twelve pages, none for automation.
