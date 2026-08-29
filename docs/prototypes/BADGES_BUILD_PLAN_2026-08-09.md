# Build round — the badge language: quests, roles, events and conversations on the buildings

**Paste into a Claude Code session.** This round the guardrail flips: you ARE the map lane —
`docs/prototypes/grounds-v0.html` is yours to edit, using the house protocol: python `rep()` patch
scripts with exact-count anchors, `node --check` every script block after each patch, run
`qa/verify_doors.js` + `qa/verify_features.js` (edit FILE/EXE paths) to zero failures and zero
pageerrors, commit, deploy. Doctrine: D9 lens-not-ledger (badges are projections of
`questsAt/seatsAt/eventsAt/threadsAt`, zero new stored state), creator's word is law, voice rules
per the `regen-content-repurposing` skill (no em-dashes in any user-facing string).

## 1 · The design system (locked by Rye)

**One seal, four charges.** Every badge is the same small round seal (parchment face, 2px
hand-drawn stroke, `var(--t-icon)` ink, gold rim) so the family reads as one language:

| kind | charge | anchor on building | rim |
|---|---|---|---|
| Quest | leaf-pennant (flag whose cloth is a leaf) | door (lower-left) | gold; **amber = suggested address, gold = creator's word** |
| Role / open seat | raised hand | window (mid-left) | **dashed while open** (org-map open-call echo), silver |
| Event | star-lantern (existing evbadge, re-seated on the seal) | roofline (upper-right, current spot) | warm; brightness/tempo = days-until (existing ev-u0..u3) |
| Conversation | rising curl (smoke-spiral speech mark) | chimney (upper-left) | soft teal; pulses with the existing PULSE glow |
| Invitation | dashed empty seal, faint seed-dot | door position when a building has NO quests | dashed |

**Four channels, four facts — never crossed:**
- **Shape = kind** (the charge above; never varies per type)
- **Color = domain**: the quest leaf tints with the quest's circle color (`CIRCLE_COL[aff]`),
  seat hand tints with its circle. No new taxonomy; the village's own colors.
- **Pips = weight**: 1–3 seed-dots under the charge. Derive v1 from `need` text:
  /hour|beginner/→1, /session|half|4 hours|per event|per meeting/→2,
  /full day|multi|recurring|intermediate|advanced/→3; store optional explicit `weight:1|2|3` on
  quests (export + Loom + admin later own it). Time and difficulty collapse to this ONE scale at
  map level; the card carries the rest.
- **Motion = time only**: event urgency tempo (exists), one soft sparkle on new-today, pulse on
  live conversation. Nothing else animates.
- Rim extras: smooth = open to everyone, braided = skilled (/intermediate|advanced|skilled/);
  your claimed quests get a small ✓ overlay (localStorage, per-browser).

**SVG, not emoji, not sprites**: author the seal + 5 charges as inline SVG symbols in the ICONS
hand (stroke 2, round caps). Sizes: 22 px near, 16 px mid. Invisible 44 px hit areas.

## 2 · Behavior (locked in prior rounds — implement all)

1. **Badges are doors**: tap ⚑ → `openPanel(key)` scrolled to that quest with Claim prominent;
   raised-hand → the seat card; lantern → the event card + RSVP; curl → conversations. Each badge
   is addressable: `#/place/<key>?item=<kind>:<id>` opens the panel focused on it (extend
   routeHash + setHash; panel gains a focus-highlight).
2. **Zoom gates**: badges render only when `cam.z` ≥ ~1.0 (tune); below, the existing label count
   chip (⚑2 ⛨1 ✦) carries the info. Fade in/out, no popping.
3. **Calm by default**: idle badges 60 % opacity; ONE featured badge per screen breathes at a
   time (seeded rotation, reuse mulberry); intent filters — "What needs hands" brightens only
   quest badges ~8 s; the Events door brightens lanterns.
4. **Invitation slot**: tap → on desktop opens the resolver prefilled to this structure
   ("Create it there" flow exists); on pocket opens a small sheet linking `/propose-quest`
   (siteNav). Voice: "This place has room for work."
5. **Pocket fan**: on pocket, tapping a building with 2+ badges fans them out enlarged (radial,
   ~150 ms, transform-only) for one beat before acting; single-badge buildings act immediately.
   Haptic tick on fan, triple-pulse on claim (helpers exist).
6. **Walk integration**: the Greenhouse beat's gate becomes tapping a real quest badge
   (`gesture:'badge'` — add the gate type; WGATE.badge set in the badge tap handler). Update the
   seed step's gate_hint: "tap the leaf-pennant at the door".
7. **Founder control**: inspect card gains a "badges" chip row (like doors) toggling kinds per
   building; default all on; audited (`logEdit('badges',…)`), exported in bindings, restored.

## 3 · Implementation map (the artifact)

- `BADGE_DEFS` (seal + charges SVG, anchors per family using existing crown/scale math —
  `FAM_SCALE`, `s.scale`, `GSCALE` all multiply anchor offsets AND hit radius, same as hitStruct).
- `refreshBadges()` beside `refreshEventBadges()` (fold the lantern into the new system; keep
  `ev-u*` classes working — verify_features asserts them). Recompute on `logEdit`, restore, and
  the ~3 s badge tick; positions synced per-frame in `syncBanners` next to `_crownOff`.
- Delegated tap handler on `#icons` (pois are DOM); `stopPropagation` so building-tap still works
  beside badge-tap. Update the collision engine's icon-squat guard to include badge extents.
- Export: quests gain optional `weight`; structures' bindings gain `badges` toggles;
  `qa/check-schema.js` extended accordingly.
- New suite `qa/verify_badges.js` (~20 checks): seal counts per building match the *At() lists;
  domain tint matches circle; pips match weight derivation; amber vs gold rim matches
  `address_source`; tap-to-claim path; invitation slot on a questless building; zoom gate;
  featured-breathing single instance; pocket fan (programmatic); deep-link `?item=`;
  founder toggle + export/restore roundtrip; zero pageerrors. Rerun doors + features + pocket
  checks; then the live QA session gets a section-13 addendum (write it, commit beside the others).

## 4 · Order of work

P1 seal + charges + placement + zoom gates (the look). P2 tap-to-act + deep links + invitation
(the doors). P3 calm system + filters + fan + walk gate (the feel). P4 founder toggles + weight
field + export/schema + suites + deploy (the contract). Commit per phase.

## Handoff — RYE only
| # | Task |
|---|---|
| 1 | Bless the seal + charge sketches from P1 screenshots before P2 proceeds (samples-first rule) |
| 2 | Real-phone pass of the fan + badge taps after P3 |
| 3 | Optional: set explicit `weight` on the six site quests (else derivation stands) |
| 4 | Deploy after P4 gates; the amber approval round on the Loom remains open |
