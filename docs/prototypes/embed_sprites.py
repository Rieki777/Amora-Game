#!/usr/bin/env python3
"""Embed sprites/*.png into grounds-v0.html between /*SPRITES_DATA*/ markers.
Usage: python3 embed_sprites.py [grounds-v0.html]"""
import base64, glob, os, sys
HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
HERE = os.path.dirname(os.path.abspath(__file__))
entries = []
for f in sorted(glob.glob(os.path.join(HERE, "sprites", "*.png"))):
    fam = os.path.splitext(os.path.basename(f))[0]
    b64 = base64.b64encode(open(f, "rb").read()).decode()
    entries.append(f"{fam}:'data:image/png;base64,{b64}'")
data = "/*SPRITES_DATA*/window.SPRITES={" + ",".join(entries) + "};/*SPRITES_DATA_END*/"
src = open(HTML, encoding="utf8").read()
a = src.index("/*SPRITES_DATA*/"); b = src.index("/*SPRITES_DATA_END*/") + len("/*SPRITES_DATA_END*/")
src = src[:a] + data + src[b:]
open(HTML, "w", encoding="utf8").write(src)
print(f"embedded {len(entries)} sprites -> {HTML}", len(src) // 1024, "KB total")
