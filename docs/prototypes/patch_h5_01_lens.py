# -*- coding: utf-8 -*-
"""L5/1: the org lens stops ringing every building and starts drawing the org.

RYE, R6: "when clicking the 'org' button on the top right to see the org structure,
it creates one circle around each area (it should only do this for where circles
live) and then should have satellite circles representing each role that exists in
that circle."  R4: "I should see 3 satellites within the Org circle showing the 3
roles. Then if those roles are open, partially filled or full they need to show up
differently on the map."

WHAT WAS THERE. One loop, three lines, over EVERY structure:

    if(orgOn)for(const s of SCENE.structures){ ... cx.arc(s.x,s.y,46,0,7) ... }

Twenty-two halos, one per building, all at radius 46, and the ones with no circle
drew in '#ccc'. That is the "one circle around each area" Rye is looking at.

WHAT IT IS NOW.

1. HALOS ONLY AT THE CURATED CIRCLE HOMES. `CIRCLE_HOMES` already resolves ten
   distinct buildings for eleven circles (Coordination and Arts share the
   Community Center), and `circleHome()` already trusted it. The lens now reads
   the same table, so the halos and the org chart agree by construction.

2. THE OVERLAP IS SOLVED, NOT STATED. Measured on the shipped land, ten halos at
   radius 46 leave EIGHT overlapping pairs, because five homes sit inside the
   heart district:

       community-library 58   kitchen-council 64   greenhouse-library 66
       community-kitchen 68   library-council  79   welcome-market   82
       community-council 85   community-greenhouse 87

   Each halo takes HALF THE DISTANCE TO ITS NEAREST NEIGHBOUR, capped at 46. For
   any pair, r_a <= d_ab/2 and r_b <= d_ab/2, so r_a + r_b <= d_ab and the two
   discs cannot overlap. Tangent is the worst case and it happens only between
   the closest pair. On this land that puts every radius between 29 and 46.

   ROLE_HALO_MIN is a legibility floor and it is the one thing that can break the
   proof. It can only bind when two circle homes sit within 36 scene units of each
   other, which is closer than two building sprites can stand without overlapping,
   so a founder who reaches it has already told you by moving the buildings.

3. SATELLITES, one per role, around the building the role is addressed to,
   carrying that role's own circle colour. Deterministic radial placement, the
   same law the org chart uses: angle is a pure function of (index, count), no
   physics and no jitter, so a role does not move when a sibling is added.

4. OPEN / PARTIAL / FULL, three inks. `state` is read off the seat and nothing
   else: `filled` draws solid, `partial` draws half, and everything else draws a
   dashed hollow ring. Absent state reads `open`, which is the honest answer for
   this artifact's own seed: all sixteen seeded seats are open calls and the org
   chart has said so in a comment since it was written. The five server values
   (`open|partial|filled|expired` plus an override) collapse here to three
   because Rye asked for three; `expired` reads open because the server's own
   comment says an expired seat is "still held, and openly waiting for the
   village to reassign it", which is an opening.

5. OPEN ROLES PULSE, at the same 2.4s the org chart's `.ovac` already pulses at,
   so the two views breathe together. R4: "the open roles for the character I'm
   playing should always be the most obvious." `roleRelevant()` is the gate and
   it answers TRUE for everything until a party is pushed, so this build pulses
   every open seat and the character wiring narrows it later.

6. GOVERNING FUNCTIONS FALL BACK AT DRAW TIME, and `x.at` is never written.
   R6: "for all governing functions (like marketing, accounting, etc) they should
   default to exist under the main community center building ... unless/until a
   founder moves them to another location."

   The founder's word is the whole question, and the artifact ALREADY has the
   predicate for it: `classify()` returns 'creator' for an address a person chose,
   'resolver' for a guess, and 'pool' for silence. `roleHome()` defers to
   'creator' and defaults the other two. Nothing is written down, so a
   founder-placed governing role and a defaulted one stay tellable apart forever,
   which is the distinction migration 0060 exists to protect.

   On the shipped seed this moves exactly three roles: Development Board of
   Directors, Community Advisory Council and Leadership Council, all Wisdom, all
   holding a resolver GUESS at the Council Fire, now gathering at the Community
   Center. The Council Fire keeps Storyweaver, which is the scene's own word.

   THE BADGES DO NOT MOVE. `seatsAt()` still keys on `x.at`, so the seat badge on
   the Council Fire still counts four. The lens is a lens and the address is the
   address; moving the badge would be moving the seat, and that is a founder's
   act rather than a view's.

7. THE LENS BAR HIDES UNDER THE CHART. `body.circles` puts `#orgmap` over the
   whole viewport at z 28, and `#layers` sits at z 30 on top of it: you could
   toggle a lens you had no way to see.

Anchored on code and CSS. Guard per edit, re-runnable, a second run is all skips
and zero bytes.

    python patch_h5_01_lens.py
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
    """One edit, one guard.

    The guard is a SENTINEL that no later patch in this family touches. It is
    not the whole inserted block, because guarding on the block makes a patch
    re-apply itself the moment a later patch edits one line inside it, and
    then a second pass over the family duplicates work instead of skipping.
    Falls back to the block when an edit is nobody else's anchor.

    An anchor matching anything other than `count` times aborts before a byte
    is written."""
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


# ---------------------------------------------------------------- 1/5  CSS
OLD = "  #orgSvg .ovac{animation:opulse 2.4s ease-in-out infinite}\n"
NEW = (
    "  #orgSvg .ovac{animation:opulse 2.4s ease-in-out infinite}\n"
    "  /* ---------- L5: THE ORG LENS ON THE LAND ----------\n"
    "     The key names three inks and nothing else. It carries no counts,\n"
    "     because a count on a legend is a number nobody can check. */\n"
    "  #roleKey{position:absolute;top:44px;right:12px;z-index:30;display:none;gap:9px;\n"
    "    align-items:center;padding:5px 10px;border-radius:8px;font-size:10.5px;\n"
    "    letter-spacing:.02em;color:var(--parch);pointer-events:none;\n"
    "    background:linear-gradient(180deg,rgba(44,33,20,.95),rgba(28,20,11,.95));\n"
    "    border:1px solid rgba(201,162,94,.3);box-shadow:0 4px 14px rgba(0,0,0,.4)}\n"
    "  body.org-lens #roleKey{display:flex}\n"
    "  #roleKey .role-k{width:11px;height:11px;border-radius:50%;display:inline-block;\n"
    "    margin-right:3px;vertical-align:-1px;box-sizing:border-box}\n"
    "  #roleKey .role-open{background:rgba(20,14,8,.72);border:1.6px dashed var(--gold)}\n"
    "  #roleKey .role-part{border:1.6px solid var(--gold);\n"
    "    background:linear-gradient(90deg,var(--gold) 50%,rgba(20,14,8,.72) 50%)}\n"
    "  #roleKey .role-full{background:var(--gold);border:1.6px solid var(--gold)}\n"
    "  /* The chart covers the whole viewport at z 28 and the lens bar sits at\n"
    "     z 30 on top of it, so the lens could be toggled with nothing behind\n"
    "     it to see. Both of these come AFTER the rule that shows the key, so\n"
    "     they win on order at equal specificity. */\n"
    "  body.circles :is(#layers,#roleKey){display:none}\n"
    "  body.pocket #roleKey{display:none}\n"
)
swap('1/5 the org lens key, and the lens bar hiding under the chart', OLD, NEW,
     mark='#roleKey .role-full{')

# ---------------------------------------------------------------- 2/5  DOM
OLD = (
    "<div id=\"layers\">\n"
    "  <button id=\"lyNow\" class=\"on\">Now</button><button id=\"lyVision\">Vision</button>"
    "<button id=\"lyOrg\">Org</button><button id=\"lyFlows\">Flows</button>\n"
    "</div>\n"
)
NEW = (
    "<div id=\"layers\">\n"
    "  <button id=\"lyNow\" class=\"on\">Now</button><button id=\"lyVision\">Vision</button>"
    "<button id=\"lyOrg\">Org</button><button id=\"lyFlows\">Flows</button>\n"
    "</div>\n"
    "<div id=\"roleKey\"><span class=\"role-k role-open\"></span>open"
    "<span class=\"role-k role-part\"></span>part filled"
    "<span class=\"role-k role-full\"></span>full</div>\n"
)
swap('2/5 the key element, beside the bar that turns it on', OLD, NEW,
     mark='<div id="roleKey">')

# ---------------------------------------------------------------- 3/5  the draw
# The anchor is the whole old loop, so the count assert is the proof that the
# twenty-two-halo version is gone rather than shadowed.
OLD = (
    "  // org halos\n"
    "  if(orgOn)for(const s of SCENE.structures){if(mode==='now'&&s.state==='blueprint')continue;\n"
    "    const col=CIRCLE_COL[s.circle]||'#ccc';cx.fillStyle=col+'2e';cx.beginPath();cx.arc(s.x,s.y,46,0,7);cx.fill();\n"
    "    cx.strokeStyle=col+'aa';cx.lineWidth=1.2;cx.beginPath();cx.arc(s.x,s.y,46,0,7);cx.stroke()}\n"
)
NEW = (
    "  // org halos: circle homes, and one satellite per role. roleLens is declared\n"
    "  // beside CIRCLE_HOMES, in a later script block, so the call is guarded the\n"
    "  // way every other cross-block call in this file is.\n"
    "  if(orgOn&&typeof roleLens==='function')roleLens(cx,mode,t);\n"
)
# THE SENTINEL IS THE COMMENT, NOT THE CALL. Patch 11 rewrites the call line
# itself - the lens gets its own plane and its own once-a-frame owner, so
# `if(orgOn&&typeof roleLens===...)` becomes `if(typeof roleLensFrame===...)`.
# A guard carrying the call therefore stopped matching, and because the OLD
# anchor is also long gone by then, a second pass over the family ABORTED here
# on the count assert instead of skipping. Safe, and still a broken replay.
swap('3/5 the twenty-two-halo loop gives way to the lens', OLD, NEW,
     mark="  // org halos: circle homes, and one satellite per role. roleLens is declared\n")

# ---------------------------------------------------------------- 4/5  the lens
OLD = (
    "const CIRCLE_HOMES={Outreach:'gate',Community:'welcome',Finance:'market',Land:'greenhouse',Coordination:'community',\n"
    "  Gathering:'kitchen',Learning:'library',Wisdom:'council',Building:'ridgeA',Healing:'sanctuary',Arts:'community'};\n"
)
NEW = OLD + (
    "/* ---------- L5: THE ORG LENS ON THE LAND (R6, R4) ----------\n"
    "   A lens, never a ledger: everything below READS the scene and writes\n"
    "   nothing back into it. `roleHome` in particular never assigns `x.at`.\n"
    "\n"
    "   WHICH CIRCLES ARE GOVERNING FUNCTIONS. Rye named marketing and accounting\n"
    "   and said \"etc\", so this is the reading and it is one editable line:\n"
    "   Outreach is the village's face outward, Finance is its books, Coordination\n"
    "   is its administration and Wisdom is its governance. The other seven are\n"
    "   circles that belong to a PLACE (Land to the gardens, Gathering to the\n"
    "   hearth, Building to the ridge), and a place-bound circle that has lost its\n"
    "   address should read as homeless instead of quietly moving to the centre. */\n"
    "const ROLE_GOV={Outreach:1,Finance:1,Coordination:1,Wisdom:1};\n"
    "const ROLE_GOV_HOME='community';\n"
    "/* Halo radius. MAX is the radius the lens has always drawn at. MIN is a\n"
    "   legibility floor, and it is the only thing that can break the no-overlap\n"
    "   proof in roleHomes(); it takes two circle homes standing 36 scene units\n"
    "   apart to reach it, which is closer than two sprites can stand. */\n"
    "const ROLE_HALO_MAX=46,ROLE_HALO_MIN=18;\n"
    "/* The party the player has chosen, as archetype keys, pushed over the\n"
    "   CREDENTIALED hand. Null until then, and null means every role is relevant:\n"
    "   a map with nobody signed in narrows nothing. */\n"
    "let ROLE_PARTY=null;\n"
    "/* An untagged row belongs to everyone, and \"tagged for nobody\" has to read\n"
    "   the same way as \"not tagged at all\". That is the server's own law in\n"
    "   server/lib/characters.ts, written here so the two cannot drift. */\n"
    "function roleRelevant(tags){\n"
    "  if(!ROLE_PARTY||!ROLE_PARTY.length)return true;\n"
    "  if(!Array.isArray(tags)||!tags.length)return true;\n"
    "  for(const a of tags)if(ROLE_PARTY.indexOf(a)>=0)return true;\n"
    "  return false}\n"
    "/* Where a role DRAWS, which is not always where it is addressed.\n"
    "   `classify()` is the artifact's own provenance predicate and it is the one\n"
    "   asked here: 'creator' is a person's decision and is never moved, while\n"
    "   'resolver' is a guess and 'pool' is silence. A governing function holding\n"
    "   either of those two gathers at the Community Center until a founder places\n"
    "   it, and the moment they do, classify() says 'creator' and this stops. */\n"
    "function roleHome(x){\n"
    "  if(!x)return null;\n"
    "  const own=(x.at&&BY[x.at])?x.at:null;\n"
    "  if(own&&(typeof classify!=='function'||classify(x)==='creator'))return own;\n"
    "  if(ROLE_GOV[x.c]&&BY[ROLE_GOV_HOME])return ROLE_GOV_HOME;\n"
    "  return own}\n"
    "/* True when this role is drawn somewhere its address does not name it. */\n"
    "function roleDefaulted(x){const h=roleHome(x);return !!(h&&h!==x.at)}\n"
    "/* Five server values, three inks, because Rye asked for three. `expired`\n"
    "   reads open: the server's own comment calls it \"still held, and openly\n"
    "   waiting for the village to reassign it\", which is an opening. */\n"
    "function roleState(x){const v=String((x&&x.state)||'open');\n"
    "  return v==='filled'?'full':(v==='partial'?'partial':'open')}\n"
    "/* The curated homes that resolve, each with a radius that CANNOT overlap a\n"
    "   neighbour's. Half the distance to the nearest other home, capped at MAX:\n"
    "   for any pair r_a <= d/2 and r_b <= d/2, so r_a + r_b <= d. Measured on the\n"
    "   shipped land this returns ten homes with radii from 29 to 46, against the\n"
    "   eight overlapping pairs a flat 46 produced. Recomputed per frame on\n"
    "   purpose, because build mode drags buildings and a cached radius would go\n"
    "   stale mid-drag; ten homes is forty-five distances. */\n"
    "function roleHomes(mode){\n"
    "  const seen={},out=[];\n"
    "  for(const c of Object.keys(CIRCLE_COL)){\n"
    "    const k=CIRCLE_HOMES[c],s=k&&BY[k];\n"
    "    if(!s)continue;\n"
    "    if(mode==='now'&&s.state==='blueprint')continue;\n"
    "    if(seen[k]){seen[k].circles.push(c);continue}\n"
    "    const e={k:k,x:s.x,y:s.y,circles:[c],r:ROLE_HALO_MAX};\n"
    "    seen[k]=e;out.push(e)}\n"
    "  for(const a of out){let nn=Infinity;\n"
    "    for(const b of out)if(b!==a){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<nn)nn=d}\n"
    "    a.r=Math.max(ROLE_HALO_MIN,Math.min(ROLE_HALO_MAX,nn/2))}\n"
    "  return out}\n"
    "window.roleHomes=roleHomes;\n"
    "/* Every role that DRAWS at each building, keyed by building. Built once per\n"
    "   frame, so the satellite pass is one walk of the seats and not one walk\n"
    "   per building. */\n"
    "function roleSeatsBy(){const m={};\n"
    "  for(const x of SCENE.seats){const k=roleHome(x);if(!k)continue;(m[k]||(m[k]=[])).push(x)}\n"
    "  return m}\n"
    "window.roleSeatsBy=roleSeatsBy;\n"
    "/* One satellite. Solid is full, half is partial, and a dashed hollow ring is\n"
    "   open. An open role the player's party can take breathes at the 2.4s the\n"
    "   org chart's own .ovac breathes at, so the land and the chart agree. */\n"
    "function roleSat(cx,px,py,col,st,pulse,t){\n"
    "  cx.lineWidth=1.6;cx.strokeStyle=col;\n"
    "  cx.beginPath();cx.arc(px,py,4.2,0,7);\n"
    "  if(st==='full'){cx.fillStyle=col;cx.fill();cx.stroke();return}\n"
    "  if(st==='partial'){cx.fillStyle='rgba(20,14,8,.72)';cx.fill();cx.stroke();\n"
    "    cx.beginPath();cx.moveTo(px,py);cx.arc(px,py,4.2,-Math.PI/2,Math.PI/2);cx.closePath();\n"
    "    cx.fillStyle=col;cx.fill();return}\n"
    "  cx.fillStyle='rgba(20,14,8,.72)';cx.fill();\n"
    "  cx.globalAlpha=pulse?(0.6+0.3*Math.sin(t*2.618)):0.9;\n"
    "  cx.setLineDash([2.4,2]);cx.stroke();cx.setLineDash([]);cx.globalAlpha=1}\n"
    "/* The whole lens, called from the draw loop with the canvas already in scene\n"
    "   coordinates. Halos first so the satellites sit on top of their own wash. */\n"
    "function roleLens(cx,mode,t){\n"
    "  const homes=roleHomes(mode),byHome={};\n"
    "  for(const h of homes){byHome[h.k]=h;\n"
    "    const col=CIRCLE_COL[h.circles[0]]||'#9aa08f';\n"
    "    cx.fillStyle=col+'2e';cx.beginPath();cx.arc(h.x,h.y,h.r,0,7);cx.fill();\n"
    "    cx.lineWidth=1.2;\n"
    "    /* Two circles can share a home. Each gets its own ring, stepped inward,\n"
    "       so the Community Center reads as two circles and not as one. */\n"
    "    h.circles.forEach((c,i)=>{cx.strokeStyle=(CIRCLE_COL[c]||'#9aa08f')+'aa';\n"
    "      cx.beginPath();cx.arc(h.x,h.y,Math.max(5,h.r-i*4),0,7);cx.stroke()})}\n"
    "  const by=roleSeatsBy();\n"
    "  for(const k of Object.keys(by)){\n"
    "    const s=BY[k];if(!s)continue;\n"
    "    if(mode==='now'&&s.state==='blueprint')continue;\n"
    "    const list=by[k],n=list.length;\n"
    "    /* Inside the halo where there is one, and on a ring of its own where\n"
    "       there is not: a role can be addressed to a building no circle calls\n"
    "       home, and it still has to be visible there. */\n"
    "    const h=byHome[k],R=h?Math.max(12,h.r*0.66):26;\n"
    "    list.forEach((x,i)=>{\n"
    "      const a=-Math.PI/2+2*Math.PI*i/n;\n"
    "      const st=roleState(x);\n"
    "      roleSat(cx,s.x+R*Math.cos(a),s.y+R*Math.sin(a),\n"
    "        CIRCLE_COL[x.c]||'#9aa08f',st,st==='open'&&roleRelevant(x.archetypes),t||0)})}}\n"
    "window.roleLens=roleLens;\n"
)
swap('4/5 the lens: homes, radii, satellites, three inks', OLD, NEW,
     # PATCHES 09 THROUGH 16 ALL EDIT INSIDE THIS BLOCK - the signature gains a
     # second context, the satellite radius gains a floor, the governing rule
     # starts reading CIRCLE_HOMES, the fan learns to open. A guard on the
     # signature line stopped matching at patch 11 and this whole block was
     # inserted a SECOND time on a family replay. roleHomes' own declaration is
     # the one line in here nothing downstream has any reason to touch.
     mark='function roleHomes(mode){')

# ---------------------------------------------------------------- 5/5  the toggle
OLD = (
    "$('lyOrg').onclick=()=>{orgOn=!orgOn;$('lyOrg').classList.toggle('on',orgOn);\n"
    "  toast(orgOn?'Org lens: circle colors over the land':'Org lens off')};\n"
)
NEW = (
    "$('lyOrg').onclick=()=>{orgOn=!orgOn;$('lyOrg').classList.toggle('on',orgOn);\n"
    "  document.body.classList.toggle('org-lens',orgOn); // the key rides the same switch\n"
    "  toast(orgOn?'Org lens: a halo where each circle lives, and one satellite for every role.':'Org lens off')};\n"
)
swap('5/5 the toggle carries the key with it', OLD, NEW,
     mark="classList.toggle('org-lens',orgOn)")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
