#!/usr/bin/env python3
"""Build mode gets a draft, a publish button, and a way back.

WHAT WAS MISSING. Build mode could rearrange the whole village and the only
route to the live site was `Export scene`, a file, a person with database
access, and `scripts/import-map-scene.ts`, which skips `structures`, `zones`
and `flows` because the geometry had nowhere to land. So the founder's hand
moved a map nobody else would ever see. 0063 gives the scene a home in the
village database; this gives the map the doors to reach it.

THE ABSORBER ALREADY EXISTED, which is the whole reason this patch is small.
`buildExportJSON()` writes a scene and `restoreScene()` reads one back, and
they have been a complete round trip since build mode shipped. A published
scene arriving over the bridge is just another scene, so it goes through
`restoreScene` and nothing here reimplements a second reader. That is the D7
lesson applied before it could bite a fifth time: the fix for a value crossing
a boundary is fewer absorbers, never another one.

WHAT A PERSON SEES, which is the point of the round:

  - The Build button only exists for someone the VILLAGE says may edit. The
    server decides that; this only draws it. The artifact is a static file at
    a known URL, so its buttons gate nothing and never could.
  - A standing bar while editing: how many changes are unpublished, and the
    plain statement that the live map is unchanged. A bar and not a toast,
    because a toast is how you miss things.
  - Publish names its blast radius before it happens, and lists the changes
    in the founder's own words. Those words are free: the map has kept an
    edit journal (`logEdit`) all along and nobody was reading it.
  - After publishing: live since, by version, with Undo sitting right there.
  - VIEW AS VISITOR. The single most useful affordance in the round. Seeing
    the live land instead of your own draft is what makes the difference
    between draft and live felt rather than explained.

THE ONE SUBTLE RULE. A push from the shell never repaints a map that has
unpublished work on it. Another admin publishing while you are mid-drag must
not move anything under your hands; you are told the live map changed and your
base version deliberately stays where it was, so your next publish is REFUSED
by the version check and you get told what moved. Rebasing you silently is how
you overwrite somebody without either of you noticing.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable: detects its own marker and skips rather than double-applying.
Usage: python3 patch_d8_publish.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)

if "PUBLISH_MARK" in src:
    print(f"already applied to {HTML} (PUBLISH_MARK present); nothing to do")
    sys.exit(0)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ------------------------------------------------------------------ 1. the dress
# Appended to the restore bar's rule, which is the nearest neighbour in both
# position and purpose: a strip that appears when the map has something to say
# about work in progress.
swap(
    "    box-shadow:0 10px 30px rgba(0,0,0,.55);padding:9px 14px;font-size:12.5px}",
    """    box-shadow:0 10px 30px rgba(0,0,0,.55);padding:9px 14px;font-size:12.5px}
  /* ---------- D8: draft, publish, and the way back ---------- */
  /* The Build button is drawn only for a hand the village recognises. This is
     cosmetics and is commented as such: the artifact is a static file anyone
     can open directly, so every real check is on the server. */
  #buildBtn{display:none}
  body.can-edit #buildBtn{display:block}
  /* The standing bar. Persistent for as long as build mode is on, because the
     thing it says (your edits are not live) has to be true and visible the
     whole time, not for four seconds after a click. */
  #draftBar{position:absolute;top:52px;left:50%;transform:translateX(-50%);z-index:63;display:none;
    align-items:center;gap:12px;background:linear-gradient(180deg,rgba(58,44,20,.97),rgba(38,28,12,.97));
    border:1px solid var(--gold-b);border-left:4px solid #e0a34e;border-radius:8px;color:var(--parch);
    box-shadow:0 10px 30px rgba(0,0,0,.6);padding:8px 14px;font-size:12.5px;max-width:min(760px,92vw)}
  body.build.can-edit #draftBar{display:flex}
  body.visiting #draftBar{display:flex;border-left-color:#7bb0a0}
  #draftBar .dsep{opacity:.4}
  #draftBar b{color:var(--gold-b);font-weight:600}
  #draftLive{opacity:.72;font-size:11.5px}
  #pubGo:disabled{opacity:.45;cursor:default}
  /* Publishing is the one irreversible-feeling act in the map, so it gets a
     real modal and not a confirm() the browser styles like a warning. */
  #pubWrap{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;
    background:rgba(8,6,3,.62)}
  #pubWrap.show{display:flex}
  #pubCard{width:min(560px,92vw);max-height:84vh;overflow:auto;background:linear-gradient(180deg,#fdf3d7,#efdcae);
    border:1px solid #8a6a33;border-radius:10px;color:var(--ink);box-shadow:0 24px 70px rgba(0,0,0,.6);padding:18px 20px}
  #pubCard h4{font-variant:small-caps;letter-spacing:.14em;font-size:14px;margin-bottom:4px}
  #pubCard .blast{font-size:12.5px;margin:8px 0 12px;padding:8px 10px;border-radius:6px;
    background:rgba(160,90,30,.13);border:1px solid rgba(138,106,51,.5)}
  #pubList{list-style:none;font-size:12px;margin:0 0 12px;max-height:230px;overflow:auto;
    border:1px solid rgba(138,106,51,.35);border-radius:6px}
  #pubList li{padding:5px 10px;border-bottom:1px solid rgba(138,106,51,.18)}
  #pubList li:last-child{border-bottom:none}
  #pubNote{width:100%;font-family:inherit;font-size:12.5px;padding:7px 9px;border-radius:6px;
    border:1px solid #8a6a33;background:rgba(255,255,255,.5);color:var(--ink);margin-bottom:12px}
  #pubActions{display:flex;gap:8px;justify-content:flex-end}
  /* The conflict card. Same furniture as the confirm, different colour, so a
     refusal reads as information and not as an error page. */
  #pubCard.conflict .blast{background:rgba(120,40,30,.14);border-color:rgba(150,60,40,.55)}""",
)

# --------------------------------------------------------------- 2. the furniture
# Both bars sit beside the restore bar in the DOM for the same reason they sit
# beside it in the stylesheet.
swap(
    """  <button class="btn ghostbtn" id="restoreNo" style="font-size:11px;padding:4px 12px">Start fresh</button>
</div>""",
    """  <button class="btn ghostbtn" id="restoreNo" style="font-size:11px;padding:4px 12px">Start fresh</button>
</div>

<div id="draftBar">
  <span id="draftState">Editing a draft. The live map is unchanged.</span>
  <span class="dsep">|</span>
  <span id="draftLive"></span>
  <button class="btn" id="pubGo" style="font-size:11px;padding:4px 12px">Publish to the live map</button>
  <button class="btn ghostbtn" id="visitBtn" style="font-size:11px;padding:4px 12px">View as visitor</button>
</div>

<div id="pubWrap"><div id="pubCard">
  <h4 id="pubTitle">Publish to the live map</h4>
  <div class="blast" id="pubBlast"></div>
  <ul id="pubList"></ul>
  <input id="pubNote" maxlength="200" placeholder="What changed, in a few words (optional)">
  <div id="pubActions">
    <button class="btn ghostbtn" id="pubCancel" style="font-size:11.5px">Not yet</button>
    <button class="btn" id="pubConfirm" style="font-size:11.5px">Publish it</button>
  </div>
</div></div>""",
)

# ------------------------------------------------------------------ 3. the button
swap(
    '<button class="chip" id="exportBtn">⤓ Export scene</button></div></div>',
    '<button class="chip" id="exportBtn">⤓ Export scene</button>'
    '<button class="chip" id="pubChip">⇧ Publish</button></div></div>',
)

# ------------------------------------------------------------------- 4. the engine
# Placed immediately before the embed bridge, because the bridge is what calls
# into it and JS hoisting should never be the reason an ordering works.
swap(
    """/* ---------- embed bridge — the site shell speaks, the map listens ----------""",
    """/* ---------- D8: THE VILLAGE'S HAND ON THE MAP ----------
   Draft, publish and undo. Everything here is about WHAT TO DRAW; every
   question of what is allowed is answered by the server, because this file is
   served at a URL any visitor can open and its buttons prove nothing.

   PUBLISH_MARK is the honest definition of "unpublished": the edit sequence
   as it stood the last time this draft was made live. Counting EDITS.length
   would call a restored draft's whole history unpublished work every time,
   and counting nothing would call a real change nothing. */
let HAND={canEdit:false,canPublish:false};
let LIVE=null;            /* {version,by,at} as the village last reported it */
let LIVE_SCENE=null;      /* the published land, kept for View as visitor */
let BASE_VERSION=0;       /* the published version THIS draft forked from */
let PUBLISH_MARK=0;       /* editSeq at the last successful publish */
let SCENE_APPLIED=false;  /* has a pushed scene ever landed */
let VISITOR_VIEW=false;
let DRAFT_HOLD=null;      /* my work, stashed while I look at the live map */
let PUB_SEQ=0;
const PUB_PENDING={};

function inShell(){try{return window.parent!==window}catch(_){return false}}
function shellPost(m){try{if(inShell())window.parent.postMessage(m,'*')}catch(_){}}

/* Ask the village to do something and wait for its answer.
   The nonce is what makes an answer belong to a question: publish twice
   quickly and two replies come back, and the second must not apply itself
   over a newer intent. Eight seconds of silence resolves as `quiet`, NOT as a
   failure, because the map runs standalone from file:// in every QA suite and
   there is no village there to answer. A caller decides what quiet means; for
   an autosave it means nothing at all. */
function shellAsk(type,extra){
  const nonce='sc'+(++PUB_SEQ)+'-'+Date.now();
  return new Promise(res=>{
    PUB_PENDING[nonce]=res;
    shellPost(Object.assign({type:type,nonce:nonce},extra||{}));
    setTimeout(()=>{if(PUB_PENDING[nonce]){delete PUB_PENDING[nonce];res({ok:false,quiet:true})}},8000);
  });
}
function sceneResult(d){const fn=PUB_PENDING[d.nonce];if(!fn)return;delete PUB_PENDING[d.nonce];fn(d)}
window.sceneResult=sceneResult;

function unpublished(){return EDITS.filter(e=>(e.seq||0)>PUBLISH_MARK)}

/* The village telling this browser what its holder may do. */
function applyHand(d){
  HAND={canEdit:d.canEdit===true,canPublish:d.canPublish===true};
  LIVE=d.live||null;
  document.body.classList.toggle('can-edit',HAND.canEdit);
  document.body.classList.toggle('can-publish',HAND.canPublish);
  /* Only adopt the village's version as MY base when I have nothing of my own
     riding on an older one. See the note in applyScene: a silent rebase is
     how one admin overwrites another. */
  if(!unpublished().length)BASE_VERSION=+d.liveVersion||0;
  if(d.draft&&d.draft.scene)offerDraft(d.draft);
  renderDraftBar();
}

/* A draft waiting on the server, offered through the bar the browser-saved
   session already uses. The server's copy wins when both exist: it is the one
   that followed you here from another machine. */
function offerDraft(draft){
  const n=(draft.scene.map_edits||[]).length,b=(draft.scene.map_structures||[]).length;
  $('restoreMsg').textContent=`You have an unpublished draft of the map: ${b} buildings, ${n} changes.`;
  $('restoreYes').textContent='Open my draft';
  $('restoreNo').textContent='Start from the live map';
  $('restoreBar').style.display='flex';
  $('restoreYes').onclick=()=>{$('restoreBar').style.display='none';
    if(restoreScene(draft.scene)){BASE_VERSION=+draft.baseVersion||0;PUBLISH_MARK=0;renderDraftBar()}};
  $('restoreNo').onclick=()=>{$('restoreBar').style.display='none'};
}

/* The published land arriving over the bridge.
   NOTHING REPAINTS OVER UNPUBLISHED WORK. A colleague publishing while you
   are mid-drag must not move the ground under your hands, and your base
   version deliberately stays where it was so your next publish is refused and
   explains itself. Rebasing you here would turn that refusal into a silent
   overwrite of the person who just published. */
function applyScene(scene,version){
  LIVE_SCENE=scene;
  const mine=unpublished().length;
  if(SCENE_APPLIED&&mine){
    toast('The live map changed. Your draft is untouched.');
    renderDraftBar();return false}
  if(restoreScene(scene)){SCENE_APPLIED=true;BASE_VERSION=+version||0;PUBLISH_MARK=0;
    renderDraftBar();return true}
  return false;
}

function renderDraftBar(){
  const st=$('draftState'),lv=$('draftLive'),go=$('pubGo');if(!st)return;
  if(VISITOR_VIEW){
    st.innerHTML='<b>Seeing what a visitor sees.</b> This is the live map.';
    lv.textContent=LIVE?`Version ${LIVE.version}`:'Nothing published yet';
    go.style.display='none';$('visitBtn').textContent='Back to my draft';return}
  go.style.display='';$('visitBtn').textContent='View as visitor';
  const n=unpublished().length;
  st.innerHTML=n?`<b>${n}</b> unpublished change${n===1?'':'s'}. The live map is unchanged.`
                :'Editing a draft. The live map is unchanged.';
  lv.textContent=LIVE?`Live: version ${LIVE.version}${LIVE.by?', by '+LIVE.by:''}`:'Nothing published yet';
  go.disabled=!HAND.canPublish||!n;
  go.title=HAND.canPublish?'':'Publishing the map is a cartographer\\'s work.';
}
window.renderDraftBar=renderDraftBar;

/* ---------- View as visitor ----------
   Stash the draft, draw the live land, and put the draft back untouched. The
   stash is a full export and the restore is the same absorber every other
   scene goes through, so this cannot drift from what publishing does. */
function toggleVisitor(){
  if(!VISITOR_VIEW){
    if(!LIVE_SCENE)return toast('Nothing has been published yet, so this already is what a visitor sees.');
    DRAFT_HOLD=buildExportJSON();
    VISITOR_VIEW=true;document.body.classList.add('visiting');
    restoreScene(LIVE_SCENE);
    toast('This is the live map. Your draft is waiting.');
  }else{
    VISITOR_VIEW=false;document.body.classList.remove('visiting');
    if(DRAFT_HOLD){restoreScene(DRAFT_HOLD);DRAFT_HOLD=null}
  }
  renderDraftBar();
}

/* ---------- publish ---------- */
function openPublish(){
  const changes=unpublished();
  if(!HAND.canPublish)return toast('Publishing the map is a cartographer\\'s work.');
  if(!changes.length)return toast('Nothing to publish: the live map already matches this one.');
  const card=$('pubCard');card.classList.remove('conflict');
  $('pubTitle').textContent='Publish to the live map';
  $('pubBlast').innerHTML=`<b>${changes.length} change${changes.length===1?'':'s'}</b> will become the map every visitor sees, straight away. `+
    (LIVE?`This replaces version ${LIVE.version}.`:'This is the first published version.')+
    ' Nobody else\\'s draft is touched.';
  /* The founder's own words, from the journal the map has kept all along. */
  $('pubList').innerHTML=changes.slice().reverse().slice(0,40)
    .map(e=>`<li>${escq(editLine(e))}</li>`).join('');
  $('pubActions').style.display='flex';$('pubNote').style.display='';
  $('pubConfirm').textContent='Publish it';
  $('pubConfirm').onclick=doPublish;
  $('pubWrap').classList.add('show');$('pubNote').focus();
}
function closePublish(){$('pubWrap').classList.remove('show')}

/* One line per edit, in the same plain words shared/mapScene.ts uses on the
   site side. Two lists that must agree is a known way to lose things, so the
   verbs live in ONE place per side and qa/verify_publish.js checks that every
   action this map can log has a word on the site's list. */
const EDIT_VERBS={place:'placed',move:'moved',remove:'removed',rename:'renamed',duplicate:'duplicated',
  scale:'resized',archetype:'changed the kind of',phase:'changed the phase of',circle:'changed the circle of',
  blurb:'rewrote the description of',origin:'rewrote the origin story of',activity:'changed the activity of',
  fund:'changed the funding of',badges:'changed the marks on',door:'changed a door on',
  'door-add':'opened a door on','door-remove':'closed a door on',doors:'changed the doors on',
  'feature-edit':'redrew','flow-add':'drew a flow','flow-remove':'removed a flow',
  'flow-endpoint':'rerouted a flow','flow-medium':'changed what flows through','flow-via':'rerouted a flow',
  'flow-style':'changed the flow styling','label-style':'changed the label styling',
  'quest-add':'created a quest','quest-address':'moved a quest to','quest-weight':'changed the weight of a quest',
  'seat-add':'created a seat','seat-address':'moved a seat to','address-override':'set the place of',
  'public-unlock':'opened to the public','vision-boundary-seed':'drew the vision boundary',
  'vital-override':'set a village vital','sprite-approve':'approved artwork for',
  'sprite-reroll':'asked for new artwork for',skin:'restyled the map',
  vocab:"renamed the village's words",undo:'undid a change'};
function editLine(e){
  const t=String(e.target||''),name=t.indexOf(':')>=0?t.slice(t.indexOf(':')+1):t;
  const verb=EDIT_VERBS[e.action]||e.action;
  return name?verb+' '+name:verb;
}
window.EDIT_VERBS=EDIT_VERBS;

async function doPublish(){
  const note=$('pubNote').value.trim();
  $('pubConfirm').disabled=true;$('pubConfirm').textContent='Publishing...';
  const r=await shellAsk('publish',{scene:buildExportJSON(),baseVersion:BASE_VERSION,note:note||null});
  $('pubConfirm').disabled=false;$('pubConfirm').textContent='Publish it';
  if(r.ok){
    closePublish();
    BASE_VERSION=+r.version||BASE_VERSION;PUBLISH_MARK=editSeq;
    LIVE=(r.live&&r.live.version)?r.live:{version:r.version};
    LIVE_SCENE=buildExportJSON();
    $('pubNote').value='';
    renderDraftBar();liveSince(r.version);
    return}
  if(r.quiet){closePublish();
    return toast('This map is running on its own, with no village to publish to.')}
  if(r.reason==='stale')return showConflict(r);
  toast(r.error||'The village could not take that change. Your draft is safe.');
}

/* The refusal, given the same room as the act. A person who just pressed
   publish and was told no needs to know who moved it and that their work
   survived, in that order. */
function showConflict(r){
  const card=$('pubCard');card.classList.add('conflict');
  $('pubTitle').textContent='The live map moved while you were working';
  $('pubBlast').innerHTML=escq(r.error||'Someone published a change to the live map.')+
    (r.live&&r.live.version?` It is now version ${r.live.version}.`:'');
  $('pubList').innerHTML='<li>Your draft is exactly as you left it. Nothing was published.</li>'+
    '<li>Look at the live map first, then bring your changes onto it.</li>';
  $('pubNote').style.display='none';
  $('pubConfirm').textContent='Show me the live map';
  $('pubConfirm').onclick=()=>{closePublish();if(!VISITOR_VIEW)toggleVisitor()};
}

/* Live since, with the undo sitting right there for the minute it matters. */
function liveSince(version){
  const t=new Date();
  const hh=String(t.getHours()).padStart(2,'0'),mm=String(t.getMinutes()).padStart(2,'0');
  maiaSay(`<b>Live since ${hh}:${mm}.</b> Version ${version} is the map every visitor sees now. `+
    `<button class="btn ghostbtn" style="font-size:11px;padding:3px 9px;margin-top:6px" onclick="undoPublish(${version})">Undo this</button>`);
  toast('Live. Everyone sees this map now.');
}

/* Undo is a publish carrying an older scene, so it takes the same key and
   settles the same race. Nothing is deleted, which is what makes it safe to
   press when you are not sure. */
async function undoPublish(version){
  const back=(+version||0)-1;
  if(back<1)return toast('There is no earlier version to go back to.');
  const r=await shellAsk('restore',{version:back});
  if(r.quiet)return toast('No village to reach from here.');
  if(!r.ok)return toast(r.error||'That version could not be put back.');
  LIVE=(r.live&&r.live.version)?r.live:{version:r.version};
  BASE_VERSION=+r.version||BASE_VERSION;
  renderDraftBar();
  toast(`Version ${back} is live again.`);
}
window.undoPublish=undoPublish;

(function publishBoot(){
  $('pubGo').onclick=openPublish;
  $('pubChip').onclick=openPublish;
  $('visitBtn').onclick=toggleVisitor;
  $('pubCancel').onclick=closePublish;
  $('pubWrap').addEventListener('click',e=>{if(e.target===$('pubWrap'))closePublish()});
  $('pubWrap').addEventListener('keydown',e=>{
    if(e.key==='Escape'){closePublish();return}
    if(e.target&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName))e.stopPropagation();
  });
  renderDraftBar();
})();

/* ---------- embed bridge — the site shell speaks, the map listens ----------""",
)

# ---------------------------------------------------------- 5. the inbound doors
swap(
    "  if(d.type==='promise-result'&&d.id&&(d.kind==='rsvp'||d.kind==='claim'))promiseResult(d);\n}catch(_){}});",
    "  if(d.type==='promise-result'&&d.id&&(d.kind==='rsvp'||d.kind==='claim'))promiseResult(d);\n"
    "  /* D8. `hand` is the village saying who is holding this map; `scene-result`\n"
    "     answers a draft-save, a publish or a restore. */\n"
    "  if(d.type==='hand')applyHand(d);\n"
    "  if(d.type==='scene-result'&&d.nonce)sceneResult(d);\n"
    "}catch(_){}});",
)

# The published land rides in on the same `config` push as the skin, the walk
# and the vocabulary: one message, one pass, never a half-configured frame.
swap(
    "  const d=e.data;if(!d||d.type!=='config')return;\n  if(d.skin)applySkinExport(d.skin);",
    "  const d=e.data;if(!d||d.type!=='config')return;\n"
    "  /* The land first: everything below dresses what the scene puts down, and\n"
    "     restoreScene rebuilds the vocabulary anyway. Applying the skin to a\n"
    "     map that is about to be replaced wholesale is work thrown away. */\n"
    "  if(d.scene&&typeof d.scene==='object')applyScene(d.scene,d.sceneVersion);\n"
    "  if(d.skin)applySkinExport(d.skin);",
)

# ---------------------------------------------------------------- 6. the autosave
# A draft stops being a thing trapped in one browser. localStorage STAYS: it is
# the only save there is when the map runs standalone from file://, which is
# every QA suite and every founder who opened the artifact directly.
swap(
    "function scheduleAutosave(){clearTimeout(autosaveT);\n"
    "  autosaveT=setTimeout(()=>{try{localStorage.setItem('amora-grounds-scene',JSON.stringify(buildExportJSON()))}catch(e){}},2500);",
    "function scheduleAutosave(){clearTimeout(autosaveT);\n"
    "  autosaveT=setTimeout(()=>{const J=buildExportJSON();\n"
    "    /* Two saves, and the local one is not a fallback for the other. This\n"
    "       file runs from file:// with no parent in every QA suite, and there\n"
    "       localStorage is the only save that exists. */\n"
    "    try{localStorage.setItem('amora-grounds-scene',JSON.stringify(J))}catch(e){}\n"
    "    if(HAND.canEdit&&!VISITOR_VIEW)shellAsk('draft-save',{scene:J,baseVersion:BASE_VERSION});\n"
    "    if(typeof renderDraftBar==='function')renderDraftBar();},2500);",
)

# The nudge told people their work lives in this browser. For someone with a
# village behind them that is now the smaller half of the truth, and the half
# they need is that nobody sees it yet.
swap(
    "    toast('Your work saves itself in this browser. ⤓ Export scene hands you the file any time.')}}",
    "    toast(HAND.canEdit\n"
    "      ?'Your work saves itself to your own draft. Nobody else sees it until you publish.'\n"
    "      :'Your work saves itself in this browser. ⤓ Export scene hands you the file any time.')}}",
)

# ------------------------------------------------------------- 7. entering build
swap(
    "$('buildBtn').onclick=()=>{buildMode=!buildMode;document.body.classList.toggle('build',buildMode);",
    "$('buildBtn').onclick=()=>{buildMode=!buildMode;document.body.classList.toggle('build',buildMode);\n"
    "  if(typeof renderDraftBar==='function')renderDraftBar();",
)

# Build mode's own words. The old ones ended at Export scene, which was the
# only door out of build mode there was.
swap(
    "    maiaSay(`<b>Build mode.</b> Drag any building to its true position, ✕ removes, the palette adds, ↩ undoes. When the map matches the land, <b>Export scene</b> writes the seed the real build grows from. Your hand becomes the ground truth.`)}",
    "    maiaSay(`<b>Build mode.</b> Drag any building to its true position, ✕ removes, the palette adds, ↩ undoes. `+\n"
    "      (HAND.canEdit\n"
    "        ?`You are editing <b>a draft</b>. The live map does not change and no other draft is touched until you press <b>Publish</b>.`\n"
    "        :`When the map matches the land, <b>Export scene</b> writes the seed the real build grows from.`)+\n"
    "      ` Your hand becomes the ground truth.`)}",
)

# ----------------------------------------------------------------- 8. the label
# `/grounds/manifest.json` verification greps this to tell live from stale. The
# FAMILY (v0.8) is what the site importer pins, so a point release inside it is
# admitted by design.
#
# ANCHOR THE FAMILY, NOT THE PREDECESSOR. This step used to read
# `BUILD_VERSION='v0.8-roundD1'` exactly, and it cost the round E lane an
# aborted script the moment this round moved the label to roundD2 underneath
# them. Then it cost this round the same way in reverse when round E shipped
# and the label became roundE. A round lands on top of whatever the previous
# one reached, so matching the family with a required count of one is both
# safer and no looser: it still refuses a file with two build labels or none.
#
# `[A-Za-z0-9]+` and no hyphen, matching patch_e9_version.py exactly, because
# the two scripts have to keep finding each other's labels. A label like
# `roundE-publish` would parse here and be invisible to theirs.
import re

_labels = re.findall(r"BUILD_VERSION='(v0\.8-[A-Za-z0-9]+)'", src)
assert len(_labels) == 1, f"expected exactly one v0.8 build label, found {_labels}"
src = src.replace(f"BUILD_VERSION='{_labels[0]}'", "BUILD_VERSION='v0.8-publish'", 1)
print(f"  build label {_labels[0]} -> v0.8-publish")

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"publish patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
