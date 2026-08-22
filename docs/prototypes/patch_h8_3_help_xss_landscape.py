#!/usr/bin/env python3
r"""
L8 / R16 — TWO THINGS R14 SHIPPED WRONG, both found by a reviewer, both closed
here with a gate that goes red when the fix is removed.

-------------------------------------------------------------------------- 1
renderHelp's escq(t.replies) IS HYGIENE, NOT A VULN FIX — RE-STATED ONTO #29.

An earlier version of this patch (derived against def4b18 / #19) claimed a live
stored-XSS sink here: `t.replies` went into innerHTML raw as

    +escq(t.author)+' · '+t.replies+' replies · '+escq(t.last)+' ago · '

and the argument was that restoreScene mapped it straight across (`replies:
t.replies||0`, `||0` only replacing a falsy value), so a non-empty string a
stranger authored would survive whole and run on every open of the sheet.

THAT CLAIM DOES NOT HOLD ON THIS BASE. The lane's real parent is #29, which
coerces the field at restore. restoreScene (:5089) maps

    replies:Number(t.replies)||0

so a string a restored scene carries in `replies` comes back a NUMBER, and the
door surfaces #29 hardened (cvrow/loom/mrow) all read it after that coercion.
There is no reachable stored-XSS through replies on this surface. The one-line
edit below wrapping it in escq is kept only as harmless hygiene over a value
that is already numeric; the gate asserts the coercion (restoreScene returns a
number), and does NOT sell this escape as a fix for a sink that is not open.

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
WHAT THIS PATCH DOES NOT CLOSE. Two LAYOUT limitations remain, pinned below. The
SECURITY half of this section is WITHDRAWN: an earlier draft, derived against
def4b18 / #19, listed five open escaping sinks and told the next lane to chase
them. The lane's real parent is #29, which already closed every one. The true
reachable count through these surfaces is 0. They are recorded here only so the
next lane does not go looking for a fix that already shipped.

WITHDRAWN, AND VERIFIED CLOSED ON #29 (do not chase these):
  - the three thread surfaces — cvrow (:3497), the Loom .lcard (:5241) and the
    door .mrow (:5493): #19 read t.title/author/replies/last as raw innerHTML;
    #29 wraps each in escq, so all three render the payload as literal text and
    inject nothing.
  - the map banner: #19 read bannerHTML's `${s.name}` as raw; #29 wraps it in
    escq(s.name) (:3163), so restoreScene injects no node there. §1 now RATCHETS
    that as a control — its pre-tap place-node count must stay 0, and the x10
    mutant proves it reds if #29's banner escq is ever reverted.
  - the vital dropdown's Claim button: #19 read it as
    claimQuest('${escq(q2.q)}', ...) with escq (the wrong tool for a
    single-quoted JS string) and the button text as raw. #29 rebuilt it (:5957)
    as claimQuest('${escj(q2.q)}', ...) with escj — the correct JS-string escape
    — and the text as escq(q2.q). escj exists throughout this artifact now, so
    the old "the right tool does not exist here" note is stale as well.
  replies itself is coerced to a number at restore (:5089), so it is not a
  string sink on any of these surfaces. The probes kept beside this file
  (_probe_thread_sinks.js, _probe_vdrop_claim.js) measured these on #19 and are
  retained only as history; run against this base they read 0 injected and no
  breakout.

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

   ONE FIELD, AND WHY ITS escq IS ONLY HYGIENE HERE. `t.replies` is an integer in
   the seed. An earlier draft of this comment claimed it was a live stored-XSS
   sink because restoreScene "maps replies:t.replies||0" and `||` only replaces a
   falsy value, so any non-empty string would survive. That is NOT true on this
   base: #29 coerces the field at import — :5089 maps `replies:Number(t.replies)||0`
   — so a string a restored scene carries here comes back a number, and the door
   surfaces #29 hardened (cvrow/loom/mrow) read it after that same coercion. The
   security claim is therefore withdrawn: there is no reachable stored-XSS through
   replies on this surface. escq(t.replies) below is kept as harmless hygiene over
   a value that is already numeric, not as a fix for a live sink, and the gate
   asserts the coercion (restoreScene returns a number) rather than selling this
   escape as a vuln fix it is not. */"""

src = edit(src, "the escaping comment states the coercion, not a vuln fix", CLAIM_ANCHOR, CLAIM_NEW,
           guard="ONE FIELD, AND WHY ITS escq IS ONLY HYGIENE HERE")

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
