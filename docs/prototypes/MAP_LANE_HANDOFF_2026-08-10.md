# Map lane handoff, 2026-08-10

Everything the map lane knows, for whoever picks up `grounds-v0.html` next.
Pair it with `docs/SITE_LANE_HANDOFF_2026-08-10.md`, which is the other half
of the same day and is the site's side of every contract named here.

**Live:** `d4634c8` on `main`, deployed, artifact `v0.8-roundD`.
**Ahead of live:** `238784e` on `wt/map-events` only, artifact `v0.8-roundD1`
(the vocabulary inbound fix). Pushed to the mirror and deliberately NOT to
`main`, so it is built and gated but not deployed. Whoever ships next carries
it along; `origin/main` is the truth about what is running.
**Read `## Lane rules` before touching anything.** Two sessions share this
worktree and the expensive mistakes are all in there.

---

## Read this first: how work happens here

`docs/prototypes/grounds-v0.html` is a ~4.7 MB single-file artifact with three
inline `<script>` blocks and no build step. Every change lands through a
**python patch script** with exact-count anchors, never by hand:

```python
def swap(old, new, count=1):
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}"
    src = src.replace(old, new, count)
```

An anchor that matches zero or two times aborts before anything is written.
This is not ceremony. It is what made every recovery in this round a single
command: the artifact was overwritten wholesale twice by the other lane, and
both times `python patch_d1_camera.py grounds-v0.html` put it back byte for
byte through 269 voice rewrites and two badge rounds.

**Rules that come with it:**

- Anchor on **code and CSS**, never on player copy. Copy gets rewritten by
  voice passes; `function clampCam(){` does not.
- `node check_blocks.mjs grounds-v0.html` after every patch. A dropped brace
  is one silently dead script and no error anywhere.
- Scripts must be **re-runnable**. `patch_d3_surround.py` strips its own
  previous embed first and skips its code edits when they are already there.
  Skip **per edit, not per script**: `patch_d7_vocab_inbound.py` guards each of
  its four steps on its own marker, because one guard at the top makes a file
  that took three of four edits look finished, which is the same shape as the
  bug that patch exists to remove. It prints `apply` or `skip` per step, and a
  clean re-run is all skips and zero bytes changed.
- One script per concern, committed alongside the artifact it changed.

## Running the gates

```bash
cd docs/prototypes && source qa/env.sh
node check_blocks.mjs grounds-v0.html    # all 3 script block(s) parse
node qa/verify_doors.js                  # DOORS: ALL GREEN
node qa/verify_features.js               # FEATURES: ALL GREEN   (~90 checks)
node qa/verify_badges.js                 # BADGES: ALL GREEN     (36 checks)
node qa/verify_loom.js                   # LOOM: ALL GREEN
node qa/verify_skin_bridge.js            # SKIN BRIDGE: ALL GREEN (site lane's)
node qa/verify_vocab_bridge.js           # VOCAB BRIDGE: ALL GREEN (19 checks)
node qa/_dump_scene.js out.json && node qa/check-schema.js out.json
```

`qa/env.sh` holds `GROUNDS_FILE`, `PW_EXE`, `NODE_PATH`, `EXPORT_OUT`. The
suites were born on a Linux sandbox; nothing else needs editing.

`qa/shell.html` + `qa/_probe_bridge.js` drive the artifact inside a real parent
frame that answers promises. Point them at the real shell to test the site
side. The `_probe_*.js` files are throwaway instruments kept because they
document how each thing was actually proven.

---

## What the map is now

| | |
|---|---|
| **Camera** | Zoom floor is FIT x 0.85, not COVER. The clamp is the world plus a quarter screen, widened until every building can reach screen centre. `travelTo` aims at the strip a drawer leaves visible. Trackpad ctrl-wheel and Safari gesture events both zoom. |
| **Imagery** | A wide surround plate under everything, drawn over world rect `[-780,-920,3960,3440]`. **`W`/`H` are unchanged at 2400x1600**; the surround is a picture at negative coordinates, not a new coordinate system. |
| **Badges** | Own plane `#badges` at z-index 12, above labels, above buildings. Slots are angles on a ring solved per building for the 44 px HIT footprint. One collision pass over the whole land; rings that fight collapse to a counted seal that fans on tap. |
| **At a distance** | Below the badge gate, one activity seal per building (dark ground, parchment ink) plus a `⌂` home chip that is always there. The label carries no counts as text. |
| **Doors** | Every mark is addressable: `#/place/<key>?item=<kind>:<id>`. |
| **The land's dress** | Nine flow glyphs from `SCENE.vocabulary.media`; `Built/Building/Planned` from `SCENE.vocabulary.phases`; bamboo scaffold on phase 2; `SKIN.flow_style` and `SKIN.label_style`. All editable from the skin panel. |
| **The village's words, arriving** | One `applyVocabulary()` absorbs all five vocabulary keys whichever door they come through: a scene file, or the shell's `{type:'config'}` push. `VOCAB_KEYS` is the list, and a key the export gains without a door fails `verify_vocab_bridge.js` rather than dressing the land in defaults. |
| **Founder's hands** | Duplicate a building with its quests and seats; the vitals override in plain words; the role field as a combobox; `SCENE.vision_bound`. |
| **Promises** | RSVP and claim toggle both ways, persist per browser, and cross the bridge. |

Version lives in `window.BUILD_VERSION`. The site importer pins on the FAMILY
(`v0.8`), so a point release inside it is accepted; a new family is refused
loudly and deliberately. That is now demonstrated rather than asserted: the
`v0.8-roundD1` bump was dry-run through `scripts/import-map-scene.ts` and
admitted. `qa/verify_features.js` moved with it, from pinning the whole string
to pinning the family, because a gate that has to be edited green on every
point release teaches the next session to edit it instead of read it.

---

## The bridge contract (agreed with the site lane, both sides building to it)

Map to shell, on every toggle including withdrawals:

```js
{type:'rsvp',  id, title, on, nonce}
{type:'claim', id, on, nonce}
```

Shell to map, on **every** post including failures:

```js
{type:'promise-result', kind:'rsvp'|'claim', id, ok, state:'on'|'off', nonce,
 reason?, count?, href?}
```

- **`nonce` must be echoed exactly.** The map drops any reply that is not
  answering the post it is currently waiting on. Without it, toggling
  on-off-on inside the four-second window lets a late reply for a replaced
  intent apply its undo over the newer one.
- **`ok:true`** keeps the promise; a numeric `count` replaces the map's sample
  number, because the count is the site's to own.
- **`ok:false`** puts the toggle back exactly, without re-posting, and says
  why. Reasons handled: `anonymous` (401, `href` is the way in), `not-yet`
  (403 from the capability gate), `closed`, `full`, `not-here`, `gone`,
  `error`.
- **`not-here` is the ordinary state of a fresh fork**, not an error. Every id
  the map sends is scene sample data, so a village that has not imported has
  no row for any of it. Sending `gone` there tells a first-time visitor a thing
  was deleted when it was never adopted.
- **Silence means local only.** No reply within four seconds and the promise
  stands. The artifact runs from `file://` with no parent in every suite; a
  missing reply can never hang or revert.

**Identity:** quests carry a `key`, derived from the title ONCE and kept when
the title changes. The claim post sends that key. The site stores it verbatim
in `map_key` and never computes it, so there is one slugify in the world.
Pattern `/^[a-z0-9_-]{1,190}$/`. Events use their scene id (`e1`), which the
importer resolves as `ev-<sceneKey>-<id>`.

---

## Doctrine, and where it is enforced

- **D9, lens not ledger.** Badges are projections of
  `questsAt/seatsAt/eventsAt/threadsAt`. Nothing about a mark is stored.
  `verify_badges.js` re-derives every mark from those lists and fails if the
  DOM disagrees.
- **Creator's word is law.** A place chosen by hand outranks any resolver
  guess; the resolver step reads "your hand" and the quest is written
  `addr:'creator'`. Duplicating a building addresses the clones the same way.
- **q1d, the village's own words.** Zones, flow types and phase names are all
  editable and all export. A rename changes the NAME; the KEY is machinery.
  Renaming a zone rewrites every feature's subtype because a zone subtype IS
  the word. A medium key is not, so it stays put and the flows keep resolving.
- **Only a decision is written down.** An untouched building exports
  `badges: []`; an untouched quest exports `weight: null`. Silence is the only
  thing worth recording.
- **No em-dashes in player copy**, per the `regen-content-repurposing` rules.
  A gate check asserts zero survive in quest titles.

---

## Lane rules, learned the expensive way

**Never rebuild `grounds-v0.html` from a copy.** It was overwritten wholesale
twice this round by a session working from a copy taken earlier. A wholesale
write is a silent revert of everything landed in between and the file gives no
sign of it. Read the CURRENT file on the branch and re-run the patch script
against it.

**Stage files by name, never a directory.** `git add docs/prototypes` swept the
other lane's in-flight work onto `main` under an unrelated message.

**When a commit is the subject, name the SHA and give the greps.** Messages
between sessions cross constantly. Four crossings in one day, each one a
session reviewing a superseded commit and reaching a correct conclusion about
the wrong state. Every one cost minutes instead of a rebuild because both sides
wrote `git show <sha>:path | grep -c "<marker>" -> 10` rather than "it is
fixed". Verify from `origin/<branch>`, not from the shared checkout, which may
hold either lane's uncommitted work.

**Never `railway up` from this worktree.** It has no Railway link of its own,
so `railway status` walks up and reports `ReGen Civics / MySQL`, a database
service in the wrong project. Deploying is `git push origin HEAD:main`; Railway
auto-deploys the `Amora Game` service from GitHub `main`. Confirm with
`railway status --json` from `game-amora` and read `meta.repo` / `meta.branch`.

**`main` requires a `verify` check and a direct push BYPASSES it.** Rye's
account holds bypass rights, so nothing blocks and nothing warns twice. The
runs did pass afterwards both times; read them rather than assume.

**Verify a deploy on the artifact, not the shell.** `/health` gives the build
SHA. `GET /grounds/manifest.json` returns `{present, bytes, url}` with a
content-hashed filename; fetch that url and grep `BUILD_VERSION` plus a marker
only the new work contains.

**Playwright's `isMobile` lies on this Chromium.** A 390x844 context reports
`innerWidth` 1560 while `visualViewport` says 390. Pocket contexts use
`hasTouch` alone. `qa/` also needs its own `package.json` (`type: commonjs`)
because the repo root is `type: module`.

**A leading slash resolves against the current DRIVE on Windows.** A suite
writing to `/root/amora/...` passed here only because a stray `C:\root\amora\`
existed from an earlier session. Found by the site lane deleting the directory.

---

## The shape of every bug this round

Four, and they were all the same bug wearing different clothes. **A value
crossed a boundary and lost the parts the far side had no slot for. None
raised an error. None was caught by a test that already existed. Two were found
by the other lane READING rather than by either of us testing.**

| where | what was lost |
|---|---|
| `sanitiseMapSkin` | `flow_style`, `label_style` dropped by a field-by-field rebuild |
| the same | `vocabulary.media`, `vocabulary.phases` |
| quest keys | cut to 32, and a cut join key COLLIDES silently |
| `slugify` | a 48 cap, correct for a URL fragment, wrong for a join key |
| the `{type:'config'}` handler | `vocabulary.media`, `vocabulary.phases` AGAIN, inbound this time |

**The fifth arrived the next day, and it hid better than the other four.**
`SCENE.vocabulary` has five keys, and the map absorbed them in two places that
had to agree forever: `restoreScene` for a scene file, and the `{type:'config'}`
handler for the shell's live push. When `media` and `phases` joined the
vocabulary, only the file one grew. A founder who renamed their phases or
coloured their own flows got those words back on a file import and lost them on
every push from Village Settings, and the land drew in the platform's defaults.

This handoff recorded it as "nothing reads `map_vocabulary` inbound", and that
phrasing is exactly why it sat. Something WAS reading it: three keys of five.
**A partial absorber is indistinguishable from a working one from the outside,
and the keys that do land are the evidence that hides the ones that do not.**
There is no wrong value to notice anywhere, only a default one.

The fix is deliberately not a third enumeration, because two lists that must
agree forever is what produced this and a third would guarantee the sixth. One
`applyVocabulary()` absorbs a vocabulary whichever door it came through,
`VOCAB_KEYS` names what a vocabulary IS, and `qa/verify_vocab_bridge.js`
asserts that every key the export emits is a key the absorber takes. Add a
sixth key to one side now and a gate fails, rather than the land quietly
wearing the platform's words.

Three rules came out of it, and they are the most useful thing to carry forward:

1. **Reusing a helper is a decision about its LIMITS, not just its behaviour.**
   A cap that suits one caller is not a property of the function.
2. **A rule handed across a boundary needs its scope attached**, or the other
   side has to guess. `/^[a-z0-9_-]{1,32}$/` was the media-key pattern; it
   arrived without "for media" and got applied where truncation collides.
3. **A gate that has never failed is not yet a gate.**
   `qa/verify_vocab_bridge.js` was run against the UNPATCHED artifact before
   the fix existed and had to go red: 10 of 18, and the three that stayed
   green were road, water and zone. Those greens are what named the shape.
   Write the check first, watch it fail, and the failure tells you what you
   are actually looking at.

**So: when a value crosses a boundary, ask what happens to the parts the far
side has no slot for.** Any future map round should end by exporting from the
new build and dry-running `scripts/import-map-scene.ts`, which turns a silent
drop into a loud refusal and names the rest.

**Then notice which edge that ritual walks.** Export-and-dry-run checks the
OUTBOUND direction only. The fifth bug was inbound, and the export is byte for
byte identical with the fix and without it, so the dry run passed before and
after and could never have found it. Both were run this round and both were
green while the map was dropping two fifths of every vocabulary the shell sent.

**Every boundary has two directions, and this one has a gate on one of them.**
Worth knowing before trusting the pattern: `verify_skin_bridge.js` proves the
skin ABSORBER by calling `applySkinExport()` directly, which means the
`{type:'skin'}` and `{type:'config'}` doors that reach it are not covered by
it. `verify_vocab_bridge.js` posts a real `message` for exactly that reason,
and now also asserts the config door delivers skin. Nothing yet posts a real
`{type:'skin'}`.

---

## Open

### Rye only

1. **The amber approval round on the Loom.** The oldest open item on the board,
   named in both handoffs.
2. **Three samples to bless**, each one line to flip: the nine flow glyphs
   (`SKIN.flow_style`, default `'glyph'`), the bamboo scaffold, and ribbon
   versus the golden tablet (`SKIN.label_style`, default `'ribbon'`). Plus:
   which label style does Amora ship?
3. **Three quest titles on the live Quests page.** The map's seed is fixed, but
   those rows are in the village database and were never imported, so the edit
   is still owed. The rename table is in the site lane handoff. It also
   restores the importer's title match until `map_key` lands.
4. **Blueprint look.** Guest Lodge, Healing Garden and Pacific Trailhead draw
   as ghost emblems by design. Ghosted painted sprites instead is one clause in
   the `painted` test.
5. **Two QA leftovers on live:** `painterly {0.5, 0.5}` and accent `#157f7d`.
   One `PUT` to `/api/admin/brand` restores the pre-test look.
6. **One synthetic walk row** in production reads as an abandoned walk in the
   first report. Delete or ignore.
7. **Real-phone pass** of `/map` and the pocket profile.

### Map lane

- **Per-flow glyph overrides.** Deferred by the Round D plan itself; the
  vocabulary handles the types, not the individual edge.
- **The healed water in the surround plate** still shows a faint straight edge
  in the far south-west. Esri's own capture boundary, healed rather than
  removed, well outside the property line. **Correction to the earlier note
  here: `fetch_surround.py` does NOT fix this, it only rebuilds the plate.**
  The fetch is the same tiles at the same zoom and `heal_open_water` is
  deterministic per cell, so a plain re-run reproduces the seam exactly.
  Removing it means changing the heal (feather the cell edges, or take the
  surround a zoom lower where the boundary falls outside the pad) or sourcing
  that corner elsewhere. Cosmetic, outside the property line, and it costs a
  multi-MB re-embed, so it is the right thing to leave until someone is in the
  plate anyway.
- **`my_rsvps` / `my_claims` export at the top level**, not under `events`. The
  round doc asked for `events.my_rsvps` and `events` is a JSON array, which
  cannot carry a key. Two lists say the same thing. Confirmed still true and
  still correct: they sit beside `events` in the export, and the importer reads
  them there.
- **Nothing yet posts a real `{type:'skin'}`.** `verify_skin_bridge.js` proves
  the skin absorber by calling `applySkinExport()` directly, so the
  `{type:'skin'}` door itself has no gate. `verify_vocab_bridge.js` now covers
  the `{type:'config'}` door for both skin and vocabulary; the standalone skin
  verb is the one left. This is the same shape as the fifth bug and is written
  down here before it is one.

**Closed this round:** the vocabulary inbound gap. `applyVocabulary()` is the
one door, `patch_d7_vocab_inbound.py` is the change, `qa/verify_vocab_bridge.js`
is the gate, and the artifact ships as `v0.8-roundD1`.

### Site lane (theirs, do not take)

`map_key` plus the two promise routes is their next round: the migration, the
importer storing the key verbatim, both POSTs with the nonce echoed, the
reasons mapped from real status codes, and `count` on every ok reply. Also
`quest.how_to` and `map_scene.vision_bound` have no column, and `recorded` from
`/api/map/walk-log` returns `affectedRows`, which counts updates as inserts.

---

## Files

| file | what |
|---|---|
| `grounds-v0.html` | the artifact. Served directly, never copied into `dist`. |
| `patch_*.py` | one per concern, in order: `d1_camera`, `d1b_overscroll`, `badges_p1..p4`, `d2_badges`, `d2_chips`, `d3_flows`, `d3_dress`, `d3_surround`, `d3_geolabels`, `d4_hands`, `d4_vision`, `d5_promises`, `d6_loose_ends`, `d6b_contract`, `d6c_questkeys`, `d7_vocab_inbound` |
| `fetch_sat.py`, `fetch_surround.py` | the Esri mosaics. The surround heals a bad capture over open water at cell granularity, because per-pixel thresholds leave a checkerboard. |
| `check_blocks.mjs` | parses each inline script alone |
| `qa/` | the suites, `env.sh`, `shell.html`, and the `_probe_*` instruments |
| `QA_ADDENDUM_ROUND_D.md` | what each round added to the gates, and what only eyes can catch |
| `ROUND_D_PLAN_2026-08-09.md`, `BADGES_BUILD_PLAN_2026-08-09.md` | the briefs this round was built from |
