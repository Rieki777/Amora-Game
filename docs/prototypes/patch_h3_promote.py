#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H3. The walk and the tour both become the journey.

Rye's decision: playJourney is promoted to both profiles and BECOMES the
guided conversation. The pocket-only WALK and the desk-only TOUR go.

WHAT THIS DOES TO EACH ONE.

  startTour()  was a second script of eight paragraphs about the same eight
               places. It now opens the Welcome Walk journey. Every caller
               keeps its name: the `t` key, the concierge lexicon, and two
               <a onclick="startTour()"> links inside her own lines.

  startWalk()  was the pocket card flow. It now opens the same journey, keeps
               its `amora-walk-done` gate, and keeps its session key, so the
               newcomer measurement survives the merge instead of being
               deleted with the thing it measured.

  nextWalk()   gone with #walkCard's contents. endWalk() STAYS and becomes what
               its name always meant: the row that closes a run and posts it.
               It takes the index from the journey now, because WIDX went with
               the card.

WHAT IS KEPT ON PURPOSE, AND WHY. Two symbols survive as views rather than as
features, because gates and probes read them and a silent break is worse than
a little compatibility:

  TOUR              a READ-ONLY view of the Welcome Walk's stops, so
                    qa/secB.js §14 still has a list to check narration against,
                    and now checks it against the words she actually says.
  tourI, tourTimer  a live mirror of the journey's position and timer.
                    qa/secB.js reads tourI to know when the walk ended, and the
                    intro's nine-second nudge reads it to know whether she is
                    already walking someone.

  window.WALK, WALK_SEED, WALK_LOG, WALK_SESSION, sendWalkLog and window.WGATE
  are untouched. WALK_SEED is village copy that verify_badges.js reads, WALK is
  the config bridge's own key that verify_vocab_bridge.js pushes, and the seeds
  now feed the journey's narration through jLine().

NOT DONE HERE, AND NAMED SO IT IS NOT LOST: #walkCard's markup, its CSS and its
entry in BAND_SLOT.bottom are left in place. Nothing shows it any more. Taking a
tenant out of the band is the band owner's edit, and this file has other lanes
in it this round.

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


# --------------------------------------------------- 1. the tour becomes a view
TOUR_OLD = """/* guided tour — deterministic script, camera-driven (D3) */
const TOUR=[
  {at:'gate',z:1.35,txt:`Welcome to <b>Amora</b>: 123 hectares on the Osa Peninsula, drawn live from Master Plan V7. Every story here walked in through this gate, and today that's you.`},
  {at:'welcome',z:1.3,txt:`The <b>Welcome Lodge</b>. First meals, first questions, and the Welcome Aboard quests, ten small meaningful acts that root you in this community.`},
  {at:'ponds',z:1.25,txt:`<b>The Ponds</b>. Rain caught and kept. The hamlet around them was Amora's first neighborhood. Herons approve.`},
  {at:'greenhouse',z:1.35,txt:`The <b>Greenhouse</b>, engine room of food sovereignty. Two seats are open and three quests are waiting; the seedling census is a beautiful first one.`},
  {at:'community',z:1.3,txt:`The <b>Village Heart</b>. Community Center, Kitchen, Library-in-the-raising, and the Council Fire. Click any building and it opens as a door into the game: forum, library, roles, gratitude.`},
  {at:'ridgeA',z:1.3,txt:`Up the ridge, the first hamlet is <b>72% pooled</b>. Crowdpooling you can watch become walls. Saturday is a build day; strong backs welcome.`},
  {at:'sanctuary',z:1.2,txt:`South, where the land still dreams, the <b>Sanctuary</b> is coming. Flip the Vision layer and you'll see the whole masterplan as blueprint ghosts, the fundable gap between today and the dream.`},
  {at:'council',z:1.35,txt:`That's the shape of it. My whole job is to get you <i>off</i> this map and into the real one. Claim a quest, raise a hand for a seat, come to the feast tonight. Where shall we start?`},
];
let tourI=-1,tourTimer=null;
function startTour(){tourI=-1;maiaSay(`Come, the short walk. You can wander off any time; the land doesn't mind.`);nextTour()}
function nextTour(){clearTimeout(tourTimer);tourI++;if(tourI>=TOUR.length){tourI=-1;return}
  const st=TOUR[tourI],s=BY[st.at];if(!s){nextTour();return}travelTo(s.x,s.y,st.z,()=>{maiaSay(st.txt);tourTimer=setTimeout(nextTour,5600)})}
"""

TOUR_NEW = r"""/* The tour was a second script about the same eight places. It is the journey
   now, so this is the one line of it that is left: the name every caller
   already uses. The `t` key, the concierge lexicon and two links inside Maia's
   own sentences all say startTour(), and they all mean the Welcome Walk.

   TOUR, tourI and tourTimer below are VIEWS, not features. They exist because
   qa/secB.js §14 reads all three to follow the narration, and because the
   intro's nine-second nudge asks tourI whether she is already walking someone.
   The journey writes them; nothing reads them to decide anything. */
let TOUR=[],tourI=-1,tourTimer=null;
function startTour(){const id=welcomeJourney();if(id)playJourney(id)}
"""

edit("js: the tour becomes the journey", TOUR_OLD, TOUR_NEW, mode="replace",
     guard="function startTour(){const id=welcomeJourney()")

# -------------------------------------- 2. the journey publishes the tour view
VIEW_ANCHOR = "window.MAIA_STOPS=MAIA_STOPS;\n"
VIEW_NEW = r"""
/* Which journey is the newcomer's. j1 is Amora's Welcome Walk; a fork that
   imported its own journeys gets its first one, and a village with none gets
   nothing rather than a broken call. */
function welcomeJourney(){return (jById('j1')?'j1':((SCENE.journeys[0]||{}).id||null))}
window.welcomeJourney=welcomeJourney;

/* The read-only view the old tour left behind. Built from the journey and
   Maia's own lines, so qa/secB.js §14 now checks narration against the words
   she actually says. Rebuilt on demand because SCENE.journeys is replaced
   wholesale by restoreScene() on every shell push. */
function tourView(){const id=welcomeJourney(),j=id&&jById(id);
  return (j?j.steps:[]).filter(st=>st.at&&BY[st.at])
    .map(st=>({at:st.at,z:1.25,txt:MAIA_STOPS[st.at]||st.t||''}))}
window.tourView=tourView;
TOUR=tourView();
"""

edit("js: the tour view, rebuilt from the journey", VIEW_ANCHOR, VIEW_NEW,
     guard="function welcomeJourney()")

# ------------------------------------------ 3. the journey mirrors the position
MIRROR_STEP_OLD = (
    "    const x=stops[JWALK.i];const s=BY[x.st.at];\n"
    "    if(JWALK.log)WALK_LOG.push({step:jStepId(j,x),at_index:JWALK.i,ts_seq:WALK_LOG.length});\n"
)
MIRROR_STEP_NEW = (
    "    const x=stops[JWALK.i];const s=BY[x.st.at];\n"
    "    tourI=JWALK.i;                                   // the view qa/secB.js follows\n"
    "    if(JWALK.log)WALK_LOG.push({step:jStepId(j,x),at_index:JWALK.i,ts_seq:WALK_LOG.length});\n"
)
edit("js: mirror the stop index", MIRROR_STEP_OLD, MIRROR_STEP_NEW, mode="replace",
     guard="tourI=JWALK.i;                                   // the view")

MIRROR_HOLD_OLD = (
    "    JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id&&!JWALK.paused){JWALK.i++;step()}},JDWELL)};\n"
)
MIRROR_HOLD_NEW = (
    "    JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id&&!JWALK.paused){JWALK.i++;step()}},JDWELL);\n"
    "    tourTimer=JTMR};\n"
)
edit("js: mirror the timer", MIRROR_HOLD_OLD, MIRROR_HOLD_NEW, mode="replace",
     guard="    tourTimer=JTMR};")

# Three exits, three places the mirror has to go back to -1: walked past the
# last stop, jEnd(), and Escape. Missing one leaves qa/secB.js waiting 66s.
for tag, old, new in [
    ("finish",
     "    if(JWALK.i>=stops.length){const logged=JWALK.log,at=JWALK.i;JWALK=null;setHash('');jSheetOff();\n",
     "    if(JWALK.i>=stops.length){const logged=JWALK.log,at=JWALK.i;JWALK=null;tourI=-1;setHash('');jSheetOff();\n"),
    ("jEnd",
     "    JWALK=null;setHash('');jSheetOff();mvStop();\n",
     "    JWALK=null;tourI=-1;setHash('');jSheetOff();mvStop();\n"),
    ("escape",
     "  const logged=!!JWALK.log,at=JWALK.i;JWALK=null;jSheetOff();mvStop();\n",
     "  const logged=!!JWALK.log,at=JWALK.i;JWALK=null;tourI=-1;jSheetOff();mvStop();\n"),
]:
    edit("js: mirror -1 on exit (" + tag + ")", old, new, mode="replace", guard=new)

# ------------------------------------------------- 4. the walk becomes the journey
WALK_OLD = """function walkSteps(){return(window.WALK&&WALK.length?WALK:WALK_SEED).filter(st=>st.structure_key&&BY[st.structure_key])}
let WIDX=-1,WTMR=null;
function startWalk(replay){const steps=walkSteps();if(!steps.length)return;
  if(!replay&&localStorage.getItem('amora-walk-done'))return;
  leaveIntro();closeLoom();$('panel').classList.remove('open');panelKey=null;$('module').classList.remove('show');
  if(document.body.classList.contains('circles'))setMapType('living',true);
  WIDX=-1;window.WALK_SESSION=newWalkSession();window.WALK_LOG=[];nextWalk()}
window.startWalk=startWalk;
"""
WALK_NEW = r"""/* The newcomer's first run. It is the journey now, on both profiles, and this
   function is what is left of the pocket card: the once-only gate, and the
   session key that makes the run countable. `log:true` is what tells the
   journey to record; a journey opened from the Loom or from an address does
   not, because it is not a first walk. */
function startWalk(replay){
  if(!replay&&localStorage.getItem('amora-walk-done'))return;
  const id=welcomeJourney();if(!id)return;
  window.WALK_SESSION=newWalkSession();window.WALK_LOG=[];
  playJourney(id,{log:true})}
window.startWalk=startWalk;
"""
edit("js: the walk becomes the journey", WALK_OLD, WALK_NEW, mode="replace",
     guard="function startWalk(replay){\n  if(!replay&&localStorage")

# ---------------------------------------------- 5. endWalk closes a run, no card
END_OLD = """function endWalk(done){clearTimeout(WTMR);const atEnd=WIDX;WIDX=-1;$('walkCard').classList.remove('show');
  if(done){try{localStorage.setItem('amora-walk-done','1')}catch(_){}}
  WALK_LOG.push({step:done?'complete':'abandoned',at_index:atEnd,ts_seq:WALK_LOG.length});
  sendWalkLog()}
"""
END_NEW = r"""/* Closes a run and posts it. The index comes from the journey now; WIDX went
   with the card. Called only for a run startWalk() opened, so a journey opened
   from the Loom never writes a newcomer row. */
function endWalk(done,atIndex){
  if(done){try{localStorage.setItem('amora-walk-done','1')}catch(_){}}
  WALK_LOG.push({step:done?'complete':'abandoned',
    at_index:(typeof atIndex==='number'?atIndex:-1),ts_seq:WALK_LOG.length});
  sendWalkLog()}
window.endWalk=endWalk;
"""
edit("js: endWalk takes its index from the journey", END_OLD, END_NEW, mode="replace",
     guard="function endWalk(done,atIndex){")

# --------------------------------------------------- 6. the card renderer goes
CARD_OLD = """function nextWalk(){clearTimeout(WTMR);const steps=walkSteps();WIDX++;
  if(WIDX>=steps.length){endWalk(true);return}
  const st=steps[WIDX];const sBY=BY[st.structure_key];
  WALK_LOG.push({step:st.id,at_index:WIDX,ts_seq:WALK_LOG.length});
  window.WGATE={};hap(15);
  travelTo(sBY.x,sBY.y,1.3,()=>{
    const wc=$('walkCard');
    const choice=st.gesture==='choice';
    wc.innerHTML=`<h5>${escq(st.title)}</h5><p>${escq(st.body)}</p>
      ${(!choice&&st.gesture&&st.gesture!=='none')?`<div class="wgate">✋ ${escq(st.gate_hint||st.gesture)}</div>`:''}
      ${choice?`<div class="wrow" style="flex-wrap:wrap">
        <button class="btn" onclick="claimQuest('Welcome Ambassador','the Welcome Lodge');endWalk(true)">⚑ Claim a first quest</button>
        <button class="btn" onclick="evRSVP('e1');endWalk(true)">✦ Join tonight’s feast</button>
        <button class="btn ghostbtn" onclick="endWalk(true);openDoor('journeys',{})">➹ Begin a journey</button></div>`:''}
      <div class="wrow"><button class="btn ghostbtn" style="font-size:10.5px" onclick="endWalk(false)">skip</button>
       ${!choice?`<button class="btn" style="font-size:10.5px" onclick="nextWalk()">next ›</button>`:''}
       <span class="wn">${WIDX+1} / ${steps.length}</span></div>`;
    wc.classList.add('show');
    if(!choice){const need=st.gesture&&st.gesture!=='none'?st.gesture:null;
      if(need){let waited=0;const poll=()=>{if(WIDX<0)return;
        if(WGATE[need]||waited>12000){hap([10,40,10]);nextWalk()}else{waited+=400;WTMR=setTimeout(poll,400)}};WTMR=setTimeout(poll,400)}
      else WTMR=setTimeout(nextWalk,6500)}})}
"""
CARD_NEW = r"""/* nextWalk() and the #walkCard renderer stood here. The journey renders into
   the Maia dock on both profiles, so a second card that says the same things
   in a different voice is one surface too many.
   WALK_SEED above is untouched: it is the village's own copy, jLine() reads it
   as the third-choice source for a stop's words, and verify_badges.js reads
   step w4. #walkCard's markup, CSS and band slot are still in the file and
   nothing shows them; removing a band tenant belongs to whoever owns the
   band. */
"""
edit("js: the walk card renderer goes", CARD_OLD, CARD_NEW, mode="replace",
     guard="/* nextWalk() and the #walkCard renderer stood here.")

# ------------------------------------------------- 7. the intro nudge asks JWALK
NUDGE_OLD = "    setTimeout(()=>{if(tourI<0)maiaSay("
NUDGE_NEW = "    setTimeout(()=>{if(!JWALK)maiaSay("
edit("js: the intro nudge asks the walk itself", NUDGE_OLD, NUDGE_NEW, mode="replace",
     guard="setTimeout(()=>{if(!JWALK)maiaSay(")

if src != orig:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)

print("H3 promote:")
for a in applied:
    print("  apply  " + a)
for s in skipped:
    print("  skip   " + s + " (already present)")
print("  bytes  %+d" % (len(src.encode("utf-8")) - len(orig.encode("utf-8"))))
