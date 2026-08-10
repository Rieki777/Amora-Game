#!/usr/bin/env python3
"""Round D, amendment A1: the badges become reachable, and stop touching.

Measured against the P1 artifact before this patch, at cam.z 1.7 with 28 seals
on screen: SIX were the top element at their own centre. The other 22 were
covered by the building they belong to (`.poi` carries an inline z-index of
1000+y inside `#icons`, while `.bgroup` sat at z-index 1) or by a label
(`#banners` is z-index 11, above `#icons` at 10). The star was worse than
unclickable by accident: it lived inside the poi with `pointer-events:none`.

So, in order:

  the layer     badges move to their own `#badges` plane above the labels, and
                the order Rye asked for holds: badge, then label, then building
  the ring      fixed anchors put quest and invite on the same point and seat
                16 px from it; slots are now angles on a ring whose radius is
                solved per building so the two closest marks in use cannot
                touch. Non-overlap by construction, not by hoping.
  the cluster   when a building is too small to carry its ring, the marks
                collapse into one seal with a count. It fans in P3.
  the star      folds into the seal system: same face, same hit area, opens
                the event card, and keeps its ev-u* urgency by wearing the
                class itself instead of inheriting it from the poi.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d2_badges.py [grounds-v0.html]
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


# ── 1. A plane of their own, above the labels ────────────────────────────
swap(
    '<div id="banners"></div>\n',
    '<div id="banners"></div>\n<div id="badges"></div>\n',
)
rep(
    "  #banners{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:11}\n",
    "  /* Badges sit above the labels, which sit above the buildings: the order\n"
    "     a tap resolves in. The plane itself is deaf; only the seals hear. */\n"
    "  #badges{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:12}\n",
)
swap(
    """  #icons .bgroup{position:absolute;left:0;top:0;pointer-events:none;z-index:1;
    opacity:0;transition:opacity .28s ease;will-change:transform,opacity}
  #icons .bgroup.on{opacity:.6}""",
    """  #badges .bgroup{position:absolute;left:0;top:0;pointer-events:none;
    opacity:0;transition:opacity .28s ease;will-change:transform,opacity}
  #badges .bgroup.on{opacity:.6}
  /* Too small a building to carry its ring: one seal, one number, and the
     marks it stands for wait behind it. */
  .bgroup .b-more{display:none}
  .bgroup.clustered .bseal{display:none}
  .bgroup.clustered .b-more{display:block}
  .bseal .cnum{fill:var(--ink);font:600 10px/1 Georgia,serif;text-anchor:middle}""",
)

# The lantern leaves the poi. Its urgency vocabulary comes with it, worn by
# the seal instead of inherited from the building, so the animation survives
# the move and `evp` keeps its meaning.
swap(
    """  .poi .evbadge{position:absolute;right:-8px;top:-10px;width:22px;height:22px;pointer-events:none;display:none;
    transform-origin:50% 50%}
  .poi.hasev .evbadge{display:block}
  .evbadge svg{width:100%;height:100%;filter:drop-shadow(0 0 3px rgba(255,214,120,.8))}
  .ev-u0 .evbadge{animation:evp 3.4s ease-in-out infinite;opacity:.55}
  .ev-u1 .evbadge{animation:evp 2.4s ease-in-out infinite;opacity:.75}
  .ev-u2 .evbadge{animation:evp 1.5s ease-in-out infinite;opacity:.92}
  .ev-u3 .evbadge{animation:evp .8s ease-in-out infinite;opacity:1}
  .ev-u3 .evbadge svg{filter:drop-shadow(0 0 7px rgba(255,222,132,1))}""",
    """  .bseal.evbadge svg{filter:drop-shadow(0 0 3px rgba(255,214,120,.55))}
  .bseal.ev-u0{animation:evp 3.4s ease-in-out infinite;opacity:.62}
  .bseal.ev-u1{animation:evp 2.4s ease-in-out infinite;opacity:.8}
  .bseal.ev-u2{animation:evp 1.5s ease-in-out infinite;opacity:.94}
  .bseal.ev-u3{animation:evp .8s ease-in-out infinite;opacity:1}
  .bseal.ev-u3 svg{filter:drop-shadow(0 0 7px rgba(255,222,132,.95))}""",
)
# The seal breathes about its own centre; the old element hung off a corner.
swap(
    "  @keyframes evp{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}",
    "  @keyframes evp{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}",
)
swap(
    "    .evbadge,#loomWires .lw.staged,#orgSvg .ovac,.poi.talk{animation:none!important}",
    "    .bseal,#loomWires .lw.staged,#orgSvg .ovac,.poi.talk{animation:none!important}",
)

# ── 2. The star stops being furniture inside the building ────────────────
swap(
    """  el.insertAdjacentHTML('beforeend','<span class="evbadge"><svg viewBox="0 0 24 24"><path fill="#ffd98a" stroke="#8a6a33" stroke-width="1" d="M12 3l2.1 4.4 4.9.7-3.5 3.4.8 4.9-4.3-2.3-4.3 2.3.8-4.9L5 8.1l4.9-.7z"/></svg></span>');\n""",
    "",
)
swap(
    """      /* The lantern stays inside the poi where the design and the door suite
         both want it, and is counter-scaled so it matches the other four
         instead of growing with whatever it is pinned to. */
      const ev=p.querySelector('.evbadge');
      if(ev){const ps=(iso||painted)?k*1.35*sc:k*(window.GSCALE||1);
        ev.style.transform=ps?`scale(${(1/ps).toFixed(3)})`:'';}
      /* three braces close, in order: if(ev) above, then if(!hideP), then the
         `for (const s of SCENE.structures)` this whole block lives in. The
         original line ended `)}}` and dropping one of them is a silent dead
         script, not an error the browser will point at. */
      }}""",
    """      /* The lantern used to live in here and be counter-scaled out of the
         building's own transform. It is a seal now, in the badge plane with
         the rest, so there is nothing left to undo. */
      }}""",
)

# ── 3. Slots on a ring, solved per building ──────────────────────────────
swap(
    "const BADGE_ANCHOR = { quest:[-0.62,0.34], seat:[-0.72,-0.06], talk:[-0.5,-0.52], invite:[-0.62,0.34] };",
    """/* Slots are angles, not points: door, window, chimney, roofline, read
   anticlockwise from the lower left. Degrees, measured the way a compass
   rose is, then flipped for screen y. Kind always takes the same seat, so a
   reader learns where to look once. */
const BADGE_SLOT = { quest:215, invite:215, seat:165, talk:115, event:55 };
/* The ring is solved for the HIT footprint, not the ink. Two 22 px seals
   stop touching at 26 px apart, but their 44 px targets keep overlapping
   until 44, and an overlapping target means the neighbour answers your tap.
   Measured: at 26 the wrong seal won two of every thirty-six. */
const BADGE_GAP = 44;
/* The radius that keeps the two closest slots in use apart. Chord geometry:
   two points on a ring of radius R, d degrees apart, sit gap = 2R sin(d/2)
   apart, so R = gap / (2 sin(d/2)). Same slot twice means no radius works,
   which the caller reads as "cluster". */
function badgeRing(kinds,gap){
  let need=0;
  for(let a=0;a<kinds.length;a++)for(let b=a+1;b<kinds.length;b++){
    let d=Math.abs((BADGE_SLOT[kinds[a]]||215)-(BADGE_SLOT[kinds[b]]||215));
    if(d>180)d=360-d;
    need=Math.max(need, d?gap/(2*Math.sin(d*Math.PI/360)):Infinity);
  }
  return need;
}""",
)

# ── 4. The event joins the set, and a cluster waits behind them ──────────
swap(
    """    if(th.length) marks.push({kind:'talk',tint:'',pips:0,rim:'r-soft',braid:false,n:th.length});""",
    """    if(th.length) marks.push({kind:'talk',tint:'',pips:0,rim:'r-soft',braid:false,n:th.length});
    /* The star was the one mark nobody could tap: it lived inside the
       building with pointer-events off. Here it is one of the five, with the
       same face and the same 44 px target, wearing its own urgency. */
    const ev=(typeof eventsAt==='function')?eventsAt(s.key):[];
    if(ev.length) marks.push({kind:'event',tint:'',pips:0,rim:'',braid:false,n:ev.length,
      extra:'evbadge '+((typeof evU==='function')?evU(Math.min(...ev.map(e=>e.days))):'')});""",
)
swap(
    """    const want=marks.map(m=>m.kind).join(',');
    if(g.dataset.sig!==want+'|'+marks.map(m=>m.pips+m.rim+m.tint).join(',')){
      g.innerHTML=marks.map(m=>{
        const cls=['bseal','b-'+m.kind,m.rim,m.braid?'r-braid':''].filter(Boolean).join(' ');
        const tint=m.tint?` style="--btint:${m.tint}"`:'';
        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+
               badgeSvg(m.kind,m.pips?badgePips(m.pips):'')+`</span>`;
      }).join('');
      g.dataset.sig=want+'|'+marks.map(m=>m.pips+m.rim+m.tint).join(',');
    }""",
    """    /* One seal stands for the whole ring when the building is too small to
       hold it apart. It is built every time and hidden by CSS until the
       placement pass asks for it, because the decision depends on the
       camera and this function does not run per frame. */
    const total=marks.reduce((n,m)=>n+(m.n||0),0)||marks.length;
    const sig=marks.map(m=>m.kind+m.pips+m.rim+m.tint+(m.extra||'')).join(',')+'|'+total;
    if(g.dataset.sig!==sig){
      g.innerHTML=marks.map(m=>{
        const cls=['bseal','b-'+m.kind,m.rim,m.braid?'r-braid':'',m.extra||''].filter(Boolean).join(' ');
        const tint=m.tint?` style="--btint:${m.tint}"`:'';
        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+
               badgeSvg(m.kind,m.pips?badgePips(m.pips):'')+`</span>`;
      }).join('')+
      `<span class="bseal b-more" data-bk="${s.key}" data-bkind="more"><svg viewBox="0 0 24 24">`+
      BADGE_FACE+`<text class="cnum" x="12" y="15.6">${total>9?'9+':total}</text></svg><span class="bhit"></span></span>`;
      g.dataset.sig=sig;
    }
    g.dataset.kinds=marks.map(m=>m.kind).join(',');""",
)

# ── 5. Placement: solve the ring, or collapse it ─────────────────────────
swap(
    """        if(show){
          const off=(s._crownOff||30)*0.72;
          bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;
          let i=0;
          for(const seal of bg.children){
            const a=BADGE_ANCHOR[seal.dataset.bkind]||BADGE_ANCHOR.quest;
            seal.style.left=(a[0]*off)+'px';
            seal.style.top=(a[1]*off)+'px';
            i++;
          }
        }""",
    """        if(show){
          const off=(s._crownOff||30)*0.72;
          bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;
          const kinds=(bg.dataset.kinds||'').split(',').filter(Boolean);
          const need=badgeRing(kinds,BADGE_GAP); // the target stays 44 at both seal sizes
          /* A building carries its marks as far out as its own crown, and a
             little further when the ring asks for it. Past that the ring
             would float free of the building it belongs to, so the marks
             collapse into one instead. */
          const R=Math.max(off,need,20), Rmax=Math.max(off*1.8,30);
          const clustered=need>Rmax;
          bg.classList.toggle('clustered',clustered);
          if(clustered){
            const more=bg.querySelector('.b-more');
            if(more){const r=Math.max(off,20);more.style.left=(-0.82*r)+'px';more.style.top=(0.57*r)+'px'}
          } else {
            for(const seal of bg.children){
              const a=(BADGE_SLOT[seal.dataset.bkind]!==undefined?BADGE_SLOT[seal.dataset.bkind]:215)*Math.PI/180;
              seal.style.left=(Math.cos(a)*R)+'px';
              seal.style.top=(-Math.sin(a)*R)+'px'; // screen y grows downward
            }
          }
        }""",
)

# ── 6. A tap on a mark opens what the mark is about ──────────────────────
rep(
    "window.refreshBadges=refreshBadges;\n",
    r"""/* Delegated, because the seals are rebuilt whenever the projections move.
   stopPropagation keeps the building's own click from firing underneath: the
   badge is the more specific answer to the same tap. */
const BADGE_TAB={quest:1,invite:1,seat:2,talk:0,event:0,more:0};
$('badges').addEventListener('click',e=>{
  const seal=e.target.closest('.bseal');if(!seal)return;
  e.stopPropagation();
  const key=seal.dataset.bk,kind=seal.dataset.bkind;const s=BY[key];if(!s)return;
  window.hap&&hap(6);
  if(kind==='more'){travelTo(s.x,s.y,Math.max(cam.z,1.6));return} // closer, where the ring opens
  (typeof buildMode!=='undefined'&&buildMode?openInspect:openPanel)(key,BADGE_TAB[kind]||0);
});
""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D2 A1 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
