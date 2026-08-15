#!/usr/bin/env python3
"""L4 LAND RENDER, item 8: the district name plates stand too far from the
buildings they name, and some of them are printed under the vitals bar.

PASS 5. Pass 3's placement stands: aim at the district's own roofs, refuse the
live vitals rect, price the last resort. Five defects were found in it and all
five are answered here. Pass 4 was accepted on substance and left two claims
proved against a proxy rather than against themselves: a window global that a
grep for `window.X=` cannot see, and a B1 residue nobody had priced. Item 6
below closes the first. B1 records the second, measured, WITHOUT fixing it,
because the repair reaches one frame of the five it is raised about and fails a
standing gate to do it. Neither changes the design.

  B1  THE OFF-SCREEN KEY WAS A SORT ORDER, NEVER A COST. platePlace returns the
      FIRST slot that costs nothing, so a slot 100% outside the window that
      collides with nothing beat an on-screen slot that costs 4. Priced at
      pocket|s1500|0.66, The Ridge: rank 0 [-88,14] spill 0 cost 4, rank 8
      [150,20] spill 4088 of 4088 cost 0, and rank 8 was taken. plateSlots now
      returns TWO tables. The off-screen one is offered only when the on-screen
      one yields nothing, at either neighbourhood, which makes spill a cost that
      outranks every collision the file prices. It is lexicographic and not
      additive because platePlace is a boundary this lane may not touch, and the
      consequence is stated plainly: a slot 21% clipped now loses to a fully
      on-screen slot that covers a door chip at 8.
        AND IT IS CONDITIONAL, WHICH LEAVES A MEASURED RESIDUE. A district with
      none of its own buildings on the screen is handed one JOINED table, on then
      off, so for that district the free pass can still reach an off-screen slot
      and still beat an on-screen slot costing 4. Over 2,808 plate-frames, 36
      plates end up less on the screen than the shipped artifact puts them and 5
      entirely off it. Pass 5 built the repair, measured it, and did NOT take it:
      spending `on` first reaches 1 of those 5, because in the other 4 the
      on-screen table is empty and the decision is made inside `off`, where spill
      is a sort key and not a cost; it fails verify_features on plate-over-mark
      in a hand, 33 against a ceiling of 31 that is the shipped artifact's own
      count; and in all 5 frames the name the shipped artifact draws is ALREADY
      unreadable, clipped to 0.53-0.68 on screen in three of them and mostly
      under the bar in the other two. The full reading is at the T= line in edit
      5, and qa/_probe_g4g_rung.js prints the tables it rests on.

  B2  EDIT 5 REPLACED A FLOOR WITH A DELETE, AND THE DELETE TOOK NAMES THE
      SHIPPED ARTIFACT DREW PERFECTLY. Where every offset lands above y=26 the
      untouched `if(y<26)continue` empties platePlace, best stays null, and pass
      3 then hid the name. The shipped artifact floored to y=26 and drew it, and
      at lap|e1900|0.55 The Arrival that floor is READABLE and TOUCHING its own
      on-screen building. The floor is back, unchanged, as the last rung, so a
      district name is never deleted: every rung above it is a legal priced slot
      and the last one is the shipped artifact's own expression.

  B3  kinOn WAS THE WRONG PREDICATE AND THE SHIPPED RULE WAS NOT THE DOCUMENTED
      RULE. The comment said "no building on the screen, no name"; the code
      counted sprite ANCHOR POINTS in the window while the probe, the gate and
      the eye all use the sprite RECT. It deleted names for districts that DO
      have a building on screen, and it never fired where it was written for,
      because with a non-empty table the rung below it drew the name anyway.
      Both halves are answered. The predicate is a RECT now: KIN_R is half the
      sprite's own box at this camera, 42.9*k px, measured across the whole band
      the district names draw in (21.8 px at z=0.46, 31.3 px at z=0.90, the same
      on all three profiles because it follows the LOD scale and nothing else).
      And it no longer decides whether a name exists. It decides an ORDER: a
      district you can see prefers the slots on the screen and may floor itself
      to reach one; a district you cannot see keeps this file's own order and
      stays out at the edge with its land. The floored neighbourhood also gains
      the cheapest-slot pass it never had: pass 3 gave it a free-only pass, so
      when the anchor table was empty nothing ever took the cheapest slot there.

  R2  PER-FRAME COST, MEASURED WITH performance.now(). syncBanners runs from the
      rAF loop. Pass 3 rebuilt six districts by a hundred and thirty-two
      worldToScreen calls every frame, ran plateSlots twice whether or not the
      second neighbourhood differed, and was never timed. Three things changed.
      Every structure's screen point is converted ONCE for the whole frame and
      the four readers that used to convert it themselves take the same object,
      so the frame does 32 conversions where the shipped artifact does about 76.
      The second plateSlots is built lazily and only when the floor moves. And
      the geo pass stopped forcing a synchronous layout on every hidden name,
      which turned out to be the whole of the cost: 400 calls a sample, 300
      warm-up, 9 samples INTERLEAVED A,B,A,B over 18 frames, this tree is SLOWER
      in 7 of 18 with a worst ratio of 1.30x and FASTER in 11, down to 0.45x.
      Worst absolute 0.365 ms against the shipped artifact's 0.601 ms, which is
      2.18% of a 16.7 ms frame. qa/_probe_g4e_cost.js is the instrument.

  R4  THE GATE. Its containment threshold was set to the failure count it had,
      which is a snapshot and not a gate. verify_features now sweeps cam.x as
      well as cam.y (seven cameras), holds three lines at ZERO on both profiles
      (no district name deleted, none drawn outside the window while its own
      land is inside it, none printed under the bar while it has a building on
      the screen), and caps plate-over-plate and plate-over-mark at the counts
      the SHIPPED artifact scores on that same sweep, naming every survivor.
      Zero is not reachable on those two while every district keeps its name;
      pass 3 reached it by deleting 134 plate-frames.

WHAT THIS CHANGES, on top of what pass 3 earned

  1. TWO TABLES, NOT ONE ORDER. plateSlots returns {on,off}: the slots at least
     80% inside the window, and the rest. Inside each the order is pass 3's
     exactly, and the tier boundary is monotone in the same spill the sort
     already led with, so wherever the off table is never consulted the offered
     order is byte-for-byte pass 3's and pass 3's desk wins are untouched by
     construction.

  2. SIX PRICED RUNGS AND THE SHIPPED FLOOR. free on-screen where it stands;
     free on-screen at the floor; cheapest on-screen where it stands; cheapest
     on-screen at the floor; cheapest off-screen at either; then y=Math.max(ay,26)
     at the anchor, which is the shipped artifact's own last resort.

  3. THE FLOOR IS THE SHIPPED FLOOR. Pass 3 floored to just under the bar, which
     is lower than y=26 and loses the band beside a centred bar where a name is
     legal and legible. y>=26 is what the artifact has always used, unchanged
     including the fact that it can land under the bar; the bar rect inside
     plateSlots refuses whatever the bar actually paints over on every other rung.
     x is pulled into the window ONLY for a district with a building on the
     screen. The first cut of this pass clamped x for every district and that
     stood every one whose land is off the side of a phone at the same screen
     edge: plate-over-plate on the phone went from 27 on-screen overlaps to 118
     and 213 legible names appeared for land nobody could see. Measured, and cut
     back to the districts the clamp is true for.

  4. ONE CONVERSION PASS PER FRAME. SPT is every structure's screen point and KIN
     groups those points by district. The sprite transform, the icon-point list,
     the name-ordering sort and the district aim all read it.

  5. A PLACE-NAME TAKES THE ON-SCREEN TABLE FIRST AND THE OTHER ONE AFTER, and
     its box is measured while it is visible and remembered while it is not.
     Refusing the second table looked strictly better and measured far worse: it
     hid names, the top of that loop un-hides them, and the offsetWidth two lines
     later forces a synchronous layout every frame. 0.20 ms a frame on the phone
     for no readable name gained on any profile.

  6. NO NEW WINDOW GLOBAL, PROVED BY ENUMERATING WINDOW AND NOT BY GREP.
     platePlace, marksHit and plateBudget are on window because a later block
     reads them; plateSlots' only callers are the three in syncBanners, in its
     own block. Deleting a `window.plateSlots=plateSlots` line does not delete
     that global: these script tags are classic and top-level, which is why
     SCENE and bEls are bare identifiers here, and by the same rule a `function`
     at column 0 IS a window property. Own-property count HEAD 1496, patch 1496,
     with a declaration 1497 and `plateSlots` the difference. It is a
     `const plateSlots=function(...)` for that reason alone.

WHAT IT COSTS, on 216 frames a tree, 3 profiles x 8 cameras x 9 zooms, against
grounds-v0.html at HEAD and paired per district per frame:

  ink, the share of a plate covered by a sprite, RISES: 0.083 -> 0.115 on the
  desk and worse in 183 of 432 plate-frames, 128 on the lap, 100 on the phone.
  That is the feature, not a defect. A name asked to stand on the buildings it
  names stands on them.

  dIcon, centre to centre from a plate to its nearest own icon, improves on the
  mean everywhere (80.7 -> 42.7 desk, 97.3 -> 73.4 lap, 91.8 -> 84.2 phone) and
  is WORSE in 27, 46 and 80 plate-frames. gIcon and dIcon are different
  questions: a plate can touch a box from further away than one that does not.

  On-screen plate-over-plate falls on the desk (6 -> 3) and the lap (72 -> 47)
  and RISES on the phone, 27 -> 35, worse in 22 frames of 216. Every one is a
  district that was off the screen or under the bar and is now on it. Readable
  and unoverlapped names rise on all three anyway: 397 -> 414, 301 -> 327,
  154 -> 206.

  platePlace, PLATE_COST, PLATE_LEASH, marksHit, the y<26 line and the
  building-name loop's own :3014 box are all UNTOUCHED. "Is this slot clear" is
  bit-for-bit what it was, so the cost==0 guarantee verify_features D2 A2 rests
  on is preserved by construction, and the three callers still share no new
  term: structure plates do not move.

NOT TOUCHED: any z-index; refreshBadges / BADGE_SLOT / badgeRing / RING_ROT /
badge CSS; restoreScene; iScale / renderInspect / bindInspect; PLATE_LEASH;
platePlace. The near/far gate at :2976 keeps its threshold. No new cam.z
threshold is added and no existing one is read here. d.x and d.y are authored
data and are not moved. The sprite pass keeps every value it had: it reads the
frame's cached point instead of converting the same world point a second time.

Re-runnable: every edit guards itself, per edit and not per script. A second run
prints all skips and writes nothing.

    python patch_g4_01_plates.py
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
ORIGINAL = src
start_bytes = len(src.encode('utf-8'))

applied = 0
skipped = 0


def swap(name, old, new, count=1):
    """One edit, one guard. An anchor matching anything other than `count`
    times aborts before a byte is written: that assert is the swarm's conflict
    detector and it is not negotiable. The skip test asks whether THIS edit is
    already in, so a file that took three of ten edits still finishes the
    other seven instead of reading as done."""
    global src, applied, skipped
    have_new = src.count(new)
    have_old = src.count(old)
    if have_new and not have_old:
        assert have_new == count, \
            '%s: already-applied text appears %d times, expected %d' % (name, have_new, count)
        print('  skip   %s' % name)
        skipped += 1
        return
    assert have_old == count, \
        '%s: anchor appears %d times, expected %d' % (name, have_old, count)
    assert have_new == 0, \
        '%s: replacement already present %d times while the anchor is still here' % (name, have_new)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# ---------------------------------------------------------------- edit 1 of 10
# The note above the table. It has to say that the written order is no longer
# the order the solver sees, or the next person to add an offset will sort this
# list by hand and walk pass 1 straight back in.
OLD_NOTE = (
    '/* A district names an AREA, not a roof, so drift costs it far less meaning\n'
    '   than it costs a building name, and it only draws when the camera is pulled\n'
    '   back, which is exactly when it is the only wayfinding on the screen. Wider,\n'
    '   with more places to try, and it never gives up its spot entirely. */'
)
NEW_NOTE = (
    '/* A district names an AREA, not a roof, so drift costs it far less meaning\n'
    '   than it costs a building name, and it only draws when the camera is pulled\n'
    '   back, which is exactly when it is the only wayfinding on the screen. Wider,\n'
    '   with more places to try, and it never gives up its spot entirely.\n'
    '\n'
    '   THE ORDER WRITTEN HERE IS NOT THE ORDER THE SOLVER SEES. plateSlots splits\n'
    '   a copy of it per call into the slots that are on the screen and the slots\n'
    '   that are not, and orders each by how near the district\'s own buildings it\n'
    '   stands, so an offset appended to the end is still reachable. Do not\n'
    '   hand-sort this list. Sorting it by distance from the ANCHOR is what pass 1\n'
    '   did, and the anchor is 43 to 74 px from the middle of the district\'s own\n'
    '   roofs before any plate is placed, so that sort walks names AWAY from the\n'
    '   buildings they name; sorting it by distance to the buildings ALONE is what\n'
    '   pass 2 did, and it promotes the outermost offsets in this table until the\n'
    '   plate walks off the side of a 390 px phone, which is the same defect in a\n'
    '   different coordinate. Both keys are in plateSlots, in that order.\n'
    '   What still matters is whether an offset EXISTS. Straight below the anchor\n'
    '   this table stopped at 64 px and the next offset with any downward component\n'
    '   was 89 px out to the side, while the badge ring grows with the camera and\n'
    '   the leash stays in fixed screen px, so past z=0.82 the near column is eaten\n'
    '   and the name had to cross the land. [0,80] is taken 22 times in 144 measured\n'
    '   placements. [-40,10], [40,10], [-40,-30] and [40,-30] were measured beside\n'
    '   it and taken zero times, so they are not here, and neither is [0,-82]: it is\n'
    '   the most vitals-dangerous offset this table could hold and it is selected\n'
    '   zero times in the same 144. */'
)
swap('1/10 the note: two tables, then the buildings', OLD_NOTE, NEW_NOTE)

# ---------------------------------------------------------------- edit 2 of 10
# The table. Three physical lines, matched as one block so a partial rewrite by
# another lane cannot half-match and land a mangled literal. One offset added,
# beside the [0,64] whose column it continues.
OLD_TABLE = (
    'const DISTRICT_LEASH=[[0,0],[0,-18],[0,17],[-62,-6],[62,-6],[0,-34],[0,32],\n'
    '  [-88,14],[88,14],[-62,-32],[62,-32],[0,48],[0,-50],\n'
    '  [-120,0],[120,0],[-120,-34],[120,-34],[0,-66],[0,64],[-150,20],[150,20]];'
)
NEW_TABLE = (
    'const DISTRICT_LEASH=[[0,0],[0,-18],[0,17],[-62,-6],[62,-6],[0,-34],[0,32],\n'
    '  [-88,14],[88,14],[-62,-32],[62,-32],[0,48],[0,-50],\n'
    '  [-120,0],[120,0],[-120,-34],[120,-34],[0,-66],[0,64],[0,80],[-150,20],[150,20]];'
)
swap('2/10 DISTRICT_LEASH gains [0,80]', OLD_TABLE, NEW_TABLE)

# ---------------------------------------------------------------- edit 3 of 10
# plateSlots, laid in directly after platePlace so the two read together. A
# `const` bound to a function expression and NOT a declaration: these script
# tags are classic and top-level, so `function plateSlots(){}` at column 0 is
# itself `window.plateSlots` with no assignment anywhere, which is the boundary
# this lane works under. Measured by enumerating window's own properties, 1496
# on both trees; a grep for `window.X=` cannot see that class at all.
OLD_TAIL = (
    '  return mustDraw?best:null}\n'
    '/* How many building names the land carries at once.'
)
NEW_TAIL = (
    '  return mustDraw?best:null}\n'
    '/* WHICH OFFSETS THIS FRAME ALLOWS, IN TWO TABLES: THE ONES ON THE SCREEN AND\n'
    '   THE ONES THAT ARE NOT. Two facts about platePlace make this necessary and\n'
    '   both are load-bearing.\n'
    '\n'
    '   One: it prices marks, plates and icons and never distance, and it returns\n'
    '   the FIRST slot that costs nothing. The order of the table it is handed is\n'
    '   the only distance preference the solver has.\n'
    '\n'
    '   Two: a static order can only aim at the ANCHOR, and a district\'s anchor is\n'
    '   its authored point for an AREA, measured 43 px from the centroid of its own\n'
    '   buildings pulled right back and 74 px at the near end of the band, before\n'
    '   any plate is placed. Sorting by distance from it moves a name AWAY from the\n'
    '   roofs it names: it took The Ridge off a building it was touching and stood\n'
    '   it 38 px clear in open jungle. `aim` is the district\'s own icons as screen\n'
    '   points, and the offsets come back ordered by the gap between the plate they\n'
    '   would make and the NEAREST of them, ties broken by the gap to the middle of\n'
    '   the whole set: touch a building you name first, and of the places that do,\n'
    '   stand in the middle of your own land rather than off the far end of it.\n'
    '   Both are measured to the icon\'s ANCHOR POINT, so a gap of 0 here means the\n'
    '   plate covers the point, and a gap of 16 can still be a plate touching the\n'
    '   sprite\'s box. That is why this pass is greedy: at pocket z=0.46 The Arrival\n'
    '   moves 98 px to close 31 px of point gap (10.6 px of box gap) and lands on\n'
    '   The Ponds\' only free slot, which costs The Ponds its place in 12 of the 90\n'
    '   frames swept. A tolerance wide enough to stop that is a tolerance that calls\n'
    '   an 11 px gap close enough, which is the state this item was raised about, so\n'
    '   it is not taken. Nothing here is tuned for it.\n'
    '\n'
    '   AND OFF THE SCREEN IS A PRICE, NOT A PREFERENCE. This table reaches +-150 px\n'
    '   and a phone is 390 px wide, so aiming at the buildings alone promotes the\n'
    '   outermost offsets and a plate half off the side of the screen scores a\n'
    '   perfect gap to a building that is off the side with it. Ordering alone does\n'
    '   not fix that, because platePlace stops at the first slot costing nothing:\n'
    '   an offset entirely outside a 390 px window collides with nothing, prices at\n'
    '   zero, and wins outright over an on-screen slot that costs 4. So the two\n'
    '   kinds are returned SEPARATELY and the caller spends `on` first, both its\n'
    '   free pass and its cheapest pass, at both neighbourhoods, before `off` is\n'
    '   offered at all. That makes being off the screen dearer than every collision\n'
    '   this file prices and cheaper than not drawing, which is the order a reader\n'
    '   would choose. It is lexicographic rather than a number added to the cost\n'
    '   because platePlace is not this lane\'s to touch, and the consequence is\n'
    '   worth reading twice: a slot clipped by more than a fifth loses to a fully\n'
    '   on-screen slot that covers a door chip.\n'
    '\n'
    '   A fifth is not a taste. It is the readable threshold the probe and the gate\n'
    '   both use: at least 80% of the plate inside the window. Inside each table the\n'
    '   order is what it was, spill first, and the split is monotone in that same\n'
    '   spill, so wherever `off` goes unspent the offered order is unchanged. In a\n'
    '   desk frame nothing is clipped, `off` is empty, and this is a no-op.\n'
    '\n'
    '   platePlace is untouched, so "is this slot clear" is bit-for-bit what it was\n'
    '   and cost==0 still means clear. Nothing here prices a collision; this decides\n'
    '   only which order the clear slots are offered in, and which ones are offered\n'
    '   at all before the others.\n'
    '\n'
    '   And the bar. #vitals is z-index 30 with an opaque gradient while #banners is\n'
    '   11, so a plate that lands under the bar is not misplaced, it is GONE, and\n'
    '   districts and place-names were the only plates with no rule about it. `bar`\n'
    '   is its live rect, read once a frame by the caller. The building names use a\n'
    '   scalar box for the same job, the +-360 x-band with y<88, and that box is one\n'
    '   number standing in for two bar heights (46 on a desk, 35 in a hand), two bar\n'
    '   widths and every plate height: it refuses a place-name standing 0.9 px CLEAR\n'
    '   of the bar and fully legible. The rect refuses exactly what the bar paints\n'
    '   over, plus 2 px so a name does not sit flush against it, which is the margin\n'
    '   marksHit already keeps from a door. Without a laid-out bar it falls back to\n'
    '   the scalar box. A rejection here is not a hide: the district caller has a\n'
    '   priced ladder ending in the floor the artifact has always used, and a\n'
    '   place-name goes on not drawing, as it always did.\n'
    '\n'
    '   THE COORDINATE SPACE IS THE PLATE\'S, NOT THE VIEWPORT\'S, and that is not a\n'
    '   detail. .banner left/top are relative to #banners; a getBoundingClientRect\n'
    '   is relative to the VIEWPORT; the two agree only while the document is not\n'
    '   scrolled. verify_features reaches a state where it is scrolled 400 px and\n'
    '   they do not, and a bar rect read in the wrong space protected a strip of\n'
    '   empty land while four names printed under the real bar. `bar` and `view`\n'
    '   are both converted by the caller, once a frame.\n'
    '\n'
    '   No aim, no sort of any kind, so a place-name keeps its authored order inside\n'
    '   each table and gains only the bar and the split.\n'
    '\n'
    '   AND IT IS A const, NOT A function DECLARATION, WHICH IS NOT A STYLE CHOICE.\n'
    '   These three script tags are classic and top-level, which is exactly why SCENE\n'
    '   and bEls are reachable here as bare identifiers, and it is the same fact that\n'
    '   makes `function plateSlots(){}` at column 0 into window.plateSlots with no\n'
    '   assignment written anywhere: window\'s own properties go 1496 to 1497 and this\n'
    '   lane may add none. Grepping for `window.X=` cannot see that class, so the\n'
    '   count is enumerated instead. Nothing is lost by giving up the hoisting: this\n'
    '   line runs some 240 lines before syncBanners is even defined and some 1200\n'
    '   before it is first called, and the three callers are all inside it. */\n'
    'const plateSlots=function(T,ax,ay,w,h,aim,bar,view){\n'
    '  const on=[],off=[];let cx=0,cy=0;\n'
    '  if(aim&&aim.length){for(let n=0;n<aim.length;n++){cx+=aim[n].x;cy+=aim[n].y}\n'
    '    cx/=aim.length;cy/=aim.length}\n'
    '  /* .banner is translate(-50%,-100%): x is the CENTRE and y is the BOTTOM\n'
    '     edge, so the plate rect is x+-w/2 by y-h..y. Rect to point, and 0 when\n'
    '     the plate would cover the point outright. Math.sqrt and not Math.hypot:\n'
    '     hypot carries overflow and underflow scaffolding that two screen offsets\n'
    '     can never reach, and this line runs some hundreds of times a frame from\n'
    '     inside the rAF loop. */\n'
    '  const gap=(x,y,px,py)=>{const dx=Math.max(0,x-w/2-px,px-(x+w/2)),\n'
    '    dy=Math.max(0,y-h-py,py-y);return Math.sqrt(dx*dx+dy*dy)};\n'
    '  const V=view||{l:0,t:0,r:innerWidth,b:innerHeight};\n'
    '  /* px^2 of that rect outside the window. Whole px^2, so float noise cannot\n'
    '     outrank the aim. A fifth of the plate is the readable line. */\n'
    '  const spill=(x,y)=>Math.round(w*h\n'
    '    -Math.max(0,Math.min(x+w/2,V.r)-Math.max(x-w/2,V.l))\n'
    '    *Math.max(0,Math.min(y,V.b)-Math.max(y-h,V.t)));\n'
    '  const SPILL_MAX=w*h*0.2;\n'
    '  const B=(bar&&bar.r>bar.l)?bar:null;\n'
    '  for(let i=0;i<T.length;i++){const x=ax+T[i][0],y=ay+T[i][1],o=spill(x,y);\n'
    '    if(B?(x-w/2<B.r+2&&B.l-2<x+w/2&&y-h<B.b+2&&B.t-2<y)\n'
    '        :(y<V.t+88&&Math.abs(x-(V.l+V.r)/2)<360))continue; // the bar owns this\n'
    '    let d=0,c=0;\n'
    '    if(aim&&aim.length){d=Infinity;\n'
    '      for(let n=0;n<aim.length;n++)d=Math.min(d,gap(x,y,aim[n].x,aim[n].y));\n'
    '      c=gap(x,y,cx,cy)}\n'
    '    (o<=SPILL_MAX?on:off).push({t:T[i],o,d,c,r:Math.hypot(T[i][0],T[i][1]),i})}\n'
    '  /* least clipped; then touch a building you name; of the places that do,\n'
    '     stand in the middle of your own land; then nearest the anchor; then as\n'
    '     written. No aim, no sort at all: a caller with no icons to aim at has\n'
    '     nothing to say about which slot is nearer anything, and reordering one by\n'
    '     the window alone dragged a district with no buildings in it out of the\n'
    '     margin and across two door chips. The split above is not a sort, so a\n'
    '     place-name keeps its authored order inside each table. */\n'
    '  if(aim&&aim.length){const by=(a,b)=>(a.o-b.o)||(a.d-b.d)||(a.c-b.c)||(a.r-b.r)||(a.i-b.i);\n'
    '    on.sort(by);off.sort(by)}\n'
    '  return{on:on.map(o=>o.t),off:off.map(o=>o.t)}};\n'
    '/* How many building names the land carries at once.'
)
swap('3/10 plateSlots: two tables, aim, and the live bar', OLD_TAIL, NEW_TAIL)

# ---------------------------------------------------------------- edit 4 of 10
# One rect read and one conversion pass for the whole frame, before the loop
# that uses them. Anchored on the two lines that open the district pass.
OLD_HEAD = (
    "  const placedD=[]; // district plates dodge the marks, then each other\n"
    "  for(const d of SCENE.districts){const el=bEls['d_'+d.id];"
)
NEW_HEAD = (
    "  const placedD=[]; // district plates dodge the marks, then each other\n"
    "  /* The window and the bar that paints over a plate, measured once for the\n"
    "     whole frame and handed to every placement in it. Two getBoundingClientRects\n"
    "     in a pass that already forces layout once per banner with offsetWidth.\n"
    "     BOTH ARE CONVERTED INTO THE PLATE'S COORDINATE SPACE. A plate's left/top\n"
    "     are relative to #banners and a client rect is relative to the VIEWPORT;\n"
    "     those agree only while the document is not scrolled, and mixing them put\n"
    "     four district names under the real bar while the box guarded a strip of\n"
    "     empty land 400 px away. */\n"
    "  const bwr=bWrap.getBoundingClientRect();\n"
    "  const VIEW={l:-bwr.left,t:-bwr.top,r:innerWidth-bwr.left,b:innerHeight-bwr.top};\n"
    "  const vbar=$('vitals').getBoundingClientRect();\n"
    "  const BAR=vbar.width?{l:vbar.left-bwr.left,t:vbar.top-bwr.top,\n"
    "    r:vbar.right-bwr.left,b:vbar.bottom-bwr.top}:null;\n"
    "  /* EVERY STRUCTURE'S SCREEN POINT, ONCE FOR THE WHOLE FRAME. This function\n"
    "     runs from the rAF loop, so a line in it is paid sixty times a second, and\n"
    "     worldToScreen returns a fresh array on every call. The same world point\n"
    "     used to be converted four times over: by the sprite transform, by the\n"
    "     icon-point list, by the name-ordering sort, and once per district by the\n"
    "     placement below, which alone was six passes over every structure on the\n"
    "     land. One pass now, and all four readers take the object it makes.\n"
    "     KIN groups those points by the district whose own record names them, which\n"
    "     is what the placement aims at. Its own visibility test and not the DOM,\n"
    "     because the sprite loop has not run yet this frame and the display flags\n"
    "     still belong to the last one. */\n"
    "  const SPT={},KIN={};\n"
    "  for(const s of SCENE.structures){const[ix,iy]=worldToScreen(s.x,s.y),q={x:ix/DPR,y:iy/DPR};\n"
    "    SPT[s.key]=q;\n"
    "    if(mode==='now'&&s.state==='blueprint'&&!buildMode)continue;\n"
    "    (KIN[s.district]||(KIN[s.district]=[])).push(q)}\n"
    "  /* HALF THE SPRITE'S BOX, so \"is one of my buildings on the screen\" can be\n"
    "     asked about the BOX and not about the anchor point inside it. The sprite\n"
    "     element is square about its anchor and its half-extent is 42.9*k px for\n"
    "     the largest structure on this land, measured right across the band the\n"
    "     district names draw in: 21.8 px at z=0.46 and 31.3 px at z=0.90, the same\n"
    "     on a 1480 px desk, an 1180 px lap and a 390 px phone, because it follows\n"
    "     the LOD scale and nothing else. Asking the bare point instead reads a\n"
    "     building 30 px inside the window as off it, and that answer was used to\n"
    "     delete names for districts with a building plainly on the screen. */\n"
    "  const KIN_R=k*43;\n"
    "  for(const d of SCENE.districts){const el=bEls['d_'+d.id];"
)
swap('4/10 syncBanners reads the bar and converts the land once a frame', OLD_HEAD, NEW_HEAD)

# ---------------------------------------------------------------- edit 5 of 10
# The district caller. The join s.district === d.id carries 22 of 22 structures.
# The whole placement is one block so the ladder cannot drift away from the
# floor that terminates it.
OLD_DISTRICT = (
    "    const dw=el.offsetWidth||140,dh=el.offsetHeight||22;\n"
    "    /* Never silent at this zoom, because the district names are the only\n"
    "       words on the land, so it takes the cheapest spot in its table rather\n"
    "       than the raw anchor, which used to park it on top of a door. */\n"
    "    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true,null,null,DISTRICT_LEASH,true)\n"
    "      ||{x:sx/DPR,y:Math.max(sy/DPR,26)};\n"
    "    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:dw})}"
)
NEW_DISTRICT = (
    "    const dw=el.offsetWidth||140,dh=el.offsetHeight||22;\n"
    "    /* Never silent at this zoom, because the district names are the only\n"
    "       words on the land, so it takes the cheapest spot in its table rather\n"
    "       than the raw anchor, which used to park it on top of a door.\n"
    "\n"
    "       A DISTRICT NAME IS NEVER DELETED. A pass that hid it instead of flooring\n"
    "       it took names this artifact draws readable and touching their own\n"
    "       building: where every offset lands above y=26 the untouched guard inside\n"
    "       platePlace empties the table, and a hide there is a name lost for a\n"
    "       reason that has nothing to do with the name. The ladder below always\n"
    "       ends somewhere, and the last rung is this file's own floor, unchanged.\n"
    "\n"
    "       AND ONE QUESTION DECIDES WHICH LADDER IT CLIMBS: IS ONE OF THIS\n"
    "       DISTRICT'S OWN BUILDINGS ON THE SCREEN. It is asked of the sprite's BOX,\n"
    "       through KIN_R above, and not of the anchor point inside it, which is the\n"
    "       question pass 3 asked and got wrong in 24 plate-frames. It decides an\n"
    "       ORDER and never a deletion.\n"
    "         A district you CAN see prefers the slots on the screen: it is worth\n"
    "         scuffing a door chip to keep a name beside the roofs it names.\n"
    "         A district you CANNOT see keeps this file's own order, so its name\n"
    "         stays out at the edge with its land instead of being dragged into the\n"
    "         middle of somebody else's. That is not a nicety. Preferring the screen\n"
    "         for a district whose land is off it took plate-over-plate on the phone\n"
    "         from 27 on-screen overlaps to 61 and printed 54 more legible names for\n"
    "         land nobody could see, and the same rule tested against the anchor\n"
    "         point rather than the box is what deleted the 24.\n"
    "\n"
    "       EVERY RUNG IS PRICED, and there are six of them rather than one. A hard\n"
    "       {x:anchor,y:88} consults nothing: not the plates already laid, not the\n"
    "       door chips, not the icons, and it printed one district name on top of\n"
    "       another and laid names across door chips, at 8 a chip the most expensive\n"
    "       collision this file has.\n"
    "         1. A FREE slot where the district stands: on the screen for a district\n"
    "            you can see, anywhere in the leash for one you cannot. Nearest its\n"
    "            own roofs, which is the whole feature.\n"
    "         2. Nothing free there, and a building of its own IS on the screen:\n"
    "            floor the anchor to y>=26 and ask the same two functions again.\n"
    "            That is a second neighbourhood, and it is the rung that matters,\n"
    "            because refusing the bar also took away the free slot this artifact\n"
    "            escaped to and left only slots that cover a door. Built only if the\n"
    "            floor actually moves the anchor, because otherwise it is the same\n"
    "            table twice.\n"
    "            x IS PULLED IN ONLY FOR A DISTRICT YOU CAN SEE, and that condition\n"
    "            is the whole of it. Clamping x for every district stood every one\n"
    "            whose land is off the side of a phone at the same screen edge: six\n"
    "            names in one spot, plate-over-plate on the phone from 27 on-screen\n"
    "            overlaps to 118, and 213 legible names for land nobody could see.\n"
    "            Measured, and cut back to the districts that have a building on the\n"
    "            screen, where the edge nearest their own land is a true place to\n"
    "            stand and the leash on its own cannot reach the window.\n"
    "         3. The cheapest slot in that same table where it stands. For a district\n"
    "            you can see, an on-screen name that scuffs a door chip beats a\n"
    "            perfect one nobody can see, and THAT is the whole of the off-screen\n"
    "            price: it is paid here, not by a number added to the cost.\n"
    "         4. The cheapest slot on the screen at the floor. Pass 3 gave the\n"
    "            floored neighbourhood a free pass and no cheapest pass, so when the\n"
    "            anchor table was empty nothing ever took the cheapest slot there.\n"
    "         5. Only now, and only for a district you can see, the slots that hang\n"
    "            off the window, cheapest first, at the anchor and then at the floor.\n"
    "            A district you cannot see was offered them at rung 1 already, in one\n"
    "            joined table, and the residue that leaves is measured and recorded\n"
    "            at the T= line below rather than fixed here: the repair reaches 1 of\n"
    "            the 5 frames it is raised about, and it fails the plate-over-mark\n"
    "            ceiling verify_features holds at the shipped artifact's own count.\n"
    "         6. Nowhere legal at all: y=Math.max(anchor,26), which is exactly what\n"
    "            this file has always done, and the reason it is reachable is that a\n"
    "            name is worth more than the rule that would have deleted it. It is\n"
    "            left EXACTLY as it was, including the fact that it can land under\n"
    "            the bar, and the reason is measured. Dropping it clear of the bar\n"
    "            instead unburies 68 plate-frames and every one of them belongs to a\n"
    "            district with no building on the screen, so what it really does is\n"
    "            take a name nobody could see and stand it on top of a name they\n"
    "            could: readable-and-not-overlapped names for districts you can see\n"
    "            fell on all three profiles, desk 344 to 342, lap 266 to 257, phone\n"
    "            172 to 168. Every plate still buried on this sweep belongs to a\n"
    "            district with nothing of its own on the screen, 0 of 68 otherwise,\n"
    "            and that is the line verify_features holds at zero. */\n"
    "    const px=sx/DPR,py=sy/DPR,aimD=KIN[d.id];\n"
    "    let kinOn=0;if(aimD)for(let n=0;n<aimD.length;n++){const q=aimD[n];\n"
    "      if(q.x>=VIEW.l-KIN_R&&q.x<=VIEW.r+KIN_R&&q.y>=VIEW.t-KIN_R&&q.y<=VIEW.b+KIN_R)kinOn++}\n"
    "    const S=plateSlots(DISTRICT_LEASH,px,py,dw,dh,aimD,BAR,VIEW);\n"
    "    /* One table for a district you can see, the whole leash in its own order\n"
    "       for one you cannot: S.on and S.off are sorted by the same comparator and\n"
    "       spill leads it, so joined they are the order pass 3 offered.\n"
    "\n"
    "       AND THE JOIN LEAVES A RESIDUE OF B1. It is RECORDED here and not fixed,\n"
    "       and both halves of that decision are measured rather than argued.\n"
    "       platePlace returns the FIRST slot costing nothing, so inside a joined\n"
    "       table a slot entirely outside the window, colliding with nothing, can\n"
    "       still beat an on-screen slot that costs 4. The mechanism is real: over a\n"
    "       12-camera by 13-zoom sweep of all three profiles, 2,808 plate-frames, 36\n"
    "       plates end up less on the screen than the shipped artifact puts them and\n"
    "       5 land entirely off it.\n"
    "         SPENDING `on` TO EXHAUSTION FIRST, which is the obvious repair, reaches\n"
    "       ONE of those 5. In the other 4 the on-screen table is EMPTY: every offset\n"
    "       in the leash is more than a fifth clipped, so there is no on-screen slot\n"
    "       to prefer and nothing for a tier to order. What decides those frames is\n"
    "       inside `off`, where spill is the SORT KEY and not a cost. At lap cam\n"
    "       600,1100 z 0.82, The Ridge: [-150,20] is 23.6% clipped and costs\n"
    "       something, [150,20] is 100% clipped and is free, and the free one wins.\n"
    "       That is B1 one level down, and reaching it means a spill tier INSIDE the\n"
    "       off table, which is a design change and not this pass's to make.\n"
    "         AND THE REPAIR COSTS MORE THAN IT BUYS. Preferring the cheapest\n"
    "       on-screen slot for a district with nothing of its own on the screen means\n"
    "       preferring a name over a DOOR, at 8 the dearest collision this file\n"
    "       prices. Measured: verify_features goes from plate-over-mark 29 of 31\n"
    "       allowed in a hand to 33 of 31, and FAILS, on a ceiling that is the\n"
    "       shipped artifact's own count; and of the 24 names it newly makes readable\n"
    "       on the phone, all 24 are names for land nobody can see.\n"
    "         WHAT THE RESIDUE DOES NOT COST IS A READABLE NAME, which is why it is\n"
    "       a residue. In all 5 frames the shipped artifact's own plate is already\n"
    "       unreadable: 0.53 to 0.68 of the way onto the screen in three of them, and\n"
    "       in the other two mostly UNDER THE BAR, which paints over it. readable ->\n"
    "       NOT readable stays 0 on all three profiles either way.\n"
    "       qa/_probe_g4g_rung.js prints the offered tables, their spill and what\n"
    "       platePlace prices them at, frame by frame. */\n"
    "    const T=(kinOn||!S.off.length)?S.on:S.on.concat(S.off);\n"
    "    const fy=Math.max(py,26),fx=kinOn?Math.min(Math.max(px,VIEW.l+dw/2),VIEW.r-dw/2):px;\n"
    "    let F=null;\n"
    "    let spot=T.length?platePlace(px,py,dw,dh,placedD,true,null,null,T,false):null;\n"
    "    if(!spot&&kinOn&&(fy!==py||fx!==px)){F=plateSlots(DISTRICT_LEASH,fx,fy,dw,dh,aimD,BAR,VIEW);\n"
    "      if(F.on.length)spot=platePlace(fx,fy,dw,dh,placedD,true,null,null,F.on,false)}\n"
    "    if(!spot&&T.length)spot=platePlace(px,py,dw,dh,placedD,true,null,null,T,true);\n"
    "    if(!spot&&F&&F.on.length)spot=platePlace(fx,fy,dw,dh,placedD,true,null,null,F.on,true);\n"
    "    if(!spot&&kinOn&&S.off.length)spot=platePlace(px,py,dw,dh,placedD,true,null,null,S.off,true);\n"
    "    if(!spot&&F&&F.off.length)spot=platePlace(fx,fy,dw,dh,placedD,true,null,null,F.off,true);\n"
    "    if(!spot)spot={x:px,y:fy};\n"
    "    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:dw})}"
)
swap('5/10 the district caller: six priced rungs, then the floor', OLD_DISTRICT, NEW_DISTRICT)

# ---------------------------------------------------------------- edit 6 of 10
# The place-name caller. Same bar, same split, no aim, so PLATE_LEASH keeps its
# order inside each table.
OLD_GEO = (
    "  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);\n"
    "    const hideG=!(cam.z<1.25&&roomy);el.style.display=hideG?'none':'block';if(hideG)return;\n"
    "    /* Last into the same pass the district plates just ran, so a place-name\n"
    "       steps around a district rather than through it. */\n"
    "    const gw=el.offsetWidth||120,gh=el.offsetHeight||20;\n"
    "    const spot=platePlace(sx/DPR,sy/DPR,gw,gh,placedD,true);\n"
    "    if(!spot){el.style.display='none';return}\n"
    "    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:gw})});"
)
NEW_GEO = (
    "  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);\n"
    "    const hideG=!(cam.z<1.25&&roomy);\n"
    "    /* THE BOX IS MEASURED WHILE THE NAME IS ON AND REMEMBERED WHILE IT IS OFF,\n"
    "       and that is a cost fix, not a tidy-up. This loop used to set display to\n"
    "       block and read offsetWidth two lines later. For a name that was hidden\n"
    "       last frame and is about to be hidden again, that pair is a write that\n"
    "       dirties layout followed by a read that forces it back, once per name per\n"
    "       frame, from inside the rAF loop. It never showed while place-names nearly\n"
    "       always found a slot; the moment the bar rule started refusing the slots\n"
    "       that print underneath it, four names on the phone began toggling every\n"
    "       frame and this one pattern cost 0.20 ms against 0.007 ms for the whole\n"
    "       loop. The width of a place-name changes when its text or its stylesheet\n"
    "       changes and neither ever does, so the last measurement taken while it was\n"
    "       visible is the right one; any frame that draws it takes a fresh one,\n"
    "       which is what carries it across a late font load; and display is written\n"
    "       only when it actually changes, so a steady camera forces no layout here\n"
    "       at all. */\n"
    "    if(el.style.display!=='none'){el._gw=el.offsetWidth||el._gw;el._gh=el.offsetHeight||el._gh}\n"
    "    const gw=el._gw||120,gh=el._gh||20;\n"
    "    if(hideG){if(el.style.display!=='none')el.style.display='none';return}\n"
    "    /* Last into the same pass the district plates just ran, so a place-name\n"
    "       steps around a district rather than through it. */\n"
    "    /* The same bar the district plates just refused, and the same split. No\n"
    "       aim: a place-name names water and rock, which carry no icons, so\n"
    "       PLATE_LEASH keeps the order it was written in inside each table. The\n"
    "       on-screen table first and the other one after, which is the district\n"
    "       ladder with the rungs a place-name has no use for taken out: it is\n"
    "       allowed not to draw, so there is no floor and no last resort. Offering\n"
    "       the on-screen table alone was measured and dropped: it gained no readable\n"
    "       name on any profile and it hid enough names to pay the toggle above. */\n"
    "    const gS=plateSlots(PLATE_LEASH,sx/DPR,sy/DPR,gw,gh,null,BAR,VIEW);\n"
    "    let spot=gS.on.length?platePlace(sx/DPR,sy/DPR,gw,gh,placedD,true,null,null,gS.on):null;\n"
    "    if(!spot&&gS.off.length)spot=platePlace(sx/DPR,sy/DPR,gw,gh,placedD,true,null,null,gS.off);\n"
    "    if(!spot){if(el.style.display!=='none')el.style.display='none';return}\n"
    "    if(el.style.display!=='block')el.style.display='block';\n"
    "    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:gw})});"
)
swap('6/10 the place-name caller takes the same bar and the on-screen table', OLD_GEO, NEW_GEO)

# ---------------------------------------------------------------- edit 7 of 10
# The sprite pass reads the frame's cached point. Every value it computes is
# unchanged: sx and sy were device px divided by DPR at each of four uses, and
# are the same CSS px here, read once.
OLD_SPRITE = (
    "    if(!hideP){const[sx,sy]=worldToScreen(s.x,s.y);\n"
    "      const iso=!painted&&useIso&&s.state!=='blueprint';\n"
    "      const sc=((typeof FAM_SCALE!=='undefined'&&FAM_SCALE[fam])||1)*(s.scale||1)*(window.GSCALE||1);\n"
    "      s._crownOff=(painted?k*1.35*sc*54:(iso?k*1.35*sc*34:k*30*(window.GSCALE||1)))+6;\n"
    "      p.style.transform=`translate(${sx/DPR}px,${sy/DPR}px) scale(${(iso||painted)?k*1.35*sc:k*(window.GSCALE||1)})`;\n"
)
NEW_SPRITE = (
    "    if(!hideP){const q=SPT[s.key],sx=q.x,sy=q.y; // converted once at the top of the frame\n"
    "      const iso=!painted&&useIso&&s.state!=='blueprint';\n"
    "      const sc=((typeof FAM_SCALE!=='undefined'&&FAM_SCALE[fam])||1)*(s.scale||1)*(window.GSCALE||1);\n"
    "      s._crownOff=(painted?k*1.35*sc*54:(iso?k*1.35*sc*34:k*30*(window.GSCALE||1)))+6;\n"
    "      p.style.transform=`translate(${sx}px,${sy}px) scale(${(iso||painted)?k*1.35*sc:k*(window.GSCALE||1)})`;\n"
)
swap('7/10 the sprite transform reads the cached point', OLD_SPRITE, NEW_SPRITE)

OLD_SPRITE_BG = (
    "        bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;\n"
    "        bg._off=(s._crownOff||30)*0.72;bg._cx=sx/DPR;bg._cy=sy/DPR;bg._on=!hideP;\n"
)
NEW_SPRITE_BG = (
    "        bg.style.transform=`translate(${sx}px,${sy}px)`;\n"
    "        bg._off=(s._crownOff||30)*0.72;bg._cx=sx;bg._cy=sy;bg._on=!hideP;\n"
)
swap('8/10 the badge plane reads the same two numbers', OLD_SPRITE_BG, NEW_SPRITE_BG)

# ---------------------------------------------------------------- edit 9 of 10
OLD_ICONPTS = (
    "  for(const s of SCENE.structures){if(mode==='now'&&s.state==='blueprint')continue;\n"
    "    const[ax,ay]=worldToScreen(s.x,s.y);iconPts.push({k:s.key,x:ax/DPR,y:ay/DPR})}"
)
NEW_ICONPTS = (
    "  for(const s of SCENE.structures){if(mode==='now'&&s.state==='blueprint')continue;\n"
    "    const q=SPT[s.key];iconPts.push({k:s.key,x:q.x,y:q.y})}"
)
swap('9/10 the icon-point list reads the cached point', OLD_ICONPTS, NEW_ICONPTS)

# ---------------------------------------------------------------- edit 10 of 10
OLD_ORDER = (
    "  const order=SCENE.structures.map(s=>{const[sx,sy]=worldToScreen(s.x,s.y);\n"
    "      const px=sx/DPR,py=sy/DPR;\n"
)
NEW_ORDER = (
    "  const order=SCENE.structures.map(s=>{const q=SPT[s.key],px=q.x,py=q.y;\n"
)
swap('10/10 the name-ordering sort reads the cached point', OLD_ORDER, NEW_ORDER)

# --------------------------------------------------------------------- write
if applied:
    with io.open(TARGET, 'w', encoding='utf-8', newline='') as fh:
        fh.write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n%d applied, %d skipped, %d -> %d bytes (%+d)'
          % (applied, skipped, start_bytes, end_bytes, end_bytes - start_bytes))
else:
    assert src == ORIGINAL, 'nothing applied yet the buffer changed'
    print('\n%d applied, %d skipped, 0 bytes changed (%d)' % (applied, skipped, start_bytes))
sys.exit(0)
