#!/usr/bin/env python3
"""The site lane reviewed the bridge contract and found five things. All five.

  1. ORDERING, which was a real bug. Nothing correlated a reply to a post, so
     toggling on-off-on inside the four-second window let a late reply for an
     earlier post apply its undo over a newer intent, and the map would show a
     state the reader had already changed their mind about. Every post now
     carries a nonce and the map ignores any reply that is not answering the
     post it is currently waiting on.

  2. QUEST IDENTITY. The map was emitting `slugify(title)` and the site would
     have had to compute the same slug to match, which is two slugify
     implementations that must agree forever and unmatch on the first title
     edit. Quests carry a stable `key` now: derived from the title ONCE, then
     kept even when the title changes, exported, restored, and sent in the
     claim post. The site stores it and never computes it.

  3. `gone` was going to be the common case rather than the rare one, because
     every event id the map sends is scene sample data and a village that has
     not imported has no row at all. `not-here` says that calmly and means
     something different from "this was deleted".

  4. One more reason: `not-yet`. The route answers 401 for nobody signed in
     and 403 for signed in but not permitted, and those need different words.
     Signing in cannot solve the second one.

  5. THE VOCABULARY EDITOR WOULD HAVE FED THEIR SANITISER GARBAGE. It drops a
     medium WHOLE if the key is not a plain identifier, the colour is not
     six-digit hex, or the name runs long, and it drops it silently. The
     editor now generates the key itself, caps it at their 32, caps names at
     48, refuses the 25th type, and refuses a name that cannot make a key at
     all. Same for phase names.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d6b_contract.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def rep(anchor, addition, where="after", count=1):
    global src
    n = src.count(anchor)
    assert n == count, f"anchor appears {n} times, expected {count}: {anchor[:70]!r}"
    src = src.replace(anchor, anchor + addition if where == "after" else addition + anchor, 1)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ── 2. A quest carries its own key, once, forever ────────────────────────
swap(
    """const questId=q=>slugify(typeof q==='string'?q:(q&&q.q));
window.questId=questId;""",
    """/* A quest's identity is a field, not a computation. The site stores exactly
   what the map sends and never derives it, so there is one slugify in the
   world and a title edit cannot unmatch anything. Derived from the title the
   first time it is needed, then kept even when the title changes.
   The site's sanitiser wants a plain identifier of at most 32. */
function questKey(q){
  if(typeof q==='string')q=SCENE.quests.find(x=>x.q===q)||{q};
  if(q&&q.key)return q.key;
  const base=slugify(q&&q.q).slice(0,32)||'quest';
  let k=base,n=1;
  while(SCENE.quests.some(x=>x!==q&&x.key===k))k=(base+'-'+(++n)).slice(0,32);
  if(q&&typeof q==='object')q.key=k;
  return k}
window.questKey=questKey;
const questId=questKey;
window.questId=questId;
/* Every seeded quest gets its key at boot, so an export written before anyone
   claims anything already carries them. */
(function seedQuestKeys(){for(const q of SCENE.quests)questKey(q)})();""",
)
swap(
    """  if(kind==='quest')return 'quest:'+slugify(x&&x.q);""",
    """  if(kind==='quest')return 'quest:'+((typeof questKey==='function')?questKey(x):slugify(x&&x.q));""",
)
swap(
    """      weight:x.weight||null, // null means read it from the need text, which is what the map does""",
    """      key:questKey(x), // the site stores this and never computes it
      weight:x.weight||null, // null means read it from the need text, which is what the map does""",
)
swap(
    """  SCENE.quests=(J.quests||[]).map(r=>({q:r.title,at:(r.structure_key&&BY[r.structure_key])?r.structure_key:null,r:r.reward,need:r.need,""",
    """  SCENE.quests=(J.quests||[]).map(r=>({q:r.title,key:r.key||undefined,at:(r.structure_key&&BY[r.structure_key])?r.structure_key:null,r:r.reward,need:r.need,""",
)
rep(
    """  if(Array.isArray(J.forum_threads))SCENE.threads=J.forum_threads.map(t=>({id:t.id,title:t.title,""",
    """  SCENE.quests.forEach(q=>questKey(q)); // an import from before keys existed gets them now
""",
    where="before",
)
# a quest written from the resolver gets its key with everything else
swap(
    """  SCENE.quests.push({q:q.text.trim(),at:r.key,r:'20 ♥',need:'hands welcome',""",
    """  SCENE.quests.push({q:q.text.trim(),key:slugify(q.text.trim()).slice(0,32),at:r.key,r:'20 ♥',need:'hands welcome',""",
)

# ── 1. A nonce, so a late reply cannot speak for a newer intent ──────────
swap(
    """const PROMISE_PENDING={};
function promiseWatch(kind,id,undo){
  const k=kind+':'+id,p=PROMISE_PENDING[k];
  if(p)clearTimeout(p.t);
  PROMISE_PENDING[k]={undo,t:setTimeout(()=>{delete PROMISE_PENDING[k]},4000)}}
window.promiseWatch=promiseWatch;""",
    """const PROMISE_PENDING={};
let PROMISE_N=0;
/* One string per post, echoed back untouched. Toggle on-off-on inside the
   window and three replies arrive; without this the first one home wins and
   the map shows a state the reader already changed their mind about. */
function promiseNonce(){return 'p'+(++PROMISE_N)+'-'+(performance.now()|0)}
window.promiseNonce=promiseNonce;
function promiseWatch(kind,id,nonce,undo){
  const k=kind+':'+id,p=PROMISE_PENDING[k];
  if(p)clearTimeout(p.t);
  PROMISE_PENDING[k]={nonce,undo,t:setTimeout(()=>{delete PROMISE_PENDING[k]},4000)}}
window.promiseWatch=promiseWatch;""",
)
swap(
    """const PROMISE_WHY={
  anonymous:'Sign in and this is yours to keep.',
  full:'That one is full. The door stays open for the next.',
  closed:'That has closed. The door stays open for the next.',
  gone:'That is no longer on the board.',
  error:'That did not save. Try again in a moment.'};""",
    """const PROMISE_WHY={
  anonymous:'Sign in and this is yours to keep.',
  'not-yet':'Your account cannot take this one yet. A steward can open it for you.',
  full:'That one is full. The door stays open for the next.',
  closed:'That is not open to anyone right now.',
  /* The map ships a sample village. Until someone imports the scene the site
     has no row for any of it, and that is the ordinary state of a fresh fork
     rather than something going wrong. */
  'not-here':'This one lives on the map for now. It joins the village when a steward brings the scene across.',
  gone:'That is no longer on the board.',
  error:'That did not save. Try again in a moment.'};""",
)
swap(
    """function promiseResult(d){
  const k=d.kind+':'+d.id,p=PROMISE_PENDING[k];
  if(p){clearTimeout(p.t);delete PROMISE_PENDING[k]}""",
    """function promiseResult(d){
  const k=d.kind+':'+d.id,p=PROMISE_PENDING[k];
  /* Not the post we are waiting on: a straggler from an intent the reader has
     already replaced. Dropping it is the whole point of the nonce. */
  if(!p||(d.nonce&&p.nonce&&d.nonce!==p.nonce))return;
  clearTimeout(p.t);delete PROMISE_PENDING[k];""",
)
swap(
    """  if(p&&p.undo)p.undo();
  toast(PROMISE_WHY[d.reason]||PROMISE_WHY.error);""",
    """  if(p.undo)p.undo();
  toast(PROMISE_WHY[d.reason]||PROMISE_WHY.error);""",
)
swap(
    """  bridgePost({type:'rsvp',id,title:e.title,on});
  promiseWatch('rsvp',id,()=>{ // put it back exactly, without posting again""",
    """  const nonce=promiseNonce();
  bridgePost({type:'rsvp',id,title:e.title,on,nonce});
  promiseWatch('rsvp',id,nonce,()=>{ // put it back exactly, without posting again""",
)
swap(
    """  bridgePost({type:'claim',id,on});
  promiseWatch('claim',id,()=>{""",
    """  const nonce=promiseNonce();
  bridgePost({type:'claim',id,on,nonce});
  promiseWatch('claim',id,nonce,()=>{""",
)

# ── 5. The editor cannot hand their sanitiser something it will drop ─────
swap(
    """  const keep=()=>{
    const name=n.value.trim();if(!name)return renderMediaVocab();
    const color=box.querySelector('.vmc').value,glyph=box.querySelector('.vmg').value;
    if(add){const key=slugify(name);
      if(L.some(x=>x.key===key))return toast('That type already exists.');
      L.push({key,name,color,glyph});logEdit('vocab','media:+',{added:key})}""",
    """  const keep=()=>{
    /* The site's sanitiser drops a medium WHOLE if the key is not a plain
       identifier, the colour is not six-digit hex or the name runs long, and
       it drops it in silence. So the key is machine-made and never typed, the
       name is capped, and a name that cannot make a key is refused here where
       a person can see it. */
    const name=n.value.trim().slice(0,48);if(!name)return renderMediaVocab();
    const color=box.querySelector('.vmc').value,glyph=box.querySelector('.vmg').value;
    if(add){const key=slugify(name).slice(0,32);
      if(!key)return toast('Give it a name with letters or numbers in it, so the map has something to file it under.');
      if(L.length>=24)return toast('Twenty four kinds of moving thing is the most a village can carry.');
      if(L.some(x=>x.key===key))return toast('That type already exists.');
      L.push({key,name,color,glyph});logEdit('vocab','media:+',{added:key})}""",
)
swap(
    """      if(e.key==='Enter'){const v=inp.value.trim();
        if(v&&v!==phaseName(nn)){SCENE.vocabulary.phases[nn]=v;logEdit('vocab','phase:'+nn,{to:v});""",
    """      if(e.key==='Enter'){const v=inp.value.trim().slice(0,48); // the site caps phase names at 48
        if(v&&v!==phaseName(nn)){SCENE.vocabulary.phases[nn]=v;logEdit('vocab','phase:'+nn,{to:v});""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"contract amendments patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
