# -*- coding: utf-8 -*-
"""L5/11: the satellites paint OVER the buildings, because that is where a
person can see them.

THE DEFECT, measured on the composited page by qa/verify_org_paint.js before
this patch, camera centred on each home at z=2.0, 15x15 px per satellite, on a
frozen clock so the number is the lens and not the weather:

    0%  community    Leadership Council
    0%  greenhouse   Permaculture Designer & Land Steward
    4%  community    Development Board of Directors
    94-100%  every other satellite

Nothing changes on screen where those three are drawn. The building sprite is a
DOM element in #icons at z-index 10 and the lens was painting into #scene,
which is under it. The ink lands, the sprite covers it.

WHY THE RADIUS WAS NOT THE FIX. The first cut of this lane drew satellites
inside the sprite and it was fixed with ROLE_SAT_R=30, from a measured 28.9-unit
half-extent. That constant only ever applied to a building with no halo: a
halo'd building takes h.r, the no-overlap solver drives h.r to 29.1 at the
Community Center, and the sprite there measures 43.0 units of half-width and
31.6 down (measured off the live DOM, qa/_probe_h5_occl.js). Raising the radius
until it clears is the wrong shape of answer twice over. The clearance needed
is not a constant: the sprite's extent in SCENE units is the CSS box times the
LOD scale over cam.z, so it grows as you zoom out and no single number holds.
And clearing the Community Center's sprite needs about 46 units against a halo
of 29, which puts a circle's own roles well outside its own ring and into the
next building's air. The satellites belong on the ring. They belong on top.

WHAT THIS DOES.

  1. ONE MORE CANVAS, #lens, z-index 11, over #icons (10) and under #banners
     (11, later in the document) and #badges (12). pointer-events none, so
     nothing about the map's hit testing changes. It is sized by fit(), from
     the same DPR and the same innerWidth/innerHeight as #scene, in the same
     function, so the two cannot drift on a resize.

  2. THE HALOS STAY WHERE THEY ARE. A halo is a wash on the ground and belongs
     under the buildings standing in it; a satellite is a mark ABOUT a
     building and belongs on top of it, which is what the badge seals already
     do from #badges at z 12. So roleLens takes an optional second context and
     draws the two halves onto the two surfaces. Called with one argument it
     behaves exactly as before, which is what every scratch-canvas check in
     verify_org_lens does.

  3. roleLensFrame OWNS THE LENS CANVAS. It is the only thing that draws
     there, so it is the only thing that has to clear it, and it is called
     every frame rather than only when the lens is on, because a canvas nobody
     clears keeps the last frame it was given forever. ROLE_PAINTED means the
     clear is paid once on the way down and not sixty times a second while the
     lens is off.

  4. THE RECORD FOLLOWS THE INK. ROLE_LAST_SATS.surface is read off the canvas
     the satellite was actually drawn on, so verify_org_paint's P1c asserts the
     real stacking rather than assuming it.

ONE THING CHANGES THAT IS NOT A BUG FIX. The day tint and the night wash are
applied to #scene after the lens draws, so a satellite used to go dark with the
land. On its own canvas it does not. That is the same rule the badge seals
already follow from the DOM, and a mark that says "this seat is open" is worth
less at dusk than at noon only if it is decoration.

    python patch_h5_11_overcanvas.py
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


def swap(name, old, new, count=1, mark=None):
    """One edit, one guard. The guard is a sentinel a later patch does not
    touch; an anchor matching anything other than `count` times aborts before a
    byte is written."""
    global src, applied, skipped
    if (mark or new) in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# ---------------------------------------------------------------- 1/7  CSS
OLD = "  #icons{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10}\n"
NEW = OLD + (
    "  /* ---------- L5: THE LENS PAINTS OVER THE BUILDINGS ----------\n"
    "     Over #icons at 10, which is where the sprites are, and under #banners\n"
    "     and #badges: #banners carries the same 11 and comes LATER in the\n"
    "     document, so the district names still win, and the seals at 12 still\n"
    "     win over everything. Deaf, like every other plane except the seals. */\n"
    "  #lens{position:absolute;inset:0;pointer-events:none;z-index:11}\n"
)
swap('1/7 the lens plane, between the sprites and the names', OLD, NEW,
     # THE GUARD IS THE SELECTOR, NOT THE RULE. Patch 13 rewrites this whole
     # block - comment and z-index both - to lift the plane over the seals, and
     # a guard carrying `z-index:11` stopped matching the moment it did. This
     # patch then re-applied on a family replay and inserted a SECOND #lens
     # rule and a second canvas. Caught by the second-run-is-all-skips check,
     # which is exactly what that check is for.
     mark='  #lens{position:absolute;inset:0;pointer-events:none;z-index:')

# ---------------------------------------------------------------- 2/7  DOM
OLD = '<div id="icons"></div>\n<div id="banners"></div>\n'
NEW = '<div id="icons"></div>\n<canvas id="lens"></canvas>\n<div id="banners"></div>\n'
swap('2/7 the canvas itself, after the sprites and before the names', OLD, NEW,
     mark='<canvas id="lens"></canvas>')

# ---------------------------------------------------------------- 3/7  context
OLD = "const cv=document.getElementById('scene'),cx=cv.getContext('2d');"
NEW = (
    "const cv=document.getElementById('scene'),cx=cv.getContext('2d');\n"
    "/* The lens plane. Declared beside the scene canvas so fit() can size both\n"
    "   in one place; read from the later script block the way cam and DPR are. */\n"
    "const lv=document.getElementById('lens'),lcx=lv.getContext('2d');"
)
swap('3/7 the lens context, beside the scene context', OLD, NEW,
     mark="const lv=document.getElementById('lens'),lcx=lv.getContext('2d');")

# ---------------------------------------------------------------- 4/7  size
# Same function, same DPR, same innerWidth: a resize cannot move one and not
# the other, and the two transforms are computed from the same numbers.
OLD = ("function fit(){DPR=Math.min(window.devicePixelRatio||1,2);"
       "cv.width=innerWidth*DPR;cv.height=innerHeight*DPR;"
       "cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px'}\n")
NEW = ("function fit(){DPR=Math.min(window.devicePixelRatio||1,2);"
       "cv.width=innerWidth*DPR;cv.height=innerHeight*DPR;"
       "cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';"
       "lv.width=cv.width;lv.height=cv.height;"
       "lv.style.width=cv.style.width;lv.style.height=cv.style.height}\n")
swap('4/7 one fit for both planes', OLD, NEW,
     mark='lv.width=cv.width;lv.height=cv.height;')

# ---------------------------------------------------------------- 5/7  the call
# Unconditional now: a canvas nobody clears keeps its last frame forever, so
# the frame function has to run on the way down too.
OLD = "  if(orgOn&&typeof roleLens==='function')roleLens(cx,mode,t);\n"
NEW = "  if(typeof roleLensFrame==='function')roleLensFrame(cx,mode,t);\n"
swap('5/7 the draw loop calls the frame, not the lens', OLD, NEW,
     mark="if(typeof roleLensFrame==='function')")

# ---------------------------------------------------------------- 6/7  two surfaces
OLD = "function roleLens(cx,mode,t){\n"
NEW = (
    "function roleLens(cx,mode,t,scx){\n"
    "  /* WHERE THE SATELLITES GO. `cx` takes the halos and `scx` takes the\n"
    "     satellites; absent, one canvas takes both, which is what a scratch\n"
    "     drive in the suites wants and what this did before the review found\n"
    "     three satellites painted underneath a building sprite. */\n"
    "  const sx2=scx||cx;\n"
)
swap('6/7 the lens can put its two halves on two planes', OLD, NEW,
     mark='  const sx2=scx||cx;')

OLD = "  const live=!!(cx.canvas&&cx.canvas.isConnected);\n"
NEW = "  const live=!!(sx2.canvas&&sx2.canvas.isConnected);\n"
swap('6b/7 the record answers for the canvas the satellites went onto', OLD, NEW,
     mark='  const live=!!(sx2.canvas&&sx2.canvas.isConnected);')

OLD = "        x:px,y:py,st:st,surface:cx.canvas.id});\n      roleSat(cx,px,py,\n"
NEW = "        x:px,y:py,st:st,surface:sx2.canvas.id});\n      roleSat(sx2,px,py,\n"
swap('6c/7 the ink and the record both name the satellite plane', OLD, NEW,
     mark='surface:sx2.canvas.id});')

# ---------------------------------------------------------------- 7/7  the frame
OLD = "window.roleLens=roleLens;\n"
NEW = (
    "window.roleLens=roleLens;\n"
    "/* ONE CALL A FRAME, AND IT OWNS THE LENS PLANE.\n"
    "\n"
    "   It runs whether the lens is on or off, because #lens is a canvas and a\n"
    "   canvas nobody clears keeps the last thing it was given until the page\n"
    "   is reloaded: toggling Org off used to be enough when the ink was on\n"
    "   #scene, which is repainted from the sea colour every frame. ROLE_PAINTED\n"
    "   is what keeps that from costing a full-viewport clear sixty times a\n"
    "   second while nobody is looking at the lens.\n"
    "\n"
    "   THE TRANSFORM IS THE SCENE'S OWN, computed from the same cam and the\n"
    "   same DPR in the same shape as the line in frame(), so a satellite lands\n"
    "   on the same scene point on both planes. save/restore for the reason\n"
    "   patch 09 gave for the other plane: roleSat leaves a dash pattern and an\n"
    "   alpha behind on the branch it returns from. */\n"
    "let ROLE_PAINTED=false;\n"
    "function roleLensFrame(cx,mode,t){\n"
    "  const on=!!orgOn;\n"
    "  if(on||ROLE_PAINTED){\n"
    "    lcx.setTransform(1,0,0,1,0,0);lcx.clearRect(0,0,lv.width,lv.height);\n"
    "    ROLE_PAINTED=on;\n"
    "    if(!on)ROLE_LAST_SATS.length=0}\n"
    "  if(!on)return;\n"
    "  lcx.setTransform(cam.z*DPR,0,0,cam.z*DPR,\n"
    "    lv.width/2-cam.x*cam.z*DPR,lv.height/2-cam.y*cam.z*DPR);\n"
    "  lcx.save();\n"
    "  roleLens(cx,mode,t,lcx);\n"
    "  lcx.restore()}\n"
    "window.roleLensFrame=roleLensFrame;\n"
)
swap('7/7 the frame that owns the plane', OLD, NEW,
     mark='function roleLensFrame(cx,mode,t){')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
