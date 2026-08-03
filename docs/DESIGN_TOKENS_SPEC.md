# Design tokens + uploads lifecycle — the spec, and what the adversarial pass caught

**How to read this file.** The base spec below (§0 onward) was synthesised from
three independent designs (fork-builder / design-system / image-generation
perspectives) grounded in a four-lens map of the actual code. Two adversarial
verifiers then attacked it and **both refuted parts of it with concrete,
verified failure sequences**. The base text is kept verbatim because its
cross-references are load-bearing; the amendments below **override it wherever
they conflict**. An implementing session applies the base spec *as amended* —
implementing the base text alone re-creates four real defects, one of which
destroys investor documents.

---

## MANDATORY AMENDMENTS (verifier-proven, not stylistic)

### A1. The orphan sweep, as specified, deletes live investor documents — ship REPORT-ONLY until fixed

The vault writes `${sanitizedOriginalBase}-${Date.now()}-${rand5}${ext}`
(server/index.ts, investor-docs upload) — e.g. `Cap-Table-2026-<13digits>-ab3de.pdf` —
and stores the **bare filename** with no `/api/uploads/` prefix. The spec's
canonicalizer only recognises paths containing `/api/uploads/` or names matching
five literal stamp prefixes, so the reference side cannot see vault files while
the delete side treats their shape as reclaimable. Concrete outcome: 31 days
after upload, `sweep_mode=reclaim` unlinks the cap table while `investor_docs`
still names it and every packet email already sent 404s.

Also proven: the reclaim gate (`investor_docs_repair: true` in the
`data-migrations` document) **can never open** — that document is a string
array written only by `runOnce()`, which replaces the whole document; nothing
ever sets a boolean, and a hand-written flag is erased on next boot. So the
spec simultaneously deletes the wrong files AND never reclaims a genuine
orphan.

**Amendment:** the sweep ships with no delete path at all — enumerate, match,
report to `/health` and the `uploads-report` document, full stop. A reclaim
mode may only be added after: (a) the canonicalizer is extended to the vault
convention `<anything>-<13digits>-<5 alnum><ext>` AND reads
`investor_docs.filename` as a reference source; (b) the gate is a real
`runOnce("investor_docs_repair", …)` id checked via the `applied` array;
(c) a test exists in which a vault-named file with a live row survives a
sweep. Additional reference sources the map missed, all mandatory:
`shared_items` (this village's own published items, free-text `detail`),
soft-deleted rows (`forum_threads.hidden_at` — a hidden thread can be unhidden
and its `image_url` returns to the page; `regen_entries` supersede/retract),
and multi-path string leaves (the canonicalizer must extract **every**
`/api/uploads/` occurrence per string, trimming trailing prose punctuation,
not just the last).

### A2. Blank `theme.place` leaks Amora's biome into every fork's generated art

§3.1 falls back to `project.location` — but at read time that goes through
`mergedConfig()`, whose `pick()` inherits `GAME_CONFIG.project.location` =
"Dominicalito, Costa Rica". The "if that is also blank" placeless branch is
**unreachable**, and the ratchet cannot catch it because the string arrives at
runtime. Same defect in §7.2's `{project.name}` → "Amora".

**Amendment:** all prompt-building resolution reads the **RAW stored brand
document**, never `mergedConfig()`. Blank raw `project.location` ⇒ the
placeless clause (`no strong regional markers, unspecified setting`). Drop
`{project.name}` from templates entirely — substitute the neutral phrase
"this village" (which §7.4's own worked example already assumed).

### A3. Contrast overrides must be measured, not excused

§3.3 marks every `theme.overrides` role `unverifiable`; §6.6's report computes
`status:"ok"` when `failCount` is 0. An override IS two exact hexes — a pure
computation. As written, `overrides.surface=#3F4A44` yields ~1.2:1 body text,
a green "0 failing" checkmark, and a passing launch requirement.

**Amendment:** overridden pairs are measured like any other and can produce
`fail`. `unverifiable` is reserved for genuinely uncomputable cases (text over
an untreated uploaded photo). `unverifiableCount > 0` maps to a distinct
`status:"unverified"` — never `"ok"`. `fail` blocks the `brand-contrast`
launch check.

### A4. Serialization and naming defects

- `art.never.effective` cannot exist (a named child of a JSON array is dropped
  by serialization). Rename to sibling key `art.effectiveNever`.
- `theme.register.personLabel` (derived from the character card) conflicts
  with the stored, admin-editable `project.memberName`. Rule: **memberName,
  when set, wins** everywhere `personLabel` would be used; the card only
  supplies the default.
- `art.seedSalt` / `art.styleLock.anchorSeed` move out of the brand blob into
  `generated_images` metadata, per the spec's own argument for that table.

---

# Base spec (as synthesised — apply amendments above)

# Brand Design Tokens + Uploads Volume — Implementable Spec

**Status:** one spec, synthesised from three designs. Ship in the order given; each section names the exact file and line it lands at.

---

## 0. The synthesis decision (and why)

**Spine: `fork-builder`.** Its three-decision founder path (`seed`, `character`, `place`) is the only one of the three that survives contact with the actual constraint — a non-designer founder with fifteen minutes. `designer` ships ~30 typographic/spacing/elevation fields; `generation` ships ~45 art fields. Both are consoles for someone who already knows what they want. The character card is the load-bearing invention: it bundles exactly the choices a non-designer gets wrong (radius, type pairing, surface treatment, art medium, light, register) into one illustrated pick, and — decisively — it is *also* the thing that supplies `generation`'s rich WORLD tokens without asking for them. That is why the graft works rather than being an average.

**Grafted from `designer` (three ideas, all kept whole):**
1. **The semantic role layer + Tailwind alias file.** `--color-teal-deep: var(--role-brand)`. This is the single strongest idea in the entire set, because without it the schema styles nothing: colour is baked into Tailwind class *names* (`index.css:72`, `bg-teal-deep` across components) and 235 hex literals. The alias makes existing markup re-theme on day one and lets `check-brand-refs.mjs` grind the names down as a separate ratchet. Rejected alternative: block this schema for several sessions on a rewrite.
2. **Per-slot image metadata** (`alt`, `focal`, `treatment`, `origin`) — rescues the nine dead `*Alt` keys (`Admin.tsx:6339`) and makes hero-text contrast *computable* via `scrim` instead of permanently `unverifiable`.
3. **The `unverifiable` third verdict**, enumerated not hidden. The platform never claims a pass it cannot compute.

**Grafted from `generation` (four ideas):**
1. **`WORLD + SUBJECT + FRAME + NEVER`** as the prompt grammar, with a fixed slot order. This is what makes four surfaces read as one world.
2. **`subjectTemplate` with `{slot}` substitution from the DB row** — the prompt is *buildable from data*, not typed by a human. Without it, generation is a per-image manual act and coherence is a hope.
3. **Determinism + drift detection**: derived seed, `tokenDigest`, and a stamp on every generated asset. This is the honest implementation of "foundation-generated art it cannot regenerate" — the village can *see* that its words and its pictures have diverged.
4. **`generated_images` as a real table**, and the plane split (budgets → `gameVariables`, key → `secrets.ts`). The brand JSON blob has no room for prompt/seed/digest and is invisible to any column-enumerating sweep.
5. **The `pick()` divergence**: `null`/absent = inherit, `""`/`[]` = explicitly empty. `pick()` (`index.ts:1276`) cannot express "deliberately no motifs", and the code's own comment at 1293-1295 already concedes the defect.

**Rejected outright:**
- `designer`'s server-inlined `:root` into `index.html`. It breaks the "NEUTRAL BY CONSTRUCTION" contract (`client/index.html:6`) and the static build. Replaced with a better mechanism: a render-blocking `GET /api/brand/theme.css` with an ETag (§6.2). No FOUC, no templating, no localStorage hack.
- `generation`'s ~45 free art fields as the *founder* surface. They survive as Tier-3 overrides of what the character card derives.
- Font upload. Licensing liability plus a fourth writer into a volume with no GC. `fontSource` covers the real need.
- `og:image`. Structurally outside the overlay; a brand field would be a lie.

---

## 1. Plane assignment

| Concept | Plane | Location |
|---|---|---|
| Colour, type, geometry, art direction, tone, per-slot image metadata | **2 — brand overlay** | `app_config` where `config_key='brand'`, new top-level sections `theme` and `art` |
| Generation budgets, caps, cooldowns, provider, uploads budget | **1 — behaviour** | `shared/gameVariables.ts`, new categories `Imagery` and `Storage` |
| Image-generation API key | **5 — secrets** | `server/lib/secrets.ts`, `image_api_key` / `IMAGE_API_KEY` |
| Generated-asset provenance | per-deployment data | new table `generated_images` |
| Contrast requirement | launch registry | `shared/launchRequirements.ts` + `server/lib/launch.ts` |
| Uploads sweep report | **4 — app_config docs** | `dbDocument(pool, "uploads-report", …)` |
| `shared/gameConfig.ts` | **receives nothing** | deliberate — see §2.3 |

---

## 2. Storage shape

### 2.1 The document

`DEFAULT_BRAND` (`server/index.ts:458`) goes from four keys to six:

```ts
const DEFAULT_BRAND = {
  project:  { name:"", tagline:"", memberName:"", location:"", siteUrl:"", eventsUrl:"", footerBlurb:"" },
  currency: { name:"", nameLower:"" },
  images:   { hero:"", investorHero:"", residentHero:"", stewardHero:"", prosperityHero:"",
              masterPlanHero:"", logo:"", heartLogo:"", favicon:"" },   // UNCHANGED — 9 strings
  setup:    { identity:false, images:false, numbers:false, content:false, technical:false, look:false },
  theme:    { ...DEFAULT_THEME },   // from shared/brandTokens.ts
  art:      { ...DEFAULT_ART },     // from shared/brandTokens.ts
};
```

`images` keeps its nine-string contract untouched — `BrandImages` (`gameApi.ts:24`), six hero pages and the wizard's `ImagePicker` all depend on it. Metadata lives in the parallel `art.slots` map keyed by the same names.

No migration. `app_config.value` is `json` (`drizzle/0001_init.sql:139`).

### 2.2 Blank semantics — two rules, one divergence

- **`theme.*` scalars keep `pick()` semantics**: `""` / `undefined` / `null` = INHERIT.
- **`art.*` free text and arrays diverge**: `null` / absent = INHERIT; `""` / `[]` = **explicitly empty**. A village that genuinely wants no motifs and no material constraint must be able to say so. This divergence is documented at the top of `shared/brandTokens.ts` in a comment that says *why*, or the next person "fixes" it back.

### 2.3 Where the fallback chain terminates

```
stored brand.theme/art value
  → GAME_CONFIG.theme/art   (does NOT exist and will NOT be added)
  → NEUTRAL_THEME / NEUTRAL_ART in shared/brandTokens.ts
```

Everywhere else in the overlay a blank field resolves to Amora's value in `gameConfig.ts`. For theme and art that would make every untouched fork wear another village's colours and art direction — the exact thing the white-label rule exists to prevent, and the mistake the nine hero URLs (`gameConfig.ts:194-204`) already made. **`shared/gameConfig.ts` gains nothing.** A fresh fork that touches nothing must look like nobody in particular.

`shared/brandTokens.ts` lands in the **HARD-CLEAN** zone of `scripts/check-brand-refs.mjs` (everything not in the ratchet or declared-homes list). Any hit on a village name fails CI on the first commit. Neutrality is therefore mechanical, not promised.

---

## 3. Field list

### 3.1 `theme` — Tier 1, the three decisions

| Key | Type | Default when blank |
|---|---|---|
| `theme.seed` | `string` hex `#rrggbb`, validated `/^#[0-9a-f]{6}$/i` on write | `NEUTRAL_THEME.seed = "#6E7376"` — a desaturated stone. Supplies hue + clamped chroma to every role, the chart ramp, and the prompt's palette clause. |
| `theme.character` | `choice(6)`: `quiet \| handmade \| field \| woven \| coastal \| civic` | `"quiet"` — the most restrained card, so an untouched fork reads as plain rather than as a style statement someone else made. |
| `theme.place` | `string ≤160`, newline-stripped | `""` → falls back to `project.location`; if that is also blank, the biome clause is **omitted** and the prompt gains `no strong regional markers, unspecified setting` (blank must produce *placeless* art, not the generator's default, which skews suburban North American). |

### 3.2 `theme` — Tier 2, optional

| Key | Type | Default when blank |
|---|---|---|
| `theme.accent` | hex | derived: seed hue rotated by the card's `accentRotation`, chroma ×0.85 |
| `theme.surface` | `choice`: `auto \| light \| warm \| deep` | `auto` → the card's surface family |
| `theme.mode` | `choice`: `light \| dark \| auto` | `light`. Both ramps are always derived, so switching cannot half-apply. This is the selector the existing `.dark` block (`index.css:125`) has never had. |
| `theme.chroma` | `choice`: `muted \| balanced \| vivid` | the card's default. Multiplies derived-step chroma only (×0.6 / ×1.0 / ×1.35), never the seed itself. |
| `theme.radius` | `number` rem, clamped 0–1.5 | `null` → the card's radius |
| `theme.contrastPolicy` | `choice`: `enforce \| verbatim` | `enforce`. `enforce` discards the seed's lightness for UI roles and substitutes an accessible foreground when a pair fails. `verbatim` ships the authored hexes exactly and is the **only** way to reach a `fail` verdict on the safe path. The opt-out and the alarm are the same switch. |
| `theme.contrastTarget` | `choice`: `AA \| AAA` | `AA` (4.5:1 body, 3:1 large/non-text) |
| `theme.fontSource` | `choice`: `foundation \| system \| google \| self-hosted` | `foundation` — the card names a pairing from a closed, self-hosted, subset foundation set. The hardcoded Google Fonts `<link>` in `client/index.html` is **removed** and re-emitted only when this says `google`; today every fork downloads four Amora-chosen families it may not use. |

### 3.3 `theme` — Tier 3, escape hatch (behind "More options")

| Key | Type | Default |
|---|---|---|
| `theme.overrides` | `map<roleName, hex>` | `{}`. Skips derivation for the named roles only. Every overridden role is marked `unverifiable` in the report, and under `enforce` its ink partner is still derived. Choosing exact hexes costs you the guarantee, visibly. |
| `theme.fontDisplay` / `.fontBody` / `.fontAccent` | CSS font-stack strings | `""` → the card's pairing. Full stacks, so the fallback chain is the village's decision. |
| `theme.fontImportUrl` | URL string | `""` → no import emitted. Blank + `fontSource:"google"` degrades to the system fallback; text always renders. |
| `theme.baseSize` | integer px, clamped 14–20 | `16` |
| `theme.density` | `choice`: `comfortable \| compact` | `comfortable`. Scales spacing only, with a floor so touch targets never drop below the accessible minimum. |

### 3.4 `theme` — server-owned, never client-writable

| Key | Type | Behaviour |
|---|---|---|
| `theme.engine` | integer | Which revision of `resolveBrandTokens()` produced this village's look. Stamped `1` on first save. Lets the foundation improve the ramp without silently repainting every existing fork overnight; an admin explicitly adopts a new engine in the wizard. |
| `theme.rev` | integer | Incremented by the PUT handler on **any** write touching `theme` or `art`. It is the ETag for `/api/brand/theme.css` and the stale-tab signal. A client-supplied value is ignored. |

### 3.5 `theme` — DERIVED, never stored

Recomputed on read from `(seed, character, surface, mode, chroma, overrides, engine)`, memoised on the brand document's identity so it recomputes only when `brandRepo.put()` refreshes the cache. `mergedConfig()` is called from ~30 synchronous sites; `resolveBrandTokens()` must stay pure and cheap.

| Key | Shape |
|---|---|
| `theme.roles` | `Record<RoleName, { hex, oklch }>` |
| `theme.css` | `{ light: string, dark: string }` — the two `:root` / `.dark` blocks |
| `theme.contrast` | `{ status: "ok"\|"adjusted"\|"fail", worstRatio, failCount, unverifiableCount, scope, pairs: ContrastPair[] }` |
| `theme.colorWords` | `string[]` — nearest plain names ("deep teal", "warm sand"). Image models obey names far better than hex; the prompt carries both. |
| `theme.fonts` | `{ display, body, accent, source, importUrl }` |
| `theme.geometry` | `{ radius, borderWeight, elevation, density, spacingBase, baseSize, typeScale, lineHeight, displayCase }` |
| `theme.register` | `{ formality, warmth, personLabel }` — **read-only**, derived from the card. Tone is genuinely absent from all five planes today; this gives generators something real to read *now*, at zero founder cost, without minting a half-designed field that strands like `project.memberName`. |

### 3.6 The six character cards

Foundation-authored, in `shared/brandTokens.ts`, named in plain language and carrying no village's name.

| id | label | radius | surface | chroma | border | elevation | fonts (display/body) | medium | light | cameraLanguage | accentRot | palettePolicy | register |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `quiet` | Quiet | 0.5 | light | muted | standard | flat | humanist-sans / humanist-sans | photographic | soft-overcast | 35mm, eye-level, natural depth | +32° | natural | plain / warm / "member" |
| `handmade` | Hand-made | 0.75 | warm | balanced | standard | soft-shadow | serif / humanist-sans | watercolour-and-ink | dappled-shade | close, hand-height, shallow depth | +26° | brand-led | informal / warm / "neighbour" |
| `field` | Field station | 0.25 | light | balanced | bold | flat | grotesk / grotesk | photographic | bright-midday | 28mm, working distance, deep focus | +180° | natural | direct / plain / "worker" |
| `woven` | Woven | 1.0 | warm | vivid | hairline | soft-shadow | serif / geometric-sans | painterly-illustration | golden-hour | flat-ish, layered, no strong perspective | +48° | brand-led | lyrical / warm / "weaver" |
| `coastal` | Coastal | 0.75 | light | balanced | hairline | lifted | geometric-sans / humanist-sans | photographic | golden-hour | 50mm, horizon-led, shallow depth | +160° | natural | open / warm / "resident" |
| `civic` | Civic | 0.25 | light | muted | standard | flat | grotesk / grotesk | line-illustration | studio-even | flat, orthographic, no depth of field | +200° | monochrome-brand | formal / neutral / "citizen" |

Each card also carries a `styleClause` (one foundation-authored sentence, e.g. `hand-drawn ink and watercolour wash, soft edges, visible paper grain, no photographic realism`) and a `subjectBank` (neutral fallback subjects) used when `art.subjects` is blank.

### 3.7 `art` — stored

| Key | Type | Default when blank |
|---|---|---|
| `art.subjects` | `string ≤160` | `null` → the card's `subjectBank` filtered by `place`. Present so a village can say "always hands, never portraits" without touching negatives. |
| `art.avoid` | `string ≤240` | `null` → platform floor only. Village text is **appended** to the floor, never replaces it. |
| `art.styleNote` | `string ≤240`, single line | `null` → contributes **nothing**. A blank style note must never become a hallucinated default aesthetic. |
| `art.palettePolicy` | `choice`: `brand-led \| natural \| monochrome-brand` | the card's value. Controls whether the derived hexes and `colorWords` enter the prompt at all. |
| `art.people.context` | `string ≤160` | `null` → `"people of varied and unspecified background"`. The platform **never guesses demography from location** and never emits a blank people clause — a blank clause lets the generator's own bias fill the gap. |
| `art.people.dress` | `string ≤80` | `null` → clause omitted |
| `art.people.depiction` | `choice`: `none \| distant-figures \| candid-people` | `distant-figures`. Every value emits an explicit negative (`none` → `no people, no figures`), so the constraint is enforced positively. |
| `art.people.ageRange` | `string ≤60` | `null` → `"adults"`. Deliberately narrow: the safe default cannot collide with the minors floor. |
| `art.world.*` | Tier 3 overrides: `medium`, `light`, `cameraLanguage`, `biome`, `architecture`, `materials[≤8]`, `motifs[≤6]`, `colourGrade`, `mood` | `null` → card + `place` derived. `""`/`[]` → explicitly empty. |
| `art.never` | `string[]` ≤20 entries, ≤40 chars each | `null` → platform floor only. **Additive only** — no village path shrinks the floor. |
| `art.slots.<slot>` | see §3.8 | `{}` → per-slot platform defaults |
| `art.styleLock` | machine-written `{ descriptor, anchorSeed }` | `null` → minted on the first successful generation. Same lock, same look, across a hundred images made months apart. Editing any `art.world.*` or `theme.character` value **invalidates it** and the UI says so plainly. |
| `art.seedSalt` | opaque, server-generated once | absent → generated on first write and persisted, never regenerated. Without it two villages with identical tokens receive byte-identical art. |
| `art.digest` | DERIVED sha256 of the fully resolved theme+art | always computable; stamped onto every generated asset |
| `art.never.effective` | DERIVED `string[]` | platform ∪ village ∪ slot, deduplicated, order-stable. Exposed on the **admin** read only so a founder sees the exact negative list before spending a credit. Never stored — a stored union goes stale the moment the floor updates. |
| `art.promptPreview` | DERIVED `string` | the exact composed positive prompt for a named slot, returned by `GET /api/admin/brand`. Rejected on PUT. |

**`PLATFORM_NEVER`** lives in `shared/brandTokens.ts`, not in the village document, so a fork cannot delete it by editing JSON: *text, lettering, captions, watermarks, signatures, logos, brand marks, UI chrome, QR codes; extra limbs, extra fingers, warped faces; identifiable real public figures; depiction of minors; nudity; weapons; clinical/medical imagery; religious and Indigenous sacred iconography; corporate stock-photo affect; AI-render artefacts.* Emitted **last**, or into the provider's dedicated negative parameter where one exists (strictly better — prompt text cannot override it).

### 3.8 `art.slots.<slot>`

Slot keys = the nine brand image slots (`hero`, `investorHero`, `residentHero`, `stewardHero`, `prosperityHero`, `masterPlanHero`, `logo`, `heartLogo`, `favicon`) **plus** the generation surfaces (`portrait`, `circleScene`, `questIllustration`, `badge`).

| Field | Type | Default |
|---|---|---|
| `alt` | `string ≤160` | `""` → today's `Layout.tsx:84` fallback (`villageName \|\| "Village logo"`). **On read, if `images.<slot>Alt` is non-empty and this is empty, adopt it** — a one-time rescue of the alt text admins have already typed into the void. |
| `focalX` / `focalY` | `number` 0–1 | `0.5` / `0.5` → today's dead-centre crop. This is what stops two villages getting identical framing from the same nine slots without commissioning new art. |
| `treatment` | `choice`: `none \| scrim \| duotone` | `scrim` for hero slots (today's hardcoded dark overlay), `none` for logo/heartLogo/favicon |
| `scrimMin` | `number` 0–1 | `0.45` for hero slots, `0` elsewhere. Under `enforce`, opacity is raised until the overlaid text pair passes. |
| `origin` | `choice`: `inherited \| foundation \| uploaded \| village` | `""` inferred on read: URL equal to a `gameConfig` default → `inherited`; an `/api/uploads/` path with a matching `generated_images` row → `foundation`/`village` per that row's `generated_by`; otherwise `uploaded`. **Blank never infers `foundation`** — the platform never claims authorship it cannot prove and never offers to regenerate an image it did not make. |
| `aspect` | `string` ratio | `hero/*Hero` 16:9, `banner` 21:9, `logo/heartLogo/favicon/portrait/questIllustration/badge` 1:1, `circleScene` 4:3. Never null — a generation call cannot proceed without a ratio. This is the missing metadata that today exists only as the prose "Landscape works best" (`Admin.tsx:6250`). |
| `pixels` | integer long edge | 1024 (portrait/quest/badge/logo), 1536 (circleScene), 2048 (hero/banner). **Always clamped down** to `imagery.max_resolution`, never up. |
| `framing` | `string ≤80` | per-slot platform default (`"wide establishing shot, horizon in the upper third"` for hero). Never omitted — an unframed request is the commonest cause of an unusable image. |
| `subjectCount` | `string` exact or range | hero `0-3 distant`, portrait `1`, circleScene `3-6`, questIllustration `0`. `0` emits an explicit "no people", not merely an omission. |
| `subjectTemplate` | `string ≤300` with `{slot}` placeholders | per-slot platform template. See §7.2. |
| `safeZone` | `string ≤60` | hero: `"lower third visually quiet, no focal subject"`; others none. This is the bridge between the tokens and the contrast question — hero text is legible only if the image reserves space for it. |
| `never` | `string[] ≤10` | `null` → the per-slot platform list. Additive to the floor. |

### 3.9 `setup.look`

`boolean`, default `false`. Sixth wizard tick alongside the existing five. Self-reported like the others — it gates nav placement only and verifies nothing (`Admin.tsx:7001-7006` computes `setupComplete` over the key set).

### 3.10 `shared/gameVariables.ts` — new defs

All `ring: "founder"` unless noted. Shape follows `VariableDef` (`gameVariables.ts:58`): values stored as strings, parsed by `type`.

**Category `Imagery`:**

| key | type | default | min/max | note |
|---|---|---|---|---|
| `imagery.generation_enabled` | boolean | `"false"` | — | Ships OFF, like every non-core module. A fork that pulls this change spends nothing. The art block stays editable and previewable while off. |
| `imagery.monthly_image_budget` | integer | `"0"` | 0 / platform ceiling | 0 = zero, never unlimited (caps-fail-closed). Its **max is a platform ceiling, not a village-editable bound** — otherwise a governance proposal could raise a village's spend on the foundation's card. First variable where violating "governance moves a value within its bounds, never the bounds" costs cash. Enforced by a foundation-side counter. |
| `imagery.max_resolution` | choice `1024\|1536\|2048` | `"1024"` | — | Hard clamp on `art.slots.*.pixels`. Clamps down only. |
| `imagery.regens_per_slot` | integer | `"3"` | 0/20 | Bounds the orphan blast radius per slot. |
| `imagery.regenerate_cooldown_hours` | integer | `"24"` | 0/720 | |
| `imagery.member_portrait_regens_per_season` | integer, **ring `open`** | `"0"` | 0/10 | 0 = members are offered no regeneration at all — the correct posture on foundation credit. |
| `imagery.provider` | choice | `"foundation"` | — | A choice, not a URL, so a village cannot point the platform's key at an arbitrary host. Ignored while generation is off. |
| `imagery.stale_art_banner` | boolean | `"true"` | — | Whether admins see the drift badge when an asset's `token_digest` ≠ `art.digest`. Default on: drift is information a village is entitled to. |

**Category `Storage`:**

| key | type | default | note |
|---|---|---|---|
| `uploads.budget_mb` | integer | `"2048"` | Per-village byte budget for UPLOADS_DIR. §9.4. |
| `uploads.orphan_grace_days` | integer | `"30"` | Minimum age before an unreferenced file is even a candidate. |
| `uploads.sweep_mode` | choice `report\|reclaim` | `"report"` | Dry-run by default, forever, until a human flips it. §9.3. |

### 3.11 Secrets plane

`server/lib/secrets.ts`: append `"image_api_key"` to `SECRET_KEYS` and `image_api_key: "IMAGE_API_KEY"` to `ENV_FALLBACK`. Inherits write-only storage, last4 masking, admin-value-beats-env.

`secretConfigured("image_api_key")` is the switch between the two states the constraint names: **absent** → foundation-generated art, every Regenerate control disabled *with the reason stated on the control* (not hidden), drift badges still shown, existing art keeps serving. **Present** → the village regenerates on its own dime at the higher ceiling.

---

## 4. Migration needs

Two SQL migrations. Observe the house traps: `--` comments on their own lines, never ending in `;`; never edit a shipped file.

### 4.1 `drizzle/0046_investor_docs_repair.sql` — **PREREQUISITE, ship first**

The vault writer at `index.ts:9374` pushes `{id,name,filename,pageLink,uploadedAt}` into a collection whose spec (`index.ts:608-617`) declares `{id,title,description,url,requiresRequest,order}`. `filename` has no column; `title` writes NULL into `NOT NULL`. Every vault upload is an unconditional orphan today, and `DELETE /api/admin/investor-docs/:id` 500s for every row after a restart because `path.join(UPLOADS_DIR, undefined)` throws.

```sql
ALTER TABLE investor_docs ADD COLUMN filename varchar(255) NULL;
ALTER TABLE investor_docs ADD COLUMN page_link varchar(500) NULL;
ALTER TABLE investor_docs ADD COLUMN uploaded_at datetime NULL;
```

Plus code, same change: add `filename`, `pageLink`, `uploadedAt` to the `investorDocsRepo` column spec; make the upload handler write `title` (from the original basename) and `requiresRequest`; wrap it so a DB failure unlinks the file it just wrote; guard `9396` with `path.basename` + the containment helper from §9.2.

**No orphan sweep may run in `reclaim` mode until this has been applied**, or the sweep becomes the thing that destroys the investor vault. Gate it: `runUploadsSweep` refuses `reclaim` unless the `data-migrations` document records `investor_docs_repair: true`.

### 4.2 `drizzle/0047_generated_images.sql`

```sql
CREATE TABLE generated_images (
  id varchar(64) NOT NULL,
  slot varchar(64) NOT NULL,
  subject_kind varchar(32) NOT NULL DEFAULT 'brand',
  subject_id varchar(64) NULL,
  prompt text NOT NULL,
  negative text NOT NULL,
  seed bigint NOT NULL,
  variant int NOT NULL DEFAULT 0,
  token_digest varchar(64) NOT NULL,
  theme_engine int NOT NULL DEFAULT 1,
  model varchar(120) NOT NULL,
  provider varchar(60) NOT NULL,
  generated_by enum('foundation','village') NOT NULL,
  filename varchar(255) NOT NULL,
  thumb_filename varchar(255) NULL,
  alt text NULL,
  width int NULL,
  height int NULL,
  bytes int NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_generated_filename (filename),
  KEY idx_generated_slot (slot, created_at),
  KEY idx_generated_subject (subject_kind, subject_id)
);
```

Empty table = no generated art; every surface falls back to its existing hardcoded local fallback exactly as today. Nothing about generation is load-bearing for the app to render.

`filename`/`thumb_filename` become the **first reference source a reclaim sweep can read for generated art**, and `alt` finally gives the nine dead `*Alt` keys a producer.

### 4.3 No migration for the overlay

`app_config.value` is `json`. A stored document missing `theme`/`art` reads correctly through the `getBrand()` spread.

---

## 5. The six mandatory code edits — order matters

The repo contains a proven trap: the wizard writes nine `*Alt` keys into `brand.images` (`Admin.tsx:6339`) that reach the database and die there, because `mergedConfig()` (`index.ts:1281`) enumerates output fields one by one and silently drops anything unnamed. `project.memberName` is a second stranded field. **Adding `theme`/`art` client-side alone reproduces that bug exactly** — the field stores, echoes back to the wizard, looks saved, and does nothing. Write the `mergedConfig()` enumeration first.

1. **`DEFAULT_BRAND` (`index.ts:458`)** gains `theme` and `art`.
2. **`getBrand()` (`index.ts:1265`)** gains two spreads. **The existing spread is shallow, one level deep** — `art.slots.hero` is two levels, so `resolveBrandTokens()` must do the deep resolution; relying on the spread means a village that sets one slot field wipes the platform defaults for its siblings.
3. **`mergedConfig()` (`index.ts:1281`)** gains a `theme` block calling `resolveBrandTokens()` and an `art` block returning the public slot subset. **THIS IS THE HARD CEILING.**
4. **`PUT /api/admin/brand` (`index.ts:9801`)** gains real validation. Today it is `typeof req.body === "object"` and nothing else. Required: hex parse on `seed`/`accent`/every `overrides` value (a hex written straight into a CSS custom property is a CSS-injection sink); enum membership on every `choice`; length caps + newline stripping on every free-text field; array-length and per-entry caps; numeric clamps; rejection of `promptPreview`/`never.effective`/`digest`/`rev`/`seedSalt` (server-owned); then `rev++`, mint `seedSalt` if absent, and invalidate `styleLock` if any world/character key changed.
5. **`PublicGameConfig` (`client/src/lib/gameApi.ts:24`)** gains `theme: PublicTheme` and `art: PublicArt`.
6. **Delivery** — §6.

Also: register `brand-contrast` in `shared/launchRequirements.ts` and its check in `server/lib/launch.ts`; add `shared/brandTokens.ts` to the HARD-CLEAN expectation and the `@theme inline` alias file to the **RATCHET** zone (not declared-homes) so the alias count can only fall.

---

## 6. Delivery — how tokens reach pixels

### 6.1 `shared/brandTokens.ts` (new, pure, isomorphic)

No I/O, no clock, no `Math.random`, no `mysql2`. Same discipline as `shared/launchRequirements.ts` and `shared/modules.ts`.

```ts
export function resolveBrandTokens(stored: StoredBrandTokens): ResolvedTokens;
export function themeCss(r: ResolvedTokens): { light: string; dark: string };
export function contrastAudit(r: ResolvedTokens): ContrastReport;
export function buildImagePrompt(slot: SlotName, subject: SubjectRow | null, r: ResolvedTokens, variant?: number): BuiltPrompt;
export function deriveSeed(salt: string, slot: string, subjectId: string, rev: number, variant: number): number;
export function tokenDigest(r: ResolvedTokens): string;
```

`deriveSeed` and `tokenDigest` need a **synchronous** hash on both server and client (`crypto.subtle` is async and Node's `crypto` is not importable in the browser bundle). Vendor a ~60-line pure-TS SHA-256 in `shared/lib/sha256.ts` — no imports, HARD-CLEAN, and deterministic by construction.

Four consumers, none of which may invent a token of its own: the CSS route, the client runtime injector, the wizard's live preview, and the prompt composer.

### 6.2 The stylesheet route — no FOUC, no templating

```
GET /api/brand/theme.css
  → resolveBrandTokens(getBrand()) → themeCss()
  → text/css
  → ETag: W/"theme-<rev>-<engine>"
  → Cache-Control: no-cache, must-revalidate
GET /api/brand/theme.css?rev=N   → Cache-Control: public, max-age=31536000, immutable
```

`client/index.html` gains one line: `<link rel="stylesheet" href="/api/brand/theme.css">`. That file stays **neutral by construction** — the URL names no village and a static artifact still cannot know which fork it serves. The stylesheet is render-blocking, so colour never flashes; its body is the resolver's output (hexes and numbers only, no village-authored string), so it stays honest under `check-brand-refs`. Steady state is one conditional request per page load returning 304.

This replaces `designer`'s server-inlined `:root` (breaks the static build and the neutrality comment) and `fork-builder`'s localStorage pre-paint snapshot (a cache with no invalidation story).

### 6.3 The alias layer in `client/src/index.css`

The `@theme inline` block (`index.css:26-86`) becomes an alias file:

```css
@theme inline {
  --color-teal-deep: var(--role-brand);
  --color-teal:      var(--role-support);
  --color-cream:     var(--role-surface-raised);
  --color-amber:     var(--role-support);
  /* …one line per existing colour-named utility… */
  --radius-sm: calc(var(--radius) - 4px);   /* unchanged */
  --font-display: var(--font-display-role);
}
```

`:root` ships the **neutral** role values as literals, so a no-JS / pre-stylesheet render is coherent rather than unstyled. `/api/brand/theme.css` overrides them.

This is a deliberate lie: a fork's blues will render through a class named `teal`. Every alternative is worse — rewriting 235 hex literals and every colour-named utility before any village can change its primary blocks this schema for several sessions. `check-brand-refs.mjs` already provides the ratchet that makes the lie decay monotonically.

### 6.4 Runtime injection (wizard live preview only)

There are currently **zero** `style.setProperty` calls anywhere in the repo. The favicon swap in `client/src/App.tsx:97` is the only existing precedent for the overlay reaching into the document, and it is the pattern to copy: same place, same lifecycle, writing custom properties on `documentElement` instead of `link` hrefs.

Production pages do **not** need this — the stylesheet route covers them. The injector exists so the wizard can preview without a save. On save, bump `rev` and re-request the stylesheet.

Note `fetchConfigCached()` (`gameApi.ts:68`) memoises once per page load with no invalidation, so an already-open tab keeps stale identity. The theme survives this because it comes from CSS, not from that fetch.

### 6.5 Colour derivation — lightness is not a decision

Seed → OKLCH. Keep **H**; keep **C** clamped to a ceiling (0.16) and scaled by `theme.chroma` (×0.6 / ×1.0 / ×1.35). **Discard the seed's L for every UI role.** Each role has a fixed target lightness per mode:

| role | light L / C | dark L / C |
|---|---|---|
| `surface` | .985 / .004 | .180 / .020 |
| `surface-raised` | 1.000 / .000 | .225 / .022 |
| `surface-sunken` | .955 / .012 | .150 / .018 |
| `ink` | .260 / .030 | .920 / .012 |
| `ink-quiet` | .480 / .025 | .700 / .015 |
| `brand` | .520 / min(seedC,.13) | .680 / min(seedC,.11) |
| `support` | .580 / .100 @ H+rot | .700 / .090 @ H+rot |
| `edge` | .860 / .015 | .320 / .020 |
| `edge-strong` | .740 / .020 | .420 / .022 |
| `focus` | = brand | = brand |
| `positive` / `caution` / `critical` | .450 / .120 @ H 150/85/28 | .700 / .110 |
| `chart-1..5` | .520/.620 alternating, H + [0,+36,−36,+72,+144] | .680/.600 |

`*-ink` partners (`brand-ink`, `support-ink`, `positive-ink`, …) are computed, not stored: pick the higher-contrast of `{L .99, L .18}` at the partner's hue, then nudge L in .02 steps (max 20) until the target ratio is met.

Contrast is therefore **structurally satisfied by construction**, not checked afterwards. A founder cannot produce unreadable body text by picking a bad colour, because the colour they picked is never used at the lightness that would break it.

Status colours are separated from `brand` on purpose: a village whose primary *is* green must not make "success" indistinguishable from chrome. Status colour is a usability contract, not identity.

`ink` shadow colour derives from the ink seed rather than black, so elevation stays in-family in both modes.

### 6.6 The contrast report

Audited pairs, always, in both modes:

| # | pair | target |
|---|---|---|
| 1 | `ink` on `surface` | 4.5 |
| 2 | `ink-quiet` on `surface` | 4.5 |
| 3 | `ink` on `surface-raised` | 4.5 |
| 4 | `ink` on `surface-sunken` | 4.5 |
| 5 | `brand-ink` on `brand` | 4.5 |
| 6 | `support-ink` on `support` | 4.5 |
| 7 | `positive/caution/critical -ink` on partner | 4.5 |
| 8 | `brand` on `surface` | 3.0 |
| 9 | `edge` on `surface` | 3.0 |
| 10 | `focus` on `surface` | 3.0 |
| 11 | per hero slot with `treatment:"scrim"` — `ink-on-scrim` where the background is the composite of the scrim colour at `scrimMin` over a mid-luminance assumption | 4.5, verdict `estimated` |

Verdicts: **`pass`** (measured, meets target) · **`adjusted`** (the derived foreground moved to meet the target — the honest common case; the wizard says so in plain language next to the swatch: *"we darkened your colour for text — here's yours, here's ours"*) · **`fail`** (measured, misses target — reachable only via `contrastPolicy:"verbatim"` or `theme.overrides`) · **`estimated`** (scrim composites) · **`unverifiable`** (text over an untreated uploaded image, an uploaded logo on the brand-coloured nav, any role in `theme.overrides`).

`unverifiable` is **enumerated, not hidden**. The report also carries a `scope` string that states its own limits verbatim: *"This audit covers the design tokens. Pages that render hardcoded colours are not audited."* 235 hex literals across `client/src` and `#2D5A5A` 134 times in `Admin.tsx` alone are unreachable by any token-level audit; a report that implied otherwise would be a false assurance, which is worse than no assurance.

Surfaced in **three places**, so a failure cannot be silent:
1. Inline in the wizard, as a pass/fail table beside the swatches.
2. In `/api/game/config`, so any consumer (and any future fleet audit) can read it.
3. As launch requirement **`brand-contrast`**, sibling to `brand-basics` (`index.ts:5687`), riding the Journey to Launch page and the persistent admin banner for free.

```ts
{ id: "brand-contrast", group: "brand", severity: "recommended",
  title: "Colours are readable",
  why: "Text that doesn't stand out from its background is unreadable for some members, and unusable in bright sun. We check every colour pair the theme defines.",
  checkKey: "brand:contrast", fixAt: "/admin?tab=setup", fixLabel: "Open Look and feel" }
```

**`recommended`, not `blocking` — a deliberate call.** The registry's own definitions (`launchRequirements.ts:34-40`) read *blocking* = "launch is dishonest without it" and *recommended* = "the platform works, but a member will hit a wall". A low-contrast page is precisely the second. Making it blocking would mean a village that pastes its real, non-negotiable brand book cannot launch at all — which pushes founders to fake the audit rather than fix it. The audit is loud, permanent, non-dismissible and machine-readable instead. This is the field a reviewer is most likely to rule the other way on; the counter-argument is written here so the decision is legible.

---

## 7. How a generation prompt is built from tokens

### 7.1 The grammar

Every image is **`WORLD + SUBJECT + FRAME + NEVER`**, concatenated by a pure function in a fixed order.

- **WORLD** tokens are byte-identical in every prompt the village ever emits. That is the entire mechanism of coherence: a hero, a circle scene, a quest card and a portrait share ~70% of their prompt text verbatim.
- **SUBJECT** is `art.slots.<slot>.subjectTemplate` with `{}` slots filled from the DB row being illustrated.
- **FRAME** is per-slot and fixed: aspect, framing, subject count, safe zone.
- **NEVER** is the union of a platform floor the village cannot shrink and a village list it can grow.

Fixed slot order (`PROMPT_ORDER` in `brandTokens.ts` — ordering is part of determinism; the same tokens in a different order are a different prompt):

```
medium → styleClause → styleNote → subject → framing → subjectCount →
people → place/biome → architecture → materials → light → colourGrade →
cameraLanguage → motifs → mood → safeZone
```

Negatives are emitted **last**, or into the provider's dedicated negative parameter where one exists — strictly better, because prompt text cannot override a parameter.

### 7.2 Subject templates and slot resolution

| slot | template |
|---|---|
| `hero` | `a wide view of {theme.place}, the everyday life of {project.name}` |
| `portrait` | `a single person of this village: {user.name}, {user.bio}` |
| `circleScene` | `a small group at work on: {circle.name} — {circle.purpose}` |
| `questIllustration` | `the tools, materials and half-finished work of: {quest.title}` |
| `badge` | `a single emblematic object for: {badge.name}` |

Slot values are trimmed, newline-stripped, and length-capped (80 chars each) before substitution. **An unresolvable slot renders empty and the whole clause is dropped** — a generation must never emit the literal string `{quest.impact}`.

### 7.3 Determinism

```
seed = int64( sha256( art.seedSalt + "|" + slot + "|" + subjectId + "|" + theme.rev + "|" + variant ) )
```

Nothing in the path is random. Same tokens + same row = byte-identical prompt and identical seed, forever. Bump `variant` for a different take of the same subject; `theme.rev` participates in the seed so a token edit *necessarily* changes the image — a version that did not participate would let a token change silently produce identical art.

### 7.4 Worked example

Village: `seed #2E6F5E`, `character: handmade`, `place: "volcanic ridge above cloud forest, timber, lime plaster, red earth"`, `subjects: "hands at work, tools, no portraits"`, `avoid: "no drone shots, no crowds"`, slot `hero`.

```
POSITIVE:
hand-drawn ink and watercolour wash, soft edges, visible paper grain, no photographic
realism. a wide view of volcanic ridge above cloud forest, timber, lime plaster, red
earth — the everyday life of this village; hands at work, tools. wide establishing shot,
horizon in the upper third. 0-3 distant figures. people of varied and unspecified
background, adults, distant figures only. volcanic ridge above cloud forest. timber,
lime plaster, red earth. dappled shade. a palette of deep pine-green and warm sand
against soft paper white. close, hand-height, shallow depth. unhurried, dignified.
lower third visually quiet, no focal subject.

NEGATIVE:
no drone shots, no crowds, no portrait framing, no single dominant person, no faces or
focal detail in the lower third, no text, no lettering, no captions, no watermarks, no
signatures, no logos, no brand marks, no UI chrome, no QR codes, no extra limbs, no
extra fingers, no warped faces, no identifiable public figures, no minors, no nudity,
no weapons, no clinical imagery, no sacred iconography, no stock-photo affect, no AI
render artefacts

seed: 7741903255112 · aspect 16:9 · 2048px · digest a91f…c7
```

Note the palette clause carries **`colorWords`, not hex**. `#2E6F5E` means nothing to an image model; "deep pine-green" does. When `palettePolicy` is `brand-led` the hexes are appended too; when it is `natural` (the default for photographic cards) neither enters — forcing brand colour into a landscape is how generated art starts looking synthetic.

### 7.5 Drift

Every generated asset stores the `token_digest` it was made from. When `generated_images.token_digest ≠ art.digest`, the wizard shows: *"This art predates your current look. Add an image key to regenerate."* A village without its own key edits its tokens and **cannot** regenerate; the digest mismatch turns that into a visible statement instead of a village quietly staring at art that no longer matches the words it just typed. That is the honest expression of the foundation-art constraint.

### 7.6 Provenance must be written atomically

The existing brand-image writer creates **no database row at all** — upload and reference are two independent HTTP calls with no transaction between them (`index.ts:9287`). Generation must not repeat this. One function:

```ts
persistGeneratedImage({ slot, subject, buffer, prompt, negative, seed, digest, model, provider, by })
  1. write file (+ thumb) to UPLOADS_DIR
  2. INSERT generated_images row  (rollback = unlink the file)
  3. brandRepo.put({ images.<slot>: url, art.slots.<slot>.origin: by, art.slots.<slot>.alt })
```

File first, then row, then reference — the ordering the retention sweep already gets right (`index.ts:1901-1910`) and the vault delete gets wrong (`index.ts:9395`). Without this, `origin` drifts and the wizard offers to regenerate images the village actually uploaded.

### 7.7 Prompt injection posture

Admin-authored free text entering a paid generator is a prompt-injection surface. The trust level is admin, so this is not privilege escalation — but a compromised admin session can steer the **foundation's** key and budget, which is a cross-tenant cost problem, not a local one. Bounds, not safety: hard length caps on every free-text field, newline stripping, closed enums for every structural decision, free text inserted only into bounded slots in a platform-owned template (never *as* the template), the platform never-floor emitted last or as a provider parameter, and subject-slot values sanitised before substitution.

---

## 8. Admin UI shape

### 8.1 The step

A sixth wizard step, **"Look and feel"**, between *Identity* and *Pictures* — the character card and the place sentence inform what pictures you would generate, so it must come first. `setup.look` joins the five booleans at `DEFAULT_BRAND.setup`.

`SetupWizard` (`Admin.tsx:6258`) is the only component that writes the brand document; `saveBrand("theme", partial)` and `saveBrand("art", partial)` follow the existing per-section PUT pattern.

### 8.2 The founder path — three controls, then done

```
LOOK AND FEEL                                              ~5 minutes

1  Pick a colour              [ 12-swatch grid ] [ #______ ]
                              (the swatches are neutral hues, not any village's)

2  Pick a character           [ 6 illustrated cards, plain-language names ]
                              Quiet · Hand-made · Field station · Woven · Coastal · Civic

3  Describe your place        [ 160-char text box ]
                              "volcanic ridge above cloud forest, timber, lime plaster,
                               red earth"

   ── live preview ──────────────────────────────────────────────
   [ a real card, a real button, a real heading, in the derived theme ]

   Your colour  ▉  →  what we use for text  ▉
   We darkened your colour so text stays readable. Here's yours, here's ours.

   ✓ 11 colour pairs checked · 3 adjusted · 0 failing
     (This checks the theme's colours. Pages with hardcoded colours aren't covered.)

   ▸ More options   (accent, light/dark, warmth, corners, fonts, exact colours)
   ▸ Imagery        (what to show, what to avoid, people, per-picture framing)

                                                      [ Save look and feel ]
```

Everything below "More options" defaults blank and inherits. The three decisions are the whole fifteen minutes.

### 8.3 New input primitives (none exist in `Admin.tsx` today)

`brandField` (`Admin.tsx:6319`) renders a bare `<input type="text">`; there is no colour picker, no select, no swatch anywhere in the file. Required additions:

- `SwatchGrid` — 12 presets + hex box, validating on blur
- `CharacterCards` — 6 radio cards with an illustration, a name, and one line of plain description
- `ChoiceRow` — labelled enum selector, used for every `choice` field
- `ThemePreview` — renders live via `documentElement.style.setProperty` on a scoped wrapper
- `ContrastTable` — pair, ratio, verdict, with `adjusted` explained in plain language and `unverifiable` listed by reason
- `PromptPreview` — shows the exact composed sentence before a credit is spent (returned by `GET /api/admin/brand` as `art.promptPreview`)

### 8.4 Pictures step changes

`imageField` (`Admin.tsx:6339`) stops writing `images.<slot>Alt` and writes `art.slots.<slot>.alt`. It gains a focal-point picker (click the preview), a treatment selector for hero slots, and — per `origin` — either a **Regenerate** button or the line *"made for you by the foundation — upload your own to replace it"*. When `secretConfigured("image_api_key")` is false, Regenerate renders **disabled with its reason on the control**, never hidden.

### 8.5 What stays unthemed

The Admin panel itself. `#2D5A5A` appears 134 times in `Admin.tsx` alone — including the wizard's own save buttons and step badges (6361, 6419, 6437). A village will see its colours on the public pages and the platform's colours in Admin. That is defensible (Admin is the platform's tool, not the village's front door) and it is a `check-brand-refs` ratchet burn-down, not part of this schema. Pretending a token fixes it is not an option.

---

## 9. Uploads volume plan

### 9.1 Orphan detection — enumerating references safely

**Read from the DATABASE, never from a repo cache.** `dbCollection.replaceAll` sets `cache = [...rows]` retaining unmapped fields that were never written to MySQL, while `load()` rebuilds strictly from mapped columns at boot (`store-db.ts:115-133`). The referenced set can legitimately differ before and after a redeploy; only the DB is truth.

**The reference universe.** The legacy `data/*.json` files are dead — no code reads them (`index.ts:292-312`). The DB is the whole universe.

| # | Table.column | Shape | Note |
|---|---|---|---|
| 1 | `app_config.value` (**every** `config_key`) | json, scan **whole column as a string blob**, recursively | Holds `brand.images.*` (the nine hero/logo/favicon URLs — there is no `hero_url` column anywhere), plus `content`, `faqs`, `work-with-us`, `visit-config` (`visit_types[].cta_url`), `investor-summary` (`cta_url`, `details[].icon`), `journey-state`, `settings`, `season`, `exit-policy`, `email-config`, `data-migrations`. Never a per-key allowlist. |
| 2 | `submissions.data` → key `attachment` | **BARE FILENAME**, no `/api/uploads/` substring | **The single most dangerous entry.** Any sweep that greps for `/api/uploads/` classifies every Work-With-Us attachment (CVs, portfolios, ID scans on some forks) as unreferenced and deletes live files. Extract **by key**, exactly as the retention sweep already does (`index.ts:1898`). |
| 3 | `investor_docs.url` **and** `.filename` | url free text; filename after migration 0046 | Until 0046 is applied, the vault has no durable reference to its own files. **Do not treat `investor_docs` as a reference source before then.** |
| 4 | `forum_threads.image_url` | `/api/uploads/…`, prefix-validated at `index.ts:4299` | The one column contractually an upload pointer (`drizzle/0019_forum.sql:18`). |
| 5 | `forum_threads.meta` (json), `forum_threads.body`, `forum_replies.body` (text) | caller-supplied, spread unfiltered at `index.ts:4313` | An event's `ctaUrl` pointing at an uploaded flyer; a member pasting a path into a post. |
| 6 | `library_items.photo_url` | | Written from **two** files — `server/lib/library.ts:186` (intake) and `index.ts:7398` (edit). A grep of `index.ts` alone misses the insert path. |
| 7 | `accommodations.photo_url` | | |
| 8 | `tools.icon` + `tools.icon_kind` | dual-purpose | Read the **row**, not the column: identical to a lucide slug when `icon_kind='slug'`. Scan regardless of kind. |
| 9 | `users.avatar` | unvalidated, API-writable at `index.ts:8845` | |
| 10 | `quest_claims.artifact_url` | free text | Members are asked for "a link" and will paste an uploads path. |
| 11 | `training_modules.url` | free text | |
| 12 | `module_settings.config` (json) | `validateConfig()` runs for only four modules | Scan whole. |
| 13 | `badges.icon`, `circles.icon`, `quests.icon` | `varchar(64)` | A generated path is 43 chars and fits. Low probability, non-zero, free to include. |
| 14 | `notifications.link`, `game_variables.value`, `payment_products.zeffy_url`, `mechanics_proposals.hypha_ref` + `.hypha_proposal_url`, `feedback_items.page_url` | defensive | None intended to hold uploads; all wide enough to carry one. Excluding them is an unverifiable bet. |
| 15 | `exits.agreement_ref` | explicitly "a POINTER to an agreement" | Pasting the signed exit agreement's uploads path here is the intended use. |
| 16 | `recordings.url` | source enum includes `'manual'` | |
| 17 | `generated_images.filename` + `.thumb_filename` | NEW | The first reference source for generated art. |

**EXCLUDED — `peer_shared_cache.payload`.** An `/api/uploads/x` string in there refers to a file on a *different instance's* volume. Including it can only ever cause a local orphan to be spuriously kept (harmless), but it must never be counted as proof a local file is referenced.

**One canonicalizer, both sides.** The retention sweep's existing bug is instructive: it builds `keptFiles` from **raw** stored strings (`index.ts:1897`) but deletes via `path.basename(name)` (`index.ts:1905`). The two keys are in different namespaces, so a kept row holding `"foo.pdf"` does not protect against a dropped row holding `"./foo.pdf"` — which misses the Set lookup but basenames to the same file. **Both sides are attacker-supplied.** Fix that call site in the same change.

```ts
// server/lib/uploads.ts
export function uploadRefsIn(value: unknown): string[]
```
Walks any JSON/string recursively. For each candidate string:
1. If it contains `/api/uploads/`, take the substring after the **last** occurrence, cut at `?` or `#`.
2. Else if it matches the platform stamp shape (`/^(brand|proposal|doc|tool|gen)-\d{13}-[a-z0-9]{5}/`) or a plausible bare filename, take as-is.
3. Else ignore (external URLs, in-app routes, on-chain refs, lucide slugs).
4. `path.basename()` the result, then require `/^[A-Za-z0-9._-]+$/`. Case-sensitive — the volume is Linux.

The **same function** builds the referenced set and normalises directory entries. One canonicalizer, applied on both sides, is the rule.

**Thumb pairing.** Every `brand-<stamp>.thumb.webp` is referenced by no stored string anywhere: `uploadSrcSet` (`client/src/components/Image.tsx:156`) has zero call sites and `BrandImageField` discards `data.thumbUrl` (`Admin.tsx:6180`). Judged independently, every thumb ever written is an orphan — and the day `uploadSrcSet` is wired up, the sweep starts deleting live thumbnails. **Rule: `X.thumb.webp` is kept whenever `X.webp` is kept**, never judged on its own.

### 9.2 Delete-safety rules

**Path handling.**
- `UPLOADS_DIR` is a naked `path.join` over a mount point (`index.ts:283-312`) with no `realpath` anywhere in the repo. A `resolved.startsWith(UPLOADS_DIR)` test is **not sufficient**: without a trailing separator it also matches a sibling `/app/data/uploads-old`, and if the volume path or the `uploads` child is ever a symlink the prefix test passes while the real target is outside.
- Required helper: compare `fs.realpathSync(UPLOADS_DIR)` against `fs.realpathSync(path.dirname(candidate))` with an explicit `path.sep` boundary.
- Use `lstatSync`, never `statSync`, for age and size — a symlink's target mtime must never be mistaken for the entry's own.
- Delete pattern: **unconditional `unlink` inside `try/catch` swallowing ENOENT**. Never `existsSync` then `unlink` — pure overhead plus a TOCTOU window. The retention sweep at `index.ts:1904-1908` is the shape to copy; the vault delete at `index.ts:9396-9399` is the shape to fix (no basename, no containment — and `target.filename` comes out of a store that the JSON importer at `scripts/import-json-to-bmysql.ts:206` and any operator-restored backup can seed with arbitrary strings).
- Ordering: **unlink the file, then drop the reference.** The retention sweep gets this right (1901-1910); the vault delete gets it backwards (1395 before 9397), which is why a crash between the two leaves a file nobody can ever name again.

**Never delete.**
1. Anything in the referenced set (§9.1), or whose `.thumb.webp` parent is referenced.
2. Anything younger than `uploads.orphan_grace_days` (default 30). Age = **max** of `lstat.mtimeMs` and the `Date.now()` stamp parsed out of the filename; **both** must exceed the grace window. This is what protects superseded brand images: replacing an image mints a new URL by design (that is what makes the one-year immutable cache correct, `index.ts:9436-9449`), and the old pair is still live in every browser cache and in every email already sent.
3. Any entry that is a **symlink** — never delete, never follow. Report it.
4. Any **directory**.
5. Any filename that does not match a known platform shape. Foreign files are **reported, never reclaimed**. `POST /api/admin/investor-docs/upload` appends `path.extname(originalname)` raw, un-lowercased and un-allowlisted (`index.ts:9324`), so the volume can legitimately contain arbitrary extensions and quote characters. Treat every filename as hostile data: never interpolate one into a shell command, and escape it in any report.
6. Anything at all, in `reclaim` mode, unless migration 0046 has been applied (`data-migrations.investor_docs_repair === true`). Otherwise the sweep finds real, admin-uploaded, business-sensitive PDFs with zero DB references and destroys the investor vault.
7. Any file named by a string that crossed a request boundary. The sweep enumerates the **directory** and looks references up; it never accepts a filename as input. (`POST /api/forms/submit` is public and unvalidated — `index.ts:3314` — so a stranger can post `data.attachment = "brand-1753…-ab3de.webp"`; once that submission ages out, today's retention sweep deletes the village's hero image. Close that too: the retention sweep must only unlink files whose name matches the `proposal-` prefix.)

**Dry-run posture.** `uploads.sweep_mode` defaults to `report` and stays there until a human flips it. In `report` mode the job writes an `uploads-report` document and a `health_events` row and deletes nothing. The report names every candidate with its size, age, and *why* it is a candidate. Ship the measurement before the deletion — nobody can currently answer "how full is the volume", because **nothing in the codebase enumerates, counts or measures `UPLOADS_DIR`**: `readdir` across `server/` returns only `db/migrate.ts:30` and `lib/knowledge.ts:43`, and there is no `statfs`, quota or byte-total call anywhere.

**Registration.** `registerJob("uploads-sweep", 24 * 60 * 60 * 1000, runUploadsSweep)` alongside the eleven existing jobs (`index.ts:2427-2661`). It must not race or duplicate the two existing deleters (`index.ts:1905`, `index.ts:9398`).

**Write it down where the next writer will see it.** `docs/modules/tools-hub.md:73` documents `POST /api/admin/tools/icon` as shipped — it does not exist, but `tools.icon_kind` already accepts `'upload'`, so a fourth writer is coming. The `${Date.now()}-${random}` stamp convention that both the cache policy and the grace window depend on currently exists only as an English sentence in a comment at `index.ts:9436`. Record the naming, containment and reclaim contract in `docs/ARCHITECTURE.md` §3.15 and in the module doc, or the next pipeline lands outside it.

### 9.3 Per-village byte budget

**Knob:** `uploads.budget_mb`, `shared/gameVariables.ts`, category `Storage`, ring `founder`, type `integer`, default `"2048"`, unit `MB`. It is behaviour ("how much"), not identity, so it belongs nowhere near the brand overlay. Ring `founder`, not `open` — a governance proposal must not be able to raise a village's disk consumption on the foundation's volume, and the platform ceiling stays Ring 0.

**Enforcement** in a new `server/lib/uploads.ts`:

```ts
export function volumeUsage(): { files: number; bytes: number; scannedAt: string };
export function withinBudget(nextBytes: number): boolean;
export function noteWrite(bytes: number): void;   // increments the cached figure
export function noteUnlink(bytes: number): void;
```

Usage is computed once at boot and refreshed by the daily job, then adjusted in-memory on every write and unlink — never `readdir`'d per request.

`withinBudget` is checked **before multer runs** in all three (soon four) writers. Middleware ordering matters: for `diskStorage` routes the bytes are already on disk by the time a handler sees them, so the guard goes in front, exactly as `adminOnly` already runs before multer at `index.ts:9359-9364`. Over budget → **507** with a plain-language message naming the current usage and the budget. At 80% → an admin banner and a founder notification, not a silent approach to the wall.

`imagery.monthly_image_budget` is the *cost* ceiling; `uploads.budget_mb` is the *space* ceiling. Both must pass before a generation writes.

### 9.4 What `/health` should report

Extend the **unguarded** `/health` at `server/index.ts:3307` — **not** `/api/health/*`. That prefix is the health *module* (mounted behind `requireModule("health")` at `index.ts:6963`), it means the village's land-metrics dashboard, and it **ships OFF by default**. Operational storage metrics placed there would be invisible on every fork that has not enabled the module. This naming trap is worth a comment at the call site.

```jsonc
{
  "status": "ok",
  "build": "…",                    // unchanged
  "timestamp": "…",                // unchanged
  "process": { "uptimeS": 84210, "rssMb": 312 },
  "uploads": {
    "files": 1284,
    "bytes": 903_224_112,
    "budgetBytes": 2_147_483_648,
    "pct": 42,
    "orphanCandidates": 311,        // unreferenced AND past grace
    "orphanBytes": 244_118_003,
    "oldestOrphanDays": 412,
    "foreign": 0,                   // present but not platform-shaped — never reclaimed
    "symlinks": 0,                  // present but never followed or deleted
    "lastSweepAt": "2026-07-31T04:12:03Z",
    "sweepMode": "report",
    "lastSweepReclaimed": 0
  }
}
```

All values served from the cached figure refreshed by the daily job and boot — `/health` must never stat the volume per request. `symlinks > 0` or `foreign > 0` is an operator signal, not an error state.

---

## 10. Known limits, stated rather than papered over

1. **Six cards will not fit every village.** That is the price of the fifteen-minute constraint: free typography, radius and spacing fields are precisely the controls a non-designer uses to build something incoherent. The relief valves are the continuous hue, the founder's own place sentence, and `theme.overrides`. If the cards prove too narrow, the honest fix is a **seventh card authored by the foundation**, not raw knobs pushed onto the founder.
2. **The colour they pick is not exactly the colour they get.** Discarding the seed's lightness is what makes contrast safe by construction, and it will surprise anyone pasting a hex from a real brand guide. Mitigation is honesty, not silence: show both swatches and say it moved and why. `verbatim` restores exactness *and* arms the failure report — the coupling is the design.
3. **The audit proves the tokens pass, never that the page passes.** 235 hex literals are unreachable by any token-level check. The report states its own scope; without that it is a false assurance, which is worse than none.
4. **Palette control over a generator is genuinely weak.** No current model reliably hits a hex; expect drift between the CSS colour and the colour in the picture. `colorWords` is the best available lever. Two mitigations, neither built here: post-generation colour-grade toward the palette in `sharp` (already a dependency, already re-encodes every upload), or reference-image conditioning (much stronger, but stateful and order-dependent, which fights determinism). Ship the first if drift proves bad; document the second, do not build it.
5. **Locked seeds mean a bad image is permanently bad.** `variant` is the release valve, but a village without its own key cannot increment it. State this to villages rather than letting them discover it.
6. **`imagePrompt` is unverified until the pipeline exists.** No generation code exists in this repo today. Review the first ten generated sets against the cards that produced them, and treat the style clauses as tunable foundation copy — which is exactly why they live in `shared/brandTokens.ts` behind `theme.engine` rather than baked into a call site.
7. **The overlay document gets much bigger and is still one unvalidated JSON blob with no history.** Nine strings and nine URLs tolerated `PUT`-replaces-everything; ~60 nested fields plus arrays do not. Beyond the validator in §5.4, add a `brand_history` row per write (or at minimum a stored previous version) — there is currently **no way to undo a bad brand save at all**, and the first person to paste a broken palette into a live village will want one.
8. **`origin` is a provenance record on a volume with no garbage collector and three writers.** §9 fixes the measurement and the safety rules but not the underlying pipeline. If image generation ships before the sweep exists, generated art becomes the **fourth** orphan producer.