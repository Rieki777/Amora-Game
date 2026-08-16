#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
L2 OVERLAY STACK - patch g2_01: one shared band per screen edge.

THE BUG, MEASURED (qa/_probe_g2_bands.js, before this patch):
  15 of 39 scored overlay pairs intersect across five viewports.
    pocket 390x844   #maia x #toasts 366x72   #maia x #walkCard 370x204
                     #toasts x #walkCard 366x68
    desk 1440x900    #toasts x #restoreBar 420x42  #toasts x #draftBar 420x21
                     #draftBar x #restoreBar 484x21
    narrow 1100x800  #tip x #toasts 176x27  #tip x #draftBar 209x33
                     #toasts x #draftBar 420x21

THE CAUSE IS A SHARED ANCHOR EDGE, NOT A STACKING ORDER. Six overlays each
picked a literal offset from the same screen edge, none of them knowing about
the others:
    bottom edge   #maia bottom:64 (:605)   #walkCard bottom:74 (:642)
                  #toasts bottom:70 (:257) over the #pbar floor (:607)
    top edge      #draftBar top:52 (:740)  #restoreBar top:64 (:728)
                  #toasts top:64 (:251)    under the #vitals floor (:125)
No z-index value fixes that and this patch changes none. Whichever overlay wins
the stacking order still covers the other two.

WHAT IT DOES. Adds bandLayout(): each edge gets a measured floor and a running
cursor that stacks its tenants in priority order, written in the vocabulary the
file already uses - BAND_SLOT names slots the way BADGE_SLOT (:2304) names badge
angles, and the cursor walks a shared already-placed list the way platePlace
(:2786) walks a leash table against `others`.

The six CSS literals become var() reads whose FALLBACK IS THE OLD LITERAL, so if
the script block ever dies (one dropped brace kills a whole inline script here
with no error anywhere) every overlay lands exactly where it lands today.

RE-RUNNABLE, GUARDED PER EDIT. Each step tests for its own result, so a run that
landed three of four edits cannot look finished. Run it twice: the second run
prints eight skips and writes zero bytes.

  python3 patch_g2_01_bands.py
  node check_blocks.mjs grounds-v0.html
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "grounds-v0.html")

src = io.open(ART, encoding="utf-8", newline="").read()
before_bytes = len(src.encode("utf-8"))
applied = 0
skipped = 0


def step(name, old, new, guard=None, count=1):
    """One edit, one guard.

    The guard is the presence of THIS edit's own result, never a flag at the top
    of the file. A single top-of-script guard makes a run that landed three of
    four edits look finished, which is the same shape as the bug this patch
    exists to remove.

    The assert is the swarm's conflict detector. An anchor that matches zero or
    two times aborts before a byte is written, because another lane moved the
    ground under this edit.
    """
    global src, applied, skipped
    g = guard if guard is not None else new
    if g in src:
        print("  skip   %s" % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, "%s: anchor appears %d times, expected %d" % (name, n, count)
    src = src.replace(old, new, count)
    applied += 1
    print("  apply  %s" % name)


# --------------------------------------------------------------------------
# The band itself. Inserted ahead of the tooltip primitive so bandBox() is
# defined before the tip code that reads it, though the tip reads it at hover
# time and not at parse time.
# --------------------------------------------------------------------------

BAND_JS = r"""/* ---------- L2: THE SHARED BAND ----------
   Three overlays anchored themselves to the same screen edge and none of them
   knew about the others. On a phone: #maia at bottom:64 (:605), #walkCard at
   bottom:74 (:642), #toasts at bottom:70 (:257), three things measuring from the
   viewport bottom onto one strip above the pocket bar. Under the vitals bar the
   same story: #draftBar at top:52, #restoreBar at top:64, #toasts at top:64.
   Measured across five viewports that was 15 intersecting pairs, up to 370x204px
   of one card buried under another.

   NO Z-INDEX VALUE FIXES THIS and this block changes none. Whichever overlay
   wins the stacking order still covers the other two. The collision is that they
   share an anchor edge, so they have to share it on purpose.

   Written in the vocabulary already in this file: BAND_SLOT names its slots the
   way BADGE_SLOT (:2304) names badge angles, and placement walks a running
   cursor over the tenants already placed, the way platePlace (:2786) walks its
   leash table against `others`. Order inside a band IS the priority. Floor
   first, so the thing nearest the thumb is the thing that never moves.

   THE FLOOR IS MEASURED, NEVER ARITHMETIC. #pbar carries
   padding-bottom:env(safe-area-inset-bottom) (:609), so its rect already
   includes the home indicator on the phones that have one, and #vitals is 46px
   tall on a desk against 35 on a phone. Every literal you could write here is
   wrong on some device. The rect is right on all of them.

   IT PUBLISHES, IT DOES NOT POSITION. Every value lands as a custom property on
   the ROOT element and every CSS rule reading one keeps its old literal as the
   var() fallback. If this block ever dies the layout is exactly what it was
   before the band existed: bad, and not broken. */
const BAND_SLOT = {
  /* Laid out first, because the bottom band's ceiling is wherever this one
     stopped. */
  top:{floor:'vitals',pad:6,gap:6,tenants:[
    {id:'draftBar',  v:'--band-t-draft'},
    {id:'restoreBar',v:'--band-t-restore'},
    {id:'toasts',    v:'--band-t-toasts',only:'desk'}]},
  /* Pocket only. On a desk #maia is a card docked in the right corner and
     #pbar is not drawn at all, so there is no shared bottom edge to arbitrate
     and moving anything there would be a change nothing measured asked for. */
  bottom:{floor:'pbar',only:'pocket',pad:10,gap:8,tenants:[
    {id:'maia',    v:'--band-b-maia'},
    {id:'walkCard',v:'--band-b-walk'},
    {id:'toasts',  v:'--band-b-toasts',only:'pocket'}]},
};
/* #toasts is a tenant of both bands because which edge it hangs from is a
   profile question: the top band on a desk, the strip above the pocket bar on a
   phone. `only` decides, and the band it is not in has its property removed. */

/* Opacity counts. body.intro (:801) fades #maia and #toasts to zero without
   hiding them, and a band that treats a fully transparent card as a tenant
   reserves a strip of screen for something nobody can see. The threshold is a
   threshold and not a test against "0" on purpose: these fade over .9s (:800),
   and an exact test lands on either side of the fade depending on which
   millisecond it runs, which is a bug this lane already hit once in its own
   probe. */
function bandShown(el){
  if(!el)return false;
  const cs=getComputedStyle(el);
  if(cs.display==='none'||cs.visibility==='hidden')return false;
  if(parseFloat(cs.opacity||'1')<0.05)return false;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0}

let BAND_BOX={top:null,bottom:null},BAND_SIG='',bandWarned=false;

/* One edge. `limit` is the furthest a tenant's far side may reach, measured in
   the band's own offset space from its own edge, and it is the reason nothing
   here can walk off the screen. Returns where each tenant goes, which properties
   to drop, the box the band ended up occupying in viewport coordinates, and how
   far the stack wanted to run past the room it had. */
function bandPlace(B,key,pocket,pad,gap,limit){
  const set={},clear=[];
  if((B.only==='pocket'&&!pocket)||(B.only==='desk'&&pocket)){
    for(const t of B.tenants)clear.push(t.v);
    return {set,clear,box:null,base:0,over:0}}
  const fl=document.getElementById(B.floor);
  /* A hidden floor is a zero floor. #pbar is display:none off pocket (:606) and
     the band then starts at the screen edge instead of 60px up from it. */
  const fr=bandShown(fl)?fl.getBoundingClientRect():null;
  const base=fr?(key==='bottom'?Math.round(innerHeight-fr.top):Math.round(fr.bottom)):0;
  let cur=base+pad,lo=null,hi=null,want=base+pad;
  for(const t of B.tenants){
    if((t.only==='pocket'&&!pocket)||(t.only==='desk'&&pocket)){clear.push(t.v);continue}
    const el=document.getElementById(t.id);
    if(!bandShown(el)){clear.push(t.v);continue}
    const h=Math.round(el.getBoundingClientRect().height);
    /* NEVER OFF THE SCREEN. A stack can only grow away from its floor, so a
       stack taller than its room pushes the tenants at the top of it clean out
       of the viewport. MEASURED at 360x500 with an unclamped stack, the toast
       column sat at y=-92: not overlapping, gone. Clamping gives up the
       no-overlap guarantee in order to keep everything visible, which is the
       right way round, and it says so through data-band-overflow instead of
       quietly. */
    const place=Math.max(base,Math.min(cur,limit-h));
    set[t.v]=place+'px';
    lo=(lo===null)?place:Math.min(lo,place);
    hi=(hi===null)?place+h:Math.max(hi,place+h);
    cur=place+h+gap;
    want+=h+gap}
  const box=lo===null?null:(key==='bottom'
    ?{top:Math.round(innerHeight-hi),bottom:Math.round(innerHeight-lo)}
    :{top:lo,bottom:hi});
  /* What the stack WANTED, against what it had. Zero on every viewport it fits
     on, and the exact shortfall on the ones it does not. Computed from the
     unclamped total on purpose: after clamping, the placed box always fits, so
     measuring the box would report a comfortable zero on the very screens where
     tenants are sitting on top of each other. */
  const over=lo===null?0:Math.max(0,(want-gap)-limit);
  return {set,clear,box,base,over}}

function bandLayout(){
  const root=document.documentElement,body=document.body;
  const pocket=body.classList.contains('pocket');
  const write={},drop=[];
  let ceiling=null,over=0;
  for(const key of ['top','bottom']){
    const B=BAND_SLOT[key];
    /* The top band may not run off the bottom of the screen; the bottom band may
       not run up under the ceiling the top band just established. */
    const limit=key==='bottom'?Math.max(0,innerHeight-ceiling):innerHeight;
    let r=bandPlace(B,key,pocket,B.pad,B.gap,limit);
    /* Tighten before you complain. Padding is the cheapest thing to spend, and a
       short phone is where it gets spent: the three bottom tenants run 514px to
       556px of content depending on how the engine wraps the walk card, against
       667px of screen with a 60px floor under it. Whether this pass fires is
       therefore engine-dependent at the same viewport, which is exactly why it
       is a measured retry and not a hardcoded smaller padding. */
    if(r.over>0)r=bandPlace(B,key,pocket,2,2,limit);
    Object.assign(write,r.set);
    for(const v of r.clear)drop.push(v);
    BAND_BOX[key]=r.box;
    /* The ceiling is the lower of the vitals bar and whatever the top band grew
       to. Using the box alone would put the ceiling at the top of the screen
       whenever the top band is empty, which is most of the time on a phone, and
       the vitals bar is still sitting there. */
    if(key==='top')ceiling=Math.max(r.base,r.box?r.box.bottom:0)+6;
    else over=r.over}
  for(const v in write)root.style.setProperty(v,write[v]);
  /* removeProperty, not setProperty(v,''): an empty value is still a value, and
     the CSS fallback only comes back when the property is genuinely gone. */
  for(const v of drop)root.style.removeProperty(v);
  if(over>0){
    /* The attribute carries the live number; the warning fires once so a phone
       held in landscape does not fill the console. Anything reading this should
       read the attribute, not the warning. */
    body.dataset.bandOverflow=String(over);
    if(!bandWarned){bandWarned=true;
      console.warn('band: the bottom stack wants '+over+'px more than the room above its floor. '
        +'Everything stays on screen, clamped against the ceiling, so tenants overlap. '
        +'Live figure is in body[data-band-overflow].')}}
  else if(body.dataset.bandOverflow)delete body.dataset.bandOverflow;
  /* ON CHANGE ONLY. Anything anchored against the band has to hear when the band
     moves, because a band tenant can grow after its neighbour has already placed
     itself: measured at 1100x800, the toast column was 37px tall when a tooltip
     stepped around it and 72px a moment later. A listener is allowed to call
     back in here, so an unconditional event would let the two bounce off each
     other for as long as the page is open. */
  const sig=JSON.stringify(write)+'|'+drop.join(',')+'|'+over;
  if(sig!==BAND_SIG){BAND_SIG=sig;dispatchEvent(new CustomEvent('band:layout'))}}

let bandQ=0;
function bandSoon(){if(bandQ)return;bandQ=requestAnimationFrame(()=>{bandQ=0;bandLayout()})}
window.bandLayout=bandLayout;window.bandSoon=bandSoon;
/* A copy, so a reader cannot edit the band's own record of where it put things. */
window.bandBox=function(which){const b=BAND_BOX[which];return b?{top:b.top,bottom:b.bottom}:null};

(function bandWatch(){
  const ids=['pbar','vitals','maia','walkCard','toasts','draftBar','restoreBar'];
  const els=ids.map(i=>document.getElementById(i)).filter(Boolean);
  /* Height is the input this cannot guess: a toast column grows and shrinks as
     toasts arrive and expire (:3124), and the walk card is a different height at
     every step. */
  if(typeof ResizeObserver==='function'){const ro=new ResizeObserver(bandSoon);for(const el of els)ro.observe(el)}
  /* CLASS ONLY, and on BODY, while bandLayout publishes on the ROOT. Watching
     style here, or publishing onto body, would make every layout schedule the
     next one forever. */
  new MutationObserver(bandSoon).observe(document.body,{attributes:true,attributeFilter:['class']});
  /* #restoreBar carries an inline style="display:none" (:995) that app code
     flips to flex, which is an attribute change and not a resize. */
  for(const el of els)new MutationObserver(bandSoon).observe(el,{attributes:true,attributeFilter:['class','style']});
  const tb=document.getElementById('toasts');
  if(tb)new MutationObserver(bandSoon).observe(tb,{childList:true});
  /* An opacity fade fires no observer at all. body.intro lifts over .9s (:800),
     so without this the band would keep its boot-time answer, computed while
     half the tenants were still invisible, for the rest of the session. */
  addEventListener('transitionend',e=>{if(e.target&&ids.indexOf(e.target.id)>=0)bandSoon()},true);
  addEventListener('resize',bandSoon);addEventListener('orientationchange',bandSoon);
  bandLayout()})();

"""

TIPS_HDR = "/* tooltips — one primitive, the house voice (A7) */"

# --------------------------------------------------------------------------
print("patch_g2_01_bands.py  ->  %s" % ART)
print("  file: %d bytes" % before_bytes)

# 1..6  the six literals become var() reads. Every fallback is today's value.
step(
    "1 CSS #toasts top (desk/top band)",
    "#toasts{position:absolute;top:64px;",
    "#toasts{position:absolute;top:var(--band-t-toasts,64px);",
)
step(
    "2 CSS #toasts bottom (pocket/bottom band)",
    "body.pocket #toasts{top:auto;bottom:calc(70px + env(safe-area-inset-bottom,0px));width:min(94vw,420px)}",
    "body.pocket #toasts{top:auto;bottom:var(--band-b-toasts,calc(70px + env(safe-area-inset-bottom,0px)));width:min(94vw,420px)}",
)
step(
    "3 CSS #maia bottom (pocket sheet)",
    "body.pocket.msheet #maia{display:block;left:0;right:0;bottom:64px;",
    "body.pocket.msheet #maia{display:block;left:0;right:0;bottom:var(--band-b-maia,64px);",
)
step(
    "4 CSS #walkCard bottom",
    "#walkCard{position:fixed;left:10px;right:10px;bottom:74px;",
    "#walkCard{position:fixed;left:10px;right:10px;bottom:var(--band-b-walk,74px);",
)
step(
    "5 CSS #draftBar top",
    "#draftBar{position:absolute;top:52px;",
    "#draftBar{position:absolute;top:var(--band-t-draft,52px);",
)
step(
    "6 CSS #restoreBar top",
    "#restoreBar{position:absolute;top:64px;",
    "#restoreBar{position:absolute;top:var(--band-t-restore,64px);",
)

# 7  the band itself
step(
    "7 JS bandLayout + observers",
    TIPS_HDR,
    BAND_JS + TIPS_HDR,
    guard="function bandLayout(){",
)

# 8  the tooltip stops flipping into the top band
step(
    "8 JS #tip clears the top band",
    "let y=r.top-h-9;if(y<6)y=r.bottom+9;",
    "let y=r.top-h-9;if(y<6)y=r.bottom+9;\n"
    "    /* A tip flipped below a vital lands in the top band, where the draft\n"
    "       bar, the restore bar and the news line live. Push past the band, but\n"
    "       only for an anchor the band can actually reach, or a tip on a\n"
    "       mid-screen control would leap to the top of the page to clear a strip\n"
    "       nowhere near it.\n"
    "       LAY THE BAND OUT FIRST. bandLayout runs in a rAF, so the box is up to\n"
    "       a frame stale, and a tip shown in the same task as the thing that\n"
    "       moved the bars reads the PREVIOUS answer and flips straight into\n"
    "       them. Measured: with the read alone, a tip on a vital at 1100x800\n"
    "       still landed at y=43 inside a band occupying 41..152. It costs seven\n"
    "       rect reads on hover.\n"
    "       Both are reached through typeof because a dead script block leaves\n"
    "       them undeclared identifiers, not undefined properties. */\n"
    "    if(typeof bandLayout==='function')bandLayout();\n"
    "    const bb=(typeof bandBox==='function')?bandBox('top'):null;\n"
    "    if(bb&&r.top<=bb.bottom&&y<bb.bottom&&y+h>bb.top)y=bb.bottom+9;",
    guard="if(typeof bandLayout==='function')bandLayout();",
)

# 9  the tooltip follows the band when the band moves under it
step(
    "9 JS #tip re-places on band:layout",
    "  const hide=()=>{tp.classList.remove('show');cur=null};",
    "  const hide=()=>{tp.classList.remove('show');cur=null};\n"
    "  /* Stepping around the band once is not enough: a band tenant can grow\n"
    "     after the tip has already placed itself. Measured at 1100x800, the\n"
    "     toast column stood 37px tall when a tip on a vital cleared it and 72px\n"
    "     a moment later, which put the news line back over the tip by 26px.\n"
    "     THE FLAG IS THE WHOLE SAFETY ARGUMENT. show() lays the band out, a\n"
    "     layout that changed anything fires this, and this calls show(). Without\n"
    "     the flag those two call each other for as long as the page is open. */\n"
    "  let tipRelay=false;\n"
    "  addEventListener('band:layout',()=>{\n"
    "    if(tipRelay||!cur||!tp.classList.contains('show'))return;\n"
    "    tipRelay=true;try{show(cur)}finally{tipRelay=false}});",
    guard="let tipRelay=false;",
)

# --------------------------------------------------------------------------
after_bytes = len(src.encode("utf-8"))
if applied:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)
    print("  wrote %d bytes (%+d)" % (after_bytes, after_bytes - before_bytes))
else:
    print("  no write: nothing to apply (%d bytes unchanged)" % before_bytes)

print("  applied %d, skipped %d" % (applied, skipped))
sys.exit(0)
