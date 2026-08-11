#!/usr/bin/env python3
"""Embed the Gemini-painted plate into grounds-v0.html at /*PAINT_HOOK*/ (D1: paint over the vector floor).
Usage: python3 embed_paint.py [plate.png] [grounds-v0.html]"""
import base64, io, re, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "amora-plate-v1.png"
HTML = sys.argv[2] if len(sys.argv) > 2 else "grounds-v0.html"

im = Image.open(SRC).convert("RGB").resize((2400, 1600), Image.LANCZOS)  # exact world frame: georef stays true
buf = io.BytesIO(); im.save(buf, "JPEG", quality=82, optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
print("painted plate:", im.size, len(buf.getvalue()) // 1024, "KB jpeg")

hook = ("/*PAINT_HOOK*/(function(){const im=new Image();"
        "im.onload=()=>{paintPlate=im;mmDirty=true;const c=document.getElementById('tmPaint');if(c)c.style.display='';};"
        f"im.src='data:image/jpeg;base64,{b64}'}})();")
# Text mode would translate every newline on the way in and back out, so a
# one-anchor edit would rewrite all of this LF file as CRLF. The artifact is
# `-text` in .gitattributes: bytes in, same bytes out. Keep newline="".
src = open(HTML, encoding="utf8", newline="").read()
assert "/*PAINT_HOOK*/" in src, "PAINT_HOOK missing"
# replace hook + any previous embed that follows it
src = re.sub(r"/\*PAINT_HOOK\*/(\(function\(\)\{const im=new Image\(\);im\.onload=\(\)=>\{paintPlate=im;.*?\}\)\(\);)?",
             hook.replace("\\", "\\\\"), src, count=1, flags=re.S)
open(HTML, "w", encoding="utf8", newline="").write(src)
print("embedded into", HTML, "total", len(src) // 1024, "KB")
