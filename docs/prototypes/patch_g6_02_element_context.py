#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.02 — THE ELEMENT HALF.

g6.01 closed the JS-string class and reported the whole class. This closes the
other half.

WHAT WAS STILL OPEN. escj protects a value that travels inside a single-quoted
JS string in an inline handler. It does nothing for a value that lands in
ELEMENT text or in an ATTRIBUTE, and an <img onerror> in element context is code
execution just as surely as an apostrophe in a handler. Proven on the shipped
bytes through the real user path: poison a stored scene through restoreScene,
then CLICK #msCircles and nothing else.

    after restoreScene only    pwn=0   els=0
    after CLICKING #msCircles  pwn=16  els=16   (all 16 inside #orgSvg)

That is buildOrgMap, the Circles map, which verify_doors already exercises. With
the same click and a payload that also poisons vital_overrides — which
restoreScene assigns straight to window.VITAL_OVR — it is 21 and 21, because the
vitals bar prints a held number with no click at all: 5 before the click, 16 more
from the Circles map. After this patch, 0 and 0.

THE SINKS THIS CLOSES, found by driving the poisoned scene one surface at a time
and marking every field with its own name, not by reading the diff:

    buildOrgMap        circle name, home label, role name, quest <title>,
                       SCENE.name, and three data-go attributes
    openVitalDrop      the claim button's LABEL (the sibling of the onclick
                       g6.01 escaped), all six held numbers, the unit chip,
                       the head and the source line
    rebuildVitals      the held number and its label, on every restore
    inviteHere         the pocket card headline
    renderTab          the overview count line's s.event, four rows under the
                       state pill g6.01 did escape
    renderResolver     every step line and the address it lands on
    renderInspect      the circle sentence, the phase labels, the circle picker
    MODULES[k].sample  eight rows across the Stays, Housing, Forum, Quests,
                       Journeys, Health and Events rooms
    openDoor           the module card's "through the door of" line

THREE CONTEXTS, AND THE RIGHT ESCAPE FOR EACH:

    double-quoted attribute   value="${escq(x)}"          escq
    element text              <h2>${escq(x)}</h2>          escq
    JS string in a handler    onclick="f('${escj(x)}')"    escj

escj is NOT the element escape and is NOT the attribute escape. It escapes for
the JS string FIRST and then hands the result to escq, so using it on a value
that never enters a handler ships a backslash into the reader's text. Every
element and attribute site in this patch takes escq. The two rules are written
next to each other here because the wrong one is invisible until a founder types
an apostrophe.

escq GAINS THE ANGLE BRACKET IT WAS MISSING. It covered & < " — enough to keep a
value from opening a tag or closing an attribute, and NOT enough for the > that
closes one. One escape that covers all four beats a fourth helper that call
sites would have to choose between, and the choice is exactly what went wrong in
g6.01. It stays correct in the JS-string context too: escj wraps escq, and the
HTML parser decodes &gt; back to > before the handler compiles.

WHAT IS DELIBERATELY NOT ESCAPED, and why it is not a silent omission: values
read out of a CODE TABLE. MODULES, THEMES, REG, DOOR_DEFS, STATE_LABEL,
EDIT_VERBS, EVENTS and the CIRCLE_COL colour strings are literals in this file;
a stored scene cannot reach them, and one of them (`staked &amp; pooled`) is
hand-written HTML that escq would double-encode into a visible entity. The
circle NAMES off CIRCLE_COL are escaped anyway, because the circle vocabulary is
the first thing a white-label fork makes the founder's own.

ORDER MATTERS, ONCE. This patch SUPERSEDES the escq body that g6.01 wrote, so
g6.01 must run before it. Run in that order both are idempotent. Run g6.01 again
AFTER this one and its helper edit reports GONE and exits 3, correctly: its
anchor really has moved, and a guard that said "skip" there would be lying. The
re-run proof for g6.01 is taken at its own place in the chain, on the tree as it
stood before this patch.

Re-runnable: every edit is guarded on its own, the result is tested BEFORE the
anchor, and a second run is all skips and zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')


def say(s):
    """Print without assuming the operator's console speaks Unicode.

    patch_g6_01 died with UnicodeEncodeError on a default Windows shell because
    one edit name carries a right arrow and cp1252 has no glyph for it. It wrote
    zero bytes, so it was safe, but the re-runnability proof could not be
    produced without PYTHONIOENCODING=utf-8 — a patch that cannot show its own
    second run. The fix belongs in the print, not in the operator's environment,
    and the same helper is now in g6.01.
    """
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []


def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


# --------------------------------------------------------------- the helper
edit('escq gains > : element context needs all four of & < > "',
  """function escq(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}""",
  """function escq(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}""")

# ------------------------------------------------------- buildOrgMap, in full
# The Circles map. Five raw interpolations, and #msCircles is one click from the
# land. escq at every one: three are element text, three are attributes, and not
# one of them is a JS string.
edit('the Circles map, circle node: the home label is element text, data-go is an attribute (escq for both)',
  """    nodes+=`<g class="onode" data-go="${home||''}" data-kind="circle" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle r="${R.toFixed(1)}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2.4"/>
      <text y="3" text-anchor="middle" font-size="11.5" fill="#f2e7c6">${c}</text>
      <text y="${(R+12).toFixed(0)}" text-anchor="middle" font-size="8.2" fill="#b9af8f">⌂ ${home&&BY[home]?BY[home].name:'no home yet'}</text></g>`;""",
  """    nodes+=`<g class="onode" data-go="${escq(home||'')}" data-kind="circle" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <circle r="${R.toFixed(1)}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2.4"/>
      <text y="3" text-anchor="middle" font-size="11.5" fill="#f2e7c6">${escq(c)}</text>
      <text y="${(R+12).toFixed(0)}" text-anchor="middle" font-size="8.2" fill="#b9af8f">⌂ ${escq(home&&BY[home]?BY[home].name:'no home yet')}</text></g>`;""")

edit('the Circles map, role node: the role name is element text, and truncation is not an escape (escq)',
  """      nodes+=`<g class="onode orole" data-go="${s2.at||''}" data-kind="role" transform="translate(${rx2.toFixed(1)},${ry2.toFixed(1)})">
        <circle class="ovac" r="6" fill="#1c140b" stroke="#ecd08a" stroke-width="1.6" stroke-dasharray="3 2"/>
        <text y="15" text-anchor="middle" font-size="7.4" fill="#e8d9a8">${nm}</text></g>`});""",
  """      nodes+=`<g class="onode orole" data-go="${escq(s2.at||'')}" data-kind="role" transform="translate(${rx2.toFixed(1)},${ry2.toFixed(1)})">
        <circle class="ovac" r="6" fill="#1c140b" stroke="#ecd08a" stroke-width="1.6" stroke-dasharray="3 2"/>
        <text y="15" text-anchor="middle" font-size="7.4" fill="#e8d9a8">${escq(nm)}</text></g>`});""")

edit('the Circles map, quest node: an SVG <title> is element context too (escq)',
  """      nodes+=`<g class="onode oquest" data-go="${q2.at||''}" data-kind="quest" transform="translate(${qx.toFixed(1)},${qy.toFixed(1)})">
        <circle r="4.2" fill="#e8c877" fill-opacity=".85"/><title>⚑ ${q2.q}</title></g>`});""",
  """      nodes+=`<g class="onode oquest" data-go="${escq(q2.at||'')}" data-kind="quest" transform="translate(${qx.toFixed(1)},${qy.toFixed(1)})">
        <circle r="4.2" fill="#e8c877" fill-opacity=".85"/><title>⚑ ${escq(q2.q)}</title></g>`});""")

edit('the Circles map, village node: SCENE.name is scene data, not a code constant (escq)',
  """    <text y="-1" text-anchor="middle" font-size="13" fill="#f2e7c6">${SCENE.name||'Amora'}</text>""",
  """    <text y="-1" text-anchor="middle" font-size="13" fill="#f2e7c6">${escq(SCENE.name||'Amora')}</text>""")

# ------------------------------------------- the vitals drop, both halves of it
# ONE template literal carrying BOTH contexts. g6.01 edited this very line: the
# onclick argument went through escj and the button's visible LABEL printed the
# same q2.q raw, three characters to the right.
edit("the vitals drop claim button: escj guards the handler, escq guards the label beside it",
  """    return q2?`<button class="btn" onclick="claimQuest('${escj(q2.q)}','${escj(q2.at?nameOf(q2.at):'the Board')}');$('vdrop').classList.remove('show')">⚑ Claim: ${q2.q}</button>`
      :`<button class="btn" onclick="vitalQuest('${escj(createLabel)}','${escj(home)}')">⚑ Begin: ${createLabel}</button>`};""",
  """    return q2?`<button class="btn" onclick="claimQuest('${escj(q2.q)}','${escj(q2.at?nameOf(q2.at):'the Board')}');$('vdrop').classList.remove('show')">⚑ Claim: ${escq(q2.q)}</button>`
      :`<button class="btn" onclick="vitalQuest('${escj(createLabel)}','${escj(home)}')">⚑ Begin: ${escq(createLabel)}</button>`};""")

# vitalsData reads window.VITAL_OVR, and restoreScene assigns VITAL_OVR straight
# from J.vital_overrides. A held vital is the founder typing into #vOvr and the
# map keeping the word, so D[k].v is founder text on a stored round trip.
edit('the vitals drop, People: the held number is founder text (escq)',
  """    people:()=>`<div class="vfact"><b>${D.people.v}</b> members · ${D.people.sub}</div><div class="vhow">${D.people.how}</div>""",
  """    people:()=>`<div class="vfact"><b>${escq(D.people.v)}</b> members · ${escq(D.people.sub)}</div><div class="vhow">${escq(D.people.how)}</div>""")

edit('the vitals drop, Food (escq)',
  """    food:()=>`<div class="vfact"><b>${D.food.v}</b> · ${D.food.sub}</div><div class="vhow">${D.food.how}</div>""",
  """    food:()=>`<div class="vfact"><b>${escq(D.food.v)}</b> · ${escq(D.food.sub)}</div><div class="vhow">${escq(D.food.how)}</div>""")

edit('the vitals drop, Water (escq)',
  """    water:()=>`<div class="vfact"><b>${D.water.v}</b> · ${D.water.sub}</div><div class="vhow">${D.water.how}</div>""",
  """    water:()=>`<div class="vfact"><b>${escq(D.water.v)}</b> · ${escq(D.water.sub)}</div><div class="vhow">${escq(D.water.how)}</div>""")

edit('the vitals drop, Canopy (escq)',
  """    canopy:()=>`<div class="vfact"><b>${D.canopy.v}</b> · ${D.canopy.sub}</div><div class="vfact">${D._pathKm.toFixed(1)} km of drawn paths thread the land</div><div class="vhow">${D.canopy.how}</div>""",
  """    canopy:()=>`<div class="vfact"><b>${escq(D.canopy.v)}</b> · ${escq(D.canopy.sub)}</div><div class="vfact">${D._pathKm.toFixed(1)} km of drawn paths thread the land</div><div class="vhow">${escq(D.canopy.how)}</div>""")

edit('the vitals drop, Hearts (escq)',
  """    hearts:()=>`<div class="vfact"><b>${D.hearts.v} ♥</b> · ${D.hearts.sub}</div><div class="vhow">${D.hearts.how}</div>""",
  """    hearts:()=>`<div class="vfact"><b>${escq(D.hearts.v)} ♥</b> · ${escq(D.hearts.sub)}</div><div class="vhow">${escq(D.hearts.how)}</div>""")

edit('the vitals drop, the Moon: moonName is a scene field (escq)',
  """    moon:()=>`<div class="vfact">${SCENE.moonName}</div><div class="vhow">the lunar cycle closes the books: gratitude settles, stewards are thanked, the pulse resets</div>""",
  """    moon:()=>`<div class="vfact">${escq(SCENE.moonName)}</div><div class="vhow">the lunar cycle closes the books: gratitude settles, stewards are thanked, the pulse resets</div>""")

edit('the vitals drop unit chip: `unit` is sliced off the held number, so it inherits its poison (escq)',
  """              ${unit?`<span style="font-size:11px;color:#b9af8f">${unit}</span>`:''}""",
  """              ${unit?`<span style="font-size:11px;color:#b9af8f">${escq(unit)}</span>`:''}""")

edit('the vitals drop head and source line (escq)',
  """  dp.innerHTML=`<h5>${name}</h5>${(body[k]||(()=>''))()}${ovr}
    <div class="vhow" style="opacity:.8">source: ${k==='moon'?'the lunar calendar':(D[k]?D[k].src:'—')} · live feeds from the bioregion can plug in here</div>`;""",
  """  dp.innerHTML=`<h5>${escq(name)}</h5>${(body[k]||(()=>''))()}${ovr}
    <div class="vhow" style="opacity:.8">source: ${escq(k==='moon'?'the lunar calendar':(D[k]?D[k].src:'—'))} · live feeds from the bioregion can plug in here</div>`;""")

# ------------------------------------------------------------- the vitals bar
# The bar itself reads the same held numbers, on every restore, with no click at
# all: restoreScene calls rebuildVitals. This is the one surface a poisoned
# scene reaches before the visitor touches anything.
edit('the vitals bar: the held number, its label, and the two attributes beside them (escq)',
  """    return `<div class="vital" data-k="${v.k}" data-tip="${d.how} · ${d.src}"><svg viewBox="0 0 24 24" fill="none" stroke="#e8c877" stroke-width="1.7"><path d="${VICON[v.k]}"/></svg><span><b>${d.v}</b><small>${v.label}</small></span></div>`}).join('')
   +`<div class="vital" data-k="moon" data-tip="${SCENE.moonName}"><span id="moon">${SCENE.moon}</span></div>`;""",
  """    return `<div class="vital" data-k="${escq(v.k)}" data-tip="${escq(d.how)} · ${escq(d.src)}"><svg viewBox="0 0 24 24" fill="none" stroke="#e8c877" stroke-width="1.7"><path d="${VICON[v.k]}"/></svg><span><b>${escq(d.v)}</b><small>${escq(v.label)}</small></span></div>`}).join('')
   +`<div class="vital" data-k="moon" data-tip="${escq(SCENE.moonName)}"><span id="moon">${escq(SCENE.moon)}</span></div>`;""")

# ------------------------------------------------------------------ inviteHere
edit('inviteHere: the pocket card headline prints the place name raw (escq)',
  """    $('moduleCard').innerHTML=`<h2>⚑ ${s.name}</h2>""",
  """    $('moduleCard').innerHTML=`<h2>⚑ ${escq(s.name)}</h2>""")

# ------------------------------------------------- the panel's overview line
# g6.01 escaped s.event in the state pill and left the identical value in the
# count line four rows down.
edit("the overview count line: the founder's event line, the one s.event g6.01 missed (escq)",
  """    <p style="margin-top:8px;font-size:12px;color:#6b4d1e">⚑ ${q.length} quests · ⛨ ${st.length} open seats · \U0001f4ac ${threadsAt(s.key).length} conversation${threadsAt(s.key).length===1?'':'s'}${s.event?' · ✦ '+s.event:''}</p>""",
  """    <p style="margin-top:8px;font-size:12px;color:#6b4d1e">⚑ ${q.length} quests · ⛨ ${st.length} open seats · \U0001f4ac ${threadsAt(s.key).length} conversation${threadsAt(s.key).length===1?'':'s'}${s.event?' · ✦ '+escq(s.event):''}</p>""")

# ------------------------------------------------------------- the resolver
# Every step's `detail` is built from a place name, a role or the founder's own
# quest text; `rule` is a code literal at each push site and is escaped anyway
# because there are eleven of them and one new one is all it takes.
edit('the resolver report: every step line and the address it lands on (escq)',
  """  $('rqSteps').innerHTML=r.steps.map((st,i)=>`<div class="rstep ${st.hit?'hit':'miss'}"><span class="no">${st.hit?'✓':i+1}</span><span><b style="font-weight:normal;letter-spacing:.06em">${st.rule}</b> · ${st.detail}</span></div>`).join('')+
   `<div class="raddr">⚑ This quest lives at <b>${addr}</b>${r.guessed?' <span style="color:#e0a34e;font-size:10px">· a guess</span>':''}""",
  """  $('rqSteps').innerHTML=r.steps.map((st,i)=>`<div class="rstep ${st.hit?'hit':'miss'}"><span class="no">${st.hit?'✓':i+1}</span><span><b style="font-weight:normal;letter-spacing:.06em">${escq(st.rule)}</b> · ${escq(st.detail)}</span></div>`).join('')+
   `<div class="raddr">⚑ This quest lives at <b>${escq(addr)}</b>${r.guessed?' <span style="color:#e0a34e;font-size:10px">· a guess</span>':''}""")

# ---------------------------------------------------------------- the inspect
# Another lane's region; the logic is untouched and the value is wrapped where
# it becomes markup, the same way g6.01 treated the Loom.
# RE-ANCHORED 2026-08-16. Both of these edits went GONE against origin/main
# 3c295b8: the inspector lane (065a278, "the inspector says what its dials
# mean") rewrote the markup AROUND both values and left both interpolations
# raw. The old anchors carried that lane's markup:
#
#   <div style="font-size:10.5px;color:#b9af8f;margin-bottom:2px">${s.circle?`Emblem …
#   …now: <div class="insp-help insp-h-circle">${s.circle?`Emblem …
#
#   ${[1,2,3].map(ph=>`<label …  …now wrapped in <span class="insp-tipwrap" data-tip="…">
#
# The ARTIFACT EDIT is unchanged - the same two escq() wraps on the same two
# values. The anchors are now the shortest span that is unique and that carries
# neither lane's surrounding markup, so the next dress pass does not move them.
edit('the inspect card: the circle sentence prints the circle name raw (escq)',
  """wear the ${s.circle} circle's color.""",
  """wear the ${escq(s.circle)} circle's color.""")

edit("the inspect card: a phase name is the founder's own word, renamed in the vocabulary (escq)",
  """ style="accent-color:var(--gold)">${phaseName(ph)}</label>""",
  """ style="accent-color:var(--gold)">${escq(phaseName(ph))}</label>""")

edit('the inspect card: the circle picker, option value and option text (escq)',
  """  const circleSel=`<select id="iCircle"><option value="">unowned · needs a steward</option>`+Object.keys(CIRCLE_COL).map(c=>`<option value="${c}"${s.circle===c?' selected':''}>${c} circle</option>`).join('')+`</select>`;""",
  """  const circleSel=`<select id="iCircle"><option value="">unowned · needs a steward</option>`+Object.keys(CIRCLE_COL).map(c=>`<option value="${escq(c)}"${s.circle===c?' selected':''}>${escq(c)} circle</option>`).join('')+`</select>`;""")

# ------------------------------------------------- the rooms behind the doors
# MODULES[k].sample builds the room a door opens. The blurbs and the sample rows
# are code literals; every value read out of SCENE or BY is not, and eight of
# them reached innerHTML raw. Reachable in one tap from any door card.
edit('the Stays room, when the door is marked when-built (escq)',
  """      if(s&&s.doors&&s.doors.stay==='future')return `<div class="mrow"><span><b>${s.name}</b><small>bookable when it's built. The door is already on the map; the building will catch up.</small></span></div>""",
  """      if(s&&s.doors&&s.doors.stay==='future')return `<div class="mrow"><span><b>${escq(s.name)}</b><small>bookable when it's built. The door is already on the map; the building will catch up.</small></span></div>""")

edit('the Stays room, the booking line (escq)',
  """      return `${s?`<div class="lastv" style="margin:0 0 6px">booking at <b>${s.name}</b></div>`:''}""",
  """      return `${s?`<div class="lastv" style="margin:0 0 6px">booking at <b>${escq(s.name)}</b></div>`:''}""")

edit('the Housing room, the reserving line (escq)',
  """      return `${s?`<div class="lastv" style="margin:0 0 6px">reserving in <b>${s.name}</b></div>`:''}""",
  """      return `${s?`<div class="lastv" style="margin:0 0 6px">reserving in <b>${escq(s.name)}</b></div>`:''}""")

# `note` next to it stays raw ON PURPOSE: it is a code literal in the tuple
# above, and one of the three is the hand-written entity `staked &amp; pooled`.
# escq would double-encode it into a visible &amp;amp; — the over-escaping the
# gate's section E exists to catch.
edit('the Housing room, hamlet names off BY (escq; the note beside it is a code literal and stays raw)',
  """        return `<div class="mrow"><span><b>${nm}</b><small>${note}</small></span><span><b>${L.sold} of ${L.total}</b><small>lots spoken for · ${L.total-L.sold} open${housingTag(k)?' · '+housingTag(k):''}</small></span></div>`}).join('')}""",
  """        return `<div class="mrow"><span><b>${escq(nm)}</b><small>${note}</small></span><span><b>${L.sold} of ${L.total}</b><small>lots spoken for · ${L.total-L.sold} open${housingTag(k)?' · '+housingTag(k):''}</small></span></div>`}).join('')}""")

edit('the Forum room: thread title, author and last activity (escq)',
  """      return th.map(t=>`<div class="mrow"><span><b>${t.title}</b><small>${t.author} · ${t.replies} replies · ${t.last} ago</small></span></div>`).join('')||'<div class="lastv">no conversations pinned here yet</div>'}},""",
  """      return th.map(t=>`<div class="mrow"><span><b>${escq(t.title)}</b><small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago</small></span></div>`).join('')||'<div class="lastv">no conversations pinned here yet</div>'}},""")

edit('the Quests room: title, need, reward and the place it lives at (escq)',
  """      return open.map(q=>`<div class="mrow"><span><b>${q.q}</b><small>${q.need||''}</small></span><span><b>${q.r||''}</b><small>${q.at&&BY[q.at]?BY[q.at].name:'the Board'}</small></span></div>`).join('')+""",
  """      return open.map(q=>`<div class="mrow"><span><b>${escq(q.q)}</b><small>${escq(q.need||'')}</small></span><span><b>${escq(q.r||'')}</b><small>${escq(q.at&&BY[q.at]?BY[q.at].name:'the Board')}</small></span></div>`).join('')+""")

edit('the Journeys room: the journey name (escq; its id already travels under escj)',
  """      return `<div class="mrow"><span><b>${j.name}</b><small>${placed} of ${j.steps.length} steps placed</small></span>""",
  """      return `<div class="mrow"><span><b>${escq(j.name)}</b><small>${placed} of ${j.steps.length} steps placed</small></span>""")

edit('the Village Health room: the three vital fields (escq)',
  """    sample:ctx=>SCENE.vitals.map(v=>`<div class="mrow"><span><b>${v.label}</b><small>${v.sub}</small></span><span><b>${v.v}</b></span></div>`).join('')},""",
  """    sample:ctx=>SCENE.vitals.map(v=>`<div class="mrow"><span><b>${escq(v.label)}</b><small>${escq(v.sub)}</small></span><span><b>${escq(v.v)}</b></span></div>`).join('')},""")

edit('the Events room: the place names an event is held at (escq; EVENTS itself is a code table)',
  """    sample:ctx=>EVENTS.map(e=>`<div class="mrow"><span><b>✦ ${e.title}</b><small>${e.when} · at ${e.at.map(k=>BY[k]?BY[k].name:k).join(' + ')} · sample</small></span>""",
  """    sample:ctx=>EVENTS.map(e=>`<div class="mrow"><span><b>✦ ${e.title}</b><small>${e.when} · at ${escq(e.at.map(k=>BY[k]?BY[k].name:k).join(' + '))} · sample</small></span>""")

edit('the module card route line: the door you came through is a place name (escq)',
  """  $('moduleCard').innerHTML=`<h2>${M.icon} ${M.name}</h2><div class="route">${M.route}${at?` · through the door of ${at.name}`:' · from the dock'}</div>""",
  """  $('moduleCard').innerHTML=`<h2>${M.icon} ${M.name}</h2><div class="route">${M.route}${at?` · through the door of ${escq(at.name)}`:' · from the dock'}</div>""")


def main():
    if not os.path.exists(TARGET):
        sys.exit('no artifact at ' + TARGET)
    src = io.open(TARGET, encoding='utf-8', newline='').read()
    before = src
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        # GUARD PER EDIT, three outcomes rather than two, and THE RESULT IS
        # TESTED BEFORE THE ANCHOR. Several lanes work this artifact at once, so
        # "anchor absent, result absent" means the site MOVED OR WENT AWAY:
        # recorded, printed under its own heading, and the run exits non-zero so
        # nobody reads it as clean.
        if new in src:
            say('  skip   ' + name)
            n_skip += 1
            continue
        if old not in src:
            say('  GONE   ' + name)
            gone.append(name)
            continue
        got = src.count(old)
        assert got == count, ('anchor count wrong for "%s": expected %d, found %d'
                              % (name, count, got))
        src = src.replace(old, new)
        say('  apply  ' + name + ('' if count == 1 else '  (x%d)' % count))
        n_apply += 1

    if src == before:
        say('\n%d applied, %d skipped, %d gone. 0 bytes written.'
            % (n_apply, n_skip, len(gone)))
    else:
        with io.open(TARGET, 'w', encoding='utf-8', newline='') as f:
            f.write(src)
        say('\n%d applied, %d skipped, %d gone. %d -> %d bytes (%+d).'
            % (n_apply, n_skip, len(gone), len(before.encode('utf-8')),
               len(src.encode('utf-8')),
               len(src.encode('utf-8')) - len(before.encode('utf-8'))))
        say('sha256 ' + hashlib.sha256(src.encode('utf-8')).hexdigest()[:16])
        say('note: escq is now stronger than the one patch_g6_01_escaping.py writes.'
            ' Re-running g6.01 after this reports GONE on its helper edit, by design.')
    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY - read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)


if __name__ == '__main__':
    main()
