#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / PHOTOS - THE PLACE PANEL GETS THE TAB THE FEATURE WAS BUILT FOR.

THE FOUNDER'S WORDS: "sprite cards to accept photos but we should also make
this like a google maps listing where the community can upload photos".

The server half, the gallery, the moderation queue, the limits and the EXIF
proof landed first, on `/places` and `/places/:key`. This is the door on the
land, which is where a person actually is when they think about a place.

WHY A GUARDED PATCH AND NOT AN EDIT. `grounds-v0.html` is a single generated
artifact that several lanes reach for, and two lanes in it at once is the most
expensive mistake this program has made. Every edit below declares its find
string and its EXPECTED MATCH COUNT, asserts the count before anything is
written, and a second run writes zero bytes.

THREE EDITS.

  1. `Photos` joins the tab row at INDEX 3, and `Enter -> ` moves to 4.
     Inserting rather than appending is deliberate: `Enter -> ` is a terminal
     word and a tab after it reads as an afterthought. It is safe because
     nothing in the file calls renderTab with a literal 2, 3 or 4 (checked;
     only renderTab(1) appears, from claimQuest, and quests stay at 1).

  2. The Photos branch. It draws whatever the shell has pushed into
     `window.PLACE_PHOTOS[key]` and always offers the door to the site's own
     gallery, because that is where a person uploads, flags, or asks for a
     photograph of themselves to come down. The map SHOWS the record; the
     site is where it is written to.

     Every string that came from a member goes through `escq`. Alt text,
     captions and contributor names are member-authored and this is the first
     place any of them reaches HTML in this file.

     The door points at `/places`, the concrete route, and never at
     `/places/<key>`: `realRoute` is an allowlist of the literals in
     SITE_PAGES, a parameterised path is not one of them, and building a href
     out of a founder-controlled key is exactly the sink that allowlist
     exists to close.

  3. The `photos` message. The shell pushes the village's own photographs the
     same way it pushes skin, walk, vocabulary and the scene: absent means the
     map shows the door and nothing else, which is the ordinary state of a
     village whose members have not photographed anything yet.

WHAT THIS DELIBERATELY DOES NOT DO. It does not upload from the map. An upload
needs a file picker, alt text, a date and a size ceiling read from the village's
own dials, and every one of those is already built and tested at `/places/:key`.
A second implementation inside a generated artifact is a second thing to keep
true.

    python patch_r5_photos.py
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8').read()
start_bytes = len(src.encode('utf-8'))
print('patch_r5_photos: %s' % TARGET)
print('  %d bytes at start' % start_bytes)

EDITS = []

# ── 1. the tab row ────────────────────────────────────────────────────────
EDITS.append((
    'the tab row',
    "  const tabs=['Overview','Quests here','Seats here','Enter →'];",
    "  const tabs=['Overview','Quests here','Seats here','Photos','Enter →'];",
    1,
))

# ── 2. Enter moves to 4, and Photos takes 3 ───────────────────────────────
OLD_ENTER = (
    "  if(i===3)body.innerHTML=((s.modules&&s.modules.length)?"
    "s.modules.map((m,mi)=>`<button class=\"doorbtn\" onclick=\"openDoorHere(${mi})\">"
)
NEW_PHOTOS = (
    "  if(i===3){const ph=(window.PLACE_PHOTOS||{})[s.key]||[];\n"
    "    /* Member-authored text reaching HTML for the first time in this file:\n"
    "       alt, caption and the contributor's name all go through escq. */\n"
    "    const card=p=>`<figure style=\"margin:0 0 12px;border:1px solid #c8ab6f;border-radius:9px;overflow:hidden;background:#fdf6e0\">"
    "<img src=\"${escq(p.thumbUrl||p.url)}\" alt=\"${escq(p.alt||'')}\" loading=\"lazy\" "
    "style=\"display:block;width:100%;height:auto\">"
    "<figcaption style=\"padding:6px 8px;font-size:11.5px;color:#6b4d1e\">"
    "${p.caption?`${escq(p.caption)}<br>`:''}"
    "<span style=\"color:#8a7347\">${escq(p.by||'')}</span></figcaption></figure>`;\n"
    "    body.innerHTML=(ph.length?ph.map(card).join(''):"
    "`<p>Nobody has photographed this place yet. Every other number on this map is something a person could have typed from anywhere; a photograph is somebody who stood here.</p>`)+\n"
    "      `<button class=\"doorbtn\" onclick=\"openDoor('Photographs',{route:'/places',label:'Photographs'})\">"
    "<span><b>Photographs</b><br><span>/places</span></span><span class=\"arr\">➤</span></button>`+\n"
    "      `<div class=\"lastv\">Adding one, flagging one, or asking for a photograph of yourself to come down all happen through that door.</div>`}\n"
) + OLD_ENTER.replace('i===3', 'i===4')
EDITS.append(('the Photos branch, and Enter moving to 4', OLD_ENTER, NEW_PHOTOS, 1))

# ── 3. the shell's push ───────────────────────────────────────────────────
OLD_MSG = "  if(d.type==='hand')applyHand(d);"
NEW_MSG = (
    "  /* The village's own photographs, keyed by structure. Absent means the\n"
    "     map draws the door and nothing else, the same rule the walk and the\n"
    "     scene follow. Re-renders only when the open panel is the place that\n"
    "     changed, so a push never yanks a reader off the tab they are on. */\n"
    "  if(d.type==='photos'&&d.places&&typeof d.places==='object'){\n"
    "    window.PLACE_PHOTOS=d.places;\n"
    "    if(typeof panelKey!=='undefined'&&panelKey&&$('panel').classList.contains('open')&&\n"
    "       [...$('tabs').children].findIndex(b=>b.classList.contains('on'))===3)renderTab(3)}\n"
    "  if(d.type==='hand')applyHand(d);"
)
EDITS.append(("the shell's photo push", OLD_MSG, NEW_MSG, 1))

applied = 0
skipped = 0
for name, old, new, expected in EDITS:
    if new in src:
        print('  skip   %s (already applied)' % name)
        skipped += 1
        continue
    n = src.count(old)
    assert n == expected, '%s: found %d matches, expected %d' % (name, n, expected)
    src = src.replace(old, new, 1)
    print('  ok     %s (%d match)' % (name, n))
    applied += 1

# The tab row and the branch must agree, or a tab paints the wrong room.
assert src.count("'Photos','Enter →'") == 1, 'the tab row did not end up with Photos before Enter'
assert src.count('if(i===4)body.innerHTML=((s.modules') == 1, 'the Enter branch is not at index 4'
assert src.count('if(i===3){const ph=') == 1, 'the Photos branch is not at index 3'
assert 'if(i===3)body.innerHTML=((s.modules' not in src, 'the old Enter branch is still at index 3'

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
end_bytes = len(src.encode('utf-8'))
print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
print('  %d applied, %d skipped' % (applied, skipped))
sys.exit(0)
