# QA harness — Amora Living Map

Drives the full 27-section matrix against `grounds-v0.html` in one continuous
Playwright session and prints an instrumented log plus ~85 screenshots.

It asserts against **app internals**, not pixels — camera clamp per rendered
frame, per-icon class flags, undo depth, `SCENE` counts, export schema — so it
stays true when the art changes.

## Run

    npm i -D playwright
    node run.js                 # full matrix, ~19 min
    ONLY=A node run.js          # one block (A=§1-10 B=§11-16 C=§17-20 D=§21-23 E=§24-26)

Point `FILE` in `lib2.js` at your copy of the prototype, and `executablePath`
at your chromium if Playwright's bundled one isn't where it expects.

Output: `shots/` (screenshots), `errors.jsonl` + `tally.json` (every pageerror
and console error captured across the session — the bar is zero).

## Layout

| file | what |
|---|---|
| `lib2.js` | boot + listeners-before-navigation, and the helper vocabulary (`clickPoi`, `poiHit`, `landPt`, `blackEdge`, `badText`, `mmHash`, `closeInspect`…) |
| `run.js`  | session runner; enters the land, runs each block, prints the §27 tally |
| `secA–E`  | the matrix, one file per block |

## Two helpers worth knowing

- `H.landPt(inside, i)` returns a screen point that is **bare canvas** (not HUD,
  not an icon) and inside/outside the property line. Most flaky-looking failures
  are a click landing on a HUD button; this avoids that.
- `H.reachPoi(k)` hit-tests an icon's centre and re-centres the camera if
  something covers it, so tests fail on real bugs rather than on occlusion.

## Adding a check

Each section module is `async (page, H) => { … }`. Log with `H.log`, screenshot
with `H.shot('name')`, read app state with `H.ev(() => …)`. Anything thrown is
caught by `run.js`, screenshotted as `CRASH-<block>.png`, and the run continues.

## Standalone verifiers

The `verify_*.js` files run on their own against one concern each, outside the
27-section matrix. They read `GROUNDS_FILE` and `PW_EXE` from `env.sh`, print
`PASS`/`FAIL` lines, and exit non-zero on any failure.

    source ./env.sh && node verify_doors.js

`verify_skin_bridge.js` is the site lane's, and it checks the contract rather
than the map: the site stores a skin through a sanitiser that rebuilds the
object field by field, so any key `skinExport()` gains and the site has not is
dropped on save with no error anywhere. Its last check compares the two key
sets and names the difference. **When the map's skin gains a key, run it.**

`verify_door_routes.js` holds the same kind of contract in the other direction.
The artifact has no build step and cannot import `client/src/App.tsx`, so the
map carries a copied route list in `window.SITE_PAGES`. This gate re-derives
the real list with `scripts/qa/routes.mjs` and fails when the copy has drifted,
which is what keeps a copied list from rotting into a door that sends a visitor
at a 404. It also proves every door in `SCENE.structures[].modules[]` still
resolves to a room or to a page, that no door card is a dead end, and that
`bindDoor()` still refuses a route the site does not serve. **When a page is
added to or renamed in App.tsx, run it, then re-run
`patch_g1_01_doors.py`, which re-derives the list it writes.**

Three of its sections exist because the first version of that patch shipped
without them, and all three holes were real:

- **The door card is an attribute sink.** It renders the route into an `href`
  and an `onclick`, and `realRoute` strips `?` and `#` before its membership
  test, so a route that passes validation could still carry a payload in the
  part that was stripped. The gate drives payload routes and payload labels
  through both entry points and asserts that nothing reaches the DOM and that
  both attributes carry the canonical path byte for byte.
- **A scene published before round g.** `restoreScene` replaces
  `SCENE.structures` wholesale, so a data fix in the seed literal never reaches
  a village that already published. A round trip that exports the already-fixed
  scene is circular for this. The gate pushes `legacy_doors_pre_g.json`, the 32
  doors as the map really shipped them, through the real `restoreScene` and
  re-counts. **This section runs last on purpose: everything after it would be
  measuring a different map.**
- **The bound count is a ratchet.** "Nothing is stranded" stays true when every
  door quietly becomes a plain page link, so the gate holds the count at a floor
  of 19.

Two more sections were added after reviewing that patch, and each covers a hole
the patch itself opened. `_probe_doorproto.js` measures them directly and prints
the numbers, which is the tool to reach for before believing either one:

- **A name off `Object.prototype` is not a room.** The door tables are plain
  object literals, so `LEGACY_ROUTES['constructor']` handed back a function and
  the line after it called `.split` on it. `renderTab` calls that once per door,
  so a single door with that route threw the whole structure panel away. The
  gate drives 15 pairs through `bindDoor` and then drives the panel itself.
- **The panel is a sink too.** It wrote the structure key into a single-quoted
  `onclick` twice, and printed the door label into `innerHTML` unescaped. The
  gate asserts the onclick **by equality** rather than by "no payload found",
  because the only safe version of that attribute has no founder string in it.

**Every assertion in both sections was run against the pre-fix artifact and seen
to FAIL before it was believed.** A copy of the gate with its boot terms relaxed
is the way to re-do that: the real gate waits on the helpers the fix adds and
stops dead without them, which is right for a gate and useless for proving a
detector detects. Note that the drives are wrapped in `try` on purpose. An
uncaught throw inside `page.evaluate` rejects the whole run with a Node stack and
zero `FAIL` lines, and the throw is the thing being tested for.

`legacy_doors_pre_g.json` was captured by driving the pre-round-g artifact, not
typed. `_probe_doors.js` reads the same fixture through `LEGACY_DOORS=` and runs
on either build, so every before-and-after number in
`docs/prototypes/DOOR_CENSUS_2026-08-13.md` can be re-taken with the shipped
tool rather than believed.

`verify_escaping.js` is the third contract, and it is about the file's shape
rather than about any one feature. The map renders by interpolating values into
template literals, so **every feature that displays a founder-controlled value
adds an injection sink by default** — which is why three separate lanes each
added one in a single wave while fixing something else, and why the artifact was
already exploitable the same way before any of them touched it
(`map_structures[].circle_id` reached the hover card's circle line unescaped on
pristine main).

It is a STORED payload, not self-XSS: `restoreScene` runs on every shell scene
push through `applyScene`, on the Restore bar and on the draft offer, and
`scheduleAutosave` ships the whole export to draft-save, so a poisoned value
round-trips through the server. The gate drives one payload through both real
entry points — `restoreScene` and the `{type:'config'}` bridge push — renders
every surface that reads a founder string, and asks whether an element was
created, whether a handler fired, and **whether any inline handler stopped
compiling**. That last one is not a footnote: a half-escape that breaks a
founder's apostrophe is a door that no longer opens, and the file shipped one of
those as `.replace(/'/g,"\\'")`, which escapes the quote without escaping the
backslash first.

Three contexts, three escapes, and `escq` covers two of them (`& < > "` since
g6.02). It is right for
`value="${escq(x)}"` and for `<h2>${escq(x)}</h2>`. It is WRONG inside
`onclick="f('${escq(x)}')"`, because the HTML parser turns `&#39;` back into an
apostrophe **before** the handler is compiled. `escj` is that third escape:
JS-string first (backslash before quote), then `escq` for the attribute it sits
in. Where a value does not have to travel through an attribute at all, not
putting it there beats escaping it — `openDoorHere` and `doorClickHere` are that
answer, and this gate is what keeps them honest if they are ever reverted.

The element-context counters are a RATCHET the way `scripts/check-brand-refs.mjs`
caps brand debt: **the cap may only ever go down**. A non-zero count prints the
ids of the surfaces still leaking, so the number arrives with its worklist.
**Seen to fail first:** 20 FAILURES against pristine `origin/main`.

**A GUARD THAT CANNOT RESOLVE ITS SURFACE NOW FAILS.** The first version of this
gate wrapped every surface in `if (window.NAME)`, and three of the names did not
exist: `showVitalDrop` (really `openVitalDrop`), `renderOrg` (really
`buildOrgMap`), `buildPublishList` (really `openPublish`). A typo and a surface
another lane has not shipped produced the same result — a silent skip — so the
gate reported a cap of **zero elements** about three surfaces it never rendered,
while `buildOrgMap` was executing a stored payload on a plain `#msCircles`
click. Names are now resolved against `Object.getOwnPropertyNames(window)`,
because a function declared at column 0 in a classic script becomes a global BY
DECLARATION and grep cannot answer the question; an unresolvable name is
reported as a **gate defect** and fails the run. Each surface also declares the
element it must fill, so the other silent skip — an early return, like
`openPublish` refusing without `HAND.canPublish` or `renderInspect` refusing
without `inspKey` — fails instead of reading as a clean surface.

Section **B2 calls nothing**: it restores a poisoned scene and clicks
`#msCircles`, the button a visitor clicks. That path is how the `buildOrgMap`
hole was found while this gate was printing ALL GREEN, and it is held at zero
rather than ratcheted, because a count taken from a real click cannot be an
artefact of how the gate drives.

Measured with the names corrected and `vital_overrides` in the payload,
elements / fires through `restoreScene` and on the `#msCircles` click:

| artifact | restoreScene | #msCircles click |
|---|---|---|
| pristine `origin/main` | 573 / 614 | 49 / 49 |
| after `patch_g6_01` alone | 28 / 85 | 21 / 21 (16 in `#orgSvg`) |
| after `patch_g6_02_element_context.py` | **0 / 0** | **0 / 0** |

`escq` gained `>` in g6.02 — element context needs all four of
`& < > "` — so it is now the one escape for both the element and the attribute
context, and `escj` remains the only escape for a JS string inside a handler.

### The gate measures its own payload first (g6.03)

Every number in that table is a count taken over whatever the payload managed to
become, so **a payload that is not there prints the same green a clean artifact
prints**. A reviewer proved it by neutering `window.__poison` to `return J;` —
one line, its first statement — after which the whole run passed and exited 0.

Question **0** now runs before every other question, at both entry points. Every
poisoned field is DECLARED in `__PLANT_FIELDS`, planted through `P()` (which
stamps a token unique to that field into the value), and then looked for three
times: in the serialised payload, in the live state, and in the rendered page.
A declared field nothing planted fails; a planted field nothing declared fails,
so the declaration cannot rot behind the code; six named anchors
(`SCENE.structures[0].name`, a quest title, a seat, `window.VITAL_OVR`, a zone
word, a feature subtype) must carry the marker. **Seen to fail first:** the
neutered poisoner takes three of the six checks red at each door, 6 FAILURES,
exit 1. The order matters and is deliberate — with `return J;` in place,
"survives into the payload", "plants nothing undeclared" and "the absorber
refuses what it must" all still PASS, because a field that was never planted is
trivially not-absent, not-undeclared and nowhere to be found.

`stateOnly` is a second ratchet one level in: a field the payload stored in the
live state that no surface here ever drew is a field the element counters say
NOTHING about. It is printed as a worklist with the number, and it is not zero,
because some export fields genuinely have no reader in this artifact. It came
down 8 → 5 → 4 while it was being written, which is the argument for having it.

### An identifier and every field that names it move together (g6.03)

The same defect as the neutered poisoner, one level further in. The gate used to
poison `map_structures[0].key` **alone**. Eleven other export fields still named
the OLD key — `quests[].structure_key`, `map_flows[].from_key`/`to_key`,
`org_roles[].structure_key`, `journeys[].steps[].structure_key`,
`walk.steps[].structure_key` and the rest — so `SCENE.quests.filter(q => q.at
=== s.key)` matched nothing, `questRowH` and `flowRowH` never ran, and
`structOpts` (`<option value="${s.key}">`, the one place a key reached a
double-quoted attribute raw) **was never called**. The gate printed
`elements 0, cap 0` about a surface that had not rendered.

**A payload that unhooks its own reader is indistinguishable from a clean
surface.** Three identifier groups now move as groups (structure key, drawn
feature id, medium key), and `renderInspect` is also driven on a structure that
is the END of a flow, because the medium and via selects render nowhere else.
Same artifact, same payload, same surfaces:

| what the poisoner does | elements |
|---|---|
| key poisoned alone (how the table above was taken) | 0 |
| key + every field that names it, moved together | 44 |
| + `renderInspect` on a structure at the end of a flow | 280 |

Those 280 were four raw double-quoted attributes: `structOpts` :4022, the
`footprint` kind's owner list :3691, the medium select :4038 and the via list
:4044. `patch_g6_03_vocabulary.py` escapes all four, and section E now asserts
that an identifier carrying `&` and `<` comes back out of `select.value`
byte-exact — an escape that fails there does not spoil a look, it breaks a
reference.

### A hand list cannot say what it left out (g6.04)

Four rounds of this gate each closed one instance of the same defect — a check
that could not run reporting what a check that passed reports — and each fix
exposed the next. The fourth was a **50-element sink in the Loom's wires**,
sitting under a surface that had been in `__SURFACES` since the first draft.

Two shapes were underneath it, and both are the same class one level out:

- **The host a surface declares is not always the host its sink writes.**
  `renderLoom` renders in two parts: `$('loomLeft').innerHTML = …` synchronously
  (escaped, clean) and then `requestAnimationFrame(drawLoomWires)`, whose first
  line is `if(!document.body.classList.contains('loom'))return`. Called with the
  Loom closed — which is how any function-driving gate calls it — the frame
  fires, the guard returns, `#loomWires` stays empty and `#loomLeft` vouches for
  the whole surface. `renderLoom()` → 0 elements; one click on `#loomBtn` → 50.
- **The host check is satisfied by markup another pass left behind.**
  `refreshBadges()` rendered NOTHING for the whole life of this gate and the
  host check never noticed, because `#badges` was still full of the badges BOOT
  drew. `bgEls` is built once, at column 0, and `restoreScene` rebuilds `pEls`
  and `bEls` and leaves the badge groups keyed by the OLD structure keys, so
  every structure hits `const g=bgEls[s.key]; if(!g)continue;` — 0 of 22 groups
  matched. Under it: `data-bk="${s.key}"`, four times, raw, on the plane a
  visitor taps. 82 elements once the groups are asked for.

Fixing those two as instances would have been the fifth round. **The census is
the class.** Every function reachable on `window` whose own source writes HTML
is a renderer; the artifact has 34. Every one must WRITE at least once during
the render pass, or be named in `__RENDERERS_NOT_DRIVEN` with a reason. The list
fails in both directions, like `__PLANT_FIELDS`: a renderer that is neither
driven nor declared fails, and a declared name that writes after all fails as a
rotten declaration.

**Writing is the measure, not calling, and that distinction is the whole
check.** `drawLoomWires` was CALLED on every single run of this gate — the frame
`renderLoom` schedules always fired — and returned at its first line. A call
counter would have printed green over the sink exactly the way the host check
did. So the `innerHTML` setter is instrumented and each write is attributed to
the renderer on top of a stack, and the stack is carried across the two
schedulers that defer a renderer's work in this file (the animation frame and
the camera flight) so a renderer that draws from inside a callback is not
accused of drawing nothing. **Seen to fail first:** deleting one name from the
declared list takes the census red naming it (`renderSkinThemes (never called at
all)`), and declaring a driven one takes the other half red (`renderLoom
(declared not-driven, wrote 6x)`).

28 of 34 are driven. The six declared are `bindInspect` and `updateHover` (the
write is not theirs), and `renderCuration`, `renderSkinThemes`, `openDiscard`
and `duplicateStructure` (the markup has no founder string in it).

Section **B3** is the Loom's `#msCircles`: restore a poisoned scene, click
`#loomBtn`, and hover every grip and every wire. The hover is not decoration —
`:4524` used to concatenate the founder's thread id into a CSS selector, and one
double quote threw an uncaught `SyntaxError` per hover out of a listener nobody
catches. `patch_g6_04_loom.py` compares the two datasets instead, which needs no
third escape and keeps the id byte-exact on both sides.

Section B also stopped being the last place the banned guard lived: it read
`if (window.syncBanners) syncBanners()` inside a bare `try {} catch (_) {}` with
no host check, so a `showHover` that threw reported the same `0 elements` a
clean artifact reports.

**Every row of every table above was taken with a gate that drove 46 surfaces.
This one drives 50**, so the whole ladder is re-measured here rather than
extended: a bigger gate makes every earlier number smaller for a reason that has
nothing to do with escaping. The rungs are built by REVERSING each g6 patch off
the working tree, so every rung carries the doors lane's functions and the only
difference between two rungs is the patch between them.

| artifact | restoreScene | config push | #msCircles | #loomBtn | hover | page errors |
|---|---|---|---|---|---|---|
| pristine | 1012 / 1012 | 1014 / 1362 | 57 / 42 | 445 / 379 | 445 | 92 |
| + g6.01 | 446 / 114 | 446 / 114 | 26 / 11 | 45 / 5 | 31 fired | 31 |
| + g6.02 | 422 / 42 | 422 / 42 | 9 / 0 | 40 / 0 | 31 fired | 31 |
| + g6.03 (what Part 3 shipped) | 113 / 0 | 113 / 0 | **0 / 0** | 31 / 0 | 31 fired | 31 |
| + `patch_g6_04_loom.py` | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** | **0** |

The 113 are `#badges` 82 and `#loomWires` 31. Both are identifier round trips —
`data-bk` is read back as `BY[seal.dataset.bk]`, `data-conn` twice, grip to wire
to the hover match — so both are escape-only with no normaliser at the door, and
both round trips are asserted byte-exact in section E, for the reason g6.03
wrote down: a key a normaliser touched stops matching the row it names.

### The deep poison: every string leaf, not a hand list

`make_deep_poison.py` writes a variant of the gate out of the gate itself. The
declared fields are still planted through `P()`, and then **every remaining
string leaf of `buildExportJSON()` at any depth** gets the payload appended —
143 distinct paths, 1497 leaves, of which the hand list names 37. The suffix is
the SAME on every leaf on purpose: the export is full of cross-references, and a
per-leaf token breaks all of them and renders half a scene.

```
python make_deep_poison.py && source ./env.sh && node .deep/verify_escaping_DEEP.js
```

Read the element and fire counters from that file; read `stateOnly` from the
gate, because appending a payload to `map_zones[].kind` sends those rows down
different branches and a couple of fields legitimately stop being drawn. Named,
so the caveat is checkable rather than a shrug: the deep variant reports
`stateOnly` **6** against the gate's 4, and the two extra are `map_zones[].id`
and `map_zones[].name`. It reads 6 on the g6.03 rung and on the g6.04 rung
alike, so it is a property of this variant's payload and not of any patch.

That used to mean **the deep file could not exit 0 as it stood** — a red that is
always red is a red that means nothing. `patch_g6_05_gate.py` raises the cap to
6 **in the generated file only**, with those two field names written in beside
the number, and leaves the shipped gate's cap at 4 so a genuinely new
`stateOnly` field still takes the gate red. Both variants now exit 0: the deep
one on `elements 0 / fired 0 / stateOnly 6, cap 6`, and the raw one on
`0 distinct raw sites` over the 7 document loads it asserts it was live on.
(The STRING count varies run to run — 16 185, 27 669, 29 178 across three runs —
because it counts every string handed to a sink and the page is not identical
twice. The SITE count does not vary. Read the site count.)

### Two sinks no instrument here could reach (g6.05)

Both are markup-adjacent and neither is a renderer, so the census from g6.04
cannot enumerate either one, and they are invisible for two DIFFERENT reasons.

- **`focusItem` compiled a founder identifier into a CSS selector.**
  `$('panelBody').querySelector(`[data-item="${addr}"]`)`, where `addr` is
  `itemAddr()` — `'quest:'+questKey(q)` and `'talk:'+t.id`. Three instruments
  were blind at once: it writes no HTML so the census cannot classify it, it is
  in no `__SURFACES` row so the render pass never calls it, and the RAW scan
  wraps `querySelector` but a wrapper only reports about calls that HAPPEN.
  `patch_g6_05_selectors.py` compares `n.dataset.item` instead, the answer
  :4524 got.
- **`tips.show` handed an escaped attribute back to the parser.**
  `tp.innerHTML = el.getAttribute('data-tip')`. Every `data-tip` in the file is
  written through `escq`, and the parser UNDOES that before `getAttribute`
  returns — one escape at one end of a two-hop round trip is not an escape. It
  is an IIFE-local arrow, so it is not on `window` either. `textContent` now,
  measured first: of the 62 tips live on the page exactly two contain any of
  `< > &`, both a literal ampersand in prose.

`evRSVP` (twice) and the terrain switch build a selector by concatenation too.
Neither is founder-reachable today, but both write sites already run `escq`, and
closing them makes **the artifact compile no selector from a non-constant value
at all** — a property `qa/raw_interp_census.mjs` can assert statically, where a
list of three sites cannot.

**And the poisoner could not have reached either one anyway.** `__PLANT_FIELDS`
declared 37 fields; neither `quests[].key` nor `forum_threads[].id` was among
them, and `restoreScene` reads both. Every restore in this gate's history
rebuilt the scene with CLEAN quest keys and CLEAN thread ids — including the one
g6.04 rested on when it wrote "`forum_threads[].id` … reaches a double-quoted
attribute". `patch_g6_05_gate.py` plants both; the gate now declares 39.

**Seen to fail first, on a rung built by reversing the patch off the working
tree**, with every string leaf poisoned and the real `openPanel(key, tab,
itemAddr(...))` call the seal handler makes:

| rung | selector sites | throws | `#tip` elements | handlers fired |
|---|---|---|---|---|
| working tree | **0** | **0** | **0** | **0** |
| `rev:patch_g6_05_selectors` | 5 | 2 `SyntaxError` | 1 | 1 |

The five are `raw markup` ×2, `raw double quote` ×1 and `escq where escj was
needed` ×2 — the last of which cannot be read off the DOM at all. Neuter the two
new plants and the gate goes red at BOTH doors naming them
(`every declared field was planted (37 of 39)`).

### The census discovers its population, so the discovery needs a floor (g6.05)

`patch_g6_05_gate.py`'s second change teaches the census to follow a decorated
global to its declaration, because :6789 does
`const _openPanelW=openPanel;openPanel=function(…)`, so `window.openPanel`'s
source is the wrapper, the HTML-write test fails, and openPanel was neither
driven nor declared but **absent** — the one outcome the census exists to make
impossible. It writes `$('panelHead').innerHTML` and `$('tabs').innerHTML` with
`s.name`, `s.circle` and `s.event` on every tap. The repair works, and it has to
wrap the name as well as list it: keep `found.push` and delete the rebind, and
the gate goes red with `openPanel  (never called at all)`.

Then disable the repair's regex — one control — and the whole gate comes back:

```
PASS every renderer in the artifact is driven by this gate (29 of 35 wrote; 6 declared not-driven)
ESCAPING: ALL GREEN
```

35 instead of 36, openPanel silently gone from the population, exit 0. **The
scan that finds nothing reports what the scan that found everything reports** —
shape 1 of this round's list, living inside the fix for shape 7. The census is
the only instrument in this gate whose population is DISCOVERED rather than
declared, and `__PLANT_FIELDS` and `__RENDERERS_NOT_DRIVEN` both fail in two
directions for exactly this reason.

`patch_g6_05_census.py` asserts the smallest thing that closes it: **`CENSUS.hidden`
is not empty.** `hidden` is the END of the chain, not its start — a name lands
there only after the regex matched it, its column-0 declaration was located, and
that declaration tested as an HTML writer — so one number covers all three ways
the scan can stop working. It is NOT an assertion on `found`: that stays free to
grow, because eight lanes add functions to this file and an equality on 36 would
be red every day for reasons that have nothing to do with escaping.

Same control, patched gate, **three paired alternating reps**:

| rep | arm | exit | failures | `#loomWires` | scan |
|---|---|---|---|---|---|
| 1 | control | 1 | 1 | 86 wires | 0 |
| 1 | gate | 0 | 0 | 86 wires | 1 |
| 2 | gate | 0 | 0 | 86 wires | 1 |
| 2 | control | 1 | 1 | 86 wires | 0 |
| 3 | control | 1 | 1 | 86 wires | 0 |

The control's failure set is `{the decorator scan reached the decorated renderer
this artifact carries (0: NONE)}` and the gate's is empty — a strict superset of
size one, in 3 of 3 control arms. The Loom drew 86 wires on **every** arm; an
earlier single `0 wires from 99 grips` in a control run was the intermittency
this README already documents, not the control, and pairing is what said so.

A note on the first draft, because it is the same class again: it counted `dre`
matches inside the loop and carried the number out through
`__rendererCensus`'s return. That was strictly weaker — three matches all
filtered out would have passed it — and every insertion landed INSIDE the block
`patch_g6_05_gate.py` writes, so **re-running that patch reported GONE and
exited 3**. Two patches must not both claim one line. Re-run all three g6.05
patches after any change here; all three must be all-skip and zero bytes.

All three controls are built by `make_controls.py`, beside the two variant
generators, so the breaks are re-takeable rather than something a session once
did by hand:

```
python make_controls.py && source ./env.sh && node .deep/ctl_norepair.js
```

| control | what it disables | expected red |
|---|---|---|
| `ctl_noplant` | the two founder identifiers are declared, not planted | `every declared field was planted (37 of 39)`, both doors, naming them |
| `ctl_norebind` | the decorated name joins `found`, is never wrapped | `openPanel  (never called at all)` |
| `ctl_norepair` | the decorator scan's regex | `the decorator scan reached … (0: NONE)` |

Each one asserts its own anchor appears exactly once and that the result differs
from the source, because **a control that could not be BUILT cannot be
distinguished from a control that ran clean** — the same defect the controls
exist to detect.

**One collision of this kind is already shipped, in the artifact half.**
`patch_g6_01_escaping.py` re-run on the fully-patched tree is
`0 applied, 60 skipped, 1 gone` and exits **3**: its `escj` insertion carries
`function escq(…)` verbatim as context, and `patch_g6_02_element_context.py`
later rewrote that line to add `>`. Nothing is wrong with the artifact — escq
has the `>`, escj exists, and the gate proves both — but g6.01's "second run is
all skips and zero bytes" is no longer true on this tree, and a lane replaying
the chain will read that GONE as a site another lane moved.

**The limit, so the next lane inherits it rather than a belief:** the regex knows
one syntax, `const _x = y; y = function`. A decorator written
`y = (function(o){…})(y)`, with `let`, or as an arrow is not matched, and a
renderer hidden behind it is absent from the population with this check green.
Closing that needs the syntax-independent form — every `\nfunction NAME(` whose
`window[NAME].toString()` is not that declaration.

### How many raw interpolations are left, by context

`node qa/raw_interp_census.mjs` parses every inline script with acorn, works out
the HTML/CSS/JS context each interpolation lands in from the static text around
it, and classifies the expression. It runs the artifact not at all, so it says
nothing about whether a template ever reaches a sink — **over-counting is the
safe direction here** — and `--selftest` plants four known-bad sites, one per
context, and asserts the census finds exactly those four.

**747 interpolations, of which 286 interpolate a non-constant value with no
escape:**

| context | raw | composition | leaf value |
|---|---|---|---|
| `text` | 132 | 16 | 116 |
| `not-markup` | 86 | 0 | 86 |
| `attr-dq` | 50 | 0 | 50 |
| `attr-url` | 9 | 0 | 9 |
| `attr-style` | 5 | 0 | 5 |
| `attr-handler-dq` | 3 | 0 | 3 |
| `tag-position` | 1 | 0 | 1 |
| **total** | **286** | **16** | **270** |

Read it down, not off the top. `not-markup` (86) cannot create an element or run
code — the static text around it is not markup. `composition` (16) is an
interpolation whose expression is ITSELF a template, counted here and again at
every leaf inside it, so it is the same markup twice. That leaves **184 leaf
values in a markup context, over 118 source lines**, and they are not spread
thin: the hosts are `renderLoom` 27, `renderInspect` 17, `renderTab` 16,
`buildOrgMap` 12, `flowRowH` 10, `siteNav` 10, `renderCuration` 7, `showHover`
7, `openDoor` 7, `openVitalDrop` 7 — 41 column-0 functions in all.

Sampled by hand, the bulk of `attr-dq` is loop indices (`i`, `fi`, `qi`, `si`,
`dir`) and keys of const tables the classifier cannot prove constant because
they arrive as `Object.keys(CIRCLE_COL).map(c => …)` — the identifier is a loop
parameter, not a member expression. **The classifier's blind spot is named in
its own header and `CONST_TABLES` is printed, so this is checkable rather than a
shrug.**

The runtime complement, on the same artifact: every one of 1497 string leaves at
143 export paths poisoned, `0` elements, `0` handlers fired, `0` distinct raw
sites over **16 185 to 29 178 strings handed to a sink across 7 document
loads** — the string count moves run to run, the site count does not. The two
numbers do not contradict each other and neither replaces the other — the 184
is what a static reader cannot prove constant, the 0 is what a driven surface
was measured to do, and **the gap between them is exactly the surfaces nothing
drives**, which is how both of g6.05's sinks stayed open through four rounds.

### Elements / fires, re-measured with all of the above

| artifact | restoreScene | #msCircles click |
|---|---|---|
| pristine `origin/main` | 934 / 649 | 57 / 42 |
| after `patch_g6_01` + `g6_02` (what Part 2 shipped) | 309 / 42 | 9 / 0 |
| after `patch_g6_03_vocabulary.py` | **0 / 0** | **0 / 0** |

The middle row is what the vocabulary and the four identifier attributes were
worth: `#inspBody` 264, `#dOwner` 22, `#dSub` 12, `#skMedia` 9, `#dSelSub` 2.
The nine in `#skMedia` land on a plain restore **with no click at all**, because
`restoreScene` calls `renderMediaVocab()` and the media chip wrote
`background:${m.color}` into a style attribute.

### A colour is a colour, and a word is a word

Escaping six readers of a value leaves the seventh reader for the next lane to
add, so `applyVocabulary` validates at the door as well. `media[].color` is held
to `/^#[0-9a-f]{6}$/i` — the same rule and the same reasoning as `accent` and
`parchment` in `shared/mapSkin.ts` — and falls back to `#e8c877`, the default
that line always carried. Subtype words go through `vocabWord()` (trim, lower
case, drop empties and duplicates), which is the normalisation the zone editor
already did inline, lifted out so the panel a founder types into and the bridge
the shell pushes through agree byte for byte; a list that normalises to nothing
leaves the existing words alone rather than installing an empty `<select>`.

Deliberately NOT done: no length cap (the first draft had one at 48 characters
and it truncated the gate's own payload mid-tag, so the counters would have read
zero because the attack was cut in half); no allowlist for subtypes ("your land,
your words" is the feature); no stripping markup out of a word (that rewrites
what a person typed and is not a safety property, since the word lands in five
other places); and no normaliser on the four identifiers, because every one of
them is read straight back out of `select.value` and a key a normaliser touched
stops matching the row it names.

`__REFUSED_EXPECT` asserts `media[].color` reaches NOWHERE — not the state, not
the page. Run the gate against the pre-g6.03 artifact and that check goes red,
which is the difference between a validator that is present and one that works.

### The panel, driven the way a visitor drives it (g6.06)

`verify_doorsink.js` is the fifth gate and the only one that never calls a
renderer. It seeds `localStorage['amora-grounds-scene']` the way a returning
founder's browser is seeded, reloads, clicks the **Restore bar**, clicks a
building on the land, clicks all four panel tabs, and clicks the doors. Every
other suite in this lane calls `restoreScene()` by hand, so **no gate here had
ever driven `persistenceBoot`** — and the whole flow hangs off a
`localStorage.getItem` inside a `try/catch` that swallows. On a browser that
refuses storage for `file://` URLs the bar never appears, nothing restores, and
a gate built on that path drives NOTHING while printing what a clean run
prints. Section 0 asks that out loud and fails the run.

It was written for a reported sink — `onclick="openModule('${m[0]}','${m[1]}')"`
in `renderTab` tabs 0 and 3, both arguments raw, live on `origin/main` — whose
real blast radius was six nodes across `#banners`, `#panelHead` and
`#panelBody`. **All six were already closed** by `patch_g6_01`, `patch_g6_02`
and `patch_g1_03`, the last of them in the strongest available way: the
founder's two strings do not travel through the attribute at all, only the
door's integer index does. What the gate found on its first red run was a
seventh nobody had closed.

**`t.replies`.**

    <small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago</small>

Escaped on both sides, raw in the middle, through four rounds of an escaping
gate and three lanes, because the field name reads as a count. It is not one:
`restoreScene` stored it as `replies:t.replies||0`, and `'<img …>'||0` is the
string. Three render sites (:3458 the panel, :5203 the Journeys room, :5454 the
module room) and **two** doors — the import at :5050 and the EXPORT at :3897,
which is how this artifact publishes a poisoned count back to the server for
the next visitor. `patch_g6_06_openmodule.py` coerces at both doors and escapes
at all three sinks.

Every number below was taken by running the gate, and the mutants are the point:

| artifact | result | what goes red |
|---|---|---|
| pristine `origin/main` | 16 pass, **14 fail** | `#banners` 88 elements, `#panelHead` 12, `#panelBody` 236, C1 both openModule attributes, D1, D2b, and C3b — *not one door opened at all* |
| the lane's chain, before g6.06 | 23 pass, **7 fail** | `#panelBody` 52 elements, `e:replies` executing, 26 payloads on 4 real clicks |
| revert the escapes, keep the door | **30 pass, 0 fail** | nothing |
| revert the door, keep the escapes | 28 pass, **2 fail** | D1 and D3b only |
| both halves | **30 pass, 0 fail** | nothing |

**Read row three before trusting row five.** Reverting `escq(t.replies)` alone
does not take this gate red, and that is the true shape of the fix rather than
a gap: the coercion turns the payload into `0` before any sink sees it, so with
both halves in place the escapes are never exercised. Each half is
independently SUFFICIENT, which is only worth something while the door really
is the only way in — so **D3 asserts that directly**, against the artifact's
source: every site that writes a `replies` property writes a number. A second
importer added later fails there, which is the day the escapes stop being
redundant and start being the thing holding the line.

Three defects in this gate were found by running it, and each one printed a
PASS first:

- **Three passes over the empty set.** With no door handler rendered, "none is
  unsafe" and "all compile" are both true, and the gate printed both on the
  artifact where the sink was live. C1, C2 and D2b now carry their precondition.
- **One reading of a host with four documents in it.** `renderTab` REPLACES
  `#panelBody`, so a single count after the tab walk describes only the last
  tab. It reported `#panelBody: elements 0` about a tab 0 that had just built
  thirty. Counts are taken per tab and summed.
- **A hit-test that over-matched.** C1 demanded `openDoorHere(<index>)` of
  every inline handler in the panel, and the panel also carries `evRSVP('e3')`
  and `doorClickHere('wallet')` — both code-table keys, both correct. It passed
  only because the building the click happened to open had neither. The module
  doors are counted from the structure's own record now, and the claim that
  needs no allowlist ("no handler carries the payload", C1b) is separate.

And one about the click itself. `syncBanners` re-lays every name plate on an
animation frame, and on the unfixed artifact the payload becomes real markup
INSIDE the plate, so its box moves as the broken image fails. A coordinate
captured by `elementFromPoint` and clicked a moment later lands on the land,
the panel never opens, and every panel number comes back 0 — not because the
sinks are closed but because nothing rendered. The gate clicks through
`locator.click()`, which re-runs the hit-target check AT CLICK TIME, and it
tries the building's **emblem** before its name plate for the same reason.

`_probe_lsboot.js` is the throwaway that answered "does this path exist for a
gate at all" before any of it was written. Keep it: the answer is browser
policy, not artifact behaviour, and it will be asked again.

## Measuring these suites (n=1 is not a measurement)

`verify_doors`, `verify_badges`, `verify_loom` and `verify_features` are
intermittent and **red on pristine main**, so the only meaningful claim about a
change is "no worse than baseline over n>=5 paired reps", never "green". Two
ways to get a wrong answer, both seen in one session:

- **Run them in parallel and every arm gets worse.** Five suites at once turned
  `verify_loom` into 35/5 on the arm under test against 39/1 on the baseline, and
  that gap read exactly like a regression. Run serially, the same pair came back
  40/0 and 40/0 in all five reps. Under load the failures that appeared
  (`Loom re-renders after restore`, `provenance filter drops creator wires`,
  `kind filter hides quests`) hit both arms.
- **Fix the order and you bias the pair.** A harness that always ran the
  baseline first handed the arm under test a hotter machine in every rep. Alternate
  which arm goes first, and record **which** assertions failed, not just how many:
  "two more failures" is unreadable, "`provenance filter drops creator wires`,
  which also fails on the baseline" is an answer.

`verify_maia_journey.js` covers the guided conversation, Maia's voice, and the
dock as an injection surface. 82 checks over both profiles, and it ships with
its own mutation runner:

    source ./env.sh && node verify_maia_journey.js      # ~75s
    source ./env.sh && python3 break_maia_journey.py    # ~25 min, 15 mutations
    MAIA_ONLY=arrival python3 break_maia_journey.py     # one row; it prints PARTIAL
    MAIA_SUITE=/path/to/other.js python3 break_maia_journey.py   # A/B two suites

`MAIA_SUITE` exists so two versions of the suite can be put against the SAME
mutant. A guard fix has to be shown to change something, and the only honest
way to show it is to run the mutant twice, alternating, with nothing else
moving. Screenshots go to `../.qa-out/`, which `.gitignore` already carries;
they used to be written by bare relative path into whatever directory the suite
was launched from, and 2.8 MB of untracked PNGs in a shared worktree is one
`git add .` away from being committed by another lane.

`break_maia_journey.py` writes a deliberately broken artifact for each known
defect, stages it as `<dir>/grounds-v0.html` under `%LOCALAPPDATA%`, and
requires both a full check count and the named checks going red. **Run it when
you add a check to that suite**, because it has already caught the suite
passing over three real breaks: the dock has two independent XSS defences
(escaping at every call site, and `maiaClean` parsing inside an inert
`<template>`), and any assertion that only observes their combined outcome
stays green when either one alone is removed. Section J measures each layer
separately for that reason.

**And for two rounds it did not, which is the sharper half of the story.**
Section J separated the layers and then held its spy open for a fixed 2600ms
against a camera flight that is frame-counted. When the flight lands late the
spy captures only the OPENING line of the walk, where the journey NAME is
escaped by a different call: J2 finds its `&lt;img` there, J3 finds no live one
there, and both print green with the poisoned step TITLE never handed to the
parser at all. `break_maia_journey.py` said so in plain words the whole time,
`journey title unescaped again -> SILENT (nothing) MISSING J3`, and the report
of that round did not carry the line. **The breaker was honest; the summary of
it was not.**

Measured, four browsers at a time: the 2600ms version missed that break in
**6 of 6** runs and the polling version caught it **6 of 6**. Run the same pair
serially on an idle box and BOTH catch it 5 of 5, which is why an idle rerun is
not a defence of a budget. J1 now waits for the stop row and asserts the
ARRIVAL line was among what the spy caught, rather than counting lines: one
line is what the opening satisfies on its own.

**C7/C7b cover the arrival guard, and they cost a second draft.** `playJourney`
speaks from the camera flight's arrival callback, which fires frames after the
walk may already have ended, so that callback re-checks `JWALK`. The obvious
check is "no extra stop row appears after `jEnd()`". That check passes with the
guard REMOVED: without it the callback reaches `jRow(JWALK.i+1, ...)` with
`JWALK` already null, throws while building the argument, and never calls
`maiaSay` at all. Same row count, different world. C7b counts page errors over
that window instead, which is what the comment sitting beside the guard in the
artifact had already said: it is the only callback that fires late, so it is
the only one that threw. **Read the comment next to the thing you are
checking.**

**Then the second draft waited for a clock, which is the defect the paragraph
below had already taught this file.** `jEnd()` followed by a fixed
`setTimeout(3500)` for that frame-counted flight: when the landing falls past
the budget the late callback is never driven, no throw can be observed, and C7b
prints green over a path nobody walked. The first measurement of that miss was
wrong about its own conditions, and an independent review caught it: the probe
here opened a fresh context per rep and timed from `playJourney`, a COLD flight
landing at 3835-4371ms, past the budget, and reported the break missed in
**2 of 6** runs. The review ran the same pair in the suite's real conditions,
about 40 seconds in on a warm page with the flight landing at 1882-2491ms, and
the 3500ms version caught the removal **11 of 11** there. Both numbers are true
of their own context and neither is a property of the check: a budget that
catches a break warm and misses it cold or under load is an observability that
moves with machine state, and a missed run prints a full 73 of 73 ALL GREEN.
C7 polls
`travel` now and the timeout is an ASSERTION rather than a fallback, so a flight
that never lands turns C7 red instead of letting C7b pass over nothing. C7 also
PRINTS the landing it waited for, so the number that decides this comes out of
the gate rather than out of a separate instrument.

The same defect, in three sections of one file, each found separately. **When
you fix one fixed-millisecond wait, grep the whole suite for the others the
same hour.**

**The dock's second layer had holes, and each was held shut by something other
than itself.** `escq` replaces `&`, `<` and `"`, which makes a value safe to SIT
inside an attribute and says nothing about what the attribute then DOES:
`javascript:alert(1)` goes through it letter for letter, and the dock built a
sign-in href out of `d.href`, which arrives on the `promise-result` message over
the same bridge section H drives. Nothing fired, because an anchor carrying
`target="_blank"` declines a `javascript:` URL. A defence that rests on another
attribute's side effect is not a defence, so `safeHref()` now refuses any scheme
that is not http or https, and it reads the scheme off the string the browser
will see rather than the string it was handed (`java\tscript:x` runs; tabs and
newlines come out of a URL before the scheme is parsed). K1-K3 drive the real
message and assert on the href the anchor carries, never on a click: a click on
that anchor would measure the browser's rule and never the map's.

`maiaClean` removed banned ELEMENTS and never looked at attributes, so a live
`on*` handler on a `<b>` the parser was happy to keep went straight through the
layer that exists for exactly that day. It strips them now against
**an allowlist over the handler VALUE, never over the element**: the dock writes
its own controls as `<button onclick="jNext()">` and no rule about elements can
tell those from an attacker's. The `claimQuest` form in that allowlist accepts
two single-quoted arguments with every inner quote and backslash escaped, which
is what `escja` produces and what a broken `escja` would not, so an escaping
regression now shows up in layer two as well as layer one. `<style>`, `<marquee>`
and `<details>` joined `MSAY_BAN` in the same pass; `<style>` is the one that
matters, because one rule reaches the whole page.

**J6 is the check that was hard to write, and it is the reason the strip can be
trusted.** The failure mode of an allowlist is silent: a stripped `onclick`
renders as a button that does nothing, which looks exactly like a button nobody
wired. Grepping 37 call sites for `onclick=` does not answer it, because a
template literal puts the handler on a different line from the `maiaSay`
carrying it. So `maiaClean` records what it removed, and J6 reads that record
after the suite has driven the tour, a journey from both entry points, the
concierge, the claim link and two poisoned scenes over the bridge, and requires
it to be empty. **That is an enumeration. A grep is not.**

**The strip took an existing check with it, and the breaker found that on its
first run.** The row `the claim attribute loses its JS escape` used to prove
itself through I6, which counts EXECUTIONS. With the strip in place a broken
`escja` no longer produces a live handler at all: the value stops matching the
allowlist, the handler is removed, and the anchor arrives inert. So the run
printed

    the claim attribute loses its JS escape   81   SILENT  I5,J3b   MISSING I6

I6 is not wrong. It is now guarded by two defences and cannot tell them apart,
which is the same two-defences-one-observation shape section J exists to end,
arriving from the other side. **A new defence can retire an old check without
anyone noticing, and the mutation runner is what notices.** I6b reads the
string the concierge handed the parser, before any strip touches it, so only
layer one can satisfy it. I5 and J3b go red on that mutant too and are
deliberately not required: those are layer two doing its job.

**And I6b's own first draft was red on a correct artifact.** It searched the
whole handed line for the raw closer, and the same answer prints the quest name
as TEXT beside the link through `escq`, which leaves a single quote alone,
correctly, because a quote in text is a quote. The text occurrence is right and
the attribute occurrence is the defect; a substring test over the line cannot
separate them. It pulls the `onclick` values out first now. Two instrument
bugs in one pass, both found by running the thing rather than by reading it.

**Where the breaker stands: 15 of 15, exit 0, control 82 checks clean.** Print
that line whenever this lane is reported on. The run before it was 14 of 15 and
the summary of the run before THAT one omitted a failure entirely, which is the
whole reason this paragraph exists.

### Named for the lane that owns the doors

`escq` is entity-only everywhere, and `safeHref()` is exported as
`window.safeHref` so it can be used outside the dock. On `origin/main` there are
three `href="${escq(...)}"` sites in `grounds-v0.html`; this lane fixed the one
it owns, the sign-in door built from `d.href`. **The other two are the door
surfaces, and they are not obviously latent the way the dock's was.** The dock's
anchor is saved by `target="_blank"`, which declines a `javascript:` URL. Those
two carry `onclick="return siteNav(event,…)"`, and `siteNav` does
`window.top.location.href = siteHref(route)` when the map is embedded, which is
a programmatic navigation and gets no such refusal. Worth a look by whoever owns
that surface; this lane did not touch it.

`check_maia_voice.mjs` holds Maia's shipped copy to the house writing rules.
It needs no browser and takes about four seconds:

    node check_maia_voice.mjs                  # 203 lines, 8 resident lines
    python3 break_maia_voice.py                # ~40s, 6 mutations + a selftest

**The repo gate cannot see this artifact, and that is the reason this file
exists.** `scripts/check-voice.mjs` scans `SCAN_ROOTS = ["client/src",
"server", "shared", "docs/knowledge"]`, and `walkFiles()` admits only
`/\.(tsx?|json|md)$/`. So `docs/prototypes/grounds-v0.html` is excluded twice
over, and no green CI run has ever said anything about a word Maia speaks.
`check_maia_voice.mjs` does not restate the rules: it extracts her copy, writes
it as a `.ts` file of string literals, and runs the real `scripts/check-voice.mjs`
over that. The rules stay in one place and cannot drift.

**Two traps live in that handoff, and both shipped before they were caught.**

- `check-voice.mjs` resolves its arguments with `path.join(ROOT, arg)`. Given an
  ABSOLUTE path it builds a nonsense path, fails `existsSync`, skips every
  file, prints `[]` and **exits 0**. Zero files scanned is byte-identical to
  zero violations found. The first draft of `check_maia_voice.mjs` passed an
  absolute path and reported ALL GREEN over three planted violations. Anything
  else that shells out to that gate wants a relative path and this paragraph.
- So the generated file ends with a **canary** line that must be flagged. If
  its finding does not come back, the run is reported red as "the guard never
  read these lines" rather than green. `break_maia_voice.py`'s selftest reverts
  the invocation on a copy of the gate and requires the canary to catch it.

The six artifact mutations split evenly, and the split is the design. Three
plant a real violation in a line she says. Three take her copy away from the
extractor without changing a word of it: rename `MAIA_STOPS`, rename the call
sites, move a sentinel. A gate that stays green through the second group is the
silent-zero defect wearing a green shirt.

## Known harness caveats

- Native `title` tooltips (the vitals bar) can't be screenshotted headlessly —
  the harness asserts the attributes instead.
- §22's "refuses below 3 vertices" trims `SCENE.bound` programmatically to reach
  the 3-vertex state, then right-clicks a real handle. The refusal is genuine;
  only the setup is scripted.
- The `§25` blueprint-edge check is vacuous with the shipped seed data — there
  are no flows touching a blueprint structure.
- `secB.js` §14 reads `TOUR`, `tourI` and `tourTimer`, which are now a VIEW the
  journey publishes rather than a tour of their own. `clearTimeout(tourTimer)`
  still halts the walk, because the journey's dwell timer is that same handle,
  but assigning `tourI = -1` no longer ends it: `JWALK` stays set and the
  address stays on `#/journey/j1`. §14 only logs, so nothing fails; a later
  section running with a walk still open is the thing to watch for.
- §14's 66-second budget now covers eight stops at a 6.5s dwell plus their
  camera flights, which is about 58s. It fits, with less room than before.
- **A camera flight is frame-counted, not time-counted, and headless rAF runs
  at 8 to 11fps.** `travel.t += dt*1.6` with `dt` capped at `.05` means a
  flight is about 12.5 frames whatever the clock says, so `travelTo` lands in
  roughly 600ms in a real browser and anywhere from 1.4s to over 2.5s here.
  Any assertion that waits a fixed number of milliseconds for an arrival is a
  coin flip. `verify_maia_journey.js` F7 was written that way, budgeted 2500ms,
  and went red in 3 runs of 5 against an artifact that was behaving correctly
  every time. Every one of those runs printed a full 71 of 71 checks, so it
  read as a real defect and not as a flake. It now polls for the spoken line,
  which is both correct and faster. **Wait for the state.**
- **And the fix for F7 did not travel.** C7b shipped with `setTimeout(3500)`
  and section J with `setTimeout(2600)` for that same arrival, in the same file,
  after F7's fix and after the paragraph above was written. Both were found by
  a reviewer rather than by this harness.
- **The knob is BROWSERS, not cores, and that is worth knowing before you try
  to reproduce one of these.** `_probe_arrival_dist.js` measures the landing
  directly: one browser on an idle box lands at **1858-2148ms**, and four
  CPU-burning workers do not move it by a millisecond, because headless
  chromium's rAF throttle is the bound rather than the core. Four SUITES at
  once, which is the ordinary state of this box when several lanes work
  together, put it at **3170-4220ms** over twelve runs. Both retired budgets
  sit inside that spread. So a serial rerun on a quiet machine cannot clear a
  fixed-millisecond wait, and "it passed for me" about one of these means only
  that nobody else was running.
