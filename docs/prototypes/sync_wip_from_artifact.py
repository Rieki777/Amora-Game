#!/usr/bin/env python3
"""Write every embedded unfinished sprite back out to sprites_wip/.

The twin of sync_sprites_from_artifact.py, for the part-built set, and it
exists for the same reason: the sprite folders are NOT in git. The artifact
carries the art, so a fresh checkout has an empty directory, and anything that
reads that directory as the source of truth is reading nothing.

Run this before embed_wip_sprites.py whenever the directory might be behind or
absent, and the embed becomes a no-op instead of a silent deletion. The embed
refuses an empty set now as well, so the two guards meet in the middle.

Usage: python3 sync_wip_from_artifact.py [grounds-v0.html]
"""
import base64, os, re, sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sprites_wip")
os.makedirs(OUT, exist_ok=True)

src = open(HTML, encoding="utf8").read()
try:
    a = src.index("/*SPRITES_WIP_DATA*/")
    b = src.index("/*SPRITES_WIP_DATA_END*/")
except ValueError:
    sys.exit("no /*SPRITES_WIP_DATA*/ markers in this artifact: nothing to sync")

blob = src[a:b]
wrote = same = 0
for fam, b64 in re.findall(r"(\w+):'data:image/png;base64,([A-Za-z0-9+/=]+)'", blob):
    png = base64.b64decode(b64)
    path = os.path.join(OUT, fam + ".png")
    if os.path.exists(path) and open(path, "rb").read() == png:
        same += 1
        continue
    open(path, "wb").write(png)
    wrote += 1
    print(f"  {fam}: {len(png)//1024} KB written")

print(f"unfinished sprites synced from the artifact: {wrote} updated, {same} already matching")
