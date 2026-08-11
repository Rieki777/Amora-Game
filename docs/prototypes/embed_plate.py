#!/usr/bin/env python3
"""Embed the painted plate into grounds.html as a data-URL layer (D1: paint over the vector floor)."""
import base64, io, sys
from PIL import Image

HTML = "/home/claude/livingmap/app/grounds.html"
SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/livingmap/amora-plate.png"

im = Image.open(SRC).convert("RGB")
im.thumbnail((2400, 2400), Image.LANCZOS)
buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
print("plate:", im.size, len(buf.getvalue())//1024, "KB jpeg,", len(b64)//1024, "KB b64")

hook = ("/*PLATE_HOOK*/(function(){const im=new Image();"
        "im.onload=()=>{paintedPlate=im;mmDirty=true};"
        f"im.src='data:image/jpeg;base64,{b64}'}})();")
# Text mode would translate every newline on the way in and back out, so a
# one-anchor edit would rewrite all of this LF file as CRLF. The artifact is
# `-text` in .gitattributes: bytes in, same bytes out. Keep newline="".
src = open(HTML, encoding="utf8", newline="").read()
assert "/*PLATE_HOOK*/" in src, "hook missing"
head = src.split("/*PLATE_HOOK*/")[0]
tail = src.split("/*PLATE_HOOK*/", 1)[1]
if tail.lstrip().startswith("(function(){const im=new Image()"):  # replace old embed
    tail = tail.split("})();", 1)[1]
open(HTML, "w", encoding="utf8", newline="").write(head + hook + tail)
print("embedded into", HTML)
