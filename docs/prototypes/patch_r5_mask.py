#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / MASK - ONE ROOM FOR HOW THE VILLAGE LOOKS TO YOU, AND A PHONE THAT REACHES IT.

THE FOUNDER'S WORDS:

  "clicking on the theme button should open everything in theme and everything
   in the Make this map yours button in one - merge them thoughtfully together."

  "How do I edit Maps settings in mobile where I can do things like change the
   scale of the buildings for my view ... everyone is able to re-skin and make
   it the round in this aesthetic way, but only builders are able to actually
   update buildings and move them around and change boundaries. THIS IS JUST A
   MASK HOW PEOPLE PREFER TO LOOK AT THEIR VILLAGE."

That last sentence is the design law this patch is built on: the mask and the
truth are two layers. Anyone may re-skin their own view. Only builders move
buildings, redraw boundaries, and change the village's own words. A personal
size dial changes how big the houses look TO YOU and never writes a shared
fact, and the panel says so in its own first sentence instead of leaving a
person to guess.


================================================================
1. THE TAP THAT DID NOT OPEN A DOOR  (measured, then fixed)
================================================================

MEASURED FIRST, with trusted CDP touch input at a viewport proven from the
payload (innerWidth 390, innerHeight 844, devicePixelRatio 3, maxTouchPoints 1,
body.pocket true), 19 painted buildings on screen:

    hit box   art box   art above the box   pressable share of the building
    38 x 38   52 x 56        15 px                   50%
    45 x 45   75 x 66        17 px                   41%
    43 x 43   73 x 62        16 px                   40%
    49 x 49   79 x 72        19 px                   43%
    55 x 55   86 x 80        21 px                   44%
    ...
    MEDIAN pressable share of the visible building:  42%
    MEDIAN art standing above the hit box:           17 px
    MEDIAN hit box width: 45 px, and several are 38 to 43

That is the complaint as a number. `.poi` is a 52 px square centred on the
building's anchor. The painted sprite is 76 px tall and hangs from
`bottom:-4px`, so the ROOF AND UPPER BODY OF EVERY BUILDING, which is the part
a person aims at, stands outside the only box that takes a tap. The sprite
itself is `pointer-events:none`, so the tap falls through the artwork
altogether. Fifty-eight per cent of every building a person can see was dead.

WHERE THE TAP WENT INSTEAD, measured on the same run:
  * onto bare canvas, where `hitStruct` measures a radius around the ANCHOR in
    world space and does not know the art reaches above it, so nothing opened;
  * or onto a NEIGHBOUR's badge hit-span. Tapping the kitchen's roof opened
    `community` and one of its quests. `.bseal .bhit` is 44 x 44 over a 22 px
    badge and `#badges` is z-index 12 over `#icons` at 10, so a badge wins.
    That one is left alone: 44 px is the accessibility floor and pressing a
    mark that is genuinely under your thumb is the mark doing its job. It is
    reported rather than changed.

WHAT THIS DOES NOT TOUCH, and the measurement that says why. The first tap on
a building carrying two or more marks does not open the door; it fans the marks
(`#icons` click, capture phase, :3688). That is deliberate and documented, and
the measurement below shows it working exactly as written: tap 1 swallowed by
the fan, tap 2 at the identical point opens the door.

    tap 1: click capture -> path. [.poi sanctuary]          => panel open: false
    tap 2: click capture -> path. [.poi sanctuary]
           POI-onclick sanctuary
           openPanel(sanctuary)                             => panel open: true

THE FIX IS `hitArt`, AND IT IS DELIBERATELY NOT `pointer-events:auto`. Turning
the sprite on would have been one CSS word, and it would have cost the map its
pan: on the pocket profile `touchNav` is bound to `#scene`, so a finger that
lands on a building would never reach it and a drag begun on a roof would move
nothing. With 19 buildings on screen at a median 75 x 66 that is a great deal
of dead glass. Instead the artwork stays transparent to pointers, the tap
falls through to the canvas exactly as it does today, and the canvas click
asks `hitArt` FIRST: a screen-space test against the sprite the person is
actually looking at. The pan survives, the roof opens the door, and one path
serves the desk and the phone.

Hover is left on `hitStruct` alone on purpose. `updateHover` runs on every
pointermove, and reading a rect per building per move forces a layout flush on
a five megabyte document. `.poi` already carries `cursor:pointer` over its own
box, so a mouse still gets the signal.


================================================================
2. THE PAID GATHERING THAT WAS CALLED CLOSED
================================================================

`server/index.ts` refuses a one-tap RSVP to a gathering with a price on its
seat, and that refusal is right: every other door shows the fee before taking
it, and a lantern on a building has no price anywhere near it. The route says
in as many words why it sends `closed` for it:

    "Refused as `closed`, which is the nearest existing reason and is
     deliberately not a new one: the map's copy table lives inside the
     generated artifact another lane owns, and a reason with no copy reads
     worse than a reason that is merely imprecise."

This is that artifact and this is that copy table. `paid` now has words that
say the true thing, and a way onward to the door that shows the cost, in the
same shape `anonymous` already uses. The artifact is the half that can be
written here; `PROMISE_REASONS` in `shared/mapPromise.ts` and the `closed`
literal in `server/index.ts` belong to a lane that owns those files, and until
they move the entry sits ready and unused. A reason arriving with no copy is
the failure this removes.


================================================================
3. THREE DOORS, TWO PANELS, ONE ROOM
================================================================

BEFORE: `#themeBtn` opened `#themePanel` (themes, icon style, terrain, paint,
a palette, a scale dial). A build-bar chip opened `#skin` (themes, words,
accent, parchment, label size and style, flow marks, icon style, mist, pulse,
A SECOND SCALE DIAL, a second brush and palette, terrain again, and the
village's own vocabulary). A dock button promised "Make this map yours. Theme,
accent, labels, mist" and opened Village Settings on the site, which is a
different thing wearing the panel's name.

AFTER: `#themePanel` is MOVED INTO `#skin` at boot, into a host the panel
itself declares, so the two panels are one room reached by one button. Nothing
is re-implemented and no handler is rewired: every control keeps the element,
the listener and the state it already had, which is what makes this safe to do
to a file this size.

Seven controls existed twice and now exist once. Where a setting had two
homes, the surviving one is the better-labelled of the pair and the other is
marked `data-dup` and hidden, never deleted, because live code and the QA
suites reach into both by id:

    theme        #skTheme wins, and now RENDERS THE RICH SWATCHES
                 (colour dots and a description) that `#themeList` used to
                 carry, keeping BOTH class names so `applyTheme`'s on-flag
                 sweep, `verify_doors`'s `#skTheme .swb[data-t=...]` and
                 `secA`/`secB`'s `.swatchbtn:nth-of-type(N)` all still land.
                 `#themeList` stops rendering so `.swatchbtn` stays unique.
    size         #skGS wins (a labelled row). #gScale hidden.
    icon style   the [data-im] chips win. #skIcon hidden.
    terrain      the [data-tm] chips win. #skTerr hidden.
    brush        #paintCtl wins, because it is the pair that is GATED.
    palette      #paintCtl wins, same reason. #skBrush / #skPal hidden.
    words        #aiWords with its Weave it button wins. #skWords hidden.

THE DOCK BUTTON KEEPS ITS DESTINATION AND LOSES THE BORROWED NAME. It opens
Village Settings, so it now says Village Settings. Two doors now lead to one
room (the button on the map for everyone, the build-bar chip for a builder
already in build mode) and the third leads honestly somewhere else.

THE MASK AND THE TRUTH ARE SEPARATED IN THE MARKUP, not only in the prose. The
village's own words (zone names, flow types, phase names) and Save and Reset
carry `data-village` and appear only under `body.can-edit`. Everything above
them changes one person's view and nothing else. That is R53 enforced by a
selector.


================================================================
4. THE FOUR ASKS THAT KEPT BEING DEFERRED
================================================================

EASY EXITS. `#themePanel` had no close control and no Escape of its own; the
merged panel now carries a 44 px close in its header with an accessible name,
and Escape closes it from anywhere rather than only when focus is inside it.
`#wall` had neither, and now has both. Both join the one global Escape line,
which already returns early on INPUT / TEXTAREA / SELECT, so typing is safe.

PALETTE AND BRUSH ONLY WHEN THERE IS PAINT. `#paintCtl` was shown by the
terrain click handler alone, so the state was read once, at click time: paint
finishing its bake afterwards never revealed the tools, and `#skin`'s own two
copies of the same dials were shown unconditionally, all the time, whatever the
terrain was. `syncPaintTools()` is now the one place that answers the question,
it is called from the terrain switch AND from the moment the bake completes,
and it also withdraws the `painted` option from `#skTerr` until there is paint
to work with, matching what `#tmPaint` already did.

THE TAIL UNDER THE TASKBAR. `#skin` was `top:96px` with no ceiling and no
scroll, so on any window shorter than the panel the last rows fell off the
bottom and were unreachable. It now takes `max-height:calc(100dvh - 120px)`
with its own scroll. `dvh` and NOT a subtracted taskbar height: the dynamic
viewport unit is the browser telling us what is actually visible, on a desk
with a taskbar, on a phone with a shrinking address bar, and inside the site's
iframe, without this file assuming anything about any of them. A `vh` line
sits above it for engines that have no `dvh`.

A PERSONAL SIZE DIAL THAT SURVIVES. THE DIAL ALREADY EXISTED AND ALREADY
WORKED. `setGScale` drives `--gScale`, every icon transform and the label
scale, and `gScale` and `skGS` were already two faces of it. Two things were
wrong and both are what the founder actually asked about. It was UNREACHABLE
ON A PHONE, because both its homes were inside panels the pocket profile
hides. And it did not KEEP: every drag wrote `logEdit('skin','map',...)`, an
entry in the village's shared edit log, and nothing at all in the browser, so a
reload threw away the one thing that was meant to be personal and a shared
record grew for a change nobody else could see. It now writes
`amora-map-mask` in localStorage and is restored at boot. The shared export
still carries `global_scale` untouched, because a village that publishes a skin
is a different act from a person choosing how big to see the houses.

REACHING IT ON A PHONE. `#skin` leaves the pocket hide list and takes the
sheet form this document already uses for `#panel`, `#moduleCard` and
`#pdrawer`: full width, hinged off the bottom edge, the same 300 ms curve, and
a floor that clears `#pbar` and the home indicator through
`env(safe-area-inset-bottom)`. `#themeBtn` STAYS HIDDEN on pocket, because it
is a desk button anchored at `right:356px` and there is no room for it; the
pocket door is a cell in the drawer where the other ways in already live.
Opening the sheet closes the drawer and the help sheet first, because three
sheets hanging off one 60 px bar on a 390 px screen is how a control ends up
underneath something and a probe reports it visible.

House protocol: exact-count anchors, per-edit guards, refuses on any count that
is not the one declared. A second run writes zero bytes.

Afterwards, from docs/prototypes:  node check_blocks.mjs
and from docs/prototypes/qa:       source ./env.sh && node _probe_r5_mask.js
                                   && node verify_features.js && node verify_doors.js
                                   && node verify_skin_bridge.js
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "grounds-v0.html")


def load():
    with io.open(TARGET, "r", encoding="utf-8", newline="") as f:
        return f.read()


def save(s):
    with io.open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(s)


APPLIED = []
SKIPPED = []


def edit(src, name, anchor, new, guard, count=1):
    """One anchored replacement. The guard is PER EDIT, never per script."""
    if guard in src:
        SKIPPED.append(name)
        print("  skip   %s (guard already present)" % name)
        return src
    n = src.count(anchor)
    assert n == count, "%s: anchor found %d times, expected %d" % (name, n, count)
    out = src.replace(anchor, new, count)
    assert out != src, "%s: replacement changed nothing" % name
    assert guard in out, "%s: guard absent after apply" % name
    APPLIED.append(name)
    print("  apply  %s" % name)
    return out


src = load()
before = len(src)

# =============================================================== 1. THE TAP

src = edit(
    src, "hitArt: the building a finger is aiming at",
    "function hitStruct(px,py){const[wx,wy]=screenToWorld(px,py);let best=null,bd=1e9;\n",
    "/* THE BUILDING A FINGER IS AIMING AT, which is not the same box as the one\n"
    "   that used to take the tap. MEASURED at 390x844 with trusted touch input,\n"
    "   19 painted buildings on screen: the median building showed 75x66 px of\n"
    "   art and offered a 45x45 hit box, 17 px of it standing clear above the box\n"
    "   altogether. 42% of the building a person could see was pressable and the\n"
    "   roof, which is what anybody aims at, was dead. The sprite is\n"
    "   pointer-events:none, so a tap on it fell through to the canvas, and\n"
    "   hitStruct measures a radius around the ANCHOR in world space and does not\n"
    "   know the art stands above it.\n"
    "   THE SPRITE STAYS TRANSPARENT TO POINTERS, deliberately. Turning it on was\n"
    "   one CSS word and would have cost the map its pan: touchNav is bound to\n"
    "   #scene, so a finger landing on a building would never reach it and a drag\n"
    "   begun on a roof would move nothing. Testing the rendered art HERE, on the\n"
    "   click that already falls through, keeps the pan and opens the door.\n"
    "   RECTS, NOT ARITHMETIC: the sprite's box is height, a bottom offset, a\n"
    "   translate and the camera's own transform, and asking the browser is the\n"
    "   only reading that cannot drift from what was painted. It runs on a click\n"
    "   and never on a frame. Nearest centre wins where art overlaps, so the\n"
    "   building whose middle is closest to the thumb is the one that opens.\n"
    "   CALLED ONLY FROM THE CLICK PATH. updateHover runs on every pointermove\n"
    "   and a rect per building per move forces a layout flush on a five megabyte\n"
    "   document; .poi already carries cursor:pointer over its own box. */\n"
    "function hitArt(px,py){\n"
    "  if(typeof pEls==='undefined')return null;\n"
    "  let best=null,bd=1e9;\n"
    "  for(const k in pEls){const el=pEls[k],s=BY[k];if(!el||!s)continue;\n"
    "    if(mode==='now'&&s.state==='blueprint'&&(typeof buildMode==='undefined'||!buildMode))continue;\n"
    "    for(const a of el.querySelectorAll('.sprite,.sprite-wip')){\n"
    "      if(getComputedStyle(a).display==='none')continue;\n"
    "      const r=a.getBoundingClientRect();\n"
    "      if(!r.width||px<r.left||px>r.right||py<r.top||py>r.bottom)continue;\n"
    "      const d=(px-(r.left+r.width/2))**2+(py-(r.top+r.height/2))**2;\n"
    "      if(d<bd){bd=d;best=s}}}\n"
    "  return best}\n"
    "window.hitArt=hitArt;\n"
    "function hitStruct(px,py){const[wx,wy]=screenToWorld(px,py);let best=null,bd=1e9;\n",
    guard="function hitArt(px,py){")

src = edit(
    src, "the canvas click asks the artwork first",
    "  const s=hitStruct(e.clientX,e.clientY);"
    "if(s)(typeof buildMode!=='undefined'&&buildMode?openInspect:openPanel)(s.key)});\n",
    "  /* The art first, then the wider radius. A tap that landed on a building's\n"
    "     roof used to reach here and find nothing, because the roof is outside\n"
    "     every box hitStruct measures. */\n"
    "  const s=hitArt(e.clientX,e.clientY)||hitStruct(e.clientX,e.clientY);"
    "if(s)(typeof buildMode!=='undefined'&&buildMode?openInspect:openPanel)(s.key)});\n",
    guard="const s=hitArt(e.clientX,e.clientY)||hitStruct(e.clientX,e.clientY);")

# ============================================= 2. THE PAID GATHERING'S WORDS

src = edit(
    src, "PROMISE_WHY: a price is not a closed door",
    "  closed:'That is not open to anyone right now.',\n",
    "  closed:'That is not open to anyone right now.',\n"
    "  /* A SEAT WITH A PRICE IS NOT A CLOSED DOOR, and saying so was false to a\n"
    "     member who could have walked in. The map's lantern is one tap on a\n"
    "     building with no cost anywhere near it, so the route refuses to spend\n"
    "     credits through it, which is right and stays. server/index.ts sends\n"
    "     `closed` for this today and says why in its own comment: the reason\n"
    "     had no copy here to send. It has copy now. */\n"
    "  paid:'That gathering asks for credits at the door, so one tap cannot say yes to it.',\n",
    guard="  paid:'That gathering asks for credits at the door,")

src = edit(
    src, "a priced gathering is handed onward, never dead-ended",
    "  if(d.reason==='anonymous'&&d.href)\n",
    "  /* ONWARD, NOT A DEAD END. Same shape as the anonymous case below: the\n"
    "     refusal names the remedy and carries the way to it. The route's own\n"
    "     href when it sends one, and the Events room when it does not, because\n"
    "     that is the door in this product that prints a seat price before\n"
    "     anybody agrees to it. */\n"
    "  if(d.reason==='paid')\n"
    "    maiaSay(`This one has a price on its seat, so a single tap will not spend your credits. `+\n"
    "      `<a href=\"${safeHref(d.href||'/events')}\" target=\"_blank\" rel=\"noopener\">Open the gathering</a>`+\n"
    "      ` and you will see what a seat costs before you say yes.`);\n"
    "  if(d.reason==='anonymous'&&d.href)\n",
    guard="  if(d.reason==='paid')")

# ============================================ 3. THE ONE ROOM: THE STYLESHEET

src = edit(
    src, "the merged panel: one room, a reachable tail, and a pocket form",
    "  #skin{position:absolute;right:14px;top:96px;width:330px;z-index:48;display:none;flex-direction:column;gap:9px;\n"
    "    background:linear-gradient(180deg,rgba(24,17,9,.97),rgba(17,12,6,.97));border:1px solid #6b5430;border-radius:10px;\n"
    "    color:var(--parch);box-shadow:0 10px 30px rgba(0,0,0,.6);padding:13px 15px 15px}\n",
    "  #skin{position:absolute;right:14px;top:96px;width:330px;z-index:48;display:none;flex-direction:column;gap:9px;\n"
    "    background:linear-gradient(180deg,rgba(24,17,9,.97),rgba(17,12,6,.97));border:1px solid #6b5430;border-radius:10px;\n"
    "    color:var(--parch);box-shadow:0 10px 30px rgba(0,0,0,.6);padding:13px 15px 15px}\n"
    "  /* THE TAIL THAT RAN UNDER THE TASKBAR. The panel was anchored at top 96\n"
    "     with no ceiling and no scroll of its own, so on any window shorter than\n"
    "     the panel its last rows fell past the bottom of the glass and could not\n"
    "     be reached at all. NO TASKBAR HEIGHT IS ASSUMED ANYWHERE HERE: dvh is\n"
    "     the browser reporting what is actually visible, which covers a desk with\n"
    "     a taskbar, a phone whose address bar comes and goes, and this file\n"
    "     inside the site's iframe, without guessing at any of them. The vh line\n"
    "     above it is the floor for an engine with no dvh. 120 leaves the 96 px\n"
    "     the panel starts at plus a hand's breadth under it. */\n"
    "  #skin{max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);\n"
    "    overflow-y:auto;overscroll-behavior:contain}\n"
    "  /* THE THEME PANEL, NOW A SECTION OF THIS ONE. #themePanel is moved into\n"
    "     #maskLook at boot with a single appendChild, so every control keeps the\n"
    "     element, the listener and the state it already had. Two id selectors\n"
    "     outrank both `#themePanel` and `#themePanel.show`, so its own floating\n"
    "     geometry is simply overruled while it is nested. */\n"
    "  #skin #maskLook{display:flex;flex-direction:column;gap:9px}\n"
    "  #skin #themePanel{position:static;top:auto;right:auto;width:auto;z-index:auto;display:flex;\n"
    "    background:none;border:none;border-radius:0;box-shadow:none;padding:0}\n"
    "  /* A CONTROL THAT EXISTS TWICE IS HIDDEN, NEVER DELETED. Live code and the\n"
    "     QA suites reach into both copies by id, and the pairs are two-way bound\n"
    "     already, so the hidden half keeps working and keeps agreeing. */\n"
    "  #skin .srow[data-dup],#skin .customrow[data-dup]{display:none}\n"
    "  /* R53 IN A SELECTOR. Above this line a control changes one person's view.\n"
    "     Below it a control changes the village's own record, and only a builder\n"
    "     sees it. */\n"
    "  #skin [data-village]{display:none}\n"
    "  body.can-edit #skin [data-village]{display:flex}\n"
    "  #skin #skSave,#skin #skReset{display:none}\n"
    "  body.can-edit #skin #skSave,body.can-edit #skin #skReset{display:inline-block}\n"
    "  #skin .vhead{flex-direction:column;gap:2px;margin-top:6px;padding-top:9px;\n"
    "    border-top:1px solid rgba(201,162,94,.3)}\n"
    "  #skin .vhead b{font-variant:small-caps;letter-spacing:.14em;font-weight:normal;\n"
    "    font-size:11px;color:var(--gold)}\n"
    "  #skin .vhead small{font-size:10px;color:#8f855f;line-height:1.4}\n"
    "  /* THE WAY OUT, IN THE HEADER, AT THE SIZE A THUMB NEEDS. The theme panel\n"
    "     had no close control of any kind and this one had a bare glyph in a\n"
    "     row a member never sees. */\n"
    "  #skin h3{display:flex;align-items:center;gap:8px}\n"
    "  #skin #skX,#wall #wallX{margin-left:auto;flex:0 0 44px;min-width:44px;min-height:44px;\n"
    "    appearance:none;-webkit-appearance:none;background:none;border:none;cursor:pointer;\n"
    "    color:var(--parch);font-family:inherit;font-size:16px;line-height:1;opacity:.75}\n"
    "  #skin #skX:hover,#wall #wallX:hover{opacity:1}\n"
    "  #skin #skX:focus-visible,#wall #wallX:focus-visible{outline:2px solid var(--gold-b);outline-offset:2px}\n"
    "  #wall h3{display:flex;align-items:center;gap:8px}\n",
    guard="  #skin #maskLook{display:flex;flex-direction:column;gap:9px}")

src = edit(
    src, "the pocket sheet: the mask in a hand",
    "  body.pocket :is(#dock,#mapSel,#wallBtn,#loomBtn,#buildBtn,#minimapWrap,#attention,"
    "#themeBtn,#dayBtn,#layers,#skin,#buildBar){display:none!important}\n",
    "  /* #skin LEAVES THIS LIST AND #themeBtn STAYS ON IT, and that pairing is\n"
    "     the whole answer to \"how do I edit map settings on mobile\". Deleting\n"
    "     both would have put a 330 px panel anchored at right:14px top:96px onto\n"
    "     a 390 px screen, which is why they were hidden in the first place. The\n"
    "     panel gets a real pocket form below instead. #themeBtn is a desk button\n"
    "     anchored at right:356px with nowhere to stand here, so the pocket door\n"
    "     is a cell in the drawer, where every other way in already lives. */\n"
    "  body.pocket :is(#dock,#mapSel,#wallBtn,#loomBtn,#buildBtn,#minimapWrap,#attention,"
    "#themeBtn,#dayBtn,#layers,#buildBar){display:none!important}\n"
    "  /* THE SHEET, and it is the one this document already uses: #panel,\n"
    "     #moduleCard and #pdrawer all hinge off the bottom edge on the same\n"
    "     300 ms curve. Following it costs nothing and means a person who has\n"
    "     opened one of those has already learned this one.\n"
    "     THE FLOOR CLEARS #pbar AND THE HOME INDICATOR. The bottom bar is 60 px\n"
    "     plus its own safe-area padding and sits at z-index 60; a sheet whose\n"
    "     last row ends under it is the same defect as the tail under the\n"
    "     taskbar, one screen smaller. */\n"
    "  body.pocket #skin{display:flex;position:fixed;left:0;right:0;top:auto;bottom:-104%;\n"
    "    width:auto;height:80%;max-height:none;z-index:59;\n"
    "    border:none;border-top:2px solid #8a6a33;border-radius:16px 16px 0 0;\n"
    "    padding:12px 16px calc(78px + env(safe-area-inset-bottom));\n"
    "    overflow-y:auto;overscroll-behavior:contain;\n"
    "    transition:bottom .3s cubic-bezier(.2,.8,.3,1)}\n"
    "  body.pocket #skin.show{bottom:0}\n"
    "  /* Every control in the sheet is a thumb target, including the ones the\n"
    "     desk draws at 26 px. */\n"
    "  body.pocket #skin .srow{min-height:44px}\n"
    "  body.pocket #skin .srow input[type=color]{width:52px;height:34px}\n"
    "  body.pocket #skin .srow input[type=range],body.pocket #skin .customrow input[type=range]{height:34px}\n"
    "  body.pocket #skin .swb,body.pocket #skin .chip,body.pocket #skin .swatchbtn{min-height:44px}\n"
    "  body.pocket #skin select{min-height:44px}\n"
    "  @media (prefers-reduced-motion:reduce){body.pocket #skin{transition:none}}\n",
    guard="  body.pocket #skin.show{bottom:0}")

# ================================================ 4. THE ONE ROOM: THE MARKUP

src = edit(
    src, "the one door, named for what it opens",
    "<button id=\"themeBtn\">✦ Theme</button>\n",
    "<!-- ONE DOOR. It used to open #themePanel and only that; it opens the whole\n"
    "     room now. The name changed with it: \"Theme\" described a third of what is\n"
    "     behind it, and the panel behind it is about how the village looks to the\n"
    "     person pressing it. -->\n"
    "<button id=\"themeBtn\">✦ Your view</button>\n",
    guard="<button id=\"themeBtn\">✦ Your view</button>")

src = edit(
    src, "the theme list stands down so one picker carries both names",
    "  <h4>Map themes · your land, your language</h4>\n"
    "  <div id=\"themeList\"></div>\n",
    "  <!-- The theme picker moved to #skTheme, which now renders these same rich\n"
    "       swatches and carries BOTH class names, so this host is gone and\n"
    "       `.swatchbtn` resolves to exactly one set of buttons again. -->\n",
    guard="  <!-- The theme picker moved to #skTheme, which now renders these same rich")

src = edit(
    src, "the second size dial steps aside",
    "  <div class=\"customrow\"><span style=\"width:44px;font-size:10px;color:#b9af8f;"
    "font-variant:small-caps\">scale</span><input type=\"range\" id=\"gScale\"",
    "  <div class=\"customrow\" data-dup=\"1\"><span style=\"width:44px;font-size:10px;color:#b9af8f;"
    "font-variant:small-caps\">scale</span><input type=\"range\" id=\"gScale\"",
    guard="<div class=\"customrow\" data-dup=\"1\"><span style=\"width:44px;font-size:10px;color:#b9af8f;"
          "font-variant:small-caps\">scale</span><input type=\"range\" id=\"gScale\"")

src = edit(
    src, "the header says whose view this is, and carries the way out",
    " <h3>✂ Make this map yours</h3>\n"
    " <div class=\"sub\">The map's page of <b>Make This Yours</b>. Blank keeps Amora's answer "
    "as the suggestion; whatever you set here travels with the map.</div>\n",
    " <h3>✦ Your view of the village"
    "<button id=\"skX\" type=\"button\" aria-label=\"Close\">✕</button></h3>\n"
    " <!-- THE FIRST SENTENCE IS THE DESIGN LAW. \"This is just a mask how people\n"
    "      prefer to look at their village.\" A person opening this needs to know\n"
    "      before they touch anything that they cannot break the village with it,\n"
    "      and the sentence has to feel like an invitation instead of a notice. -->\n"
    " <div class=\"sub\">Everything here changes how the map looks to you, and to nobody else. "
    "The land, the buildings and the boundaries stay exactly where they are.</div>\n"
    " <div class=\"srow\"><span class=\"slbl\">building size</span>"
    "<input type=\"range\" id=\"skGS\" min=\"50\" max=\"300\" value=\"100\">"
    "<b id=\"skGSV\" style=\"font-weight:normal;font-size:11px;width:36px;text-align:right\">100%</b></div>\n",
    guard=" <div class=\"srow\"><span class=\"slbl\">building size</span>")

src = edit(
    src, "the theme panel's host, under the theme picker it belongs with",
    " <div class=\"srow\"><span class=\"slbl\">land theme</span>"
    "<span class=\"swrow\" id=\"skTheme\"></span></div>\n",
    " <div class=\"srow\"><span class=\"slbl\">land theme</span>"
    "<span class=\"swrow\" id=\"skTheme\"></span></div>\n"
    " <!-- WHERE THE THEME PANEL LANDS, and the position is the merge. Its icon\n"
    "      styles, terrain chips, paint dials, palette and the words field belong\n"
    "      directly under the theme picker, because they are the same decision\n"
    "      made in more detail. The dressing rows below it stay below it. -->\n"
    " <div id=\"maskLook\"></div>\n",
    guard=" <div id=\"maskLook\"></div>")

src = edit(
    src, "the size dial leaves its old place in the middle of the list",
    " <div class=\"srow\"><span class=\"slbl\">map scale</span><input type=\"range\" id=\"skGS\" "
    "min=\"50\" max=\"300\" value=\"100\"><b id=\"skGSV\" style=\"font-weight:normal;font-size:11px;"
    "width:36px;text-align:right\">100%</b></div>\n",
    " <!-- The size dial moved to the top of the panel, above the fold on a phone.\n"
    "      It is the control the founder asked for by name and it was the\n"
    "      eleventh row. -->\n",
    guard=" <!-- The size dial moved to the top of the panel, above the fold on a phone.")

for _label, _row in [
    ("words", " <div class=\"srow\"><span class=\"slbl\">your land, in words</span>"),
    ("icon style", " <div class=\"srow\"><span class=\"slbl\">icon style</span>"),
    ("paint brush", " <div class=\"srow\"><span class=\"slbl\">paint brush</span>"),
    ("paint palette", " <div class=\"srow\"><span class=\"slbl\">paint palette</span>"),
    ("terrain", " <div class=\"srow\"><span class=\"slbl\">terrain</span>"),
]:
    _new = _row.replace("<div class=\"srow\">", "<div class=\"srow\" data-dup=\"1\">")
    src = edit(src, "the duplicate %s row steps aside" % _label, _row, _new, guard=_new)

src = edit(
    src, "the village's own words are marked as the village's",
    " <div class=\"srow\" style=\"align-items:flex-start\"><span class=\"slbl\">zone words</span>",
    " <!-- EVERYTHING BELOW HERE IS THE SHARED RECORD, and a member never sees it.\n"
    "      Renaming a zone, a flow type or a phase changes the words on everyone's\n"
    "      map, which is a builder's act by the same law that keeps buildings and\n"
    "      boundaries in build mode. -->\n"
    " <div class=\"srow vhead\" data-village=\"1\"><b>The village's own words</b>"
    "<small>These are the shared record. Saving them changes what everyone sees.</small></div>\n"
    " <div class=\"srow\" data-village=\"1\" style=\"align-items:flex-start\">"
    "<span class=\"slbl\">zone words</span>",
    guard=" <div class=\"srow vhead\" data-village=\"1\"><b>The village's own words</b>")

for _label in ("flow types", "phase names"):
    _row = (" <div class=\"srow\" style=\"align-items:flex-start\">"
            "<span class=\"slbl\">%s</span>" % _label)
    _new = _row.replace("<div class=\"srow\" style=", "<div class=\"srow\" data-village=\"1\" style=")
    src = edit(src, "the %s row is the village's" % _label, _row, _new, guard=_new)

src = edit(
    src, "the stale note about where the paint dials live",
    " <div class=\"srow\" style=\"font-size:10px;color:#8f855f\">painterly brush &amp; palette dials "
    "live under the terrain switch; they save into the same skin</div>\n",
    " <!-- The note that used to stand here sent a person to a second set of paint\n"
    "      dials under the terrain switch. There is one set now, it sits under the\n"
    "      terrain chips in this same panel, and it appears only when there is\n"
    "      paint on the land. -->\n",
    guard=" <!-- The note that used to stand here sent a person to a second set of paint")

src = edit(
    src, "the Wall gets a way out",
    "<div id=\"wall\"><h3>Get Involved · find somewhere to help</h3><div id=\"wallList\" ></div></div>\n",
    "<div id=\"wall\"><h3>Get Involved · find somewhere to help"
    "<button id=\"wallX\" type=\"button\" aria-label=\"Close\">✕</button></h3>"
    "<div id=\"wallList\" ></div></div>\n",
    guard="<button id=\"wallX\" type=\"button\" aria-label=\"Close\">")

src = edit(
    src, "the dock button stops borrowing the panel's name",
    " <button data-m=\"admin\" data-tip=\"Make this map yours. Theme, accent, labels, mist. "
    "· /admin?tab=setup\"></button>\n",
    " <!-- This opens Village Settings on the site, so it says Village Settings.\n"
    "      It carried the panel's name and its four field names while opening\n"
    "      something else, which is how one room came to have three doors. -->\n"
    " <button data-m=\"admin\" data-tip=\"Village Settings. The village's own colours and words, "
    "the record every view is drawn from. · /admin?tab=setup\"></button>\n",
    guard="data-tip=\"Village Settings. The village's own colours and words,")

# ================================================== 5. THE ONE ROOM: THE CODE

src = edit(
    src, "the theme list host is gone, so its builder stands down",
    "(function(){const list=$('themeList');\n",
    "/* The rich swatches this built now come out of renderSkinThemes(), into the\n"
    "   merged panel's own theme row, so this host no longer exists and this\n"
    "   block stands down. Kept rather than deleted because a scene published\n"
    "   before the merge can still be opened in a file that has it. */\n"
    "(function(){const list=$('themeList');if(!list)return;\n",
    guard="(function(){const list=$('themeList');if(!list)return;")

src = edit(
    src, "one button, one room",
    "$('themeBtn').onclick=()=>$('themePanel').classList.toggle('show');\n",
    "/* ONE ROOM, REACHED FROM ONE BUTTON. #themePanel is moved inside #skin the\n"
    "   first time either is opened, and the two `show` classes are kept in step\n"
    "   from here on so that anything still asking whether the theme panel is\n"
    "   open gets a true answer about the room it now lives in. */\n"
    "$('themeBtn').onclick=()=>toggleMask();\n",
    guard="$('themeBtn').onclick=()=>toggleMask();")

src = edit(
    src, "syncPaintTools: the paint dials answer to the paint",
    "  $('paintCtl').style.display=(terrainMode==='paint'&&paintReady)?'flex':'none';\n",
    "  syncPaintTools();\n",
    guard="  syncPaintTools();\n  toast(terrainMode==='sat'")

src = edit(
    src, "the paint dials appear the moment there is paint",
    "    paintReady=true;buildPaintMix();\n",
    "    paintReady=true;buildPaintMix();\n"
    "    /* The tools were revealed by the terrain click handler and nowhere else,\n"
    "       so the answer was read once, at click time. A bake finishing after the\n"
    "       switch was thrown left the dials hidden with paint on the land. This\n"
    "       block is in an earlier <script> than syncPaintTools, so it is reached\n"
    "       through window and guarded; the terrain switch syncs anyway. */\n"
    "    if(window.syncPaintTools)window.syncPaintTools();\n",
    guard="    if(window.syncPaintTools)window.syncPaintTools();")

src = edit(
    src, "the merged room, its host, and the one set of paint dials",
    "function openSkin(){$('skin').classList.add('show');renderSkinThemes()}\n"
    "window.openSkin=openSkin;\n",
    "/* THE ONE PLACE THE PAINT DIALS ARE ANSWERED. Called from the terrain\n"
    "   switch, from the moment a bake completes, and once at boot, so the\n"
    "   question is asked wherever either half of the answer can change.\n"
    "   The `painted` OPTION goes with them: offering a terrain the file cannot\n"
    "   draw yet is the same defect one step earlier, and #tmPaint already hid\n"
    "   itself for exactly this reason. */\n"
    "function syncPaintTools(){\n"
    "  const ready=(typeof paintReady!=='undefined')&&paintReady;\n"
    "  const on=ready&&(typeof terrainMode!=='undefined')&&terrainMode==='paint';\n"
    "  const pc=$('paintCtl');if(pc)pc.style.display=on?'flex':'none';\n"
    "  const tp=$('tmPaint');if(tp)tp.style.display=ready?'':'none';\n"
    "  const st=$('skTerr'),op=st&&st.querySelector('option[value=\"paint\"]');\n"
    "  if(op)op.hidden=!ready}\n"
    "window.syncPaintTools=syncPaintTools;\n"
    "/* THE MASK: what one person prefers to see, kept in their own browser.\n"
    "   R53, in the founder's words: \"this is just a mask how people prefer to\n"
    "   look at their village\". It is not the village's skin, it is never\n"
    "   published, and it never becomes an entry in the shared edit log. */\n"
    "const MASK_KEY='amora-map-mask';\n"
    "function maskRead(){try{return JSON.parse(localStorage.getItem(MASK_KEY)||'{}')||{}}catch(_){return{}}}\n"
    "function maskWrite(p){try{const m=maskRead();Object.assign(m,p);\n"
    "  localStorage.setItem(MASK_KEY,JSON.stringify(m))}catch(_){}}\n"
    "window.maskRead=maskRead;window.maskWrite=maskWrite;\n"
    "/* ONE ROOM. The move is a single appendChild and it is what makes merging a\n"
    "   panel into another panel safe in a file this size: every control keeps\n"
    "   the element it was built on, the listener that was bound to it and the\n"
    "   state it holds. Nothing is re-implemented, so nothing can disagree. */\n"
    "function maskMount(){const h=$('maskLook'),tp=$('themePanel');\n"
    "  if(h&&tp&&tp.parentNode!==h)h.appendChild(tp);return h}\n"
    "function openMask(){maskMount();\n"
    "  /* ONE SHEET AT A TIME, the rule #help already keeps: the drawer, the help\n"
    "     sheet and this all hang off the same 60 px bar on a 390 px screen, and\n"
    "     a control underneath another sheet is a control nobody can press. */\n"
    "  if(document.body.classList.contains('pocket')){\n"
    "    const dr=$('pdrawer');if(dr)dr.classList.remove('open');\n"
    "    if(window.closeHelp)closeHelp();\n"
    "    document.body.classList.remove('msheet')}\n"
    "  $('skin').classList.add('show');\n"
    "  const tp=$('themePanel');if(tp)tp.classList.add('show');\n"
    "  renderSkinThemes();syncPaintTools();\n"
    "  if(window.hap)hap(8)}\n"
    "function closeMask(){$('skin').classList.remove('show');\n"
    "  const tp=$('themePanel');if(tp)tp.classList.remove('show')}\n"
    "function toggleMask(){$('skin').classList.contains('show')?closeMask():openMask()}\n"
    "window.openMask=openMask;window.closeMask=closeMask;window.toggleMask=toggleMask;\n"
    "/* The old name is the one the module card and verify_doors call. */\n"
    "function openSkin(){openMask()}\n"
    "window.openSkin=openSkin;\n",
    guard="function maskMount(){const h=$('maskLook'),tp=$('themePanel');")

src = edit(
    src, "the rich swatches move into the merged panel's theme row",
    "function renderSkinThemes(){$('skTheme').innerHTML=Object.values(THEMES).map(t=>\n"
    "  `<button class=\"swb${THEME.label===t.label?' on':''}\" data-t=\"${t.label}\">${t.label}</button>`).join('');\n",
    "/* THE ONE THEME PICKER, carrying both panels' markup and both their class\n"
    "   names. The merged room had two: plain buttons here and richer swatches\n"
    "   with colour dots and a description in the theme panel. This row keeps the\n"
    "   dots and the description, and keeps `swb` AND `swatchbtn` AND `data-t` AND\n"
    "   `data-k`, so applyTheme's on-flag sweep, the door suite's\n"
    "   `#skTheme .swb[data-t=...]` and the matrix's `.swatchbtn:nth-of-type(N)`\n"
    "   all still land on the same buttons. */\n"
    "function renderSkinThemes(){const h=$('skTheme');if(!h)return;\n"
    "  h.innerHTML=Object.values(THEMES).map(t=>\n"
    "  `<button class=\"swb swatchbtn${THEME.label===t.label?' on':''}\" data-t=\"${t.label}\" "
    "data-k=\"${t.label}\">`+\n"
    "  `<span class=\"dots\"><i style=\"background:${t.v['--t-surface']}\"></i>`+\n"
    "  `<i style=\"background:${t.v['--t-ring']}\"></i>`+\n"
    "  `<i style=\"background:${t.v['--t-accent']}\"></i></span>`+\n"
    "  `<span><b>${t.label}</b><small>${t.sub}</small></span></button>`).join('');\n",
    guard="function renderSkinThemes(){const h=$('skTheme');if(!h)return;")

src = edit(
    src, "the build-bar chip and the panel's own close take the one path",
    "$('skinBtn').onclick=()=>$('skin').classList.toggle('show')&&renderSkinThemes()||renderSkinThemes();\n"
    "$('skClose').onclick=()=>$('skin').classList.remove('show');\n",
    "/* A builder already in build mode keeps a chip to the same room. Two doors\n"
    "   to one panel is the fix; three doors to two panels was the complaint. */\n"
    "$('skinBtn').onclick=()=>toggleMask();\n"
    "$('skClose').onclick=()=>closeMask();\n"
    "if($('skX'))$('skX').onclick=()=>closeMask();\n",
    guard="if($('skX'))$('skX').onclick=()=>closeMask();")

# =========================================== 6. THE SIZE DIAL THAT KEEPS

src = edit(
    src, "the size dial is personal, and it keeps",
    "  mmDirty=true;if(!quiet)logEdit('skin','map',{global_scale:v/100})}\n",
    "  /* THE MASK, NOT THE RECORD. Every drag of this used to write an entry in\n"
    "     the village's shared edit log and nothing at all in the browser, so a\n"
    "     personal preference became a shared fact AND was thrown away on reload.\n"
    "     R53 says this dial changes how big the houses look TO YOU. It is kept\n"
    "     in this browser and it is kept for good. The village's own skin export\n"
    "     still carries global_scale untouched, because publishing a skin is a\n"
    "     different act from a person choosing how big to see the houses. */\n"
    "  mmDirty=true;if(!quiet&&window.maskWrite)maskWrite({scale:v})}\n",
    guard="  mmDirty=true;if(!quiet&&window.maskWrite)maskWrite({scale:v})}")

src = edit(
    src, "the mask is put back on at boot",
    "$('skGS').oninput=()=>setGScale(+$('skGS').value,true);\n"
    "$('skGS').onchange=()=>setGScale(+$('skGS').value);\n",
    "$('skGS').oninput=()=>setGScale(+$('skGS').value,true);\n"
    "$('skGS').onchange=()=>setGScale(+$('skGS').value);\n"
    "/* PUT THE MASK BACK ON. Quiet, so restoring what this browser already chose\n"
    "   is not itself recorded as a choice. Clamped to the dial's own range so a\n"
    "   hand-edited or corrupted value cannot leave somebody on a map they cannot\n"
    "   read and cannot fix. */\n"
    "(function maskBoot(){const m=maskRead();\n"
    "  const v=Math.round(+m.scale);\n"
    "  if(v>=50&&v<=300&&v!==100)setGScale(v,true);\n"
    "  syncPaintTools()})();\n",
    guard="(function maskBoot(){const m=maskRead();")

# ================================================== 7. THE WAYS OUT

src = edit(
    src, "Escape closes the room and the Wall from anywhere",
    "  if(k==='Escape'){$('panel').classList.remove('open');panelKey=null;$('module').classList.remove('show');"
    "$('attnCard').classList.remove('show');closeInspect();$('resolver')&&$('resolver').classList.remove('show')}\n",
    "  /* The merged panel and the Wall join the line. Both could be opened and\n"
    "     neither could be closed by the key every other pane answers to; the\n"
    "     theme panel had no close control of any kind. This handler returns\n"
    "     early on INPUT, TEXTAREA and SELECT twenty lines up, so Escape while\n"
    "     somebody is typing a theme into the panel never reaches here. */\n"
    "  if(k==='Escape'){$('panel').classList.remove('open');panelKey=null;$('module').classList.remove('show');"
    "$('attnCard').classList.remove('show');closeInspect();$('resolver')&&$('resolver').classList.remove('show');"
    "window.closeMask&&closeMask();$('wall')&&$('wall').classList.remove('show')}\n",
    guard="window.closeMask&&closeMask();$('wall')&&$('wall').classList.remove('show')}")

src = edit(
    src, "the Wall's own close is wired",
    "$('wallBtn').onclick=()=>{$('wall').classList.toggle('show');buildWall()};\n",
    "$('wallBtn').onclick=()=>{$('wall').classList.toggle('show');buildWall()};\n"
    "if($('wallX'))$('wallX').onclick=()=>$('wall').classList.remove('show');\n",
    guard="if($('wallX'))$('wallX').onclick=()=>$('wall').classList.remove('show');")

# ================================================== 8. THE POCKET DOOR

src = edit(
    src, "the pocket drawer opens the room",
    "    <button class=\"pcell\" data-pa=\"exit\">⏏ <span>Leave the map</span></button></div>\n"
    "   <div style=\"font-size:10px;color:#8f855f;margin-top:10px\">building and rewiring live on the "
    "desktop map. Here the land is yours to wander.</div>`;\n",
    "    <button class=\"pcell\" data-pa=\"mask\">✦ <span>Your view</span></button>\n"
    "    <button class=\"pcell\" data-pa=\"exit\">⏏ <span>Leave the map</span></button></div>\n"
    "   <div style=\"font-size:10px;color:#8f855f;margin-top:10px\">the look of the map is yours to set "
    "here. Building and rewiring live on the desktop map.</div>`;\n",
    guard="<button class=\"pcell\" data-pa=\"mask\">✦ <span>Your view</span></button>")

src = edit(
    src, "the pocket drawer's door is answered",
    "    if(a==='exit')exitMap()})}\n",
    "    if(a==='mask')openMask();\n"
    "    if(a==='exit')exitMap()})}\n",
    guard="    if(a==='mask')openMask();")

# ================================================== 9. THE WORDS ON THE TIPS

src = edit(
    src, "the tips follow the room",
    "    themeBtn:'Themes, icon styles, terrain and the one big scale dial.'};\n",
    "    skX:'Close this and go back to the land.',\n"
    "    wallX:'Close this and go back to the land.',\n"
    "    themeBtn:'How the village looks to you. Size, theme, terrain and the words on the land.'};\n",
    guard="    themeBtn:'How the village looks to you. Size, theme, terrain and the words on the land.'};")

src = edit(
    src, "the size dial's tip says whose it is",
    "    skGS:'Everything larger or smaller together. Icons and their names move as one.',\n",
    "    skGS:'How large the buildings stand on your screen. Yours alone, and it keeps.',\n",
    guard="    skGS:'How large the buildings stand on your screen. Yours alone, and it keeps.',")

if APPLIED:
    save(src)

print("\npatch_r5_mask: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
