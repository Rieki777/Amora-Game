# -*- coding: utf-8 -*-
"""L5/13: while the lens is on, the lens owns the top plane.

TWO THINGS THE FOOT LINE OF PATCH 12 EXPOSED, both measured on the composited
page by qa/verify_org_ground.js, which is the only reason either is written down.

1. ROLE_SAT_RIM WAS 7.1 AND THE INK REACHES 8.06.

   7.1 is the geometry: roleSat strokes a 2.6-wide keyline on a 5.8 circle, so
   the stroke's outer edge is at 5.8 + 2.6/2. What lands on the canvas is wider
   than that, because a stroked arc is antialiased outward. Rendered at three
   states and scanned for the furthest pixel carrying alpha, the mark reaches
   8.06. The floor was therefore 0.96 units short and G2 stayed red at
   greenhouse by exactly 0.96. The constant is now the MEASURED reach; the gate
   re-measures it every run and goes red if roleSat and this number part company.

2. THE SATELLITES CAME OUT FROM UNDER THE SPRITES AND WENT UNDER THE SEALS.

   Composited, lens on against lens off, 15x15 px per satellite:

       before patch 12   community  0%,  4%, 47%     (under the sprite)
       after  patch 12   community  0%,  4%, 14%     (under the seals)

   THAT BOX SCORE IS ALSO WRONG, and finding out why is half of what this patch
   is. A box around an `open` satellite is mostly its dark hollow fill, and dark
   fill on the dark forest under the Community Center changes almost nothing
   however visible the mark is - so the box measured the ground as much as the
   mark. qa/verify_org_ground.js scores the mark's own rim now, 36 angles by
   three radii across its outer half where the black keyline and the coloured
   rim both are in all three states, and no number below is comparable to a box
   number above.

   The badge plane is #badges at z 12 and the lens plane was #lens at z 11.
   Nothing was gained; the occluder changed.

   AND IT CANNOT BE SOLVED BY MOVING THE SATELLITE. Measured at cam.z 2.4 with
   the camera on the Community Center: FIFTY seals are on screen, on rings of
   ~39 scene units around five buildings that stand 58 to 87 apart, spaced
   against themselves at BADGE_GAP = 44 px and explicitly NOT spaced against
   each other ("Marks may now overlap a neighbour's sprite and a neighbour's
   marks, which is the instruction taken literally", layoutBadges). The nearest
   seal to the worst satellite is 18.1 px away centre to centre and its radius
   alone is 15.7. There is no arc, no radius and no rotation within reach of
   the Community Center that clears fifty of those, and pushing further out
   walks into the Library's halo, which is the wrong answer for a different
   reason.

   So this is a layering question, and the honest answer to a layering question
   is a mode. The Org lens IS a mode: it puts a key on the screen, it hides the
   layer bar under the chart, and the reader turned it on to ask one question.
   While it is on, the org language takes the top plane and the badge language
   steps back to a third of its opacity - still there, still telling you the
   marks exist, no longer competing with the answer you asked for. Turn the
   lens off and the map is exactly the map it was; nothing here changes a rect,
   a display or a hit target, so every badge check still measures what it did.

   #banners (z 11, district names) is passed too. A name plate is a solid
   parchment box and a satellite behind one is as invisible as a satellite
   behind a seal.

    python patch_h5_13_plane.py

The check that made both of these visible is qa/verify_org_ground.js G5c, and it
was watched red before either was written. Its controls now are BREAK=floor
(G2), BREAK=plane (G0e) and BREAK=ink (G5c). BREAK=plane no longer reaches G5c
on this land and that is worth knowing rather than hiding: patch 15 sent the
three Wisdom roles back to the council fire they are addressed at, so the
Community Center - the crowded building whose fifty seals were doing the
covering - has no satellites left to cover.
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


# ---- 1/3 the constant becomes the measured ink ----
OLD = (
    "/* The satellite's OUTER edge, which is not its arc: roleSat strokes a 2.6\n"
    "   keyline on a 5.8 circle, so the ink stops at 5.8+1.3. Every clearance in\n"
    "   this file is measured against this and not against the 5 the coloured rim\n"
    "   uses, because the keyline is the part that has to sit on clear ground. */\n"
    "const ROLE_SAT_RIM=7.1;\n"
)
NEW = (
    "/* The satellite's OUTER edge, which is not its arc. roleSat strokes a 2.6\n"
    "   keyline on a 5.8 circle, so the GEOMETRY stops at 5.8+1.3 = 7.1 - and the\n"
    "   INK does not, because a stroked arc is antialiased outward. Rendered at\n"
    "   all three states and scanned for the furthest pixel carrying alpha, the\n"
    "   mark reaches 8.06, and a floor built on 7.1 left the greenhouse satellite\n"
    "   0.96 units onto its own sprite - which is exactly what G2 reported.\n"
    "   THIS IS A MEASUREMENT, NOT A DERIVATION, and qa/verify_org_ground.js G0d\n"
    "   re-takes it every run: change roleSat's arc or its keyline without\n"
    "   changing this and the suite says so. Clearances use this and never the 5\n"
    "   the coloured rim uses, because the keyline is the part that has to sit on\n"
    "   clear ground. */\n"
    "const ROLE_SAT_RIM=8.1;\n"
)
swap('1/3 the rim is what the ink measures, not what the arithmetic says', OLD, NEW,
     mark='const ROLE_SAT_RIM=8.1;')

# ---- 2/3 the lens plane clears the seals and the name plates ----
OLD = (
    "  /* ---------- L5: THE LENS PAINTS OVER THE BUILDINGS ----------\n"
    "     Over #icons at 10, which is where the sprites are, and under #banners\n"
    "     and #badges: #banners carries the same 11 and comes LATER in the\n"
    "     document, so the district names still win, and the seals at 12 still\n"
    "     win over everything. Deaf, like every other plane except the seals. */\n"
    "  #lens{position:absolute;inset:0;pointer-events:none;z-index:11}\n"
)
NEW = (
    "  /* ---------- L5: THE LENS PAINTS OVER THE BUILDINGS ----------\n"
    "     Over the sprites in #icons at 10, over the district names in #banners\n"
    "     at 11 and over the seals in #badges at 12. It started at 11, under the\n"
    "     last two, and the composited-page check found the satellites it had\n"
    "     just rescued from the sprites sitting under the seals instead: 0%, 4%\n"
    "     and 14% of a 15x15 box at the Community Center. Fifty seals are on\n"
    "     screen there at cam.z 2.4 and layoutBadges deliberately does not space\n"
    "     one building's marks against another's, so there is no free ground to\n"
    "     move a satellite to. The lens is a MODE; while it is on it owns the\n"
    "     top, and the seals below dim rather than argue.\n"
    "     Deaf, like every other plane except the seals, so the marks under it\n"
    "     still take every tap. */\n"
    "  #lens{position:absolute;inset:0;pointer-events:none;z-index:13}\n"
    "  /* Still legible as \"there are marks here\", no longer competing with the\n"
    "     answer the reader turned the lens on to get. Opacity only: no rect, no\n"
    "     display and no hit target moves, so every badge check still measures\n"
    "     exactly what it measured. */\n"
    "  body.org-lens #badges{opacity:.32;transition:opacity .18s ease}\n"
)
swap('2/3 the lens plane rises above the seals and the name plates', OLD, NEW,
     mark='  #lens{position:absolute;inset:0;pointer-events:none;z-index:13}\n')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
