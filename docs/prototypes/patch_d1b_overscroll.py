#!/usr/bin/env python3
"""Rye, on the D1 build: "maybe 50% less extra space".

D1 clamped the camera centre to the world rect, which lets half a screen of
beyond-the-edge show at the rim. That fixed the real complaint (an edge
building could not reach the middle of the screen) and overshot: pan to a
corner and most of the window is flat sea.

Half as much rim, and not one pixel less reach. The clamp is a quarter screen
of beyond-the-edge, then it is widened until every building can still sit
dead centre, so the thing D1 was for survives the trim. On Amora that means
the buildings themselves set the bound long before the arbitrary fraction
does, which is the right way round: the land decides, not a constant.

The other half of Rye's note, extending the imagery so the rim is real
ground rather than flat colour, is patch_d3_surround.py.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d1b_overscroll.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


swap(
    """/* The clamp is the world itself, not the viewport inside it: every point of
   the land can sit at screen centre. */
function clampCam(){cam.z=Math.max(minZoom(),Math.min(3.2,cam.z));
  cam.x=Math.max(0,Math.min(W,cam.x));cam.y=Math.max(0,Math.min(H,cam.y))}""",
    """/* How far past the edge of the land the reader may travel, as a fraction of
   a half-screen. 1 puts the world corner at screen centre and shows half a
   window of rim, which Rye found to be about twice too much. */
const OVERSCROLL=0.5;
/* The bound the camera centre lives in. It starts as the world inset by what
   the overscroll allows, then opens out until every building fits inside it:
   an edge building reaching the middle of the screen is the whole reason this
   clamp was loosened in the first place, and a fraction must not take it back. */
function camBounds(){
  const hw=innerWidth/2/cam.z,hh=innerHeight/2/cam.z,k=1-OVERSCROLL;
  let x0=hw*k,x1=W-hw*k,y0=hh*k,y1=H-hh*k;
  for(const s of SCENE.structures){
    if(s.x<x0)x0=s.x;if(s.x>x1)x1=s.x;
    if(s.y<y0)y0=s.y;if(s.y>y1)y1=s.y}
  if(x0>x1)x0=x1=(x0+x1)/2; // a window wider than the land: there is one place to stand
  if(y0>y1)y0=y1=(y0+y1)/2;
  return[x0,x1,y0,y1]}
window.camBounds=camBounds;
function clampCam(){cam.z=Math.max(minZoom(),Math.min(3.2,cam.z));
  const b=camBounds();
  cam.x=Math.max(b[0],Math.min(b[1],cam.x));cam.y=Math.max(b[2],Math.min(b[3],cam.y))}""",
)
swap(
    """  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(0,Math.min(W,x+ox/cz)),ty:Math.max(0,Math.min(H,y+oy/cz)),tz:cz,t:0,done}}""",
    """  const zw=cam.z;cam.z=cz;const b=camBounds();cam.z=zw; // the bound the flight will land in, at the zoom it lands at
  travel={sx:cam.x,sy:cam.y,sz:cam.z,tx:Math.max(b[0],Math.min(b[1],x+ox/cz)),ty:Math.max(b[2],Math.min(b[3],y+oy/cz)),tz:cz,t:0,done}}""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D1b patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
