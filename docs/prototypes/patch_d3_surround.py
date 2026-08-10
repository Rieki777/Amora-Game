#!/usr/bin/env python3
"""Draw the land beyond the land, under everything else.

Rye: "extend it out for my whole field of view." The core plate covers exactly
the 2400x1600 world rect, so past it the reader saw flat colour. This embeds
the wider mosaic from fetch_surround.py and draws it UNDER the core plate over
an extended rect.

Nothing about the world moves. W and H are still 2400x1600, every structure,
feature, boundary point, flow and export keeps the coordinates it had; the
surround is simply a picture drawn at negative coordinates first. Changing the
world rect instead would have invalidated every stored point on the map.

Usage: python3 patch_d3_surround.py amora-surround.jpg [grounds-v0.html]
"""
import base64, io, os, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "amora-surround.jpg"
HTML = sys.argv[2] if len(sys.argv) > 2 else "grounds-v0.html"
# must match fetch_surround.py's PAD_X / PAD_Y
PAD_X, PAD_Y = 780, 920
W, H = 2400, 1600
MAXW = int(os.environ.get("SUR_MAXW", "1600"))
Q = int(os.environ.get("SUR_Q", "70"))

im = Image.open(SRC).convert("RGB")
if im.width > MAXW:
    im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, "JPEG", quality=Q, optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
print(f"surround: {im.size} · {len(buf.getvalue())//1024} KB jpeg · {len(b64)//1024} KB base64")

src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


if "/*SURROUND_HOOK*/" in src:  # re-runnable: drop the old embed first
    head, rest = src.split("/*SURROUND_HOOK*/", 1)
    src = head + rest.split("/*END_SURROUND*/", 1)[1]

# Fully re-runnable: only the picture changes on a refetch, so the two code
# edits are skipped when they are already in place.
FRESH = "const SURROUND=[" not in src
if FRESH:
  swap(
    "let satPlate=null,paintPlate=null,",
    f"""const SURROUND=[{-PAD_X},{-PAD_Y},{W + 2 * PAD_X},{H + 2 * PAD_Y}]; // world rect of the wide plate
let surPlate=null;
""" + "let satPlate=null,paintPlate=null,",
  )
swap(
    "/*PLATE_HOOK*/",
    "/*SURROUND_HOOK*/(function(){const im=new Image();"
    "im.onload=()=>{surPlate=im};"
    f"im.src='data:image/jpeg;base64,{b64}'}})();/*END_SURROUND*/\n/*PLATE_HOOK*/",
)
# Under everything: the wide plate first, then whichever plate the terrain mode
# wants on top of it, so the detailed ground still wins where it exists.
if FRESH:
  swap(
    """  const _pl=activePlate();
  if(terrainMode==='paint'&&satPlate){""",
    """  const _pl=activePlate();
  if(surPlate)cx.drawImage(surPlate,SURROUND[0],SURROUND[1],SURROUND[2],SURROUND[3]); // the land beyond the land
  if(terrainMode==='paint'&&satPlate){""",
  )

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"surround embedded in {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
