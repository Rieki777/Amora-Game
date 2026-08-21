#!/usr/bin/env python3
r"""
L8 / R16 — TWO THINGS R14 SHIPPED WRONG, both found by a reviewer, both closed
here with a gate that goes red when the fix is removed.

-------------------------------------------------------------------------- 1
A STORED-XSS SINK IN renderHelp, IN THE ONE FIELD THE COMMENT ABOVE IT
PROMISED WAS SAFE.

R14's header said "Every value that reaches the reader goes through escq". It
was true of six of the seven. `t.replies` went into innerHTML raw:

    +escq(t.author)+' · '+t.replies+' replies · '+escq(t.last)+' ago · '

In the seed `replies` is an integer, which is why it read as safe and why every
manual pass over the sheet looked clean. It stops being an integer the moment a
scene is restored. restoreScene (:4971) maps it straight across at :5001:

    replies:t.replies||0

`||0` only replaces a FALSY value, so any non-empty string survives whole. Three
callers feed restoreScene a scene a stranger can author: the autosaved scene
(:5040), a draft restore (:6213), and a scene pushed over the shell bridge
(:6229). So the payload is stored, and it runs on every open of the sheet from
then on, not once.

MEASURED, through restoreScene and a real touch tap on #pbAttn at 390x844,
before this patch:

    replies = '<img src=x onerror="window.__XSS=1">'
    -> #help contains 1 injected <img>, window.__XSS === 1
    -> the sheet renders "· replies ·" with the payload GONE from the text

After: 0 injected nodes, __XSS undefined, and the payload is on screen as the
literal text it always was.

THE RULE THE ESCAPING LANE SET, applied here without inventing a variant:
element text and double-quoted attributes take escq; escj is for a JS string
inside a handler and this sheet writes no handler, which is the whole reason it
was built from data-* attributes and one delegated listener. escq is escape-only
(& < "), so an identifier written into data-id / data-at / data-item comes back
out of `dataset` BYTE-IDENTICAL and the deep link addresses the thread the
reader tapped. No normaliser is added and none may be: normalising the id would
silently address a different thread. The gate asserts the round trip byte for
byte rather than trusting that reading.

-------------------------------------------------------------------------- 2
A LAYOUT REGRESSION ON A PHONE IN LANDSCAPE, CAUSED BY THIS LANE.

MEASURED through the real button, intro dismissed, walk card up as it is for
every first-time reader:

  844x390  #help 164..328   #walkCard  41..184   overlap 20px   overflow 22
  851x393  #help 166..331   #walkCard  41..184   overlap 18px   overflow 20
  667x375  #help 156..313   #walkCard  41..184   overlap 28px   overflow 31
  740x360  #help 147..298   #walkCard  41..184   overlap 37px   overflow 39
  390x844  #help 420..774   #walkCard 250..412   overlap  0     overflow  0

#walkCard is z-index 58 and #help is 57, so the overlap paints the walk card
OVER the sheet the reader just summoned: at 844x390 the word HELP, the subtitle
and the ✕ close button are all under the welcome card. The screenshot is
qa/.qa-out/help-LAND-844x390.png.

THE CAUSE IS THE CAP, NOT THE BAND. `max-height:42vh` is a fraction of the whole
screen, and in landscape the whole screen is the short edge: 42vh of 390 is
164px while the room between the tab bar and the vitals bar, after the walk
card has taken 143 of it, is 142. The band did exactly what it says it does —
clamped so nothing left the screen, accepted overlap, and reported the shortfall
in body[data-band-overflow] — and this lane shipped the tenant that made it
report.

THE FIX IS TO MEASURE THE ROOM INSTEAD OF GUESSING IT. A tenant may now name a
second property, `max`, and the band publishes how much room that tenant may
take. It publishes, it does not apply: #help keeps 42vh as the var() fallback,
so a dead band block leaves the sheet the size it has always been.

IT CANNOT CHASE ITSELF, and that was the thing to get right. The room is
computed from the OTHER tenants only, so shrinking #help cannot change the
number that shrank it: the pass after the shrink writes the same value, BAND_SIG
is unchanged, and no event fires. It settles in two passes. In portrait the
number is ~562px against a 354px cap, so min() picks 42vh and every byte of that
band is what it was before this patch.

-------------------------------------------------------------------------- 3
WHAT THIS PATCH DOES NOT CLOSE, measured rather than assumed, so the next lane
inherits a number instead of a hunch.

RE-DERIVED ON THE CURRENT BASE. Every line number in this file was re-grepped
after the rebase onto def4b18 and two were wrong: restoreScene's replies map is
:5001 (it was cited as :4998, which lands on questKey), and the vital dropdown's
tap-away that patch_h8_2's shipped comment points at is :5738, not :5283, which
lands on SITE_ROUTES. Both are corrected. The three below re-grepped clean.

THE SAME ESCAPING DEFECT IS LIVE ON THREE OTHER SURFACES, and they are older
than this lane. `t.title`, `t.author`, `t.replies` and `t.last` go into
innerHTML raw at :3485 (the place panel Overview .cvrow, whose data-item and
onclick are unescaped attributes as well), :5154 (the Loom .lcard, likewise
data-conn) and :5375 (the door sample .mrow). All three read the same
SCENE.threads this sheet reads, so the same stored payload reaches them.
Driven one surface per page through openPanel / openLoom / openDoor, with the
scene planted through restoreScene, each renders 4 injected nodes and fires
onerror 4 times; the help sheet renders 0 and fires 0. qa/_probe_thread_sinks.js
is that measurement. Fixing them is one escq per field, but they belong to three
other surfaces and each needs its own gate, so this lane reports rather than
reaches.

A FOURTH SURFACE, FOUND BY THE GATE'S OWN MUTATION RUN, takes a PLACE NAME
rather than a thread field. bannerHTML (:3151) interpolates `${s.name}` into a
template string and makeBanner writes it with innerHTML, so restoreScene alone
injects and fires it before any sheet is opened — measured at 1 node, 1 fire,
with #help contributing 0. The help sheet escapes the same name correctly, and
that is now asserted: §1 plants a sixth payload through map_structures because
unescaping `escq(nameOf(k))` had been passing all 288 checks silently. The gate
counts per payload rather than document-wide so it stays red about this lane and
not about the banner.

A FIFTH IS NOT AN ESCAPING BUG BUT A JS-STRING BREAKOUT, on the very surface
R15 made a band tenant. :5690 builds the vital dropdown's Claim button as
    onclick="claimQuest('${escq(q2.q)}','…')">⚑ Claim: ${q2.q}
escq escapes & < " and NOT the apostrophe, so it is right for the double-quoted
attribute and wrong for the single-quoted JS string inside it; the button's own
text takes no escaping at all. Quest titles arrive through the same restoreScene.
MEASURED through the real dropdown opened by a real tap, with a title of
    harvest',''),window.__BREAK=1,claimQuest('x
the rendered attribute is
    claimQuest('harvest',''),window.__BREAK=1,claimQuest('x','Greenhouse & Gardens');…
and pressing the button sets window.__BREAK to 1 with no page error.
qa/_probe_vdrop_claim.js is that measurement. THE RIGHT TOOL DOES NOT EXIST HERE:
escj is nowhere in this artifact, so closing it means either introducing that
primitive or rebuilding the button on data-* and a delegated listener the way
this sheet is built. Either is another lane's surface and another lane's gate.

THE TOP BAND STILL LOSES THE BOTTOM OF THE VITAL DROPDOWN ON TWO LANDSCAPE
PHONES. Opening #vdrop raises the top band's ceiling by its own 147px, the
bottom band's limit is innerHeight minus that ceiling, and the walk card gets
clamped up under the open dropdown. The `max` mechanism above cannot reach it:
the top band's limit is innerHeight, so the room it would publish is the whole
screen. This lane improves every measured overlap and closes two of them
outright (base 16/13/31/46 at 844x390 / 851x393 / 667x375 / 740x360, lane
1/0/16/31) and §5 of the gate ratchets those base numbers as a ceiling, so it
cannot get worse. Closing it means letting the two edges solve for each other in
one pass, which is a change to machinery every overlay in the app sits on.

ONE LANDSCAPE SCREEN IS SHORTER THAN THE ROOM THIS SHEET NEEDS, and the sweep
now covers it rather than stopping above it. At 568x320 — an iPhone SE held
sideways — the bottom band's whole room is 279px, the walk card takes 143 of it,
and the 72px the band publishes for this sheet is exactly its own head plus its
own footer, so the list seats nothing. The sheet is on screen and uncovered:
title, close button and Get Involved all pass the hit tests. It is NOT a
regression — on the pristine base that button opened #attnCard, which body.pocket
hides outright, so that screen showed nothing at all — and both ways out were
measured and are worse: a CSS floor puts 44px of the sheet back under the z-58
walk card, which is the regression this patch was raised on, and giving the walk
card a `max` of its own makes two shrinking tenants measure each other, which is
the oscillation the one-shrinker rule exists to prevent. §4b of the gate pins it
as the ONLY such screen, and goes red if a second joins it.

Re-runnable. Each edit carries its own guard; a second run is all skips and
zero bytes changed. Run qa/verify_help_l8.js from docs/prototypes/qa after it,
and check_blocks.mjs FROM docs/prototypes — from the repo root it defaults to a
bare "grounds-v0.html", reads <root>/grounds-v0.html, and exits 1 about a file
that does not exist. `node docs/prototypes/check_blocks.mjs
docs/prototypes/grounds-v0.html` works from anywhere.
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

# ------------------------------------------------------- 1. the XSS sink
# Element text, so escq, exactly like the six fields beside it.
src = edit(
    src,
    "replies is escaped like every other field",
    "+escq(t.author)+' · '+t.replies+' replies · '",
    "+escq(t.author)+' · '+escq(t.replies)+' replies · '",
    guard="+escq(t.replies)+' replies · '",
)

# --------------------------------------- 2. the comment that made the claim
# A comment that lies is how the next lane repeats the defect. This one said
# every value was escaped while one was not, and it is the reason a reviewer
# had to find it rather than a reader of the code.
CLAIM_ANCHOR = """   THE ROWS ARE BUILT WITH DATA ATTRIBUTES AND ONE DELEGATED LISTENER, not with
   inline handlers carrying quest titles and place names into a JS string. Every
   value that reaches the reader goes through escq; nothing needs escaping for a
   handler because no handler is written. That is also why this survives a
   thread titled with an apostrophe, which two of the thirteen have. */"""

CLAIM_NEW = """   THE ROWS ARE BUILT WITH DATA ATTRIBUTES AND ONE DELEGATED LISTENER, not with
   inline handlers carrying quest titles and place names into a JS string, which
   is why no value here needs escj: escj is for a JS string inside a handler and
   no handler is written. Element text and double-quoted attributes take escq.
   escq is ESCAPE-ONLY (& < "), so an identifier written into data-id / data-at /
   data-item comes back out of `dataset` byte-identical and the deep link
   addresses the thread the reader tapped. Normalising an id here would quietly
   address a different thread, so nothing normalises one; verify_help_l8.js
   asserts the round trip byte for byte instead of trusting this sentence.

   ONE FIELD USED TO ESCAPE THIS RULE and the paragraph above used to deny it.
   `t.replies` went into innerHTML raw. It is an integer in the seed and ANY
   STRING after a scene is restored (:5001 maps `replies:t.replies||0`, and `||`
   only replaces a falsy value), fed by the autosave, by a draft restore and by
   a scene pushed over the shell bridge. A hostile village file therefore stored
   script in this feed and ran it on every open of the sheet. It takes escq like
   everything else now, and the gate plants the payload through restoreScene,
   opens the sheet through #pbAttn, and fails if it executes. */"""

src = edit(src, "the escaping comment stops overclaiming", CLAIM_ANCHOR, CLAIM_NEW,
           guard="ONE FIELD USED TO ESCAPE THIS RULE")

# ------------------------------------------- 3. the tenant names its cap
src = edit(
    src,
    "help declares a shrinkable cap",
    "    {id:'help',    v:'--band-b-help'},",
    "    {id:'help',    v:'--band-b-help',max:'--band-b-help-max'},",
    guard="max:'--band-b-help-max'",
)

# ------------------------------------------ 4. the band publishes the room
# Cleared with the rest of a band that is not on this profile, or the sheet
# would keep a cap measured on the profile it is no longer running.
src = edit(
    src,
    "a skipped band clears its caps too",
    "    for(const t of B.tenants)clear.push(t.v);",
    "    for(const t of B.tenants){clear.push(t.v);if(t.max)clear.push(t.max)}",
    guard="if(t.max)clear.push(t.max)}\n    return {set,clear",
)

ROOM_ANCHOR = (
    "  const base=fr?(key==='bottom'?Math.round(innerHeight-fr.top):Math.round(fr.bottom)):0;\n"
    "  let cur=base+pad,lo=null,hi=null,want=base+pad;"
)
ROOM_NEW = (
    "  const base=fr?(key==='bottom'?Math.round(innerHeight-fr.top):Math.round(fr.bottom)):0;\n"
    "  /* ROOM FOR A TENANT THAT CAN SHRINK. A tenant naming `max` is one whose\n"
    "     height is a request rather than a fact, and this publishes how much of\n"
    "     the band it may have. It PUBLISHES, it does not apply: the tenant's CSS\n"
    "     keeps its authored cap as the var() fallback, so a dead band block\n"
    "     leaves it the size it has always been.\n"
    "     MEASURED FROM THE OTHER TENANTS ONLY, and that is the line that stops it\n"
    "     chasing itself. Shrinking the sheet cannot change the number that shrank\n"
    "     it, so the pass after the shrink writes the same value, BAND_SIG is\n"
    "     unchanged and nothing schedules another layout. Two passes and it rests.\n"
    "     WHAT IT FIXES, measured through the real button with the walk card up as\n"
    "     it is for every first-time reader: #help asked for 42vh, which on a\n"
    "     landscape phone is 42% of the SHORT edge, and the walk card placed after\n"
    "     it was clamped down onto the sheet's own head. 844x390 help 164..328 vs\n"
    "     walkCard 41..184, and 20px of the sheet's title, subtitle and close\n"
    "     button sat under a z-58 welcome card; 667x375 lost 28px, 740x360 lost\n"
    "     37px, and body[data-band-overflow] read 22, 31 and 39 against 0 in\n"
    "     portrait. */\n"
    "  const seen=t=>!((t.only==='pocket'&&!pocket)||(t.only==='desk'&&pocket))\n"
    "    &&bandShown(document.getElementById(t.id));\n"
    "  for(const t of B.tenants){\n"
    "    if(!t.max)continue;\n"
    "    if(!seen(t)){clear.push(t.max);continue}\n"
    "    let taken=0;\n"
    "    for(const o of B.tenants)if(o!==t&&seen(o))\n"
    "      taken+=Math.round(document.getElementById(o.id).getBoundingClientRect().height)+gap;\n"
    "    set[t.max]=Math.max(0,limit-base-pad-taken)+'px'}\n"
    "  let cur=base+pad,lo=null,hi=null,want=base+pad;"
)

src = edit(src, "the band publishes a shrinkable tenant's room", ROOM_ANCHOR, ROOM_NEW,
           guard="ROOM FOR A TENANT THAT CAN SHRINK")

# ------------------------------------------------ 5. the sheet reads the room
# min(), so the smaller of the two wins and the authored cap still governs every
# screen with room to spare: in portrait the published number is ~562px against
# a 354px cap, and that band is byte-identical to what it was.
src = edit(
    src,
    "the sheet caps against the room it was given",
    "z-index:57;display:none;flex-direction:column;max-height:42vh;",
    "z-index:57;display:none;flex-direction:column;max-height:min(42vh,var(--band-b-help-max,42vh));",
    guard="max-height:min(42vh,var(--band-b-help-max,42vh))",
)

if APPLIED:
    save(src)

print("\npatch_h8_3: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
