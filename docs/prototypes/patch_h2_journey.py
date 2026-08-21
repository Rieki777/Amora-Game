#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H2. playJourney becomes the guided conversation, on both profiles.

Rye: "I want the play journey on both, but for it to be more interactive with
Maia following them around and talking it out with them."

WHAT CHANGES, and why each one is here.

BOTH PROFILES, ONE SURFACE. The walk was pocket-only and drove #walkCard; the
tour was desk-only and drove #maiaLog. This drives #maiaLog on both. On a phone
#maia is display:none until body.msheet (the CSS at the pocket block), so the
journey adds that class and takes it off again at the end. It writes no
`bottom:` of its own: #maia is already a TENANT of the bottom band reading
--band-b-maia, and bandWatch observes body's class list, so the sheet is placed
by the band the moment it appears.

SHE TALKS IT OUT. Every stop offers three answers instead of one: walk on, tell
me more, stay here. "Tell me more" is not a second script; it reads the live
scene at that place and says what is actually there. And asking her anything
mid-walk STOPS THE CLOCK: jPause() catches the send button and the Enter key,
she answers, and the way back is offered rather than assumed.

SHE SPEAKS AS A RESIDENT. MAIA_STOPS is her own sentences about her own
village, and each line ships as the SPOKEN line too (maiaSay's third argument),
so the sound is her words and never the button labels beside them.

THIS JOURNEY'S STORED-XSS SINK IS CLOSED, AND THAT IS ALL THIS PATCH CLOSES.
The block this replaces carried a comment saying `t` and `body` "are printed
as they were written", and printed them into innerHTML unescaped along with
`j.name` and `s.name`. Journey text is not authored copy: restoreScene()
rebuilds SCENE.journeys from J.journeys on every shell push, on every autosave
restore, and on every site import, so a step title is attacker-reachable
through all three. Every value this block renders now goes through escq().

READ THAT SCOPE LITERALLY. An earlier draft of this file said "THE STORED-XSS
SINK IS CLOSED", and a payload driven through the real {type:'config'} bridge
and watched with a MutationObserver over the whole document answered with
twelve executions across six surfaces. One of them was #maiaLog itself by a
different route (openPanel -> maiaContext); patch_h6_dock_escape.py closes the
dock properly. Four are other lanes' renderers and are still open. Fixing one
renderer and reporting a class is how this round got bitten seven times.

The cost here is that a village can no longer put <b> inside a step body,
which is the correct trade for a surface fed over a bridge. Worth recording:
restoreScene maps st.title and st.structure_key and does NOT carry `body`
across at all, so a step body is reachable from the authored scene and the
draft, and not from the config bridge. It is escaped anyway.

WHAT IS DELIBERATELY UNCHANGED, because gates read it:
  - JWALK, its .id and .i, and the travelTo arrival guard that re-checks both
  - the address #/journey/<id>, set and cleared the same way
  - .jrow with at least one .btn, and .jn reading "<n> of <total>"
  - jNext(), jEnd(), Escape, and the phrase "The walk ends here"

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
        print("  anchor: %r" % (anchor[:120],))
        sys.exit(2)
    if mode == "after":
        src = src.replace(anchor, anchor + new, 1)
    elif mode == "before":
        src = src.replace(anchor, new + anchor, 1)
    else:
        src = src.replace(anchor, new, 1)
    applied.append(name)


OLD = """/* ---------- journey walks: a journey is a route on the land ---------- */
let JWALK=null;
function playJourney(id){const j=jById(id);if(!j)return;
  closeLoom();$('panel').classList.remove('open');panelKey=null;$('module').classList.remove('show');closeInspect&&closeInspect();
  if(document.body.classList.contains('circles'))setMapType('living',true);
  const stops=j.steps.map((st,si)=>({st,si})).filter(x=>x.st.at&&BY[x.st.at]);
  if(!stops.length){toast('No steps of this journey have a place yet. The Loom awaits.');return}
  const skipped=j.steps.length-stops.length;
  JWALK={id,i:0};setHash('#/journey/'+id);
  maiaSay(`<b>${j.name}</b>. Walking ${stops.length} of ${j.steps.length} steps${skipped?` (${skipped} not yet placed; drag them on the Loom)`:''}. <b>Esc</b> ends the walk.`);
  const step=()=>{if(!JWALK||JWALK.id!==id)return;
    if(JWALK.i>=stops.length){JWALK=null;
      maiaSay(`The walk ends here. The full <b>${j.name}</b> lives at <a href="${siteHref(SITE_ROUTES[id]||'/')}" target="_blank" rel="noopener">${SITE_ROUTES[id]||'/'}</a>. Two doors, one journey.`);
      setHash('');return}
    const x=stops[JWALK.i];const s=BY[x.st.at];
    travelTo(s.x,s.y,1.25,()=>{
      /* The flight lands FRAMES after step() started it, and the walk can end
         in between from jEnd(), Escape, or step() passing the last stop. Every
         other entry point re-checks JWALK for exactly that reason; this one is
         the only callback that fires late, so it is the only one that threw. */
      if(!JWALK||JWALK.id!==id)return;
      /* Maia is the PRESENTER; the words stay village content, so `t` and the
         optional `body` are printed as they were written. */
      maiaSay(`<b>${x.st.stage?x.st.stage+': ':''}${x.st.t}</b> at ${s.name}`+
        (x.st.body?`<div style="margin-top:3px">${x.st.body}</div>`:'')+
        `<div class="jrow"><button class="btn" onclick="jNext()">▸ next</button>`+
        `<button class="btn ghostbtn" onclick="jEnd()">✕ end the walk</button>`+
        `<span class="jn">${JWALK.i+1} of ${stops.length}</span></div>`);
      JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id){JWALK.i++;step()}},1500)})};
  window.jNext=()=>{clearTimeout(JTMR);if(!JWALK||JWALK.id!==id)return;JWALK.i++;step()};
  window.jEnd=()=>{clearTimeout(JTMR);JWALK=null;setHash('');
    maiaSay('The walk ends here. Wander wherever you like.')};
  step()}
let JTMR=null;
window.playJourney=playJourney;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);JWALK=null;
  maiaSay('The walk ends here. Wander wherever you like.');setHash('')}},true);
"""

NEW = r"""/* ---------- THE GUIDED CONVERSATION: a journey is a route on the land, and
   Maia walks it beside you ----------

   ONE experience on both profiles. The pocket walk and the desk tour used to
   be two scripts saying nearly the same thing to two different surfaces; this
   is the one that ships, and it is the journey, because the journey already
   knew how to move the camera stop by stop.

   THE SURFACE IS THE MAIA DOCK ON BOTH. On a desk it is already open in the
   corner. On a phone #maia is display:none until body.msheet, so this adds
   that class and removes it again at the end. NOTHING HERE POSITIONS
   ANYTHING: #maia is a tenant of the bottom band reading --band-b-maia, and
   bandWatch is watching body's class list, so the band places the sheet the
   frame after it appears. A `bottom:` literal written here would be a second
   opinion about an edge that already has an owner. */

/* Her own words, for the places the Welcome Walk visits. She lives here. This
   is the copy a village is expected to make its own, which is why a `walk`
   push over the config bridge outranks it below. */
const MAIA_STOPS={
  gate:'I am Maia. I live up past the ponds. I came through this gate three years ago with one bag and a great many questions, and somebody was standing here waiting for me. Come in.',
  welcome:'The Welcome Lodge. My first meal here was at that long table, and someone had already learned my name. One rule we keep: Hearts are gratitude. We thank each other. We never pay each other to care.',
  ponds:'The ponds. We caught the rain and kept it. Herons moved in within a month and behave like they hold the deed. I still swim here most mornings.',
  greenhouse:'The greenhouse feeds us. I spent my whole first season in here, mostly getting it wrong. The leaf pennants mark work that wants hands today, and the village thanks you in Hearts when you take one.',
  community:'The Village Heart. Kitchen, library, council fire. We have no bosses. We are circles, and every circle keeps a home somewhere on this land.',
  ridgeA:'My roof is up there. This hamlet is being pooled into existence, so the gold ring fills as money turns into walls. Saturday is a build day and my back already knows it.',
  sanctuary:'South, under the mist, the Sanctuary is still a drawing. I like standing here. You can see what we have promised each other and have yet to build.',
  council:'That is my village. Everything you walked past traces to something true: a funded build, a claimed quest, a filled seat. My whole job now is to get you off this map and onto the land. Where shall we start?'
};
window.MAIA_STOPS=MAIA_STOPS;

/* Whose words, in order. The village's own push over the {type:'config'}
   bridge wins, because a fork's guide is the fork's guide. Then Maia's line
   for that place. Then the Welcome Walk seed the village already wrote. An
   empty answer is honest and the caller falls back to live scene data. */
function jLine(st,s){
  const k=s?s.key:null;if(!k)return '';
  const pick=arr=>{const w=(arr||[]).find(x=>x&&x.structure_key===k&&x.body);return w?w.body:''};
  return pick(window.WALK)||MAIA_STOPS[k]||pick(window.WALK_SEED)||''}
window.jLine=jLine;

/* What is true at this place right now, read off the scene rather than
   written down anywhere. This is what "tell me more" says, and it is also
   what she says at a stop no resident line covers, which is most of the
   Resident, Steward and Investor journeys. Returns the written form and the
   spoken form, because a percentage sign is not a word. */
function jDeep(s){
  const q=questsAt(s.key),se=seatsAt(s.key),html=[],say=[];
  const add=(h,t)=>{html.push(h);say.push(t)};
  const first=String(s.blurb||'').split('.')[0];
  if(first)add(escq(first)+'.',first+'.');
  if(s.state==='funding'&&typeof s.fund==='number'){const pc=Math.round(s.fund*100);
    add('The pool sits at <b>'+pc+'%</b>, and every pledge here turns into wall.',
        'The pool sits at '+pc+' percent, and every pledge here turns into wall.')}
  if(q.length){const t=q.length+' quest'+(q.length>1?'s':'')+' waiting at this door';add(escq(t)+'.',t+'.')}
  if(se.length){const t=se.length+' open seat'+(se.length>1?'s':'')+' belongs to this place';add(escq(t)+'.',t+'.')}
  if(s.event)add('Coming up: <b>'+escq(s.event)+'</b>.','Coming up: '+s.event+'.');
  if(!html.length){const t='I have nothing else recorded here yet. Ask me and I will go and find out.';add(escq(t),t)}
  return{html:html.join(' '),say:say.join(' ')}}
window.jDeep=jDeep;

/* The row of answers under every line. `jn` reads "<n> of <total>" and stays
   last, which is the shape verify_features reads. */
function jRow(n,total,more){
  return '<div class="jrow"><button class="btn" onclick="jNext()">▸ walk on</button>'
    +(more?'<button class="btn ghostbtn" onclick="jMore()">☞ tell me more</button>':'')
    +'<button class="btn ghostbtn" onclick="jEnd()">✕ stay here</button>'
    +'<span class="jn">'+n+' of '+total+'</span></div>'}

/* Long enough to read a line at, and it never runs while she is paused. A
   1.5 second stop was a slideshow; this is a walk. */
const JDWELL=6500;
let JWALK=null,JTMR=null,JSHEET=false;
function jSheetOn(){
  if(document.body.classList.contains('pocket')&&!document.body.classList.contains('msheet')){
    document.body.classList.add('msheet');JSHEET=true}}
function jSheetOff(){if(JSHEET){document.body.classList.remove('msheet');JSHEET=false}}

/* Stop the clock. Asking her something is the point of the whole feature, so
   a question must never race the next stop. */
function jPause(){if(!JWALK)return false;JWALK.paused=true;clearTimeout(JTMR);return true}
window.jPause=jPause;
function jOffer(){if(!JWALK||!JWALK.paused)return;
  const say='Say the word and we walk on.';
  maiaSay(escq(say)+'<div class="jrow"><button class="btn" onclick="jNext()">▸ walk on</button>'
    +'<button class="btn ghostbtn" onclick="jEnd()">✕ stay here</button></div>',null,say)}

/* Which id the run records for this stop. The Welcome Walk's seeded steps keep
   their own ids so a village counting walk-log rows keeps counting the same
   steps it always counted. */
function jStepId(j,x){
  const k=x.st.at;
  const seed=k&&(window.WALK_SEED||[]).find(w=>w&&w.structure_key===k);
  return seed?seed.id:(j.id+':'+x.si)}

function playJourney(id,opts){const j=jById(id);if(!j)return;
  const o=opts||{};
  leaveIntro();closeLoom();$('panel').classList.remove('open');panelKey=null;
  $('module').classList.remove('show');closeInspect&&closeInspect();
  if(document.body.classList.contains('circles'))setMapType('living',true);
  const stops=j.steps.map((st,si)=>({st,si})).filter(x=>x.st.at&&BY[x.st.at]);
  if(!stops.length){toast('No steps of this journey have a place yet. The Loom awaits.');return}
  const skipped=j.steps.length-stops.length;
  $('maia').classList.remove('min');jSheetOn();
  JWALK={id,i:0,paused:false,log:!!o.log};setHash('#/journey/'+id);
  const open=j.name+'. '+stops.length+' stops, and you can stop me at any one of them.';
  maiaSay('<b>'+escq(j.name)+'</b>. '+stops.length+' stops, and you can stop me at any one of them. '
    +'<b>Esc</b> ends the walk.'
    +(skipped?'<div style="margin-top:3px;opacity:.72">'+skipped+' step'+(skipped>1?'s':'')
      +' of this journey has no place on the land yet. Drag them on the Loom.</div>':''),
    null,open);
  const hold=()=>{clearTimeout(JTMR);
    if(!JWALK||JWALK.id!==id||JWALK.paused)return;
    JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id&&!JWALK.paused){JWALK.i++;step()}},JDWELL)};
  const step=()=>{if(!JWALK||JWALK.id!==id)return;
    if(JWALK.i>=stops.length){const logged=JWALK.log,at=JWALK.i;JWALK=null;setHash('');jSheetOff();
      if(logged&&typeof endWalk==='function')endWalk(true,at);
      const route=SITE_ROUTES[id]||'/';
      maiaSay('The walk ends here. The whole of <b>'+escq(j.name)+'</b> lives at '
        +'<a href="'+escq(siteHref(route))+'" target="_blank" rel="noopener">'+escq(route)+'</a>. '
        +'Two doors, one journey.',
        null,'The walk ends here. The whole of '+j.name+' lives on the site, at '+route+'. Two doors, one journey.');
      return}
    const x=stops[JWALK.i];const s=BY[x.st.at];
    if(JWALK.log)WALK_LOG.push({step:jStepId(j,x),at_index:JWALK.i,ts_seq:WALK_LOG.length});
    hap(12);
    travelTo(s.x,s.y,1.25,()=>{
      /* The flight lands FRAMES after step() started it, and the walk can end
         in between from jEnd(), Escape, or step() passing the last stop. Every
         other entry point re-checks JWALK for exactly that reason; this one is
         the only callback that fires late, so it is the only one that threw. */
      if(!JWALK||JWALK.id!==id)return;
      /* EVERY RENDERED VALUE IS ESCAPED, and that is a change of position from
         the pass before this one, which printed `t` and `body` "as they were
         written". Journey text is not authored copy: restoreScene() rebuilds
         SCENE.journeys from J.journeys on a shell push, on an autosave
         restore, and on a site import, so a step title reaches innerHTML from
         three directions. A village loses the ability to bold a word inside a
         step body. That is the right price. */
      const title=escq((x.st.stage?x.st.stage+': ':'')+(x.st.t||''));
      const line=jLine(x.st,s),deep=line?null:jDeep(s);
      const body=x.st.body?('<div style="margin-top:3px">'+escq(x.st.body)+'</div>'):'';
      maiaSay('<b>'+title+'</b> at '+escq(s.name)
        +'<div style="margin-top:3px">'+(line?escq(line):deep.html)+'</div>'
        +body+jRow(JWALK.i+1,stops.length,true),
        null,(line||deep.say)+(x.st.body?' '+x.st.body:''));
      hold()})};
  window.jNext=()=>{clearTimeout(JTMR);if(!JWALK||JWALK.id!==id)return;
    JWALK.paused=false;JWALK.i++;step()};
  /* Tell me more stays where it is and says what is actually there. */
  window.jMore=()=>{clearTimeout(JTMR);if(!JWALK||JWALK.id!==id)return;
    JWALK.paused=true;
    const x=stops[Math.min(JWALK.i,stops.length-1)],s=x&&BY[x.st.at];if(!s)return;
    const d=jDeep(s);
    maiaSay(d.html+jRow(JWALK.i+1,stops.length,false),null,d.say)};
  window.jEnd=()=>{clearTimeout(JTMR);
    const logged=!!(JWALK&&JWALK.log),at=JWALK?JWALK.i:-1;
    JWALK=null;setHash('');jSheetOff();mvStop();
    if(logged&&typeof endWalk==='function')endWalk(false,at);
    maiaSay('The walk ends here. Wander wherever you like, and say my name when you want me.')};
  JWALK.hold=hold;step()}
window.playJourney=playJourney;

/* A question stops the walk. The send button and the Enter key are caught in
   the CAPTURE phase so the pause is set before conciergeMatch is scheduled,
   and the offer to carry on lands after her answer rather than on top of it. */
(function jListen(){
  const send=$('maiaSend'),txt=$('maiaText');
  const paused=()=>{if(jPause())setTimeout(jOffer,900)};
  if(send)send.addEventListener('click',paused,true);
  if(txt)txt.addEventListener('keydown',e=>{if(e.key==='Enter')paused()},true);
  document.querySelectorAll('#maiaActions .chip').forEach(ch=>ch.addEventListener('click',jPause,true));
})();

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);
  const logged=!!JWALK.log,at=JWALK.i;JWALK=null;jSheetOff();mvStop();
  if(logged&&typeof endWalk==='function')endWalk(false,at);
  maiaSay('The walk ends here. Wander wherever you like.');setHash('')}},true);
"""

edit("js: the guided conversation", OLD, NEW, mode="replace",
     guard="const MAIA_STOPS={")

if src != orig:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)

print("H2 journey:")
for a in applied:
    print("  apply  " + a)
for s in skipped:
    print("  skip   " + s + " (already present)")
print("  bytes  %+d" % (len(src.encode("utf-8")) - len(orig.encode("utf-8"))))
