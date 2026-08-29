#!/usr/bin/env python3
"""Write every embedded sprite back out to sprites/, so disk matches the map.

WHY THIS EXISTS. `embed_sprites.py` rebuilds window.SPRITES from whatever PNGs
are in sprites/. That is only safe while the directory is the source of truth,
and in this checkout it was not: the artifact carried newer art for eight
families (cycle, field, fire, hive, orchard, sacred, spring, stage) plus pool
and waterfall that were not on disk at all. Running the embed would have
quietly swapped ten sprites for older ones, or dropped two entirely, and
nothing would have said so.

Run this before embed_sprites.py whenever the directory might be behind, and
the embed becomes a no-op instead of a silent downgrade.

Usage: python3 sync_sprites_from_artifact.py [grounds-v0.html]
"""
import base64, os, re, sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sprites")
os.makedirs(OUT, exist_ok=True)

src = open(HTML, encoding="utf8").read()
a = src.index("/*SPRITES_DATA*/")
b = src.index("/*SPRITES_DATA_END*/")
blk = src[a:b]

wrote = same = 0
for m in re.finditer(r"(\w+):'data:image/png;base64,([^']+)'", blk):
    fam, b64 = m.group(1), m.group(2)
    raw = base64.b64decode(b64)
    path = os.path.join(OUT, fam + ".png")
    if os.path.exists(path) and open(path, "rb").read() == raw:
        same += 1
        continue
    open(path, "wb").write(raw)
    print(f"  {fam}: {len(raw)//1024} KB written")
    wrote += 1

print(f"sprites synced from the artifact: {wrote} updated, {same} already matching")
