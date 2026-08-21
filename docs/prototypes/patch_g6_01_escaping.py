#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.01 — ESCAPING.

The map renders by interpolating values straight into template literals, so
every feature that displays a founder-controlled value adds an injection sink by
default. Three lanes in one wave each added one while fixing something else, and
the file was already exploitable the same way before any of them touched it:
map_structures[].circle_id reaches the hover card's circle line unescaped on
pristine main, identical before and after every lane's work.

This is a STORED payload. restoreScene runs on every shell scene push through
applyScene, on the Restore bar and on the draft offer; scheduleAutosave ships
the whole export to draft-save, so a poisoned value round-trips through the
server and comes back to every visitor.

WHAT THIS PATCH DOES

1. Adds escj. The file already had escq, and escq is RIGHT for two of the three
   contexts and WRONG for the third:

     double-quoted attribute   value="${escq(x)}"        correct  (& < ")
     element text              <h2>${escq(x)}</h2>       correct  (& <)
     JS string in a handler    onclick="f('${escq(x)}')" WRONG

   Wrong because the HTML parser decodes &quot; and &#39; back into characters
   BEFORE the handler is compiled, so an apostrophe still closes the JS string.
   escj escapes for the JS string first, then hands the result to escq for the
   attribute it sits in. It escapes the BACKSLASH BEFORE the quote, which is the
   bug the file already shipped by hand as .replace(/'/g,"\\'"): with no
   backslash escaping, a value ending in a backslash collapses the pair and the
   quote that follows closes the string anyway.

2. Applies escj at every site where a founder- or member-controlled value lands
   inside a single-quoted JS string in an inline handler. That is the
   code-execution class, and it is fixed here in full.

3. Applies escq at the structure, quest, seat, attention-card and walk surfaces
   that show those same values as text, which is where the proven pristine hole
   lives.

The element-context sinks this does NOT reach are counted, not hidden:
qa/verify_escaping.js ratchets them, the way check-brand-refs.mjs ratchets brand
debt, so the number may only ever go down.

NOT DONE HERE, deliberately: renderInspect, syncBanners' layout, refreshBadges,
restoreScene's whitelist and every z-index belong to other lanes. Where a sink
sits in another lane's region it is escaped IN PLACE with its logic untouched.

Re-runnable: every edit is guarded on its own, so a second run is all skips and
writes zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

# ---------------------------------------------------------------- the helper
ESCQ = ("function escq(t){return String(t==null?'':t)"
        ".replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;')}")

ESCJ = ESCQ + """
/* THREE CONTEXTS, THREE ESCAPES, and escq covers two of them.
   escq is right for  value="${escq(x)}"  and for  <h2>${escq(x)}</h2>.
   It is WRONG for    onclick="f('${escq(x)}')"  because the HTML parser turns
   &quot; and &#39; back into characters BEFORE the handler is compiled, so the
   apostrophe closes the JS string exactly as it would have raw. openDoor says
   the same thing in its own comment, and openDoorHere answers it the stronger
   way, by not putting the value in the attribute at all. Where a value must
   travel through a handler, this is the escape it travels under.
   THE BACKSLASH GOES FIRST. This file shipped .replace(/'/g,"\\\\'") by hand,
   which escapes the quote and not the backslash: a value ending in a backslash
   collapses the pair and the quote after it still closes the string. */
function escj(t){return escq(String(t==null?'':t)
  .replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'")
  .replace(/\\r/g,'\\\\r').replace(/\\n/g,'\\\\n')
  .replace(/\\u2028/g,'\\\\u2028').replace(/\\u2029/g,'\\\\u2029'))}"""

def say(s):
    """Print without assuming the operator's console speaks Unicode.

    This script died with UnicodeEncodeError on a default Windows shell: one
    edit name carries a right arrow and cp1252 has no glyph for it, so the run
    aborted mid-list. It wrote zero bytes, so it was safe, but the re-run proof
    could not be produced without PYTHONIOENCODING=utf-8 — a patch that cannot
    show its own second run. The fix belongs in the print, not in the operator's
    environment: encode to whatever the console does speak and replace the rest.
    """
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []
def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


edit('escj: the JS-string escape the file was missing', ESCQ, ESCJ)

# ---------------------------------------------- the JS-string class, in full
edit('homeSheet: the request route and the structure key leave the handler escaped',
  """      <a class="btn" href="${siteHref(route)}" target="_blank" rel="noopener" onclick="return siteNav(event,'${route}')">Begin your request</a>
      <button class="btn ghostbtn" onclick="askAboutLiving('${key}')">Ask Maia about living here</button>""",
  """      <a class="btn" href="${escq(siteHref(route))}" target="_blank" rel="noopener" onclick="return siteNav(event,'${escj(route)}')">Begin your request</a>
      <button class="btn ghostbtn" onclick="askAboutLiving('${escj(key)}')">Ask Maia about living here</button>""")

edit('the conversation row carries the key into an object literal in an onclick',
  """onclick="openDoor('forum',{at:'${s.key}'})\"""",
  """onclick="openDoor('forum',{at:'${escj(s.key)}'})\"""")

edit('the quest card stops hand-rolling its own half of a JS escape',
  r'''onclick="claimQuest('${x.q.replace(/'/g,"\\'")}','${s.name.replace(/'/g,"\\'")}')"''',
  """onclick="claimQuest('${escj(x.q)}','${escj(s.name)}')\"""")

edit('the seat row writes a circle name into a toast argument',
  """onclick="toast('Intro drafted. The ${x.c} circle will hear from you.""",
  """onclick="toast('Intro drafted. The ${escj(x.c)} circle will hear from you.""")

edit('the Wall: a stranded building',
  """<div class="wallrow" onclick="wallGo('${s.key}',0)"><b>\u26a0 ${s.name}</b>""",
  """<div class="wallrow" onclick="wallGo('${escj(s.key)}',0)"><b>\u26a0 ${escq(s.name)}</b>""")

edit('the Wall: a building with no steward',
  """<div class="wallrow" onclick="wallGo('${s.key}',0)"><b>\u2302 ${s.name}</b>""",
  """<div class="wallrow" onclick="wallGo('${escj(s.key)}',0)"><b>\u2302 ${escq(s.name)}</b>""")

edit('the Wall: an open seat',
  """<div class="wallrow" onclick="wallGo('${x.at}',2)"><b>\u26e8 ${x.s}</b><span>${BY[x.at]?BY[x.at].name:'?'} \u00b7 ${x.c} circle</span></div>""",
  """<div class="wallrow" onclick="wallGo('${escj(x.at)}',2)"><b>\u26e8 ${escq(x.s)}</b><span>${escq(BY[x.at]?BY[x.at].name:'?')} \u00b7 ${escq(x.c)} circle</span></div>""")

edit('the Wall: an open quest, whose handler is built inside a conditional',
  """${x.at&&BY[x.at]?`onclick="wallGo('${x.at}',1)"`:''}><b>\u2691 ${x.q}</b>""",
  """${x.at&&BY[x.at]?`onclick="wallGo('${escj(x.at)}',1)"`:''}><b>\u2691 ${escq(x.q)}</b>""")

edit('the attention card opens a panel by key',
  """onclick="openPanel('${it.at}',${it.tab});""",
  """onclick="openPanel('${escj(it.at)}',${it.tab});""")

edit("Maia's claim link: escq was the wrong escape for this context",
  """<a onclick="claimQuest('${escq(best.q)}','${escq(nm)}')">""",
  """<a onclick="claimQuest('${escj(best.q)}','${escj(nm)}')">""")

edit('the resolver report flies to a structure by key',
  """onclick="goTo('${r.key}')\"""",
  """onclick="goTo('${escj(r.key)}')\"""")

edit('the Loom walks a journey by id',
  """<button class="lchip" onclick="playJourney('${j.id}')">""",
  """<button class="lchip" onclick="playJourney('${escj(j.id)}')">""")

edit('the journeys door walks a journey by id',
  """<button class="btn" style="font-size:10.5px;padding:3px 10px" onclick="playJourney('${j.id}')">""",
  """<button class="btn" style="font-size:10.5px;padding:3px 10px" onclick="playJourney('${escj(j.id)}')">""")

edit('both RSVP buttons carry an event id',
  """<button class="btn" data-ev="${e.id}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${e.id}')">""",
  """<button class="btn" data-ev="${escq(e.id)}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${escj(e.id)}')">""",
  count=2)

edit('the action-door button still carries the door kind',
  """onclick="doorClickHere('${k}')">""",
  """onclick="doorClickHere('${escj(k)}')">""")

edit('holding a vital carries its key',
  """onclick="vitalSet('${k}')">Hold this number</button>""",
  """onclick="vitalSet('${escj(k)}')">Hold this number</button>""")

# The action-door button used to read onclick="doorClick('${s.key}','${k}')" and
# was a sink of exactly this shape. The door lane removed the key from the
# attribute instead (doorClickHere reads panelKey), which is the stronger fix
# wherever the value does not have to travel, so there is nothing left to escape
# here. It is NOT unguarded: qa/verify_escaping.js drives a poisoned key through
# every inline handler, so if that structural fix is ever reverted the gate says
# so rather than this patch silently having nothing to say.

edit('the page door: the canonical route travels under the JS escape too',
  """onclick="return siteNav(event,'${escq(real)}')">""",
  """onclick="return siteNav(event,'${escj(real)}')">""")

edit("the module door's own route",
  """onclick="return siteNav(event,'${M.route}')">""",
  """onclick="return siteNav(event,'${escj(M.route)}')">""")

edit('the vitals drop claims a quest',
  """onclick="claimQuest('${escq(q2.q)}','${escq(q2.at?nameOf(q2.at):'the Board')}');""",
  """onclick="claimQuest('${escj(q2.q)}','${escj(q2.at?nameOf(q2.at):'the Board')}');""")

edit('the vitals drop begins one',
  """onclick="vitalQuest('${createLabel}','${home}')">""",
  """onclick="vitalQuest('${escj(createLabel)}','${escj(home)}')">""")

edit('releasing a held vital',
  """onclick="vitalClear('${k}');return false\"""",
  """onclick="vitalClear('${escj(k)}');return false\"""")

# ------------------------------------- the text surfaces those same fields reach
edit('the banner under every building',
  """function bannerHTML(s){return `<span class="dot" style="background:${s.circle?(CIRCLE_COL[s.circle]||'#9aa08f'):'#9aa08f'}"></span>${s.name}<span class="cnt"></span>`}""",
  """function bannerHTML(s){return `<span class="dot" style="background:${s.circle?(CIRCLE_COL[s.circle]||'#9aa08f'):'#9aa08f'}"></span>${escq(s.name)}<span class="cnt"></span>`}""")

edit('the hover card, where circle_id was proven to reach markup on pristine main',
  """  hc.innerHTML=`<h3>${s.name}</h3><div class="circ">${s.circle?s.circle+' circle':'needs a steward'} \u00b7 ${s.district==='heart'?'Village Heart':(SCENE.districts.find(d=>d.id===s.district)||{name:'the land'}).name}</div>""",
  """  hc.innerHTML=`<h3>${escq(s.name)}</h3><div class="circ">${s.circle?escq(s.circle)+' circle':'needs a steward'} \u00b7 ${escq(s.district==='heart'?'Village Heart':(SCENE.districts.find(d=>d.id===s.district)||{name:'the land'}).name)}</div>""")

edit('the panel head',
  """  $('panelHead').innerHTML=`<h2>${s.name}</h2><div class="sub">${s.circle?s.circle+' circle':'needs a steward'} \u00b7 ${STATE_LABEL[s.state]}""",
  """  $('panelHead').innerHTML=`<h2>${escq(s.name)}</h2><div class="sub">${s.circle?escq(s.circle)+' circle':'needs a steward'} \u00b7 ${STATE_LABEL[s.state]}""")

edit("the panel's state pill carries the founder's event line",
  """<span class="statepill">${s.event?('\u2726 '+s.event):phaseName(s.phase)}</span>""",
  """<span class="statepill">${s.event?('\u2726 '+escq(s.event)):escq(phaseName(s.phase))}</span>""")

edit('the overview blurb and the role line',
  """    body.innerHTML=`<p>${s.blurb}</p>
    <p style="margin-top:9px;font-style:italic;color:#4a3a26">${s.role||'A new organ, still finding its function in the body of the village.'}</p>""",
  """    body.innerHTML=`<p>${escq(s.blurb)}</p>
    <p style="margin-top:9px;font-style:italic;color:#4a3a26">${escq(s.role||'A new organ, still finding its function in the body of the village.')}</p>""")

edit('the quest cards in the panel',
  """<h4>\u2691 ${x.q}</h4><div class="meta">${x.r} \u00b7 ${x.need}</div>""",
  """<h4>\u2691 ${escq(x.q)}</h4><div class="meta">${escq(x.r)} \u00b7 ${escq(x.need)}</div>""")

edit('the seat rows in the panel',
  """<div class="nm"><b>${x.s}</b><span>${x.c} circle \u00b7 ${x.note}</span></div>""",
  """<div class="nm"><b>${escq(x.s)}</b><span>${escq(x.c)} circle \u00b7 ${escq(x.note)}</span></div>""")

edit('the attention card, board-bound',
  """    $('attnCard').innerHTML=`<h4>${it.h}</h4><p>${it.p}</p><p style="margin-top:4px;color:#6b4d1e;font-size:11.5px">at the Quest Board, waiting for a home</p>""",
  """    $('attnCard').innerHTML=`<h4>${escq(it.h)}</h4><p>${escq(it.p)}</p><p style="margin-top:4px;color:#6b4d1e;font-size:11.5px">at the Quest Board, waiting for a home</p>""")

edit('the attention card, placed',
  """  $('attnCard').innerHTML=`<h4>${it.h}</h4><p>${it.p}</p><p style="margin-top:4px;color:#6b4d1e;font-size:11.5px">at the ${s.name}</p>""",
  """  $('attnCard').innerHTML=`<h4>${escq(it.h)}</h4><p>${escq(it.p)}</p><p style="margin-top:4px;color:#6b4d1e;font-size:11.5px">at the ${escq(s.name)}</p>""")

edit('the module card that fronts a home request',
  """$('moduleCard').innerHTML=`<h2>\u2302 Request a home at ${s.name}</h2>""",
  """$('moduleCard').innerHTML=`<h2>\u2302 Request a home at ${escq(s.name)}</h2>""")

edit('the Wall: the quest row still showed its place and its reward raw',
  """<span>${x.at&&BY[x.at]?BY[x.at].name+' · ':'Quest Board · not yet placed · '}${x.r}</span>""",
  """<span>${x.at&&BY[x.at]?escq(BY[x.at].name)+' · ':'Quest Board · not yet placed · '}${escq(x.r)}</span>""")

edit("the hover card's event line and the events under it",
  """  ${s.event?`<div class="row"><span>✦ ${s.event}</span></div>`:''}
  ${(window.eventsAt&&eventsAt(s.key).length)?`<div class="row"><span>✦ ${eventsAt(s.key)[0].when}: ${eventsAt(s.key)[0].title}</span></div>`:''}""",
  """  ${s.event?`<div class="row"><span>✦ ${escq(s.event)}</span></div>`:''}
  ${(window.eventsAt&&eventsAt(s.key).length)?`<div class="row"><span>✦ ${escq(eventsAt(s.key)[0].when)}: ${escq(eventsAt(s.key)[0].title)}</span></div>`:''}""")

edit("Maia's own summary of a place",
  """  if(s.event)bits.push(`<b>${s.event}</b>`);
  maiaSay(`${s.name}: ${s.blurb.split('.')[0].toLowerCase()}.""",
  """  if(s.event)bits.push(`<b>${escq(s.event)}</b>`);
  maiaSay(`${escq(s.name)}: ${escq(s.blurb.split('.')[0].toLowerCase())}.""")

# ------------------------------------------------------- the Loom, in place
# The Loom is the connections lens and belongs to another lane. Nothing here
# changes what it decides or how it lays out — every edit wraps a value at the
# point it becomes markup and leaves the logic exactly as it was. Measured, the
# Loom was 379 of the 430 surviving payload elements: it renders every quest,
# seat, thread and journey the village has.

edit('the Loom: the place rows down the left',
  """    return `<div class="lrow" data-k="${s.key}"><span class="lart">${art}</span>
     <span class="lname">${s.name}<small>${s.circle?s.circle+' circle':(s.district||'—')}</small></span>""",
  """    return `<div class="lrow" data-k="${escq(s.key)}"><span class="lart">${art}</span>
     <span class="lname">${escq(s.name)}<small>${s.circle?escq(s.circle)+' circle':escq(s.district||'—')}</small></span>""")

edit('the Loom: every "→ somewhere" label reads a place name',
  """    return`→ ${atName(to)}${st?' <i class="stag">staged</i>':''}`};""",
  """    return`→ ${escq(atName(to))}${st?' <i class="stag">staged</i>':''}`};""")

edit('the Loom: quest cards',
  """     <div class="lmain"><b>${q.q}</b><small>${q.r||''}${q.need?' · '+q.need:''}${q.src==='site'?' · from the live site':''}</small>
      <span class="lto">${toLabel('quest:'+i)}</span>
      ${(q._why&&p!=='creator')?`<span class="lwhy">${q._why}</span>`:''}</div>${provChip(p)}</div>""",
  """     <div class="lmain"><b>${escq(q.q)}</b><small>${escq(q.r||'')}${q.need?' · '+escq(q.need):''}${q.src==='site'?' · from the live site':''}</small>
      <span class="lto">${toLabel('quest:'+i)}</span>
      ${(q._why&&p!=='creator')?`<span class="lwhy">${escq(q._why)}</span>`:''}</div>${provChip(p)}</div>""")

edit('the Loom: seat cards',
  """     <div class="lmain"><b>${x.s}</b><small>${x.c?x.c+' circle':''}${x.note?' · '+x.note:''}${x.src==='site'?' · from the live site':''}</small>
      <span class="lto">${toLabel('seat:'+i)}</span>
      ${(x._why&&p!=='creator')?`<span class="lwhy">${x._why}</span>`:''}</div>${provChip(p)}</div>""",
  """     <div class="lmain"><b>${escq(x.s)}</b><small>${x.c?escq(x.c)+' circle':''}${x.note?' · '+escq(x.note):''}${x.src==='site'?' · from the live site':''}</small>
      <span class="lto">${toLabel('seat:'+i)}</span>
      ${(x._why&&p!=='creator')?`<span class="lwhy">${escq(x._why)}</span>`:''}</div>${provChip(p)}</div>""")

edit('the Loom: a thread pins to as many places as its creator picks',
  """       return`<span class="lgrip achip${st?' staged':''}" data-conn="${cs}">◉ ${atName(st?LOOM_STAGED.get(cs):k)}</span>`}).join('');""",
  """       return`<span class="lgrip achip${st?' staged':''}" data-conn="${escq(cs)}">◉ ${escq(atName(st?LOOM_STAGED.get(cs):k))}</span>`}).join('');""")

edit("the Loom: the resolver's guess chip and the pool chip",
  """       `<span class="lgrip achip guess${gst?' staged':''}" data-conn="${gcs}">◉ ${gst?atName(LOOM_STAGED.get(gcs)):atName(t._res.key)+' · a guess'}</span>`:
       `<span class="lgrip achip poolc${gst?' staged':''}" data-conn="${gcs}">◉ ${gst?atName(LOOM_STAGED.get(gcs)):'the Board'}</span>`):'';""",
  """       `<span class="lgrip achip guess${gst?' staged':''}" data-conn="${escq(gcs)}">◉ ${gst?escq(atName(LOOM_STAGED.get(gcs))):escq(atName(t._res.key))+' · a guess'}</span>`:
       `<span class="lgrip achip poolc${gst?' staged':''}" data-conn="${escq(gcs)}">◉ ${gst?escq(atName(LOOM_STAGED.get(gcs))):'the Board'}</span>`):'';""")

edit('the Loom: thread cards',
  """     return`<div class="lcard pv-${p}"><div class="lmain"><b>${t.title}</b>
      <small>${t.author} · ${t.replies} replies · ${t.last} ago · ${t.aud==='public'?'public':'members'}${t.src==='sample'?' · sample':''}</small>
      <div class="laddrs">${chips}${guess}<span class="lgrip achip add${ast?' staged':''}" data-conn="${acs}">${ast?'◉ '+atName(LOOM_STAGED.get(acs)):'+ place'}</span></div>
      ${(t._res&&!(t.structures&&t.structures.length))?`<span class="lwhy">${t._res.why}</span>`:''}</div>${provChip(p)}</div>""",
  """     return`<div class="lcard pv-${p}"><div class="lmain"><b>${escq(t.title)}</b>
      <small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago · ${t.aud==='public'?'public':'members'}${t.src==='sample'?' · sample':''}</small>
      <div class="laddrs">${chips}${guess}<span class="lgrip achip add${ast?' staged':''}" data-conn="${escq(acs)}">${ast?'◉ '+escq(atName(LOOM_STAGED.get(acs))):'+ place'}</span></div>
      ${(t._res&&!(t.structures&&t.structures.length))?`<span class="lwhy">${escq(t._res.why)}</span>`:''}</div>${provChip(p)}</div>""")

edit('the Loom: journey cards and their numbered steps',
  """   SCENE.journeys.map(j=>`<div class="ljcard"><div class="ljhead"><b>${j.name}</b><small>${j.blurb||''}${j.src==='site'?' · from the live site':''}</small>""",
  """   SCENE.journeys.map(j=>`<div class="ljcard"><div class="ljhead"><b>${escq(j.name)}</b><small>${escq(j.blurb||'')}${j.src==='site'?' · from the live site':''}</small>""")

edit('the Loom: a journey step',
  """      return`<span class="lgrip lstep pv-${p}${dim?' provoff':''}" data-conn="${cs}"><i>${si+1}</i>${st.stage?`<em>${st.stage}</em>`:''}<span>${st.t}</span><u>${toLabel(cs)}</u></span>`}).join('')""",
  """      return`<span class="lgrip lstep pv-${p}${dim?' provoff':''}" data-conn="${escq(cs)}"><i>${si+1}</i>${st.stage?`<em>${escq(st.stage)}</em>`:''}<span>${escq(st.t)}</span><u>${toLabel(cs)}</u></span>`}).join('')""")

# The badge address on a card. itemAddr builds it from the quest title, the seat
# name or the thread id, so the founder's text lands in an attribute. Reading it
# back through .dataset decodes the entities, so escaping here is invisible to
# every consumer and changes nothing about how a badge tap resolves.
for _kind, _var in (('talk', 't'), ('quest', 'x'), ('seat', 'x'), ('event', 'e')):
    edit("the %s card's item address" % _kind,
         """data-item="${itemAddr('%s',%s)}\"""" % (_kind, _var),
         """data-item="${escq(itemAddr('%s',%s))}\"""" % (_kind, _var))

# Maia's log is innerHTML by design — maiaSay takes markup, so the escape has to
# go on the VALUES at each call site and never inside maiaSay itself. Wrapping
# the function would strip the <b> and <a> every one of these lines is built from.
edit("Maia confirms a claim",
  """    maiaSay(`Claimed. <b>${q}</b> is yours, and it lives at the ${at}.""",
  """    maiaSay(`Claimed. <b>${escq(q)}</b> is yours, and it lives at the ${escq(at)}.""")

edit('Maia walks you to a place by name',
  """return maiaSay(`Walking you to the <b>${s.name}</b> now.`)}}""",
  """return maiaSay(`Walking you to the <b>${escq(s.name)}</b> now.`)}}""")

edit('Maia names an open seat and its place',
  """    return maiaSay(`The <b>${seat.s}</b> seat is open, and it sits at the <b>${nameOf(seat.at)}</b>. Raise a hand from its card.`)}""",
  """    return maiaSay(`The <b>${escq(seat.s)}</b> seat is open, and it sits at the <b>${escq(nameOf(seat.at))}</b>. Raise a hand from its card.`)}""")

edit("Maia's answer that offers the claim",
  """    return maiaSay(`That sounds like <b>${best.q}</b>: ${best.r||'hearts'}, and it lives at <b>${nm}</b>.""",
  """    return maiaSay(`That sounds like <b>${escq(best.q)}</b>: ${escq(best.r||'hearts')}, and it lives at <b>${escq(nm)}</b>.""")

edit('Maia announces a journey walk and its steps',
  """  maiaSay(`<b>${j.name}</b>. Walking ${stops.length} of ${j.steps.length} steps""",
  """  maiaSay(`<b>${escq(j.name)}</b>. Walking ${stops.length} of ${j.steps.length} steps""")

edit('Maia at the end of a journey',
  """      maiaSay(`The walk ends here. The full <b>${j.name}</b> lives at""",
  """      maiaSay(`The walk ends here. The full <b>${escq(j.name)}</b> lives at""")

edit('Maia at each step of a journey',
  """      maiaSay(`<b>${x.st.stage?x.st.stage+': ':''}${x.st.t}</b> at ${s.name}`""",
  """      maiaSay(`<b>${x.st.stage?escq(x.st.stage)+': ':''}${escq(x.st.t)}</b> at ${escq(s.name)}`""")

edit('the metabolism chips name the place at the other end of a flow',
  """display:inline-block"></i>${o?o.name:(dir==='in'?'imported ⚠':'off-land')}</span>`};""",
  """display:inline-block"></i>${o?escq(o.name):(dir==='in'?'imported ⚠':'off-land')}</span>`};""")

edit('the vitals chips at an address',
  """background:#fdf6e0">${f2.payload.label}: <b>${f2.payload.value}</b></span>`;""",
  """background:#fdf6e0">${escq(f2.payload.label)}: <b>${escq(f2.payload.value)}</b></span>`;""")

edit('the overview line that names the district and the phase (a phase name is renameable)',
  """    <div style="font-size:10.5px;color:#8a7347;margin-top:3px">${dn} · ${phaseName(s.phase)} · AMORA MASTER PLAN V7</div>""",
  """    <div style="font-size:10.5px;color:#8a7347;margin-top:3px">${escq(dn)} · ${escq(phaseName(s.phase))} · AMORA MASTER PLAN V7</div>""")

edit('the conversation rows under a place',
  """<span>\U0001f4ac</span><span><b>${t.title}</b><small>${t.author} · ${t.replies} replies · ${t.last} ago</small></span>""",
  """<span>\U0001f4ac</span><span><b>${escq(t.title)}</b><small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago</small></span>""")

edit('the vocabulary editor: the zone words are the founder’s own',
  """  host.innerHTML=SUBTYPES.zone.map((z,i)=>`<button class="chip" data-vz="${i}" data-tip="Click to rename. Your land, your words; every drawn zone follows.">${z}</button>`).join('')""",
  """  host.innerHTML=SUBTYPES.zone.map((z,i)=>`<button class="chip" data-vz="${i}" data-tip="Click to rename. Your land, your words; every drawn zone follows.">${escq(z)}</button>`).join('')""")

edit('the walk card, three admin-authored fields straight to innerHTML',
  """    wc.innerHTML=`<h5>${st.title}</h5><p>${st.body}</p>
      ${(!choice&&st.gesture&&st.gesture!=='none')?`<div class="wgate">\u270b ${st.gate_hint||st.gesture}</div>`:''}""",
  """    wc.innerHTML=`<h5>${escq(st.title)}</h5><p>${escq(st.body)}</p>
      ${(!choice&&st.gesture&&st.gesture!=='none')?`<div class="wgate">\u270b ${escq(st.gate_hint||st.gesture)}</div>`:''}""")


def main():
    if not os.path.exists(TARGET):
        sys.exit('no artifact at ' + TARGET)
    src = io.open(TARGET, encoding='utf-8', newline='').read()
    before = src
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        # GUARD PER EDIT, and three outcomes rather than two. This artifact is
        # worked by several lanes at once — the action-door sink was restructured
        # out from under this script mid-session — so "anchor absent, result
        # absent" means the site MOVED OR WENT AWAY. Aborting the whole run there
        # throws away every other edit for one stale anchor; applying blindly
        # would be worse. It is recorded, printed under its own heading, and the
        # run exits non-zero so nobody reads it as clean.
        #
        # THE RESULT IS TESTED BEFORE THE ANCHOR, and that order is the whole
        # guard. The helper edit appends escj AFTER escq and keeps escq intact,
        # so escq — its own anchor — is still there on the second run. Asking
        # "is the anchor present?" first therefore said yes and appended a
        # SECOND copy of escj: a re-run that was not a re-run. Measured: run two
        # wrote +1028 bytes and left two escj definitions in the file.
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
    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY — read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)


if __name__ == '__main__':
    main()
