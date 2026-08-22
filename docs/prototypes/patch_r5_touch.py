#!/usr/bin/env python3
r"""
R5 / TOUCH — THE MAP OWNS ITS FINGERS.

THE FOUNDER'S WORDS WERE "incredibly unresponsive" AND THE FAMOUS FIX DOES
NOTHING FOR THAT. `touch-action:none` on the canvas is the one-liner everyone
reaches for, and MOBILE_MAP_NAV_RESEARCH.md measured it: forced onto #scene it
changed the pan and the pinch numbers by exactly zero. It is still correct and it
is still here (edit 1), because it fixes the OTHER half — the browser claiming
the gesture and zooming the whole window. It is not the responsiveness fix.

THE RESPONSIVENESS FIX IS THAT TWO DRAG IMPLEMENTATIONS WERE BOUND TO THE SAME
CANVAS AND BOTH RAN ON EVERY TOUCH. The desktop pointer path at :2146/:2152 has
no pointerType guard anywhere in 8109 lines, and the pocket touch path at
:7853 reads the same fingers. MEASURED here with trusted CDP touch input at
390x844, five paired reps, finger still down so no inertia is folded in:

    one-finger drag, 100 CSS px at z=1.0     want 100     got 200.00   GAIN x2.00
    the same drag, after release              want ~100    got 257..269
    two-finger pinch centred on the screen    want 0       got +133.12 world px
      centre; a symmetric pinch translates      drift        and +985..1247 once
      nothing                                                the fling lands
    pinch about an off-centre midpoint;       want 0       got 62.48 screen px
      the land under the fingers must stay      drift
      under the fingers

The 2x is the two handlers adding their deltas. The pinch drift is the pointer
path's single `lastP` alternating between two fingers 200 px apart, plus a pinch
that set cam.z and never moved the camera, so it zoomed about the screen centre
while everything slid out from under the hand.

WHAT THIS SCRIPT DOES, in the order it matters:

  1  touch-action:none on #scene, and on the two pocket strips that sit over the
     map (#vitals, #pbar), matching what the file already gets right for the
     circles view (:541) and the Loom grips (:451).
  2  ONE zoom ceiling. It was written three times and the pocket pinch used a
     different number.
  3  The pointerType guard on both canvas pointer handlers, and pointercancel
     bound alongside pointerup.
  4  The WebKit gesture events widened from the canvas to the map's chrome, and
     their anchor tracking the live midpoint instead of freezing at gesturestart.
  5  touchNav rewritten: midpoint-anchored pinch (which gives two-finger pan for
     free), momentum sampled over a window, one camera write per frame, and
     finger-count transitions and touchcancel handled instead of dying silently.
  6  #pnav — zoom and pan buttons on the pocket profile. WCAG SC 2.5.1 is Level
     A and the Understanding document's worked example is literally a map with
     plus/minus buttons; SC 2.5.7 adds pan and says in as many words that the
     arrow keys at :4221 do not satisfy it alone.
  7  #ghint — the hint whose words have been in this file all along and have
     never once been displayed (:8002, :8008), shown non-modally over a live
     map, dismissing itself the moment WGATE.pan and WGATE.pinch both latch.
     That is the first READ of WGATE in the file's history.

WHAT IT DELIBERATELY DOES NOT DO. It does not touch the viewport meta, in this
document or in the client. `user-scalable=no` has been ignored by iOS since iOS
10 and is still honoured by Android Chrome, so shipping it would fail to help the
founder's iPhone while removing pinch-zoom for most Android visitors. It does not
put touch-action anywhere except the three map surfaces above, so every other
page keeps full browser zoom. And it does not answer whether an iOS Safari child
frame can refuse a page-level pinch: that is untested in the literature and needs
a real device.

ESCAPING. Nothing here writes an interpolated value into markup. #pnav is static,
and the hint's two lines are read out of WALK_SEED and set with textContent, so
the words cannot become markup at all. No escq/escj/escja call is touched.

Re-runnable. Every edit carries its own guard; a second run is all skips and zero
bytes changed. Afterwards, from docs/prototypes: node check_blocks.mjs, and from
docs/prototypes/qa: source ./env.sh && node _probe_touch_nav.js && node
verify_features.js.
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

# ---------------------------------------------------------------- 1. touch-action

src = edit(
    src, "touch-action on the map canvas",
    "  #scene{position:absolute;inset:0;cursor:grab}\n",
    "  /* THE CANVAS OWNS ITS GESTURES. Without this the browser is entitled to\n"
    "     claim every pan and pinch that starts here, and the only thing holding\n"
    "     it off was a preventDefault() inside touchmove, which is a race the map\n"
    "     wins by a hair on a fast machine and loses on a phone. MEASURED before\n"
    "     this line existed: getComputedStyle(#scene).touchAction was 'auto' on a\n"
    "     390x844 hasTouch context with body.pocket applied, and with the pocket\n"
    "     handler switched off Chromium marked 8 of 9 touchmoves NOT-cancelable,\n"
    "     which is the browser announcing it had already taken the gesture.\n"
    "     Same declaration as #orgSvg (:541) and .lgrip (:451): the file already\n"
    "     knew the rule and the one surface that IS the map was the one missed.\n"
    "     It must live in the stylesheet. Setting it inside pointerdown is too\n"
    "     late, because a gesture already under way ignores the change. */\n"
    "  #scene{position:absolute;inset:0;cursor:grab;touch-action:none}\n",
    guard="#scene{position:absolute;inset:0;cursor:grab;touch-action:none}")

src = edit(
    src, "touch-action on the pocket vitals strip",
    "  body.pocket #vitals{top:0;left:0;right:0;transform:none;width:100%;justify-content:center}\n",
    "  /* A pinch that lands a few pixels high, on the strip instead of the land,\n"
    "     is still a pinch at the map. These two bars sit over the canvas and take\n"
    "     nothing but taps, so nothing is lost by refusing the browser here too. */\n"
    "  body.pocket #vitals{top:0;left:0;right:0;transform:none;width:100%;justify-content:center;touch-action:none}\n",
    guard="width:100%;justify-content:center;touch-action:none}")

src = edit(
    src, "touch-action on the pocket bar",
    "  body.pocket #pbar{position:fixed;left:0;right:0;bottom:0;height:60px;z-index:60;display:flex;align-items:stretch;\n",
    "  body.pocket #pbar{position:fixed;left:0;right:0;bottom:0;height:60px;z-index:60;display:flex;align-items:stretch;touch-action:none;\n",
    guard="align-items:stretch;touch-action:none;")

# ---------------------------------------------------------------- 2. one ceiling

src = edit(
    src, "one zoom ceiling, named once",
    "const cam={x:900,y:640,z:0.72,vx:0,vy:0};\n",
    "const cam={x:900,y:640,z:0.72,vx:0,vy:0};\n"
    "/* ONE CEILING, WRITTEN ONCE. It was written three times and the pocket pinch\n"
    "   carried a different number from the other two: 2.6 there against 3.2 in\n"
    "   clampCam and travelTo. A finger could not reach the zoom a tapped building\n"
    "   flies to, so pinching in after a tap pulled the map BACK out. 3.2 is the\n"
    "   one that survives, because clampCam is the authority every other path\n"
    "   already defers to and travelTo lands inside it. */\n"
    "const ZMAX=3.2;\n",
    guard="const ZMAX=3.2;")

src = edit(
    src, "clampCam reads the named ceiling",
    "function clampCam(){cam.z=Math.max(minZoom(),Math.min(3.2,cam.z));\n",
    "function clampCam(){cam.z=Math.max(minZoom(),Math.min(ZMAX,cam.z));\n",
    guard="Math.min(ZMAX,cam.z)")

src = edit(
    src, "travelTo reads the named ceiling",
    "  const cz=Math.max(minZoom(),Math.min(3.2,tz));\n",
    "  const cz=Math.max(minZoom(),Math.min(ZMAX,tz));\n",
    guard="Math.min(ZMAX,tz)")

# ---------------------------------------------------------------- 3. the guard

src = edit(
    src, "pointerdown stands down for fingers",
    "cv.addEventListener('pointerdown',e=>{\n"
    "  if(window.boundPointerDown&&window.boundPointerDown(e)){cv.setPointerCapture(e.pointerId);return}\n",
    "/* MOUSE AND PEN ONLY, PAST THIS LINE. This path was written for a mouse and\n"
    "   fires for every finger as well, so on a phone it panned the same camera the\n"
    "   pocket touch handler was already panning, from the same fingers. MEASURED\n"
    "   with trusted CDP touch input at 390x844, finger still down: a 100 CSS px\n"
    "   drag at z=1.0 moved the camera 200.00 world px, exactly twice what the\n"
    "   finger asked for, and the tally showed pointermove x10 AND touchmove x9\n"
    "   reaching #scene from one drag. Worse on two fingers: this handler keeps a\n"
    "   SINGLE lastP for every pointer id, so during a pinch it alternates between\n"
    "   two fingers 200 px apart and drags the camera by the difference. A pinch\n"
    "   centred exactly on the screen centre, which should translate nothing at\n"
    "   all, moved it +133 world px before release and +985 to +1247 once the\n"
    "   momentum this handler loaded had landed.\n"
    "   THE GUARD IS ON pointerType, NOT ON body.pocket, deliberately: a touchscreen\n"
    "   laptop is the desk profile with real fingers on it, and #hud=desk exists.\n"
    "   A pen keeps this path, which is what a pen is for.\n"
    "   WHAT THIS COSTS: dragging a building with a FINGER in build mode is now a\n"
    "   mouse-and-pen action. It was never usable by finger anyway, because the\n"
    "   camera moved underneath the building the whole time. */\n"
    "cv.addEventListener('pointerdown',e=>{\n"
    "  if(e.pointerType==='touch')return; // fingers belong to touchNav, the only path that reads them\n"
    "  if(window.boundPointerDown&&window.boundPointerDown(e)){cv.setPointerCapture(e.pointerId);return}\n",
    guard="// fingers belong to touchNav, the only path that reads them")

src = edit(
    src, "pointermove stands down for fingers; pointercancel joins pointerup",
    "addEventListener('pointermove',e=>{\n"
    "  if(dragging&&lastP){const dx=(e.clientX-lastP[0])/cam.z,dy=(e.clientY-lastP[1])/cam.z;\n"
    "    cam.x-=dx;cam.y-=dy;cam.vx=-dx;cam.vy=-dy;lastP=[e.clientX,e.clientY];clampCam()}\n"
    "  else updateHover(e.clientX,e.clientY)});\n"
    "addEventListener('pointerup',()=>{dragging=false;cv.classList.remove('dragging');lastP=null});\n",
    "addEventListener('pointermove',e=>{\n"
    "  if(e.pointerType==='touch')return; // ditto, and hover is not a thing a finger has\n"
    "  if(dragging&&lastP){const dx=(e.clientX-lastP[0])/cam.z,dy=(e.clientY-lastP[1])/cam.z;\n"
    "    cam.x-=dx;cam.y-=dy;cam.vx=-dx;cam.vy=-dy;lastP=[e.clientX,e.clientY];clampCam()}\n"
    "  else updateHover(e.clientX,e.clientY)});\n"
    "/* pointerup stays open to fingers because it only CLEARS state, and clearing\n"
    "   twice is the same as clearing once. pointercancel joins it: the browser\n"
    "   fires that one when it has concluded the pointer will produce no more\n"
    "   events, which is exactly the moment a half-finished drag would otherwise be\n"
    "   left with dragging=true and the land stuck to a hand that is gone. */\n"
    "const endPointer=()=>{dragging=false;cv.classList.remove('dragging');lastP=null};\n"
    "addEventListener('pointerup',endPointer);\n"
    "addEventListener('pointercancel',endPointer);\n",
    guard="addEventListener('pointercancel',endPointer);")

src = edit(
    src, "a building is dragged by mouse or pen, never by finger",
    "  el.addEventListener('pointerdown',e=>{if(buildMode)startDrag(e,s)});\n",
    "  /* Same rule as the canvas: touchNav owns fingers, so a finger here would\n"
    "     drag the building AND pan the land under it. This is the only pointer\n"
    "     handler outside #scene that a finger could still have reached. */\n"
    "  el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(buildMode)startDrag(e,s)});\n",
    guard="if(e.pointerType==='touch')return;if(buildMode)startDrag(e,s)")

# ---------------------------------------------------------------- 4. WebKit gestures

src = edit(
    src, "the WebKit gesture events, widened and anchored live",
    "(function safariPinch(){let gz=1,gx=0,gy=0; // Safari speaks gestures where others speak ctrl-wheel\n"
    "  cv.addEventListener('gesturestart',e=>{e.preventDefault();gz=cam.z;gx=e.clientX;gy=e.clientY});\n"
    "  cv.addEventListener('gesturechange',e=>{e.preventDefault();\n"
    "    const[wx,wy]=screenToWorld(gx,gy);cam.z=gz*e.scale;clampCam();\n"
    "    const[nx,ny]=screenToWorld(gx,gy);cam.x+=wx-nx;cam.y+=wy-ny;clampCam()});\n"
    "  cv.addEventListener('gestureend',e=>e.preventDefault())})();\n",
    "/* THE WEBKIT GESTURE EVENTS, WIDENED TO THE MAP'S OWN CHROME AND NO FURTHER.\n"
    "   These are Safari-only and they are the belt to touch-action's braces: on\n"
    "   macOS they arrive with no pointer or touch event beside them, which is how\n"
    "   pointer-only libraries miss a trackpad pinch and let the page zoom instead.\n"
    "   Apple's own instruction for refusing a page zoom is to preventDefault\n"
    "   gesturestart and gesturechange, and {passive:false} is what makes that\n"
    "   preventDefault mean anything.\n"
    "   THE ANCHOR NOW TRACKS THE FINGERS. It was frozen at gesturestart, so a\n"
    "   pinch that drifted zoomed about where the hand STARTED. Carrying the live\n"
    "   midpoint forward gives two-finger pan out of the same arithmetic.\n"
    "   WIDENED TO #vitals, #pbar AND #pnav ONLY. A pinch that lands a few pixels\n"
    "   off the canvas, on the strip or on the bar, is still a pinch at the map.\n"
    "   It is NOT widened to the document: the reading sheets in here keep their\n"
    "   pinch, because on a phone pinch-zoom is the mechanism SC 1.4.4 leans on to\n"
    "   resize text, and taking it from a panel of prose would be the accessibility\n"
    "   failure this whole lane is trying not to commit. */\n"
    "(function safariPinch(){let gz=1,gx=0,gy=0; // Safari speaks gestures where others speak ctrl-wheel\n"
    "  cv.addEventListener('gesturestart',e=>{e.preventDefault();gz=cam.z;gx=e.clientX;gy=e.clientY},{passive:false});\n"
    "  cv.addEventListener('gesturechange',e=>{e.preventDefault();\n"
    "    const[wx,wy]=screenToWorld(gx,gy);cam.z=Math.max(minZoom(),Math.min(ZMAX,gz*e.scale));\n"
    "    const mx=(typeof e.clientX==='number')?e.clientX:gx,my=(typeof e.clientY==='number')?e.clientY:gy;\n"
    "    const[nx,ny]=screenToWorld(mx,my);cam.x+=wx-nx;cam.y+=wy-ny;gx=mx;gy=my;clampCam()},{passive:false});\n"
    "  cv.addEventListener('gestureend',e=>e.preventDefault(),{passive:false});\n"
    "  for(const id of ['vitals','pbar','pnav']){const s=document.getElementById(id);if(!s)continue;\n"
    "    for(const t of ['gesturestart','gesturechange','gestureend'])\n"
    "      s.addEventListener(t,e=>{if(e.cancelable)e.preventDefault()},{passive:false})}})();\n",
    guard="for(const id of ['vitals','pbar','pnav'])")

# ---------------------------------------------------------------- 5. touchNav

src = edit(
    src, "touchNav owns the fingers, anchored, batched and cancellable",
    "/* gestures: one-finger pan, two-finger pinch, on the canvas */\n"
    "(function touchNav(){const el=$('scene');if(!el)return;let T=null; // id is 'scene'; $('cv') was null and this block never ran\n"
    "  el.addEventListener('touchstart',e=>{if(!document.body.classList.contains('pocket'))return;\n"
    "    if(e.touches.length===1){const t=e.touches[0];T={m:'pan',x:t.clientX,y:t.clientY}}\n"
    "    else if(e.touches.length===2){const[a,b]=e.touches;\n"
    "      T={m:'pinch',d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z:cam.z}}},{passive:true});\n"
    "  el.addEventListener('touchmove',e=>{if(!T)return;e.preventDefault();\n"
    "    if(T.m==='pan'&&e.touches.length===1){const t=e.touches[0];\n"
    "      cam.x-=(t.clientX-T.x)/cam.z;cam.y-=(t.clientY-T.y)/cam.z;T.x=t.clientX;T.y=t.clientY;\n"
    "      travel=null;clampCam();window.WGATE&&(WGATE.pan=true)}\n"
    "    if(T.m==='pinch'&&e.touches.length===2){const[a,b]=e.touches;\n"
    "      const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);\n"
    "      cam.z=Math.max(minZoom(),Math.min(2.6,T.z*d/T.d));clampCam();window.WGATE&&(WGATE.pinch=true)}},{passive:false});\n"
    "  el.addEventListener('touchend',()=>{T=null},{passive:true})})();\n",
    "/* GESTURES ON THE LAND: one finger pans, two fingers pinch and pan together.\n"
    "   THIS IS NOW THE ONLY PATH THAT READS A FINGER. The pointer handlers above\n"
    "   stand down on pointerType 'touch', which is why the pocket check that used\n"
    "   to open this block is gone: a touchscreen laptop runs the desk profile with\n"
    "   real fingers on it, and standing both paths down there would have left it\n"
    "   with no pan at all.\n"
    "   THE MIDPOINT IS THE ANCHOR, and that one change carries three fixes. The\n"
    "   old code set cam.z and never moved the camera, so the map zoomed about the\n"
    "   screen centre and everything slid out from under the hand; the error grew\n"
    "   with distance from centre, so it was worst exactly where someone pinches a\n"
    "   corner. MEASURED before: 62.48 screen px of drift on a pinch about a point\n"
    "   90 px off centre. Reading the world point under the PREVIOUS midpoint at\n"
    "   the OLD zoom and putting it back under the NEW midpoint keeps the land\n"
    "   under the fingers AND gives two-finger pan out of the same two lines.\n"
    "   ONE CAMERA WRITE PER FRAME. Touch hardware reports at 120 to 240 Hz and\n"
    "   this map repaints the whole canvas every rAF tick, so applying each move as\n"
    "   it arrives spends the frame budget on arithmetic nobody ever sees. The\n"
    "   compositor also has to wait for this handler before it can commit a frame,\n"
    "   because it cannot know until then whether preventDefault will be called.\n"
    "   MOMENTUM LIVES HERE NOW. It used to arrive only as a side effect of the\n"
    "   pointer path bug, which is a coupling nobody chose. It is sampled over a\n"
    "   window of recent positions rather than the last two events, because one\n"
    "   jittery final sample is what flings a map across the world, and a hand that\n"
    "   stopped moving before it lifted gets no fling at all: the 110 ms test is\n"
    "   what makes 'stopped, then lifted' mean stopped. Under a reduced-motion\n"
    "   preference the pan simply lands.\n"
    "   FINGER-COUNT CHANGES RE-SEAT INSTEAD OF DYING. Lifting one finger of a\n"
    "   pinch used to leave the gesture believing it was still a pinch while only\n"
    "   one touch remained, so both branches failed their length test and nothing\n"
    "   moved until the whole hand left the glass. touchcancel had no listener at\n"
    "   all, which is the event the browser sends when it takes the gesture. */\n"
    "(function touchNav(){const el=$('scene');if(!el)return; // id is 'scene'; $('cv') was null and this block never ran\n"
    "  let T=null,pend=null,raf=0,samp=[];\n"
    "  const CALM=()=>{try{return matchMedia('(prefers-reduced-motion:reduce)').matches}catch(_){return false}};\n"
    "  const snap=e=>{const a=[];for(let i=0;i<e.touches.length&&i<2;i++)a.push([e.touches[i].clientX,e.touches[i].clientY]);return a};\n"
    "  /* Seat the gesture on whatever is on the glass right now. */\n"
    "  function seat(p){\n"
    "    if(p.length===1)T={m:'pan',x:p[0][0],y:p[0][1]};\n"
    "    else if(p.length>=2){const d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);\n"
    "      T={m:'pinch',d:d||1,z:cam.z,mx:(p[0][0]+p[1][0])/2,my:(p[0][1]+p[1][1])/2};samp=[]}\n"
    "    else T=null}\n"
    "  function apply(p){\n"
    "    if(!T)return;\n"
    "    if(T.m==='pan'&&p.length===1){const x=p[0][0],y=p[0][1];\n"
    "      cam.x-=(x-T.x)/cam.z;cam.y-=(y-T.y)/cam.z;T.x=x;T.y=y;\n"
    "      clampCam();window.WGATE&&(WGATE.pan=true);return}\n"
    "    if(T.m==='pinch'&&p.length>=2){\n"
    "      const d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),\n"
    "        mx=(p[0][0]+p[1][0])/2,my=(p[0][1]+p[1][1])/2;\n"
    "      const wx=screenToWorld(T.mx,T.my)[0],wy=screenToWorld(T.mx,T.my)[1];\n"
    "      cam.z=Math.max(minZoom(),Math.min(ZMAX,T.z*d/T.d));\n"
    "      const nx=screenToWorld(mx,my)[0],ny=screenToWorld(mx,my)[1];\n"
    "      cam.x+=wx-nx;cam.y+=wy-ny;T.mx=mx;T.my=my;\n"
    "      clampCam();window.WGATE&&(WGATE.pinch=true);return}\n"
    "    seat(p)}\n"
    "  function flush(){raf=0;const p=pend;pend=null;if(p)apply(p)}\n"
    "  function nowFlush(){if(raf){cancelAnimationFrame(raf);raf=0}flush()}\n"
    "  el.addEventListener('touchstart',e=>{\n"
    "    if(!T){dragging=true;cv.classList.add('dragging');cam.vx=cam.vy=0;samp=[];\n"
    "      /* the pointer path used to do this on every touch, and a cancelled\n"
    "         flight still keeps its promise, so the tour chain re-arms */\n"
    "      if(travel){const d=travel.done;travel=null;d&&d()}}\n"
    "    else nowFlush();\n"
    "    seat(snap(e))},{passive:true});\n"
    "  el.addEventListener('touchmove',e=>{if(!T)return;\n"
    "    /* cancelable goes false once the browser has taken the gesture for itself,\n"
    "       and preventDefault then is a no-op with a console warning attached. */\n"
    "    if(e.cancelable)e.preventDefault();\n"
    "    const p=snap(e);\n"
    "    /* MOMENTUM IS SAMPLED HERE AND NOT IN THE FLUSH, which matters and cost a\n"
    "       measurement to learn. Batching is a rendering decision: several moves\n"
    "       can collapse into one frame, and under load they collapse into one\n"
    "       flush, at which point a velocity read from the flush has a single\n"
    "       sample and no velocity at all. MEASURED: a fling that produced a 32\n"
    "       world px tail when the probe ran it alone produced a tail of exactly\n"
    "       zero as the fourth measurement in a rep. touchmove also carries the\n"
    "       real sub-frame timing, which is the thing a velocity estimate wants. */\n"
    "    if(T.m==='pan'&&p.length===1){samp.push([p[0][0],p[0][1],performance.now()]);\n"
    "      if(samp.length>8)samp.shift()}\n"
    "    pend=p;if(!raf)raf=requestAnimationFrame(flush)},{passive:false});\n"
    "  function close(e,cancelled){\n"
    "    nowFlush();\n"
    "    const left=(e&&e.touches)?e.touches.length:0;\n"
    "    if(left>0){seat(snap(e));return}   // a finger left a pinch: carry on as a pan\n"
    "    T=null;dragging=false;cv.classList.remove('dragging');\n"
    "    if(cancelled||CALM()){cam.vx=cam.vy=0;samp=[];return}\n"
    "    const n=samp.length;\n"
    "    if(n>=2){const last=samp[n-1];let first=samp[0];\n"
    "      for(let i=n-1;i>=0;i--){if(last[2]-samp[i][2]<=110)first=samp[i];else break}\n"
    "      const dt=last[2]-first[2];\n"
    "      if(dt>0&&performance.now()-last[2]<110){\n"
    "        const k=16.7/(dt*cam.z),cap=30/cam.z;\n"
    "        let vx=-(last[0]-first[0])*k,vy=-(last[1]-first[1])*k;\n"
    "        const sp=Math.hypot(vx,vy);\n"
    "        if(sp>cap){vx=vx*cap/sp;vy=vy*cap/sp}\n"
    "        cam.vx=vx;cam.vy=vy}}\n"
    "    samp=[]}\n"
    "  el.addEventListener('touchend',e=>close(e,false),{passive:true});\n"
    "  el.addEventListener('touchcancel',e=>close(e,true),{passive:true})})();\n",
    guard="GESTURES ON THE LAND: one finger pans, two fingers pinch and pan together.")

# ---------------------------------------------------------------- 6. #pnav CSS

src = edit(
    src, "the pocket zoom and pan controls, styled",
    "  #pdrawer{position:fixed;left:0;right:0;bottom:-90%;height:78%;z-index:59;display:flex;flex-direction:column;\n",
    "  /* ZOOM AND PAN WITHOUT A GESTURE. SC 2.5.1 Pointer Gestures is Level A, its\n"
    "     definition of a multipoint gesture names the two-finger pinch outright,\n"
    "     and its Understanding document's worked example is this application: a\n"
    "     map that pinches to zoom, with plus and minus buttons as the single\n"
    "     pointer alternative. SC 2.5.7 covers the pan and says, verbatim, that\n"
    "     keyboard equivalence does not meet it unless the same operation is also\n"
    "     available to a pointer, so the arrow keys at :4221 do not carry this on\n"
    "     their own. Every button clears 44 px, well past the 24 that SC 2.5.8 asks\n"
    "     for, and matches the shell's own back button.\n"
    "     z-index 44 is chosen, not inherited: under #panel at 45 and under every\n"
    "     pocket sheet above it, so a drawer the reader opened covers these instead\n"
    "     of leaving them floating on top of it. */\n"
    "  #pnav{display:none}\n"
    "  body.pocket #pnav{position:fixed;right:8px;bottom:calc(72px + env(safe-area-inset-bottom,0px));\n"
    "    z-index:44;display:flex;flex-direction:column;align-items:center;gap:6px}\n"
    "  #pnav .pnrow{display:flex;gap:6px}\n"
    "  #pnav .pnpad{display:grid;grid-template-columns:repeat(3,36px);grid-template-rows:repeat(3,36px);gap:2px}\n"
    "  #pnav button{appearance:none;-webkit-appearance:none;font-family:inherit;color:var(--parch);\n"
    "    background:linear-gradient(180deg,rgba(28,20,12,.93),rgba(18,13,7,.96));\n"
    "    border:1px solid #8a6a33;border-radius:9px;display:flex;align-items:center;justify-content:center;\n"
    "    line-height:1;touch-action:none;-webkit-tap-highlight-color:transparent}\n"
    "  #pnav button:active{background:rgba(64,48,26,.97)}\n"
    "  #pnav .pnz{width:44px;height:44px;font-size:21px}\n"
    "  #pnav .pnpad button{width:36px;height:36px;font-size:13px;border-radius:8px}\n"
    "  #pnUp{grid-area:1/2}#pnLeft{grid-area:2/1}#pnRight{grid-area:2/3}#pnDown{grid-area:3/2}\n"
    "  /* THE HINT WHOSE WORDS WERE ALREADY IN THIS FILE. It is annotation, not\n"
    "     chrome: no plate, no border, nothing that reads as pressable. Users in\n"
    "     NN/g's Wimbledon study tried to TAP the tutorial annotations, so a hint\n"
    "     that looks like a control is a hint that wastes a tap. The land under it\n"
    "     stays live and draggable, which is what pointer-events:none buys. */\n"
    "  #ghint{display:none}\n"
    "  body.pocket #ghint{position:fixed;left:14px;right:14px;top:52px;z-index:44;\n"
    "    display:flex;flex-direction:column;gap:3px;align-items:center;pointer-events:none;\n"
    "    opacity:0;transition:opacity .55s ease}\n"
    "  body.pocket #ghint.on{opacity:1}\n"
    "  #ghint p{font-size:12.5px;font-style:italic;letter-spacing:.03em;color:#f3e6c8;text-align:center;\n"
    "    text-shadow:0 1px 3px rgba(0,0,0,.92),0 0 11px rgba(0,0,0,.75);transition:opacity .45s ease}\n"
    "  #ghint p.got{opacity:.26;text-decoration:line-through}\n"
    "  /* Clear of the vitals strip on purpose: a 44 px target overlapping the bar\n"
    "     would take taps meant for a reading. */\n"
    "  #ghint #ghintX{pointer-events:auto;position:absolute;right:-10px;top:4px;width:44px;height:44px;\n"
    "    appearance:none;-webkit-appearance:none;background:none;border:none;color:#f3e6c8;font-size:18px;\n"
    "    font-family:inherit;line-height:1;opacity:.7}\n"
    "  #pdrawer{position:fixed;left:0;right:0;bottom:-90%;height:78%;z-index:59;display:flex;flex-direction:column;\n",
    guard="  #pnav{display:none}")

# ---------------------------------------------------------------- 7. #pnav markup

src = edit(
    src, "the pocket zoom and pan controls, and the hint, in the markup",
    "<div id=\"help\"></div>\n"
    "<div id=\"pdrawer\"></div>\n"
    "<div id=\"walkCard\"></div>\n",
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
    "</div>\n"
    "<div id=\"ghint\" aria-live=\"polite\">\n"
    " <p id=\"ghintPan\"></p>\n"
    " <p id=\"ghintPinch\"></p>\n"
    " <button id=\"ghintX\" type=\"button\" aria-label=\"Hide these two lines\">&#215;</button>\n"
    "</div>\n"
    "<div id=\"help\"></div>\n"
    "<div id=\"pdrawer\"></div>\n"
    "<div id=\"walkCard\"></div>\n",
    guard="<div id=\"pnav\" role=\"group\"")

# ---------------------------------------------------------------- 8. wiring

src = edit(
    src, "the controls and the hint, wired",
    "/* pocket boot: skip the intro ceremony, walk the newcomer */\n",
    "/* THE SINGLE-POINTER PATH TO THE SAME TWO THINGS. One tap is one step, with\n"
    "   no press-and-hold, because a step big enough to be worth pressing is better\n"
    "   than a repeat rate to get wrong. Zoom is about the screen centre, which is\n"
    "   where a button press aims by definition, so no anchor arithmetic is needed:\n"
    "   the centre maps to cam.x,cam.y at every zoom. */\n"
    "(function pocketNav(){\n"
    "  const zoom=k=>{travel=null;cam.z=Math.max(minZoom(),Math.min(ZMAX,cam.z*k));clampCam();hap(6)};\n"
    "  const pan=(dx,dy)=>{travel=null;const s=140/cam.z;cam.x+=dx*s;cam.y+=dy*s;clampCam();hap(6)};\n"
    "  const on=(id,fn)=>{const b=$(id);if(b)b.onclick=fn};\n"
    "  on('pnIn',()=>zoom(1.35));on('pnOut',()=>zoom(1/1.35));\n"
    "  on('pnUp',()=>pan(0,-1));on('pnDown',()=>pan(0,1));\n"
    "  on('pnLeft',()=>pan(-1,0));on('pnRight',()=>pan(1,0))})();\n"
    "/* THE HINT, AND THE FIRST READ OF WGATE IN THIS FILE'S HISTORY. Both lines\n"
    "   have been sitting in WALK_SEED as gate_hint since the walk was written and\n"
    "   neither has ever been shown to anybody: the card that rendered them went\n"
    "   when the walk moved into the Maia dock. WGATE, the object built to record\n"
    "   that a newcomer has panned or pinched, has been WRITE-ONLY for just as\n"
    "   long. The words are read from the seed rather than copied, so there is one\n"
    "   copy of them, and they are set with textContent, so they cannot become\n"
    "   markup however a fork edits the seed.\n"
    "   IT DISMISSES ITSELF ON SUCCESS. Anyone who already knows how a map works\n"
    "   sees it for about a second. That is what makes it cost nothing: the\n"
    "   evidence against first-run tutorials is that they produce no gain in\n"
    "   success or speed and a measurable DROP in perceived ease, so this one never\n"
    "   blocks, never stacks, and never comes back once it has done its job.\n"
    "   IT NEVER RUNS OVER THE WELCOME WALK. The walk flies the camera 700 ms after\n"
    "   load, and 'drag the land' printed over land that is already moving on its\n"
    "   own reads as a malfunction. It waits for JWALK to be clear. */\n"
    "(function gestureHint(){\n"
    "  const box=$('ghint'),pl=$('ghintPan'),pz=$('ghintPinch');\n"
    "  if(!box||!pl||!pz||!document.body.classList.contains('pocket'))return;\n"
    "  try{if(localStorage.getItem('amora-gestures-seen'))return}catch(_){}\n"
    "  const say=g=>{const s=(window.WALK_SEED||[]).find(w=>w&&w.gesture===g);return(s&&s.gate_hint)||''};\n"
    "  pl.textContent=say('pan');pz.textContent=say('pinch');\n"
    "  if(!pl.textContent&&!pz.textContent)return;\n"
    "  let watch=0,tries=0;\n"
    "  const gone=()=>{clearInterval(watch);box.classList.remove('on');\n"
    "    setTimeout(()=>{box.style.display='none'},700);\n"
    "    try{localStorage.setItem('amora-gestures-seen','1')}catch(_){}};\n"
    "  $('ghintX').onclick=gone;\n"
    "  const show=()=>{box.classList.add('on');\n"
    "    watch=setInterval(()=>{const G=window.WGATE||{};\n"
    "      if(G.pan)pl.classList.add('got');\n"
    "      if(G.pinch)pz.classList.add('got');\n"
    "      if(G.pan&&G.pinch)gone()},240)};\n"
    "  const wait=setInterval(()=>{\n"
    "    if(++tries>240){clearInterval(wait);return}          // roughly three minutes, then let it be\n"
    "    if(window.JWALK||tries<3)return;                     // the pocket boot decides at 700ms\n"
    "    clearInterval(wait);show()},700)})();\n"
    "/* pocket boot: skip the intro ceremony, walk the newcomer */\n",
    guard="THE FIRST READ OF WGATE IN THIS FILE'S HISTORY")

if APPLIED:
    save(src)

print("\npatch_r5_touch: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
