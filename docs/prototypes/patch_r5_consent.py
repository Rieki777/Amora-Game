#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / CONSENT - THE CAMERA MOVES ONLY WHEN A PERSON ASKED IT TO.

THE FOUNDER'S WORDS: "we now need to clear the auto-movement that Maia is trying
to do unless people turn it on and agree to the tour - she can talk, but don't
move the screen around unless they've chosen to take the tour, and stop when
they click out of it until the click to start the tour back up."

MEASURED FIRST, with trusted CDP touch input at 390x844 hasTouch, five reps, a
first-time visitor with clean storage, and NOBODY TOUCHING THE SCREEN:

    camera at the first painted frame        900.00, 640.00, 0.1381
    the largest it moved in the next 20 s    dx 396.55  dy 63.72  dz 0.7419

That is the whole complaint as a number. The pocket boot called startWalk(false)
700 ms after load, the walk flew the camera to a new place every 6.5 seconds,
and nobody had asked for any of it. The same boot moved the camera for a
RETURNING visitor too, with a bare cam.x/cam.y/cam.z write that jumped the map
the moment the intro cleared.

THE INVENTORY THIS FIXES, every camera move nobody asked for:

  1. the pocket boot auto-starting the Welcome Walk  (:8361 startWalk(false))
  2. the pocket boot's recentre for returning visitors (:8362 cam.x=1100 ...)
  3. the journey's own flight, once the walk has been taken back: a drag
     cancelled the FLIGHT and then fired travel.done, which re-armed the 6.5 s
     dwell timer, so the camera moved again half a walk later. The comment on
     :2251 said so in as many words: "a cancelled flight still keeps its
     promise - the tour chain re-arms". That was deliberate before this brief
     and is the opposite of what the founder asked for.
  4. every queued step behind it: JTMR, and anything else the walk had waiting.

AND WHAT IT DELIBERATELY LEAVES ALONE, because these ANSWER a person:
  travelTo from a tap on a building, on a badge, on a district banner, on the
  minimap, from the concierge answering a typed question, from goTo() in the
  Loom, from the address bar, from the `h` key, from the attention banner, from
  the desk Enter button, and the whole of #pnav. A camera move that answers a
  tap is fine. A camera move nobody asked for is not.

  Maia's voice is untouched. She still speaks on boot, still narrates, still
  answers. The dock, the hint and the pulse replay are not camera movers and
  were never in scope: the pulse narrates and sparkles and moves nothing.

ONE OWNER, ONE CANCEL PATH. `GUIDE` is the only thing that knows whether a
guided sequence is running and whether a person started it. Every automatic
camera move goes through GUIDE.fly, which refuses when GUIDE.on is false. Every
interaction goes through GUIDE.hand(), which is bound at THE SAME gesture entry
points the touch lane created and not a parallel set: touchNav's touchstart and
its pan and pinch branches, the canvas pointerdown, the wheel, the dblclick, the
WebKit gesturestart, the canvas click, the keyboard pan keys and the #pnav
buttons. GUIDE.stop() cancels the pending dwell timer, drops the flight in
progress WITHOUT firing its callback, ends the run, and raises a visible way
back in. Nothing lands late.

THE WAY BACK IN IS VISIBLE. #gresume is a real button that reads "Take the walk"
before a run and "Resume the walk" after a cancel, and a resume carries on at
the stop the walk had reached instead of starting over.

ADDENDUM 1 AND 2, THE #pnav SEED. The zoom and pan cluster folds down into a
44 px dot once the visitor has demonstrated BOTH a pan and a pinch, and blooms
back when the dot is tapped. Requiring both is deliberate: it is the pair WGATE
already latches, one stray drag is not a demonstration, and a single tap or a
keyboard user never reaches the trigger at all because GUIDE.hand() is only
given a gesture kind by the pan and pinch branches.

  - the dot is 44x44, keyboard reachable, focus-visible, and carries an
    aria-label that says which way it goes. Folding never removes zoom from
    anybody: SC 2.5.1 is satisfied one tap further away, never taken away.
  - the choice is remembered per visitor in localStorage under `amora-pnav`,
    the same way the hint remembers its dismissal. An explicit tap on the dot
    outranks the inference: after it, the map needs a FRESH pan and a FRESH
    pinch before it folds them away again.
  - desk is untouched, and that needed no decision: #pnav has always been
    display:none off the pocket profile (:814), so there is no cluster there
    to fold.

THE MOTION IS THE NATURAL INTERFACE KIT'S, NOT A SECOND VOCABULARY. An import
is impossible: this is a standalone 5.5 MB document with no module graph and no
access to client/src. So the tokens are mirrored by value and named so:

    --nat-ease-organic  cubic-bezier(0.37, 0, 0.29, 1)   ->  --pn-ease, identical
    @keyframes nat-petal-open  (index.css:877)           ->  @keyframes pn-sprout,
        0% scale(.12) translateY(14px) / 60% scale(1.06) / 100% scale(1), verbatim
    celebrationPlan blossom whisper: base 0.9 s, stagger spread base/3

    pn-fold is nat-petal-open run backwards with the overshoot moved to the
    front, so the cluster gathers itself before it draws down, which is what a
    plant folding back does and what a plain reverse does not.

The RATIO is the kit's and the ABSOLUTE is one step quieter than its quietest
celebration, because this is chrome on a map somebody is navigating: base 0.4 s
with a 0.133 s spread over five stages, 0.53 s end to end. The kit's own table
already scales by intensity (blossom whisper 0.9 s against moment 1.9 s); chrome
is quieter than whisper.

REACHABILITY DURING THE BLOOM WAS THE HARD PART. A transform scales the hit box
with the paint, so a button animating up from scale(.12) is a 5 px target for
the first frames, and the brief says a thumb reaching for zoom must find it. So
the buttons themselves never transform: their plate moved to a ::before and
their glyph into an <i>, and those two animate while the button's own box stays
44 px from the first frame. The bloom also removes `folded` FIRST and animates
second, so the controls are laid out before anything moves.

prefers-reduced-motion gets a real still state: the animation is switched off
entirely and the cluster is simply open or simply a dot, fully usable either
way, with no half-open frame.

ESCAPING. Nothing here writes an interpolated value into markup. #gresume and
#pnav are static, and the resume label is set with textContent, so no escq(),
escj() or escja() call is touched, added or needed.

Re-runnable. Every edit carries its own guard; a second run is all skips and
zero bytes changed. Afterwards, from docs/prototypes: node check_blocks.mjs,
and from docs/prototypes/qa: source ./env.sh && node _probe_consent.js &&
node _probe_touch_nav.js && node verify_features.js.
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

# ------------------------------------------------------------- 1. the owner

src = edit(
    src, "GUIDE: the one owner of consent",
    "  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(b[0],Math.min(b[1],x+ox/cz)),"
    "ty:Math.max(b[2],Math.min(b[3],y+oy/cz)),tz:cz,t:0,done}}\n",
    "  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(b[0],Math.min(b[1],x+ox/cz)),"
    "ty:Math.max(b[2],Math.min(b[3],y+oy/cz)),tz:cz,t:0,done}}\n"
    "/* THE CONSENT GATE. One owner of two facts: is a guided sequence running,\n"
    "   and did a PERSON start it. Every automatic camera move asks GUIDE.fly and\n"
    "   is refused when the answer is no; every interaction calls GUIDE.hand and\n"
    "   there is exactly one of those paths.\n"
    "   MEASURED before this existed, on a first-time visitor at 390x844 who\n"
    "   touched nothing at all: the camera left its first painted frame by 396.55\n"
    "   world px in x, 63.72 in y and 0.7419 in zoom inside twenty seconds. The\n"
    "   pocket boot opened the Welcome Walk 700 ms in and the walk flew somewhere\n"
    "   new every 6.5 seconds.\n"
    "   WHAT IT IS NOT. It is not a gate on travelTo. Fifteen callers reach that\n"
    "   function and almost all of them ANSWER something a person just did: a tap\n"
    "   on a building, on a badge, on a banner, on the minimap, a typed question,\n"
    "   a row in the Loom, an address. Refusing those would be a different bug\n"
    "   with the same shape. Only the guided sequence is gated, because the guided\n"
    "   sequence is the only thing in this file that moves the map on its own.\n"
    "   CANCEL MEANS CANCEL. stop() drops the flight in progress WITHOUT firing\n"
    "   its callback, clears the walk's dwell timer and every timer the guide\n"
    "   owns, and ends the run. The old behaviour kept the promise on purpose so\n"
    "   the tour chain re-armed, which is exactly the half-second-later movement\n"
    "   the founder is describing, six seconds later. */\n"
    "const GUIDE={\n"
    "  on:false,        // a guided sequence is running AND a person started it\n"
    "  id:null,         // which journey\n"
    "  at:0,            // the stop it reached, so a resume carries on from there\n"
    "  log:false,       // whether this run is a counted newcomer walk\n"
    "  ran:false,       // one has been started at least once this load\n"
    "  why:null,        // how the last one ended: 'hand', 'end', 'escape', 'done'\n"
    "  n:{pan:0,pinch:0,tap:0},   // gestures, counted where the map already latched them\n"
    "  tmr:[],          // every timer the guide owns, so cancel can mean cancel\n"
    "  wait(fn,ms){const h=setTimeout(()=>{GUIDE.drop(h);if(GUIDE.on)fn()},ms);GUIDE.tmr.push(h);return h},\n"
    "  drop(h){const i=GUIDE.tmr.indexOf(h);if(i>=0)GUIDE.tmr.splice(i,1)},\n"
    "  clear(){for(const h of GUIDE.tmr)clearTimeout(h);GUIDE.tmr.length=0},\n"
    "  /* THE ONLY WAY A GUIDED SEQUENCE MOVES THE CAMERA. A step that arrives\n"
    "     after the walk was taken back moves nothing and says nothing. */\n"
    "  fly(x,y,z,done){if(!GUIDE.on)return false;travelTo(x,y,z,done);if(travel)travel.guide=true;return true},\n"
    "  start(id,at,log){GUIDE.clear();GUIDE.on=true;GUIDE.ran=true;GUIDE.id=id;\n"
    "    GUIDE.at=Math.max(0,at|0);GUIDE.log=!!log;GUIDE.why=null;\n"
    "    window.guideAffordance&&guideAffordance()},\n"
    "  mark(i){if(GUIDE.on)GUIDE.at=Math.max(0,i|0)},\n"
    "  finish(){GUIDE.on=false;GUIDE.clear();GUIDE.at=0;GUIDE.why='done';\n"
    "    window.guideAffordance&&guideAffordance()},\n"
    "  /* THE ONE CANCEL PATH. Everything that takes the map back arrives here. */\n"
    "  stop(why){if(!GUIDE.on)return false;\n"
    "    GUIDE.on=false;GUIDE.why=why||'hand';GUIDE.clear();\n"
    "    if(travel&&travel.guide)travel=null;      // stop where it is; the promise dies with it\n"
    "    window.jHalt&&jHalt(GUIDE.why==='hand');  // a hand keeps her sheet; a button closes it\n"
    "    if(GUIDE.why==='hand'&&window.maiaSay)\n"
    "      maiaSay('You have the map. I stopped the walk right here; tap <b>Resume the walk</b> whenever you want to carry on.');\n"
    "    window.guideAffordance&&guideAffordance();\n"
    "    return true},\n"
    "  /* EVERY INTERACTION ARRIVES HERE, from the gesture entry points the touch\n"
    "     lane already owns. A `kind` is passed only by the two branches that ARE\n"
    "     a gesture, which is what keeps a single tap and a keyboard pan from\n"
    "     counting as a demonstration of finger navigation. */\n"
    "  hand(kind){\n"
    "    if(kind==='pan'||kind==='pinch'){GUIDE.n[kind]++;window.WGATE&&(WGATE[kind]=true)}\n"
    "    else if(kind)GUIDE.n[kind]=(GUIDE.n[kind]||0)+1;\n"
    "    GUIDE.stop('hand');\n"
    "    if(kind==='pan'||kind==='pinch')window.pnavGesture&&pnavGesture()}\n"
    "};\n"
    "window.GUIDE=GUIDE;\n",
    guard="/* THE CONSENT GATE. One owner of two facts")

src = edit(
    src, "a hand on the land, whatever layer it lands on",
    "window.GUIDE=GUIDE;\n",
    "window.GUIDE=GUIDE;\n"
    "/* A HAND ON THE LAND, WHATEVER LAYER IT LANDS ON. The gesture hooks below are\n"
    "   bound to #scene, and #scene is only ONE of the four sibling layers that\n"
    "   draw this map: #icons carries the building art, #banners the district\n"
    "   plates, #badges the marks. All four are children of <body>, so a tap on a\n"
    "   building's own artwork never touches the canvas and never reached the\n"
    "   cancel. MEASURED, five reps, and it is the reason this block exists: a tap\n"
    "   on a building left the walk running and let it move the map 232.00 world px\n"
    "   six seconds later, while a drag, a pinch and a tap on bare land all read\n"
    "   exactly zero. The element under the finger was an <svg> inside a .poi, with\n"
    "   pointer-events auto and no click handler, so the tap was swallowed whole.\n"
    "   THE LIST IS THE MAP'S OWN LAYERS AND NOTHING ELSE. An allow-list on\n"
    "   purpose: a tap inside Maia's dock is how somebody says `walk on`, and a\n"
    "   deny-list would have to keep finding every panel that is not the land.\n"
    "   pointerdown alone, because it fires for a mouse, a pen and a finger, and\n"
    "   because calling the cancel twice is the same as calling it once. */\n"
    "(function handOnTheLand(){\n"
    "  const LAND=['scene','icons','banners','badges','minimapWrap'];\n"
    "  document.addEventListener('pointerdown',e=>{\n"
    "    for(const id of LAND){const el=document.getElementById(id);\n"
    "      if(el&&(el===e.target||el.contains(e.target))){GUIDE.hand();return}}},true)})();\n",
    guard="/* A HAND ON THE LAND, WHATEVER LAYER IT LANDS ON.")

src = edit(
    src, "any flight nobody guided ends the guide",
    "function travelTo(x,y,z,done){const tz=z||cam.z;\n",
    "/* ANY FLIGHT NOBODY GUIDED ENDS THE GUIDE, and this line closes a hole a probe\n"
    "   found rather than one anybody predicted. The gesture hooks below are bound\n"
    "   to #scene, and the marks that sit OVER the land are their own DOM elements:\n"
    "   a tap on a building's badge, on a district plate or on the minimap never\n"
    "   touches the canvas at all, so it never reached GUIDE.hand, and the walk\n"
    "   carried on and moved the map six seconds later. MEASURED, five reps,\n"
    "   tap-on-a-building: |dx| 232.00, |dy| 86.40 in the nine seconds after the\n"
    "   tap, with the other three interaction kinds already reading exactly zero.\n"
    "   Putting it HERE instead of on three more handlers is the difference between\n"
    "   one rule and a list. Every caller of this function except the guide itself\n"
    "   is somebody asking the camera to go somewhere, and somebody asking is the\n"
    "   definition of the walk being over. A future caller is covered on the day it\n"
    "   is written. */\n"
    "function travelTo(x,y,z,done){\n"
    "  if(window.GUIDE&&GUIDE.on&&!GUIDE.flying)GUIDE.stop('travel');\n"
    "  const tz=z||cam.z;\n",
    guard="/* ANY FLIGHT NOBODY GUIDED ENDS THE GUIDE")

src = edit(
    src, "the guide's own flight is exempt from that rule",
    "  fly(x,y,z,done){if(!GUIDE.on)return false;travelTo(x,y,z,done);"
    "if(travel)travel.guide=true;return true},\n",
    "  fly(x,y,z,done){if(!GUIDE.on)return false;\n"
    "    GUIDE.flying=true;try{travelTo(x,y,z,done)}finally{GUIDE.flying=false}\n"
    "    if(travel)travel.guide=true;return true},\n",
    guard="    GUIDE.flying=true;try{travelTo(x,y,z,done)}finally{GUIDE.flying=false}")

# --------------------------------------------------- 2. the gesture entry points

src = edit(
    src, "the mouse and pen pointerdown takes the map back",
    "  dragging=true;cv.classList.add('dragging');lastP=[e.clientX,e.clientY];cam.vx=cam.vy=0;\n"
    "  if(travel){const d=travel.done;travel=null;d&&d()}"
    " // a cancelled flight still keeps its promise — the tour chain re-arms\n",
    "  window.GUIDE&&GUIDE.hand();   // the one cancel path, and it runs BEFORE the flight is dropped\n"
    "  dragging=true;cv.classList.add('dragging');lastP=[e.clientX,e.clientY];cam.vx=cam.vy=0;\n"
    "  /* A flight NOBODY GUIDED still keeps its promise, and that is right: the\n"
    "     Enter button's welcome line rides one of these and she may always speak.\n"
    "     A guided flight has already been dropped by GUIDE.hand above, callback\n"
    "     and all, which is what stops the walk re-arming six seconds later. */\n"
    "  if(travel){const d=travel.done;travel=null;d&&d()}\n",
    guard="  window.GUIDE&&GUIDE.hand();   // the one cancel path, and it runs BEFORE the flight is dropped")

src = edit(
    src, "the wheel takes the map back",
    "cv.addEventListener('wheel',e=>{e.preventDefault();const[wx,wy]=screenToWorld(e.clientX,e.clientY);\n",
    "cv.addEventListener('wheel',e=>{e.preventDefault();window.GUIDE&&GUIDE.hand();"
    "const[wx,wy]=screenToWorld(e.clientX,e.clientY);\n",
    guard="e.preventDefault();window.GUIDE&&GUIDE.hand();const[wx,wy]=screenToWorld")

src = edit(
    src, "the double click takes the map back",
    "cv.addEventListener('dblclick',e=>{const[wx,wy]=screenToWorld(e.clientX,e.clientY);"
    "travelTo(wx,wy,Math.max(cam.z,1.15))});\n",
    "cv.addEventListener('dblclick',e=>{window.GUIDE&&GUIDE.hand('tap');"
    "const[wx,wy]=screenToWorld(e.clientX,e.clientY);"
    "travelTo(wx,wy,Math.max(cam.z,1.15))});\n",
    guard="cv.addEventListener('dblclick',e=>{window.GUIDE&&GUIDE.hand('tap');")

src = edit(
    src, "the WebKit pinch takes the map back, and counts as a pinch",
    "  cv.addEventListener('gesturestart',e=>{e.preventDefault();gz=cam.z;gx=e.clientX;gy=e.clientY},{passive:false});\n",
    "  cv.addEventListener('gesturestart',e=>{e.preventDefault();window.GUIDE&&GUIDE.hand('pinch');"
    "gz=cam.z;gx=e.clientX;gy=e.clientY},{passive:false});\n",
    guard="e.preventDefault();window.GUIDE&&GUIDE.hand('pinch');gz=cam.z;")

src = edit(
    src, "a tap on the land, and a tap on a building, take the map back",
    "cv.addEventListener('click',e=>{if(Math.abs(cam.vx)+Math.abs(cam.vy)>1.5)return;\n",
    "cv.addEventListener('click',e=>{if(Math.abs(cam.vx)+Math.abs(cam.vy)>1.5)return;\n"
    "  /* Both kinds of tap land here, and both end the walk. The flight that\n"
    "     OPENS the building a finger just chose is a different thing entirely and\n"
    "     still happens, because it answers the tap. */\n"
    "  window.GUIDE&&GUIDE.hand('tap');\n",
    guard="  window.GUIDE&&GUIDE.hand('tap');\n")

src = edit(
    src, "a keyboard pan takes the map back",
    "  const k=e.key;const pan=42/cam.z;\n",
    "  const k=e.key;const pan=42/cam.z;\n"
    "  /* The keys that MOVE the map, and only those. Typing into the dock never\n"
    "     reaches this handler at all, and a key that opens a panel is not a\n"
    "     person taking the camera. */\n"
    "  if(/^(?:Arrow(?:Left|Right|Up|Down)|\\+|=|-|h|H)$/.test(k))window.GUIDE&&GUIDE.hand();\n",
    guard="  if(/^(?:Arrow(?:Left|Right|Up|Down)|\\+|=|-|h|H)$/.test(k))window.GUIDE&&GUIDE.hand();")

src = edit(
    src, "touchNav's touchstart takes the map back",
    "  el.addEventListener('touchstart',e=>{\n"
    "    if(!T){dragging=true;cv.classList.add('dragging');cam.vx=cam.vy=0;samp=[];\n"
    "      /* the pointer path used to do this on every touch, and a cancelled\n"
    "         flight still keeps its promise, so the tour chain re-arms */\n"
    "      if(travel){const d=travel.done;travel=null;d&&d()}}\n",
    "  el.addEventListener('touchstart',e=>{\n"
    "    /* THE SAME CANCEL PATH THE MOUSE USES, at the entry point this lane\n"
    "       already owns. A finger on the glass is a person taking the map. */\n"
    "    window.GUIDE&&GUIDE.hand();\n"
    "    if(!T){dragging=true;cv.classList.add('dragging');cam.vx=cam.vy=0;samp=[];\n"
    "      /* A flight nobody guided still keeps its promise; a guided one was\n"
    "         dropped above, callback and all, so no step lands late. */\n"
    "      if(travel){const d=travel.done;travel=null;d&&d()}}\n",
    guard="    /* THE SAME CANCEL PATH THE MOUSE USES, at the entry point this lane")

src = edit(
    src, "the pan branch latches through the owner",
    "      clampCam();window.WGATE&&(WGATE.pan=true);return}\n",
    "      clampCam();window.GUIDE?GUIDE.hand('pan'):(window.WGATE&&(WGATE.pan=true));return}\n",
    guard="clampCam();window.GUIDE?GUIDE.hand('pan')")

src = edit(
    src, "the pinch branch latches through the owner",
    "      clampCam();window.WGATE&&(WGATE.pinch=true);return}\n",
    "      clampCam();window.GUIDE?GUIDE.hand('pinch'):(window.WGATE&&(WGATE.pinch=true));return}\n",
    guard="clampCam();window.GUIDE?GUIDE.hand('pinch')")

src = edit(
    src, "the pocket zoom and pan buttons take the map back",
    "  const zoom=k=>{travel=null;cam.z=Math.max(minZoom(),Math.min(ZMAX,cam.z*k));clampCam();hap(6)};\n"
    "  const pan=(dx,dy)=>{travel=null;const s=140/cam.z;cam.x+=dx*s;cam.y+=dy*s;clampCam();hap(6)};\n",
    "  /* These end a walk too, and they pass NO kind: pressing a button is not a\n"
    "     demonstration that this person navigates with their fingers, so it must\n"
    "     never be what folds the buttons away. */\n"
    "  const zoom=k=>{window.GUIDE&&GUIDE.hand();travel=null;"
    "cam.z=Math.max(minZoom(),Math.min(ZMAX,cam.z*k));clampCam();hap(6)};\n"
    "  const pan=(dx,dy)=>{window.GUIDE&&GUIDE.hand();travel=null;"
    "const s=140/cam.z;cam.x+=dx*s;cam.y+=dy*s;clampCam();hap(6)};\n",
    guard="  const zoom=k=>{window.GUIDE&&GUIDE.hand();travel=null;")

# ------------------------------------------------------------ 3. the journey

src = edit(
    src, "jHalt: the one ender the guide can call",
    "function jSheetOff(){if(JSHEET){document.body.classList.remove('msheet');JSHEET=false}}\n",
    "function jSheetOff(){if(JSHEET){document.body.classList.remove('msheet');JSHEET=false}}\n"
    "/* THE ONE ENDER, so the consent gate has something to call that does not\n"
    "   live inside one run's closure. jEnd and the Escape key each built their\n"
    "   own copy of this and neither could be reached from a touch handler.\n"
    "   Idempotent: a second call with no walk running is a no-op, which is what\n"
    "   lets jEnd keep its own body without posting a second abandoned row.\n"
    "   keepSheet is the difference between a hand and a button. A drag is the\n"
    "   person taking the CAMERA, and she may still speak, so her sheet stays and\n"
    "   she says where the way back in is. `Stay here` and Escape are the person\n"
    "   ending the conversation, so the sheet goes and the phone gets its screen\n"
    "   back, which is the behaviour D7 has always asserted. */\n"
    "function jHalt(keepSheet){\n"
    "  clearTimeout(JTMR);\n"
    "  if(!JWALK)return false;\n"
    "  const w=JWALK;JWALK=null;tourI=-1;setHash('');\n"
    "  if(!keepSheet)jSheetOff();\n"
    "  if(w.log&&typeof endWalk==='function')endWalk(false,w.i);\n"
    "  return true}\n"
    "window.jHalt=jHalt;\n",
    guard="function jHalt(keepSheet){")

src = edit(
    src, "playJourney asks for consent and can be resumed",
    "  JWALK={id,i:0,paused:false,log:!!o.log};setHash('#/journey/'+id);\n",
    "  /* REACHING THIS FUNCTION IS THE CONSENT. Every caller is a person: the\n"
    "     tour link, the `t` key, the Loom's `walk it` button, the concierge\n"
    "     answering `show me around`, an address someone followed, and the\n"
    "     affordance below. The one caller that was NOT a person was the pocket\n"
    "     boot, and it is gone. */\n"
    "  JWALK={id,i:Math.max(0,o.at|0),paused:false,log:!!o.log};setHash('#/journey/'+id);\n"
    "  GUIDE.start(id,JWALK.i,!!o.log);\n",
    guard="  /* REACHING THIS FUNCTION IS THE CONSENT.")

src = edit(
    src, "the opening line knows a resume from a start",
    "  const open=j.name+'. '+stops.length+' stops, and you can stop me at any one of them.';\n"
    "  maiaSay('<b>'+escq(j.name)+'</b>. '+stops.length+' stops, and you can stop me at any one of them. '\n"
    "    +'<b>Esc</b> ends the walk.'\n",
    "  const back=JWALK.i>0;\n"
    "  const lead=back?('Picking it up at stop '+(JWALK.i+1)+' of '+stops.length+'. ')\n"
    "    :(stops.length+' stops, and you can stop me at any one of them. ');\n"
    "  const open=j.name+'. '+lead;\n"
    "  maiaSay('<b>'+escq(j.name)+'</b>. '+lead\n"
    "    +'<b>Esc</b> ends the walk.'\n",
    guard="  const back=JWALK.i>0;\n")

src = edit(
    src, "the walk's own flight goes through the gate",
    "    tourI=JWALK.i;                                   // the view qa/secB.js follows\n",
    "    tourI=JWALK.i;GUIDE.mark(JWALK.i);               // the view qa/secB.js follows\n",
    guard="    tourI=JWALK.i;GUIDE.mark(JWALK.i);")

src = edit(
    src, "GUIDE.fly replaces the walk's bare travelTo",
    "    travelTo(s.x,s.y,1.25,()=>{\n",
    "    GUIDE.fly(s.x,s.y,1.25,()=>{\n",
    guard="    GUIDE.fly(s.x,s.y,1.25,()=>{")

src = edit(
    src, "the walk finishing tells the owner",
    "    if(JWALK.i>=stops.length){const logged=JWALK.log,at=JWALK.i;JWALK=null;tourI=-1;setHash('');jSheetOff();\n",
    "    if(JWALK.i>=stops.length){const logged=JWALK.log,at=JWALK.i;JWALK=null;tourI=-1;setHash('');jSheetOff();\n"
    "      GUIDE.finish();   // it ran to the end, so there is nothing to resume\n",
    guard="      GUIDE.finish();   // it ran to the end, so there is nothing to resume")

src = edit(
    src, "the dwell timer refuses to fire past a cancel",
    "    JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id&&!JWALK.paused){JWALK.i++;step()}},JDWELL);\n",
    "    /* GUIDE.on is checked here as well as cleared by stop(), because this is\n"
    "       the timer that used to move the map six seconds after somebody had\n"
    "       already taken it back. Two locks on the one door that was open. */\n"
    "    JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id&&!JWALK.paused&&GUIDE.on){JWALK.i++;step()}},JDWELL);\n",
    guard="!JWALK.paused&&GUIDE.on){JWALK.i++;step()}},JDWELL);")

src = edit(
    src, "stay here goes through the one cancel path",
    "  window.jEnd=()=>{clearTimeout(JTMR);\n",
    "  window.jEnd=()=>{clearTimeout(JTMR);GUIDE.stop('end');\n",
    guard="  window.jEnd=()=>{clearTimeout(JTMR);GUIDE.stop('end');")

src = edit(
    src, "Escape goes through the one cancel path",
    "document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);\n",
    "document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);"
    "GUIDE.stop('escape');\n",
    guard="if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);GUIDE.stop('escape');")

# -------------------------------------------------------------- 4. the markup

src = edit(
    src, "the seed dot, and the visible way back into the walk",
    "<div id=\"pnav\" role=\"group\" aria-label=\"Move and zoom the map\">\n"
    " <div class=\"pnrow\">\n"
    "  <button id=\"pnIn\" class=\"pnz\" type=\"button\" aria-label=\"Zoom in\">+</button>\n"
    "  <button id=\"pnOut\" class=\"pnz\" type=\"button\" aria-label=\"Zoom out\">&#8722;</button>\n"
    " </div>\n"
    " <div class=\"pnpad\">\n"
    "  <button id=\"pnUp\" type=\"button\" aria-label=\"Move the map up\">&#9650;</button>\n"
    "  <button id=\"pnLeft\" type=\"button\" aria-label=\"Move the map left\">&#9664;</button>\n"
    "  <button id=\"pnRight\" type=\"button\" aria-label=\"Move the map right\">&#9654;</button>\n"
    "  <button id=\"pnDown\" type=\"button\" aria-label=\"Move the map down\">&#9660;</button>\n"
    " </div>\n"
    "</div>\n",
    "<div id=\"pnav\" role=\"group\" aria-label=\"Move and zoom the map\">\n"
    " <div id=\"pnavCtl\" class=\"pnbody\">\n"
    "  <div class=\"pnrow\">\n"
    "   <button id=\"pnIn\" class=\"pnz\" type=\"button\" aria-label=\"Zoom in\"><i>+</i></button>\n"
    "   <button id=\"pnOut\" class=\"pnz\" type=\"button\" aria-label=\"Zoom out\"><i>&#8722;</i></button>\n"
    "  </div>\n"
    "  <div class=\"pnpad\">\n"
    "   <button id=\"pnUp\" type=\"button\" aria-label=\"Move the map up\"><i>&#9650;</i></button>\n"
    "   <button id=\"pnLeft\" type=\"button\" aria-label=\"Move the map left\"><i>&#9664;</i></button>\n"
    "   <button id=\"pnRight\" type=\"button\" aria-label=\"Move the map right\"><i>&#9654;</i></button>\n"
    "   <button id=\"pnDown\" type=\"button\" aria-label=\"Move the map down\"><i>&#9660;</i></button>\n"
    "  </div>\n"
    " </div>\n"
    " <button id=\"pnSeed\" type=\"button\" aria-expanded=\"true\" aria-controls=\"pnavCtl\""
    " aria-label=\"Fold the map zoom and pan controls into a seed\"><span class=\"pnbud\"></span></button>\n"
    "</div>\n"
    "<div id=\"gresume\">\n"
    " <button id=\"gresumeGo\" type=\"button\"><span id=\"gresumeLab\">Take the walk</span></button>\n"
    " <button id=\"gresumeX\" type=\"button\" aria-label=\"Hide this offer for now\">&#215;</button>\n"
    "</div>\n",
    guard="<button id=\"pnSeed\" type=\"button\"")

# ----------------------------------------------------------------- 5. the CSS

src = edit(
    src, "the seed, the bloom and the way back in, styled",
    "  #pnav .pnrow{display:flex;gap:6px}\n"
    "  #pnav .pnpad{display:grid;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(3,36px);gap:2px}\n"
    "  #pnav button{appearance:none;-webkit-appearance:none;font-family:inherit;color:var(--parch);\n"
    "    background:linear-gradient(180deg,rgba(28,20,12,.93),rgba(18,13,7,.96));\n"
    "    border:1px solid #8a6a33;border-radius:9px;display:flex;align-items:center;justify-content:center;\n"
    "    line-height:1;touch-action:none;-webkit-tap-highlight-color:transparent}\n"
    "  #pnav button:active{background:rgba(64,48,26,.97)}\n"
    "  #pnav .pnz{width:44px;height:44px;font-size:21px}\n"
    "  #pnav .pnpad button{width:36px;height:36px;font-size:13px;border-radius:8px}\n",
    "  #pnav .pnbody{display:flex;flex-direction:column;align-items:center;gap:6px}\n"
    "  #pnav .pnrow{display:flex;gap:6px}\n"
    "  #pnav .pnpad{display:grid;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(3,36px);gap:2px}\n"
    "  /* THE BUTTON'S BOX NEVER MOVES, AND THAT IS THE WHOLE TRICK. A transform\n"
    "     scales the hit box with the paint, so a control animating up from\n"
    "     scale(.12) is a 5 px target for its first frames, and a thumb already on\n"
    "     its way to zoom would miss. The plate moved to ::before and the glyph\n"
    "     into an <i>; those two do the sprouting while the button stays 44 px\n"
    "     from the first frame of the bloom to the last. */\n"
    "  #pnav button{appearance:none;-webkit-appearance:none;font-family:inherit;color:var(--parch);\n"
    "    background:none;border:none;padding:0;position:relative;\n"
    "    display:flex;align-items:center;justify-content:center;\n"
    "    line-height:1;touch-action:none;-webkit-tap-highlight-color:transparent}\n"
    "  #pnav .pnbody button::before{content:'';position:absolute;inset:0;box-sizing:border-box;\n"
    "    background:linear-gradient(180deg,rgba(28,20,12,.93),rgba(18,13,7,.96));\n"
    "    border:1px solid #8a6a33;border-radius:9px;transform-origin:50% 100%}\n"
    "  #pnav .pnbody button:active::before{background:rgba(64,48,26,.97)}\n"
    "  #pnav button i{font-style:normal;display:block;position:relative;transform-origin:50% 100%}\n"
    "  #pnav button:focus-visible{outline:2px solid #e8c877;outline-offset:2px;border-radius:11px}\n"
    "  #pnav .pnz{width:44px;height:44px;font-size:21px}\n"
    "  #pnav .pnpad button{width:36px;height:36px;font-size:13px}\n"
    "  #pnav .pnpad button::before{border-radius:8px}\n"
    "  /* THE SEED. 44x44 whether it is a dot or a fold control, always a real\n"
    "     button, always keyboard reachable, and its name says which way it goes.\n"
    "     Folding puts zoom one tap further away and never takes it away, which is\n"
    "     the line SC 2.5.1 draws. */\n"
    "  #pnav #pnSeed{width:44px;height:44px}\n"
    "  #pnav #pnSeed .pnbud{display:block;width:13px;height:13px;border-radius:50%;\n"
    "    background:radial-gradient(circle at 34% 30%,#f0dda6,#8a6a33 72%);\n"
    "    border:1px solid #6d5227;box-shadow:0 1px 5px rgba(0,0,0,.65);transform-origin:50% 50%}\n"
    "  #pnav.folded #pnSeed .pnbud{width:19px;height:19px}\n"
    "  #pnav.folded .pnbody{display:none}\n"
    "  /* THE NATURAL INTERFACE KIT'S MOTION, MIRRORED BY VALUE. This document is\n"
    "     standalone and cannot import from client/src, so the tokens are copied\n"
    "     and named after the ones they came from:\n"
    "       --pn-ease  is --nat-ease-organic, cubic-bezier(0.37,0,0.29,1)\n"
    "       pn-sprout  is @keyframes nat-petal-open, keyframe for keyframe\n"
    "       the stagger spread is the kit's base/3, from celebrationPlan's whisper\n"
    "     The absolute is one step quieter than the kit's quietest celebration\n"
    "     (blossom whisper is 0.9 s) because this is chrome on a map somebody is\n"
    "     navigating. 0.4 s with a 0.133 s spread over five stages: 0.53 s, and\n"
    "     the eye has it by 0.4. */\n"
    "  #pnav{--pn-ease:var(--nat-ease-organic,cubic-bezier(.37,0,.29,1));--pn-dur:.4s;--pn-step:.033s}\n"
    "  @keyframes pn-sprout{\n"
    "    0%{opacity:0;transform:scale(.12) translateY(14px)}\n"
    "    60%{opacity:1;transform:scale(1.06) translateY(0)}\n"
    "    100%{opacity:1;transform:scale(1) translateY(0)}}\n"
    "  /* Run backwards with the overshoot moved to the FRONT, so the cluster\n"
    "     gathers itself and then draws down into the seed. A plain reverse reads\n"
    "     as a shrink; this reads as a plant folding back. */\n"
    "  @keyframes pn-fold{\n"
    "    0%{opacity:1;transform:scale(1) translateY(0)}\n"
    "    30%{opacity:1;transform:scale(1.06) translateY(0)}\n"
    "    100%{opacity:0;transform:scale(.12) translateY(14px)}}\n"
    "  @keyframes pn-bud{0%{transform:scale(1)}45%{transform:scale(1.3)}100%{transform:scale(1)}}\n"
    "  #pnIn{--pn-i:4}#pnOut{--pn-i:3}#pnUp{--pn-i:2}#pnLeft{--pn-i:1}#pnRight{--pn-i:1}#pnDown{--pn-i:0}\n"
    "  #pnav.bloom .pnbody button::before,#pnav.bloom .pnbody button i{\n"
    "    animation:pn-sprout var(--pn-dur) var(--pn-ease) calc(var(--pn-i,0) * var(--pn-step)) both}\n"
    "  #pnav.fold .pnbody button::before,#pnav.fold .pnbody button i{\n"
    "    animation:pn-fold var(--pn-dur) var(--pn-ease) calc((4 - var(--pn-i,0)) * var(--pn-step)) both}\n"
    "  #pnav.bloom #pnSeed .pnbud,#pnav.fold #pnSeed .pnbud{\n"
    "    animation:pn-bud var(--pn-dur) var(--pn-ease) both}\n"
    "  /* A REAL STILL STATE, never a half-open one. The preference switches the\n"
    "     motion off outright and the cluster is simply open or simply a dot, each\n"
    "     fully usable the instant it is asked for. */\n"
    "  @media (prefers-reduced-motion:reduce){\n"
    "    #pnav.bloom .pnbody button::before,#pnav.bloom .pnbody button i,\n"
    "    #pnav.fold .pnbody button::before,#pnav.fold .pnbody button i,\n"
    "    #pnav.bloom #pnSeed .pnbud,#pnav.fold #pnSeed .pnbud{animation:none}}\n"
    "  /* THE WAY BACK IN, AND IT IS VISIBLE. The brief asks for a resume\n"
    "     affordance rather than a hidden gesture, so this is a button with words\n"
    "     on it. Bottom left on the phone, opposite #pnav; bottom centre on desk,\n"
    "     clear of the minimap at left:14 and the dock at right:14. */\n"
    "  #gresume{display:none}\n"
    "  #gresume.on{position:fixed;left:50%;transform:translateX(-50%);bottom:70px;z-index:36;\n"
    "    display:flex;align-items:stretch;gap:2px}\n"
    "  body.pocket #gresume.on{left:8px;transform:none;\n"
    "    bottom:calc(72px + env(safe-area-inset-bottom,0px));z-index:44}\n"
    "  #gresume button{appearance:none;-webkit-appearance:none;font-family:inherit;\n"
    "    color:var(--parch);background:linear-gradient(180deg,rgba(28,20,12,.95),rgba(18,13,7,.97));\n"
    "    border:1px solid #8a6a33;line-height:1;-webkit-tap-highlight-color:transparent;\n"
    "    display:flex;align-items:center;justify-content:center}\n"
    "  #gresume button:focus-visible{outline:2px solid #e8c877;outline-offset:2px}\n"
    "  #gresumeGo{min-height:44px;padding:0 14px;font-size:13px;border-radius:22px 6px 6px 22px}\n"
    "  #gresumeX{width:44px;min-height:44px;font-size:17px;border-radius:6px 22px 22px 6px;border-left:none}\n",
    guard="  #pnav .pnbody{display:flex;flex-direction:column;align-items:center;gap:6px}")

# -------------------------------------------------------------- 6. the wiring

src = edit(
    src, "the affordance, the seed controller, and a pocket boot that stays put",
    "/* pocket boot: skip the intro ceremony, walk the newcomer */\n"
    "if(document.body.classList.contains('pocket')){\n"
    "  setTimeout(()=>{leaveIntro();\n"
    "    if(!location.hash||location.hash.length<3||/hud=/.test(location.hash)){\n"
    "      if(!localStorage.getItem('amora-walk-done'))startWalk(false);\n"
    "      else{cam.x=1100;cam.y=650;cam.z=.9;clampCam()}}},700)}\n",
    "/* THE WAY BACK IN. It reads `Take the walk` before a run and `Resume the\n"
    "   walk` after one was cancelled, and a resume carries on at the stop the\n"
    "   walk had reached. The label is set with textContent, so no words here can\n"
    "   become markup however a fork edits them. */\n"
    "function guideAffordance(){\n"
    "  const box=$('gresume'),lab=$('gresumeLab');if(!box||!lab)return;\n"
    "  const live=!!(window.GUIDE&&GUIDE.on);\n"
    "  const back=!!(window.GUIDE&&GUIDE.ran&&GUIDE.at>0&&GUIDE.why!=='done');\n"
    "  let done=false,hid=false;\n"
    "  try{done=!!localStorage.getItem('amora-walk-done')}catch(_){}\n"
    "  try{hid=sessionStorage.getItem('amora-walk-offer')==='off'}catch(_){}\n"
    "  lab.textContent=back?'Resume the walk':'Take the walk';\n"
    "  box.classList.toggle('on',!live&&!hid&&(back||!done))}\n"
    "window.guideAffordance=guideAffordance;\n"
    "function guideGo(){\n"
    "  const id=(window.GUIDE&&GUIDE.id)||welcomeJourney();if(!id)return;\n"
    "  hap(10);\n"
    "  if(window.GUIDE&&GUIDE.ran&&GUIDE.at>0&&GUIDE.why!=='done'){playJourney(id,{log:GUIDE.log,at:GUIDE.at});return}\n"
    "  startWalk(true)}\n"
    "window.guideGo=guideGo;\n"
    "if($('gresumeGo'))$('gresumeGo').onclick=guideGo;\n"
    "if($('gresumeX'))$('gresumeX').onclick=()=>{\n"
    "  try{sessionStorage.setItem('amora-walk-offer','off')}catch(_){}\n"
    "  guideAffordance();hap(6)};\n"
    "/* THE SEED. The cluster folds down into a 44 px dot once this visitor has\n"
    "   shown BOTH a pan and a pinch, and blooms back when the dot is tapped.\n"
    "   BOTH, deliberately: it is the pair WGATE already latches, one stray drag\n"
    "   is not a demonstration, and the signal arrives through GUIDE.hand, which\n"
    "   is only given a kind by the two branches that ARE a gesture. A tap and a\n"
    "   keyboard pan reach GUIDE.hand with no kind and can never fold anything.\n"
    "   AN EXPLICIT TAP OUTRANKS THE INFERENCE. Tapping the dot snapshots the\n"
    "   counts, so the map needs a FRESH pan and a FRESH pinch before it folds\n"
    "   them away again, and the choice is remembered per visitor the same way\n"
    "   the gesture hint remembers its dismissal. */\n"
    "(function pnavSeed(){\n"
    "  const box=$('pnav'),seed=$('pnSeed');if(!box||!seed)return;\n"
    "  const KEY='amora-pnav',DUR=600;   // --pn-dur + the last stagger + a frame\n"
    "  const CALM=()=>{try{return matchMedia('(prefers-reduced-motion:reduce)').matches}catch(_){return false}};\n"
    "  let tmr=0,mark={pan:0,pinch:0};\n"
    "  const read=()=>{try{return localStorage.getItem(KEY)}catch(_){return null}};\n"
    "  const store=v=>{try{localStorage.setItem(KEY,v)}catch(_){}};\n"
    "  const name=f=>{seed.setAttribute('aria-expanded',f?'false':'true');\n"
    "    seed.setAttribute('aria-label',f?'Show the map zoom and pan controls'\n"
    "      :'Fold the map zoom and pan controls into a seed')};\n"
    "  function set(folded,move){\n"
    "    clearTimeout(tmr);box.classList.remove('bloom','fold');\n"
    "    if(!move||CALM()){box.classList.toggle('folded',folded);name(folded);return}\n"
    "    if(folded){box.classList.add('fold');\n"
    "      tmr=setTimeout(()=>{box.classList.remove('fold');box.classList.add('folded');name(true)},DUR)}\n"
    "    else{/* laid out FIRST and animated second, so a thumb already moving\n"
    "            toward zoom finds a full 44 px target on the opening frame */\n"
    "      box.classList.remove('folded');box.classList.add('bloom');name(false);\n"
    "      tmr=setTimeout(()=>box.classList.remove('bloom'),DUR)}}\n"
    "  set(read()==='seed',false);\n"
    "  seed.onclick=()=>{const folded=box.classList.contains('folded');\n"
    "    set(!folded,true);store(folded?'open':'seed');\n"
    "    mark={pan:(GUIDE.n.pan|0),pinch:(GUIDE.n.pinch|0)};hap(8)};\n"
    "  window.pnavGesture=()=>{\n"
    "    if(!document.body.classList.contains('pocket'))return;\n"
    "    if(box.classList.contains('folded')||box.classList.contains('fold'))return;\n"
    "    if((GUIDE.n.pan|0)<=mark.pan||(GUIDE.n.pinch|0)<=mark.pinch)return;\n"
    "    set(true,true);store('seed')}})();\n"
    "/* POCKET BOOT: SHE SPEAKS, AND THE CAMERA STAYS WHERE IT IS.\n"
    "   This block used to call startWalk(false) 700 ms after load for a newcomer\n"
    "   and write cam.x/cam.y/cam.z outright for everybody else, so the map moved\n"
    "   under a visitor who had not touched it either way. MEASURED before the\n"
    "   change, five reps at 390x844 with nobody touching the screen: 396.55 world\n"
    "   px of x, 63.72 of y and 0.7419 of zoom, away from the first painted frame.\n"
    "   Her welcome still arrives, still speaks, and the walk is one tap away on a\n"
    "   button that says what it does. */\n"
    "if(document.body.classList.contains('pocket')){\n"
    "  setTimeout(()=>{leaveIntro();\n"
    "    if(!location.hash||location.hash.length<3||/hud=/.test(location.hash)){\n"
    "      guideAffordance();\n"
    "      if(!localStorage.getItem('amora-walk-done'))\n"
    "        /* NO TOAST HERE, AND THAT WAS MEASURED. A welcome toast sits in the\n"
    "           bottom band at 390x844 and covered both the seed and the walk\n"
    "           offer for its whole six seconds, which is to say it hid the very\n"
    "           button it was pointing at. #ghint above already teaches the two\n"
    "           gestures and this button already says what it does. */\n"
    "        maiaSay('Welcome to the living map of <b>Amora</b>. The land is yours to move: drag it, pinch it, "
    "tap any building to open its door. Tap <b>Take the walk</b> and I will show you around.')}},700)}\n",
    guard="/* POCKET BOOT: SHE SPEAKS, AND THE CAMERA STAYS WHERE IT IS.")

# ------------------------------------------------- 7. the exit door (addendum 3)

src = edit(
    src, "the hint's guard reads the walk it was written to wait for",
    "    if(window.JWALK||tries<3)return;                     // the pocket boot decides at 700ms\n",
    "    /* `window.JWALK` was always undefined: JWALK is a script-level `let` and\n"
    "       never a property of window, so this guard has never once held the hint\n"
    "       back and the two lines could print over a map that was flying. */\n"
    "    if((typeof JWALK!=='undefined'&&JWALK)||tries<3)return;   // the pocket boot decides at 700ms\n",
    guard="    if((typeof JWALK!=='undefined'&&JWALK)||tries<3)return;")

src = edit(
    src, "the map knows when it is inside a shell",
    "try{if(window.parent!==window)window.parent.postMessage("
    "{type:'grounds-ready',version:window.BUILD_VERSION||'v0.7'},'*')}catch(_){}\n",
    "/* body.embed: THE ONE OVERLAY ABOVE THIS DOCUMENT GETS ROOM MADE FOR IT.\n"
    "   In app mode the shell draws a single control over the frame, and on a desk\n"
    "   it lives in the bottom left corner. The map is the only thing that knows\n"
    "   where its own chrome is, so the map is what moves. Nothing here changes\n"
    "   for a standalone artifact, which is every QA run and every file:// open. */\n"
    "try{if(window.parent!==window)document.body.classList.add('embed')}catch(_){}\n"
    "try{if(window.parent!==window)window.parent.postMessage("
    "{type:'grounds-ready',version:window.BUILD_VERSION||'v0.7'},'*')}catch(_){}\n",
    guard="try{if(window.parent!==window)document.body.classList.add('embed')}catch(_){}")

src = edit(
    src, "room in the bottom left corner for the shell's door",
    "  #mmLabel{text-align:center;color:var(--gold);font-variant:small-caps;"
    "letter-spacing:.25em;font-size:9px;padding-top:5px}\n",
    "  #mmLabel{text-align:center;color:var(--gold);font-variant:small-caps;"
    "letter-spacing:.25em;font-size:9px;padding-top:5px}\n"
    "  /* THE SHELL'S DOOR SITS AT BOTTOM LEFT IN APP MODE, so the minimap steps\n"
    "     up out of that corner and the build bar's floor follows it. 66px is the\n"
    "     door's 12px offset plus its 44px minimum plus 10px of air, and the inset\n"
    "     is added because a phone in landscape puts a home indicator down there.\n"
    "     The minimap is 254x201 with its label, so the build bar's floor has to\n"
    "     clear 66+201 before it clears anything. */\n"
    "  body.embed #minimapWrap{bottom:calc(66px + env(safe-area-inset-bottom,0px))}\n"
    "  body.embed #buildBar{bottom:calc(279px + env(safe-area-inset-bottom,0px))}\n",
    guard="  body.embed #minimapWrap{bottom:calc(66px + env(safe-area-inset-bottom,0px))}")

src = edit(
    src, "the exit door, in the bottom panel, in the map's own hand",
    " <button id=\"pbMore\"><b><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">"
    "<path class=\"ln\" d=\"M4.4 7.3q7.6-1 15.2 0M4.4 12q7.6-1 15.2 0M4.4 16.7q7.6-1 15.2 0\"/>"
    "</svg></b>more</button>\n",
    " <button id=\"pbMore\"><b><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">"
    "<path class=\"ln\" d=\"M4.4 7.3q7.6-1 15.2 0M4.4 12q7.6-1 15.2 0M4.4 16.7q7.6-1 15.2 0\"/>"
    "</svg></b>more</button>\n"
    " <button id=\"pbExit\" aria-label=\"Leave the map\"><b><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">"
    "<path class=\"ln\" d=\"M13.4 4.3H5.7v15.4h7.7\"/>"
    "<path class=\"ln\" d=\"M11.3 12h8.3M16.3 8.7 19.6 12l-3.3 3.3\"/>"
    "</svg></b>leave</button>\n",
    guard="<button id=\"pbExit\" aria-label=\"Leave the map\">")

src = edit(
    src, "the exit door wired to the one path out",
    "if($('pbMore'))$('pbMore').onclick=()=>{renderDrawer();$('pdrawer').classList.toggle('open');hap(8)};\n",
    "if($('pbMore'))$('pbMore').onclick=()=>{renderDrawer();$('pdrawer').classList.toggle('open');hap(8)};\n"
    "/* THE DOOR OUT, IN THE BOTTOM PANEL WHERE A THUMB ALREADY IS. It used to be\n"
    "   the shell's overlay card in the top left corner, which is where #buildBtn\n"
    "   lives on a desk, and it sat on top of it. The words are the ones the pocket\n"
    "   drawer has always used for exitMap(), because two names for one door is how\n"
    "   this got confusing. `leave` is the visible half of `Leave the map`, so the\n"
    "   accessible name still contains the label SC 2.5.3 asks about. */\n"
    "if($('pbExit'))$('pbExit').onclick=()=>{hap(8);exitMap()};\n",
    guard="if($('pbExit'))$('pbExit').onclick=()=>{hap(8);exitMap()};")

# ------------------------------------------ 8. the builder's plaque (addendum 4)

src = edit(
    src, "the Build button becomes a plaque worth being handed",
    "  #buildBtn{position:absolute;left:14px;top:52px;z-index:33;border:1px solid #6b5430;"
    "border-radius:8px;cursor:pointer;\n"
    "    background:linear-gradient(180deg,#2c2114,#1c140b);color:var(--parch);font-family:inherit;font-size:11px;\n"
    "    font-variant:small-caps;letter-spacing:.14em;padding:7px 14px;box-shadow:0 3px 10px rgba(0,0,0,.5)}\n"
    "  body.build #buildBtn{background:linear-gradient(180deg,#7a5f33,#5a4423);color:#fff}\n",
    "  /* ONE EASING FOR THE WHOLE PRODUCT. This is --nat-ease-organic from the\n"
    "     Natural Interface kit (client/src/index.css), copied by value because a\n"
    "     standalone 5.5 MB document has no module graph to import it through. It\n"
    "     is declared here so the seed's bloom and the plaque below are demonstrably\n"
    "     the same curve rather than two literals that happen to match today. */\n"
    "  :root{--nat-ease-organic:cubic-bezier(.37,0,.29,1)}\n"
    "  /* THE BUILDER'S PLAQUE. Shaping the land is the rarest thing anybody can do\n"
    "     on this map, and it was a small brown chip. It is now the same gold plaque\n"
    "     the district banners and the vitals strip are made of: an etched tablet,\n"
    "     a lit bead for the lantern, the parchment letterform the map writes every\n"
    "     other name in. Nothing foreign is imported and nothing new is invented.\n"
    "     PRESENCE AT REST, NEVER A LOOP. natural-interface.md draws the line at\n"
    "     motion that ANSWERS a person against motion that interrupts, and this\n"
    "     sits over a map somebody is navigating. So the glow is a static box\n"
    "     shadow; the only motion is the press and the one moment the land opens.\n"
    "     44 px is a floor here as everywhere: the chip was 30. */\n"
    "  #buildBtn{position:absolute;left:14px;top:52px;z-index:33;cursor:pointer;\n"
    "    min-height:44px;padding:9px 18px;border:1px solid #8a6a33;border-radius:10px;\n"
    "    background:linear-gradient(180deg,rgba(58,43,24,.98),rgba(30,21,11,.99));\n"
    "    color:var(--gold-b);font-family:inherit;font-size:12px;\n"
    "    font-variant:small-caps;letter-spacing:.2em;\n"
    "    display:inline-flex;align-items:center;gap:10px;\n"
    "    text-shadow:0 1px 0 rgba(0,0,0,.65);\n"
    "    box-shadow:0 3px 12px rgba(0,0,0,.55),inset 0 1px 0 rgba(236,208,138,.34),\n"
    "      inset 0 -1px 0 rgba(0,0,0,.5),0 0 20px rgba(236,208,138,.16);\n"
    "    transition:box-shadow .28s var(--nat-ease-organic),transform .28s var(--nat-ease-organic)}\n"
    "  /* The lantern bead. The same light the funding ring and the ✦ lantern use. */\n"
    "  #buildBtn::before{content:'';width:11px;height:11px;flex:0 0 11px;border-radius:50%;\n"
    "    background:radial-gradient(circle at 34% 30%,#fff3d0,#e8c877 45%,#8a6a33 100%);\n"
    "    box-shadow:0 0 9px rgba(236,208,138,.55)}\n"
    "  #buildBtn::after{content:'';position:absolute;inset:-3px;border-radius:13px;\n"
    "    pointer-events:none;border:1px solid rgba(236,208,138,.6);opacity:0}\n"
    "  #buildBtn:hover{box-shadow:0 4px 16px rgba(0,0,0,.55),inset 0 1px 0 rgba(236,208,138,.44),\n"
    "    inset 0 -1px 0 rgba(0,0,0,.5),0 0 30px rgba(236,208,138,.3)}\n"
    "  #buildBtn:focus-visible{outline:2px solid #e8c877;outline-offset:3px}\n"
    "  #buildBtn:active{transform:scale(.975)}\n"
    "  /* THE LAND OPENING TO YOU. One shot, on the way IN only: the rule stops\n"
    "     applying when body.build comes off, so leaving is quiet. Transform and\n"
    "     opacity only, on a ring that is its own pseudo-element, so nothing here\n"
    "     paints a shadow per frame or asks for a layout. */\n"
    "  @keyframes bb-open{0%{opacity:.9;transform:scale(.955)}100%{opacity:0;transform:scale(1.24)}}\n"
    "  @keyframes bb-lift{0%{transform:scale(1)}40%{transform:scale(1.05)}100%{transform:scale(1)}}\n"
    "  body.build #buildBtn{background:linear-gradient(180deg,#8a6a33,#5a4423);color:#fff8e6;\n"
    "    border-color:#e8c877;\n"
    "    box-shadow:0 3px 14px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,244,214,.42),\n"
    "      0 0 30px rgba(236,208,138,.45);\n"
    "    animation:bb-lift .4s var(--nat-ease-organic)}\n"
    "  body.build #buildBtn::before{background:radial-gradient(circle at 34% 30%,#fff,#ffe9a3 45%,#e8c877 100%);\n"
    "    box-shadow:0 0 14px rgba(255,233,163,.9)}\n"
    "  body.build #buildBtn::after{animation:bb-open .52s var(--nat-ease-organic) both}\n"
    "  /* A DIGNIFIED STILL STATE. The lit plaque still reads as lit, instantly,\n"
    "     with nothing moving; the state was never carried by the motion. */\n"
    "  @media (prefers-reduced-motion:reduce){\n"
    "    #buildBtn{transition:none}\n"
    "    body.build #buildBtn{animation:none}\n"
    "    body.build #buildBtn::after{animation:none;opacity:0}}\n",
    guard="  /* THE BUILDER'S PLAQUE. Shaping the land is the rarest thing anybody can do")

src = edit(
    src, "the plaque's own display survives the can-edit rule",
    "  body.can-edit #buildBtn{display:block}\n",
    "  /* inline-flex, NOT block, and this cost a screenshot to find. The plaque\n"
    "     lays its lantern bead out as a flex item, and `body.can-edit #buildBtn`\n"
    "     is a more specific selector six hundred lines further down the sheet, so\n"
    "     `display:block` won and the bead became an inline box with its width and\n"
    "     height ignored. MEASURED: the button came out 99.5 px wide when the bead\n"
    "     and its 10 px gap would have made it 117, which is the arithmetic saying\n"
    "     the bead was never laid out at all. */\n"
    "  body.can-edit #buildBtn{display:inline-flex}\n",
    guard="  body.can-edit #buildBtn{display:inline-flex}")

if APPLIED:
    save(src)

print("\npatch_r5_consent: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
