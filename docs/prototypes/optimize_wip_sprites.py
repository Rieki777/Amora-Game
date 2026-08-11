#!/usr/bin/env python3
"""Quantize the unfinished sprite set, because it is paid for on a phone.

The artifact is ONE file, served whole, and Rye's primary experience is Safari
over mobile data. The finished sprite set is 2.0 MB of PNG that becomes 2.7 MB
once base64 inflates it by a third. Adding a second full set at the same weight
takes the artifact from 4.6 MB to about 7.4 MB, a 59% increase, to change how
buildings look in ONE phase.

Measured on bighall, 221x176 truecolour PNG:

    original        83 KB
    256 colours     20 KB   (24%)
    192 colours     20 KB
    128 colours     18 KB
     96 colours     14 KB

256 is the first step down and already gives back three quarters of the weight,
so there is no reason to go further and trade visible banding for another 2 KB.
Painterly art at this size is a few dozen hues of timber, glass and foliage; it
was never using 16 million of them.

RESOLUTION IS NOT THE LEVER, which is worth writing down so the next person does
not reach for it. A sprite is drawn 176 px tall and displayed at 76 CSS px, but
the poi is transformed by `k * 1.35 * scale`, which at full zoom on a 3x screen
asks for around 500 device pixels. The set is already under-resolved at the top
of the zoom range. Shrinking it would show.

Only the unfinished set is touched. The finished sprites are shipped, approved
and unchanged: requantizing them would put a diff on thirty images that nobody
asked to look at again.

Usage: python3 optimize_wip_sprites.py [--colors 256] [--dry]
"""
import io, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sprites_wip")
COLORS = 256
if "--colors" in sys.argv:
    COLORS = int(sys.argv[sys.argv.index("--colors") + 1])
DRY = "--dry" in sys.argv

if not os.path.isdir(SRC):
    sys.exit("no sprites_wip/: run gen_wip_sprites.py first")

before_total = after_total = 0
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".png"):
        continue
    path = os.path.join(SRC, name)
    raw = open(path, "rb").read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    q = im.quantize(colors=COLORS, method=Image.FASTOCTREE)
    buf = io.BytesIO(); q.save(buf, "PNG", optimize=True)
    out = buf.getvalue()

    # A palette PNG carries alpha in a transparency chunk rather than a channel,
    # and a silent loss of it would paste a box of background onto the land.
    # Cheaper to assert than to notice later.
    #
    # ASSERT THE PROPERTY, NOT A PROXY FOR IT. The first version of this checked
    # that all four corners were transparent, which is not the same claim and is
    # not even true: `bridge` spans its box and legitimately fills one corner, so
    # a correct sprite failed. What has to survive is the ALPHA, so the check is
    # how much of the image is transparent before and after.
    back = Image.open(io.BytesIO(out)).convert("RGBA")
    clear_before = sum(1 for p in im.getdata() if p[3] == 0)
    clear_after = sum(1 for p in back.getdata() if p[3] == 0)
    #
    # THE RISK IS ONE-DIRECTIONAL. Losing transparency pastes a box of
    # background onto the land; GAINING a little is the feathered edge hardening
    # as near-transparent pixels quantize to fully clear, which is what an
    # orchard full of thin branches does and is not a fault. So the floor is
    # checked and the ceiling is not.
    assert clear_before > 0, f"{name}: source has no transparency at all, is it keyed?"
    assert clear_after >= clear_before * 0.9, (
        f"{name}: transparency did not survive quantization "
        f"({clear_before} clear px -> {clear_after})")
    assert back.size == im.size, f"{name}: size changed {im.size} -> {back.size}"

    before_total += len(raw); after_total += len(out)
    if not DRY:
        open(path, "wb").write(out)
    print(f"  {name:16s} {len(raw)//1024:4d} KB -> {len(out)//1024:3d} KB")

pct = 100 * after_total // max(before_total, 1)
verb = "would shrink" if DRY else "shrank"
print(f"{verb} sprites_wip: {before_total//1024} KB -> {after_total//1024} KB ({pct}%), {COLORS} colours")
