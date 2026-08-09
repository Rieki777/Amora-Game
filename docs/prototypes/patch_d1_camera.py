#!/usr/bin/env python3
"""Round D1: the camera and the hands.

Three complaints from Rye's live testing, one patch:

  D1.1  edge buildings could not be centred and pinch-out stopped short.
        The clamp held the *viewport* inside the world; now the clamp is the
        world itself, so any point of the land can sit at screen centre, and
        the zoom floor is FIT x 0.85 instead of COVER, so the whole land fits
        with a breath of margin. The gap beyond the land is painted in the
        deep-sea tone the terrain already uses at its western edge, so
        overscroll reads as world and not as void. And when a drawer is open
        the flight aims at the middle of the strip the reader can see.

  D1.2  trackpad pinch fell through to browser page zoom. A ctrl-wheel now
        zooms continuously about the cursor, Safari's gesture events do the
        same, and the pocket pinch loses its own hard floor of .4 (the plan
        blamed clampCam alone; the touch handler had a second floor).

  D1.3  labels floated a spring's height above their buildings.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d1_camera.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def rep(anchor, addition, where="after", count=1):
    """Splice `addition` around a uniquely-occurring anchor."""
    global src
    n = src.count(anchor)
    assert n == count, f"anchor appears {n} times, expected {count}: {anchor[:70]!r}"
    src = src.replace(anchor, anchor + addition if where == "after" else addition + anchor, 1)


def swap(old, new, count=1):
    """Replace a uniquely-occurring passage outright."""
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ── D1.1 · the clamp is the world, not the viewport ──────────────────────
# COVER fit was the old floor: the viewport always had to be full of land, so
# pinching out stopped the moment the land ran out. FIT x 0.85 lets the whole
# land sit on screen with a rim of sea around it. And clamping cam.x to [0,W]
# rather than [hw, W-hw] means a building at the boundary can reach the centre
# of the screen; half a screen of beyond-the-edge shows at the rim, which is
# what Rye asked for.
swap(
    """function clampCam(){const mz=Math.max(innerWidth/W,innerHeight/H);cam.z=Math.max(mz,Math.min(3.2,cam.z));
  const hw=innerWidth/2/cam.z,hh=innerHeight/2/cam.z;
  cam.x=Math.max(hw,Math.min(W-hw,cam.x));cam.y=Math.max(hh,Math.min(H-hh,cam.y))}
function travelTo(x,y,z,done){const tz=z||cam.z;
  const mz=Math.max(innerWidth/W,innerHeight/H),cz=Math.max(mz,Math.min(3.2,tz));
  const hw=innerWidth/2/cz,hh=innerHeight/2/cz;
  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(hw,Math.min(W-hw,x)),ty:Math.max(hh,Math.min(H-hh,y)),tz:cz,t:0,done}}""",
    """/* FIT, not COVER, and a little under: pinching all the way out shows the
   whole land with a breath of margin instead of stopping when the viewport
   is still full of ground. */
function minZoom(){return Math.min(innerWidth/W,innerHeight/H)*0.85}
window.minZoom=minZoom;
/* A drawer over the map means the map is no longer the whole window. Aim the
   flight at the middle of the strip the reader can actually see, so a tapped
   building does not land underneath the panel. Returns CSS pixels. */
function panelInset(){const pocket=document.body.classList.contains('pocket');let dx=0,dy=0;
  for(const id of ['panel','inspect']){const el=document.getElementById(id);
    if(!el||!el.classList.contains('open'))continue;
    if(pocket)dy=Math.max(dy,el.offsetHeight/2);else dx=Math.max(dx,el.offsetWidth/2)}
  const m=document.getElementById('module'),c=document.getElementById('moduleCard');
  /* On desk the module card sits in the middle of the map with strips on both
     sides, so there is nothing to aim at; on pocket it is a bottom sheet. */
  if(pocket&&m&&m.classList.contains('show')&&c)dy=Math.max(dy,c.offsetHeight/2);
  return[dx,dy]}
window.panelInset=panelInset;
/* The clamp is the world itself, not the viewport inside it: every point of
   the land can sit at screen centre. */
function clampCam(){cam.z=Math.max(minZoom(),Math.min(3.2,cam.z));
  cam.x=Math.max(0,Math.min(W,cam.x));cam.y=Math.max(0,Math.min(H,cam.y))}
function travelTo(x,y,z,done){const tz=z||cam.z;
  const cz=Math.max(minZoom(),Math.min(3.2,tz));
  const[ox,oy]=panelInset();
  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(0,Math.min(W,x+ox/cz)),ty:Math.max(0,Math.min(H,y+oy/cz)),tz:cz,t:0,done}}""",
)

# Letterbox manners. The terrain plate already paints real geography out to
# the world rect — ocean, shoreline, the highway above Dominicalito — so the
# only thing beyond it is the canvas clear. Paint that in the deep-sea tone
# the ocean gradient starts from (#16455e) and the rim reads as more world.
swap(
    "cx.setTransform(1,0,0,1,0,0);cx.fillStyle='#101d13';cx.fillRect(0,0,cv.width,cv.height);",
    "cx.setTransform(1,0,0,1,0,0);cx.fillStyle='#16455e';cx.fillRect(0,0,cv.width,cv.height); "
    "/* deep sea, the tone the painted ocean edge starts from: past the land is world, not void */",
)

# The two hand-fudged +90 offsets came from the same wish the inset now serves
# properly. Open the drawer first so the flight can measure it.
swap(
    """  travelTo(s.x+90,s.y,Math.max(cam.z,1.25));""",
    """  $('panel').classList.add('open'); // opened before the flight so travelTo can measure the strip that stays visible
  travelTo(s.x,s.y,Math.max(cam.z,1.25));""",
)
swap(
    """  renderTab(tab||0);$('panel').classList.add('open');maiaContext(s)}""",
    """  renderTab(tab||0);maiaContext(s)}""",
)
swap(
    """  travelTo(s.x+90,s.y,Math.max(cam.z,1.15));renderInspect();$('inspect').classList.add('open')}""",
    """  $('inspect').classList.add('open'); // same reason: the flight aims at what stays visible beside the card
  travelTo(s.x,s.y,Math.max(cam.z,1.15));renderInspect()}""",
)

# ── D1.2 · pinch everywhere ──────────────────────────────────────────────
# A trackpad pinch reaches a page as a wheel event carrying ctrlKey. Stepping
# it by 1.13 feels like a ratchet; an exponential factor follows the fingers.
swap(
    """cv.addEventListener('wheel',e=>{e.preventDefault();const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  cam.z*=e.deltaY<0?1.13:0.885;clampCam();""",
    """cv.addEventListener('wheel',e=>{e.preventDefault();const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  /* ctrlKey means a trackpad pinch, not a scroll: follow the fingers
     continuously instead of stepping, and never let the page zoom instead. */
  cam.z*=e.ctrlKey?Math.exp(-e.deltaY*0.012):(e.deltaY<0?1.13:0.885);clampCam();""",
)

# Safari does not send ctrl-wheel; it sends its own gesture events. Same zoom,
# same anchor point, so a Mac trackpad behaves the same in both browsers.
rep(
    """cv.addEventListener('dblclick',e=>{const[wx,wy]=screenToWorld(e.clientX,e.clientY);travelTo(wx,wy,Math.max(cam.z,1.15))});""",
    """
(function safariPinch(){let gz=1,gx=0,gy=0; // Safari speaks gestures where others speak ctrl-wheel
  cv.addEventListener('gesturestart',e=>{e.preventDefault();gz=cam.z;gx=e.clientX;gy=e.clientY});
  cv.addEventListener('gesturechange',e=>{e.preventDefault();
    const[wx,wy]=screenToWorld(gx,gy);cam.z=gz*e.scale;clampCam();
    const[nx,ny]=screenToWorld(gx,gy);cam.x+=wx-nx;cam.y+=wy-ny;clampCam()});
  cv.addEventListener('gestureend',e=>e.preventDefault())})();""",
    where="after",
)

# The pocket gesture block asked the DOM for an element named "cv". That is
# the name of the JS variable holding the canvas; the canvas itself is
# id="scene". `$('cv')` has always returned null, so touchNav returned on its
# first line and the two-finger pinch was never wired at all. Panning survived
# only because the pointer handlers on the real canvas cover touch too. This
# one word is the whole of "pinch-out stops" on a phone.
swap(
    """(function touchNav(){const el=$('cv');if(!el)return;let T=null;""",
    """(function touchNav(){const el=$('scene');if(!el)return;let T=null; // id is 'scene'; $('cv') was null and this block never ran""",
)

# The pocket pinch had a hard floor of its own. Freeing clampCam alone would
# have left the phone stuck at .4, which is where the testing complaint came
# from in the first place.
swap(
    """      cam.z=Math.max(.4,Math.min(2.6,T.z*d/T.d));clampCam();window.WGATE&&(WGATE.pinch=true)}},{passive:false});""",
    """      cam.z=Math.max(minZoom(),Math.min(2.6,T.z*d/T.d));clampCam();window.WGATE&&(WGATE.pinch=true)}},{passive:false});""",
)

# Map labels need land to sit on. The old floor was COVER, so the land always
# filled the window and the district emblems and geography names always had
# room. Pulled back to FIT on a phone the land is barely 330 px across, and
# five district plates stack into a wall of text over it. They wait until the
# land is at least 900 px wide, which is every desktop at the floor and no
# phone at the floor.
swap(
    """  for(const d of SCENE.districts){const el=bEls['d_'+d.id];const[sx,sy]=worldToScreen(d.x,d.y-46);
    el.style.display=zoomed?'none':'block';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'}
  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);
    el.style.display=cam.z<1.25?'block':'none';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'});""",
    """  const roomy=W*cam.z>900; // pulled back past this and the plates are wider than the land they name
  for(const d of SCENE.districts){const el=bEls['d_'+d.id];const[sx,sy]=worldToScreen(d.x,d.y-46);
    el.style.display=(zoomed||!roomy)?'none':'block';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'}
  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);
    el.style.display=(cam.z<1.25&&roomy)?'block':'none';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'});""",
)

# ── D1.3 · labels hug their buildings ────────────────────────────────────
# The crown offset carried a spring's worth of air. Closer, never overlapping:
# the collision engine and the neighbour-icon guard below still have the last
# word, this only lowers where a label starts from.
swap(
    """      s._crownOff=(painted?k*1.35*sc*66:(iso?k*1.35*sc*34:k*30*(window.GSCALE||1)))+10;""",
    """      s._crownOff=(painted?k*1.35*sc*54:(iso?k*1.35*sc*34:k*30*(window.GSCALE||1)))+6;""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D1 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
