#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H6. Everything that reaches Maia's dock is escaped, and the dock stops being
able to load anything.

HOW THIS WAS FOUND, because it matters that it was not found by reading. H2
closed the journey walk's sink and its docstring said "THE STORED-XSS SINK IS
CLOSED". A payload driven through the real bridge
(postMessage {type:'config',scene}) and watched with a MutationObserver over
the WHOLE document said otherwise: twelve executions across six surfaces, and
one of them was #maiaLog itself, reached through openPanel -> maiaContext.
Measuring the one surface that had just been fixed is how a fix gets reported
as a class.

WHAT IS FIXED HERE: every maiaSay() call site that interpolates a value the
map did not author. All of them are reachable from restoreScene(), which
rebuilds SCENE.structures, .quests, .seats and .journeys wholesale from
J.* on a shell push, an autosave restore and a site import.

  maiaContext   s.name, s.blurb, s.event
  sayQuest      best.q, best.r, nm
  the walk-to   s.name
  the seat      seat.s, nameOf(seat.at)
  claimQuest    q, at
  publish       version, which arrives over the {type:'scene-result'} bridge
  the pulse     p.msg

TWO GRAMMARS, TWO ESCAPES. sayQuest puts a quest name inside a JS string
inside an HTML attribute: onclick="claimQuest('<name>')". escq() escapes & < "
and deliberately leaves ' alone, which is correct for text and for a
double-quoted attribute and WRONG here, because a quest named

    ');window.x=1;('

closes the JS string without ever touching an HTML delimiter. escja() closes
the JS grammar first and then hands the result to escq().

AND THE SINK ITSELF STOPS BEING A LOADER. Escaping every call site is the
fix; it is also a promise about all 37 call sites and about every one written
after today. maiaClean() parses the line inside a <template>, whose contents
live in an INERT document, so an <img> in there is never fetched and its
onerror never runs. Assigning to a detached <div> does NOT have that property,
which is the whole reason this class kept detonating. Elements that load or
execute are dropped; the dock's own <button onclick> controls are untouched,
because the journey needs them and they are markup this file wrote.

The dock inserts no <img> of its own anywhere: 0 of the 37 maiaSay call sites
contain one.

Re-runnable. Every edit is guarded, applies once, and prints apply or skip.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "grounds-v0.html")

src = io.open(ART, encoding="utf-8").read()
orig = src
applied, skipped = [], []


def edit(name, anchor, new, count=1, mode="after", guard=None):
    global src
    if guard is not None and guard in src:
        skipped.append(name)
        return
    n = src.count(anchor)
    if n != count:
        print("ABORT %s: anchor found %d times, expected %d" % (name, n, count))
        print("  anchor: %r" % (anchor[:130],))
        sys.exit(2)
    if mode == "after":
        src = src.replace(anchor, anchor + new, 1)
    elif mode == "before":
        src = src.replace(anchor, new + anchor, 1)
    else:
        src = src.replace(anchor, new, 1)
    applied.append(name)


# ------------------------------------------- 1. the second escape, and the sink
SINK_OLD = (
    "function maiaSay(html,from,say){const d=document.createElement('div');d.className='mline'+(from==='me'?' me':'');\n"
    "  d.innerHTML=(from==='me'?'':'<span class=\"from\">maia</span>')+html;mlog.appendChild(d);mlog.scrollTop=1e9;\n"
)

SINK_NEW = r"""/* A value crossing into a JS string inside an HTML attribute passes through
   two grammars, and escq() only closes one of them: it escapes & < " and
   leaves ' alone, which is right for text and for a double-quoted attribute
   and wrong for onclick="f('<value>')". A quest named  ');window.x=1;('
   closes the JS string without touching a single HTML delimiter. Close the JS
   grammar first, then hand the result to escq for the HTML one. */
function escja(t){return escq(String(t==null?'':t).replace(/\\/g,'\\\\').replace(/'/g,"\\'"))}
window.escja=escja;

/* Elements the dock has no business containing. All of them either fetch
   something or run something on their own, and not one of the 37 maiaSay call
   sites in this file writes any of them. <button onclick> is deliberately NOT
   here: the journey's own controls are that, and they are markup this file
   wrote rather than anything that came over a bridge. */
const MSAY_BAN='script,img,iframe,object,embed,svg,link,meta,base,form,input,textarea,video,audio,source,track';

/* THE PARSE HAPPENS SOMEWHERE INERT. A <template>'s contents belong to a
   separate, document-less fragment, so an <img> inside one is never fetched
   and its onerror never fires. Assigning the same string to a detached <div>
   DOES fire it, which is exactly how this class kept going off while looking
   handled. Sanitising after an innerHTML assignment is sanitising the wreck. */
function maiaClean(html){
  const t=document.createElement('template');
  t.innerHTML=String(html==null?'':html);
  t.content.querySelectorAll(MSAY_BAN).forEach(function(el){el.remove()});
  return t.content}
window.maiaClean=maiaClean;

function maiaSay(html,from,say){const d=document.createElement('div');d.className='mline'+(from==='me'?' me':'');
  d.appendChild(maiaClean((from==='me'?'':'<span class="from">maia</span>')+html));mlog.appendChild(d);mlog.scrollTop=1e9;
"""

edit("js: the dock parses inert, and gains the attribute escape",
     SINK_OLD, SINK_NEW, mode="replace", guard="function maiaClean(html){")

# ------------------------------------------------------ 2. maiaContext's three
edit("js: maiaContext escapes the event",
     "  if(s.event)bits.push(`<b>${s.event}</b>`);\n",
     "  if(s.event)bits.push(`<b>${escq(s.event)}</b>`);\n",
     mode="replace", guard="bits.push(`<b>${escq(s.event)}</b>`)")

edit("js: maiaContext escapes the name and the blurb",
     "  maiaSay(`${s.name}: ${s.blurb.split('.')[0].toLowerCase()}. ",
     "  maiaSay(`${escq(s.name)}: ${escq(s.blurb.split('.')[0].toLowerCase())}. ",
     mode="replace", guard="maiaSay(`${escq(s.name)}: ${escq(s.blurb")

# --------------------------------------------------------------- 3. the answers
edit("js: the quest answer escapes both grammars",
     "    return maiaSay(`That sounds like <b>${best.q}</b>: ${best.r||'hearts'}, and it lives at <b>${nm}</b>. "
     "<a onclick=\"claimQuest('${escq(best.q)}','${escq(nm)}')\">Claim it</a> and the land will remember your name.`)};\n",
     "    return maiaSay(`That sounds like <b>${escq(best.q)}</b>: ${escq(best.r||'hearts')}, and it lives at <b>${escq(nm)}</b>. "
     "<a onclick=\"claimQuest('${escja(best.q)}','${escja(nm)}')\">Claim it</a> and the land will remember your name.`)};\n",
     mode="replace", guard="That sounds like <b>${escq(best.q)}</b>")

edit("js: the walk-to answer escapes the name",
     "return maiaSay(`Walking you to the <b>${s.name}</b> now.`)}}\n",
     "return maiaSay(`Walking you to the <b>${escq(s.name)}</b> now.`)}}\n",
     mode="replace", guard="Walking you to the <b>${escq(s.name)}</b>")

edit("js: the seat answer escapes the seat and the place",
     "    return maiaSay(`The <b>${seat.s}</b> seat is open, and it sits at the <b>${nameOf(seat.at)}</b>. Raise a hand from its card.`)}\n",
     "    return maiaSay(`The <b>${escq(seat.s)}</b> seat is open, and it sits at the <b>${escq(nameOf(seat.at))}</b>. Raise a hand from its card.`)}\n",
     mode="replace", guard="The <b>${escq(seat.s)}</b> seat is open")

edit("js: the claim line escapes the quest and the place",
     "    maiaSay(`Claimed. <b>${q}</b> is yours, and it lives at the ${at}. ",
     "    maiaSay(`Claimed. <b>${escq(q)}</b> is yours, and it lives at the ${escq(at)}. ",
     mode="replace", guard="Claimed. <b>${escq(q)}</b> is yours")

# --------------------------------------------- 4. the two that arrive elsewhere
edit("js: the publish line escapes the bridge's version",
     "  maiaSay(`<b>Live since ${hh}:${mm}.</b> Version ${version} is the map every visitor sees now. `+\n",
     "  maiaSay(`<b>Live since ${hh}:${mm}.</b> Version ${escq(version)} is the map every visitor sees now. `+\n",
     mode="replace", guard="Version ${escq(version)} is the map")

edit("js: the pulse line escapes its message",
     "  if(pulseI%3===1)maiaSay(p.msg.split(' · ')[0].trim()+'.')},14000);\n",
     "  if(pulseI%3===1)maiaSay(escq(p.msg.split(' · ')[0].trim())+'.')},14000);\n",
     mode="replace", guard="maiaSay(escq(p.msg.split(")

if src != orig:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)

print("H6 dock escape:")
for a in applied:
    print("  apply  " + a)
for s in skipped:
    print("  skip   " + s + " (already present)")
print("  bytes  %+d" % (len(src.encode("utf-8")) - len(orig.encode("utf-8"))))
