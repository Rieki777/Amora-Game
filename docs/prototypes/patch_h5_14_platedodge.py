# -*- coding: utf-8 -*-
"""L5/14: a name plate stops landing on a satellite.

Patch 13 put the lens plane over #banners as well as #badges, and #banners is
where the building name plates live. Screenshotted at the Community Center,
cam.z 2.0: the middle satellite sat squarely across "Council Fire", covering
two letters of a name and reading as a smudge on a parchment box.

Raising #banners back over the lens only moves the loss to the other side - the
plate would then hide the satellite - and the plate solver already knows how to
deal with this. `platePlace` scores every candidate spot against
`window.BADGE_PTS`, the list of every mark drawn on the land, through
`marksHit`. A satellite IS a mark on the land. It was simply not on the list.

So the lens's marks join it, and the plates dodge them exactly the way they
already dodge fifty badge seals. One statement, at the end of layoutBadges,
which is where that list is built.

ORDER. layoutBadges() runs at the end of syncBanners and syncBanners runs after
roleLens in the same frame, so ROLE_LAST_SATS is this frame's. The building
plate loop runs immediately after layoutBadges and sees the full list; the
district plate pass runs earlier in syncBanners and sees the previous frame's,
which is what it already did for every seal.

EMPTY WHEN THE LENS IS OFF, with nothing to check for it: roleLensFrame clears
ROLE_LAST_SATS when the lens goes off, so the loop runs zero times and the
plates go back to dodging seals alone.

MARKS ARE 16 PX EITHER SIDE in marksHit, taken from "the widest one drawn is a
28 px seal". A satellite is ROLE_SAT_RIM scene units, which is 16.2 px at
cam.z 2.0 and 19.4 at 2.4, so the fixed half-extent is right at the range the
plates are drawn at all (they hide below cam.z 0.95) and a little tight above
it. Left alone rather than widened for one caller: a plate is a 120x22 box and
this is a preference in a cost function, not a hard bound.

    python patch_h5_14_platedodge.py
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


OLD = (
    "    if(hc2){const ha=(BADGE_SLOT.home+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;\n"
    "      pts.push({x:g.cx+Math.cos(ha)*hr,y:g.cy-Math.sin(ha)*hr})}\n"
    "  }\n"
    "}\n"
    "window.BADGE_PTS=[];\n"
)
NEW = (
    "    if(hc2){const ha=(BADGE_SLOT.home+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;\n"
    "      pts.push({x:g.cx+Math.cos(ha)*hr,y:g.cy-Math.sin(ha)*hr})}\n"
    "  }\n"
    "  /* THE LENS'S OWN MARKS JOIN THE LIST THE PLATES DODGE. #lens paints above\n"
    "     #banners, so a name plate that lands on a satellite hides the answer the\n"
    "     reader turned the lens on to get - measured at the Community Center,\n"
    "     where the middle satellite sat across two letters of \"Council Fire\".\n"
    "     A satellite is a mark on the land and this is the list of those.\n"
    "     Empty whenever the lens is off, because roleLensFrame clears the record\n"
    "     then, so this costs nothing and needs no flag to say so. */\n"
    "  if(window.ROLE_LAST_SATS)for(const r of ROLE_LAST_SATS){\n"
    "    const[mx,my]=worldToScreen(r.x,r.y);pts.push({x:mx/DPR,y:my/DPR})}\n"
    "}\n"
    "window.BADGE_PTS=[];\n"
)
swap('1/1 the plates dodge the satellites too', OLD, NEW,
     mark="  if(window.ROLE_LAST_SATS)for(const r of ROLE_LAST_SATS){\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
