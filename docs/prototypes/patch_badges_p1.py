#!/usr/bin/env python3
"""P1 of the badge language: one seal, five charges, placed and zoom-gated.

The look only. Tapping, deep links, the calm system and founder toggles are
P2-P4; this lands what Rye blesses from a screenshot.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_badges_p1.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
# Text mode would translate every newline on the way in and back out, so a
# one-anchor edit would rewrite all of this LF file as CRLF. The artifact is
# `-text` in .gitattributes: bytes in, same bytes out. Keep newline="".
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)


def rep(anchor, addition, where="after", count=1):
    """Splice `addition` around a uniquely-occurring anchor."""
    global src
    n = src.count(anchor)
    assert n == count, f"anchor appears {n} times, expected {count}: {anchor[:70]!r}"
    src = src.replace(anchor, anchor + addition if where == "after" else addition + anchor, 1)


# ── 1. The seal, in CSS ──────────────────────────────────────────────────
# One face for every kind so the family reads as one language. Sizes are
# FIXED (22 near / 16 mid): the family scale moves a badge's OFFSET, never how
# big it is, or a large building would wear large badges and the row would
# stop reading as a set.
rep(
    "  .poi.talk{filter:drop-shadow(0 0 10px rgba(232,200,119,.9))}\n",
    """  /* ── the badge language: one seal, four charges ── */
  #icons .bgroup{position:absolute;left:0;top:0;pointer-events:none;z-index:1;
    opacity:0;transition:opacity .28s ease;will-change:transform,opacity}
  #icons .bgroup.on{opacity:.6}
  .bseal{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:auto;
    cursor:pointer;transition:opacity .2s ease,transform .18s ease}
  .bmid .bseal{width:16px;height:16px;margin:-8px 0 0 -8px}
  /* A 44px target under a 22px mark: the seal is small on purpose and a
     thumb is not. Centred on the seal, invisible, and the only hit surface. */
  .bseal .bhit{position:absolute;left:50%;top:50%;width:44px;height:44px;
    margin:-22px 0 0 -22px;border-radius:50%}
  .bseal svg{width:100%;height:100%;overflow:visible;display:block}
  /* The seal's own ink.
     `--t-icon` is #f0e3bf: an ink for DARK chips, and all but invisible on a
     #f3e6c8 parchment face. The event star and the conversation bubble were
     drawn in it and vanished. `--ink` is the theme's real dark, so the seal
     borrows that and falls back to a brown of its own if a fork drops it. */
  .bseal{--bink:var(--ink,#241a10)}
  .bseal .face{fill:var(--parch);fill-opacity:.94}
  .bseal .rim{fill:none;stroke:var(--gold);stroke-width:2}
  .bseal .ink{fill:none;stroke:var(--bink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .bseal .tint{stroke:var(--btint,var(--bink))}
  /* FILLED, not stroked. A 2px outline in a 24-unit box is invisible at the
     22px these actually render at: the first two passes drew a hand that
     filled into a lump and a star you could not see against the parchment.
     A solid silhouette reads at a glance, which is the whole job of a seal.
     `cut` carves detail back out in the face colour, which is how the leaf
     vein and the finger gaps survive being small. */
  .bseal .sol{fill:var(--btint,var(--bink));stroke:var(--btint,var(--bink));stroke-width:1.1;stroke-linejoin:round}
  .bseal .solink{fill:var(--bink);stroke:var(--bink);stroke-width:1.1;stroke-linejoin:round}
  .bseal .staff{fill:none;stroke:var(--btint,var(--bink));stroke-width:2;stroke-linecap:round}
  .bseal .cut{fill:none;stroke:var(--parch);stroke-width:1.3;stroke-linecap:round}
  .bseal .cutf{fill:var(--parch);stroke:none}
  /* The pips ride below the seal, so they need their own contrast against
     whatever land is behind them. */
  .bseal .pip{fill:var(--bink);stroke:var(--parch);stroke-width:1.1;paint-order:stroke}
  /* Rim vocabulary. Amber says a resolver guessed this address, gold says a
     person chose it; dashed says the seat is still open; braided says the
     work asks for a skill. */
  .bseal.r-amber .rim{stroke:var(--t-accent,#e8a13c)}
  .bseal.r-silver .rim{stroke:#c9d3d6}
  .bseal.r-open .rim{stroke-dasharray:4 3}
  .bseal.r-braid .rim{stroke-dasharray:6 2 2 2;stroke-width:2.4}
  .bseal.r-soft .rim{stroke:#7fb6b0}
  .bgroup .b-invite{opacity:.55}
  .bgroup .b-invite .face{fill-opacity:.5}
""",
    where="before",
)

# The lantern keeps its element, its class and its place inside the poi (the
# roofline is where the design puts it, and qa/verify_features asserts
# `.evbadge svg` lives there). What changes is that it now wears the seal, and
# that syncBanners counter-scales it so it matches the other four instead of
# growing with the building it sits on.
rep(
    "  .poi .evbadge{position:absolute;right:-8px;top:-10px;width:17px;height:17px;pointer-events:none;display:none}\n",
    """  .poi .evbadge{position:absolute;right:-8px;top:-10px;width:22px;height:22px;pointer-events:none;display:none;
    transform-origin:50% 50%}
""",
    where="before",
)
src = src.replace(
    "  .poi .evbadge{position:absolute;right:-8px;top:-10px;width:17px;height:17px;pointer-events:none;display:none}\n",
    "", 1)

# The palette is a const in an EARLIER script block, so the badge code (a
# later block) cannot see it. Exporting it is how everything else in this file
# crosses that boundary, and without it every leaf and hand drew in plain ink.
rep(
    "  Coordination:'#d0785a',Gathering:'#c96a8a',Healing:'#8ad0c0',Wisdom:'#a98ad0',Arts:'#d0648f',Outreach:'#6ac9c0'};\n",
    "window.CIRCLE_COL=CIRCLE_COL;\n",
)

# ── 2. The charges, and the machinery that seats them ────────────────────
rep(
    "for(const s of SCENE.structures)makePoi(s);\n",
    r"""
/* ---------- THE BADGE LANGUAGE (P1: the look) ----------
   One seal, four charges, and an invitation. Every mark is the same round
   face so the set reads as one vocabulary at a glance:

     shape = KIND      leaf-pennant / raised hand / star-lantern / rising curl
     color = DOMAIN    the charge tints with its circle's own colour
     pips  = WEIGHT    1-3 seed dots, derived from the quest's `need` text
     rim   = PROVENANCE gold for a creator's word, amber for a resolver's
                        guess, dashed while a seat is open, braided for skill

   D9 holds: nothing here is stored. Every badge is a projection of
   questsAt / seatsAt / eventsAt / threadsAt, recomputed on the tick. */

const BADGE_FACE = '<circle class="face" cx="12" cy="12" r="10.5"/><circle class="rim" cx="12" cy="12" r="10.5"/>';
/* Drawn for 22 px, not for a sketchpad. The first pass put a five-fingered
   hand and a speech bubble with an inner spiral inside a 24-unit box at 2px
   stroke: at the size they actually render, the fingers filled in and the
   pennant read as the letter P. These are the same ideas with the detail
   taken out, which is what a seal is for. */
/* Chosen by rendering candidates side by side at 76, 22 and 16 px and
   keeping only what survived 22. Two earlier passes were drawn by eye at
   sketch size and both failed the same way: the leaf-pennant closed into a
   letter P, and an inner curl on the conversation mark read as a question
   mark. These are the ones that read. */
const BADGE_CHARGE = {
  /* a swallowtail banner whose cloth carries a leaf's midrib. The notch is
     what stops it reading as a P, and it survives down to 16px. */
  quest: '<path class="staff" d="M8.2 6.1v11.8"/><path class="sol" d="M8.2 6.9h8.6l-2.3 2.7 2.3 2.7H8.2z"/><path class="cut" d="M9.4 9.6h4.6"/>',
  /* a raised hand: one filled silhouette, gaps carved back out so the
     fingers still separate at 22px instead of merging into a lump */
  seat: '<path class="sol" d="M8.6 14.3V11a1.2 1.2 0 012.4 0v2.1V7.7a1.2 1.2 0 012.4 0v5.4V9.6a1.2 1.2 0 012.4 0v5c0 2.2-1.8 3.8-4.1 3.8h-.2c-2.3 0-2.9-1.6-2.9-3.8z"/><path class="cut" d="M11 9.6v3.4M13.4 10.2v2.9"/>',
  /* the star-lantern, re-seated from the old evbadge and filled so it is
     visible against a parchment face */
  event: '<path class="solink" d="M12 5.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>',
  /* someone is talking here. The spec called for a rising curl; a curl at
     this size read as a question mark, and a bubble with an ellipsis says
     the same thing and is legible. */
  talk: '<path class="solink" d="M12 6.4c-3.3 0-5.9 2.2-5.9 5 0 1.6.9 3.1 2.3 4-.2 1-.8 1.9-1.7 2.7 1.7-.3 3.1-1 4-1.9.4.1.9.1 1.3.1 3.3 0 5.9-2.2 5.9-5s-2.6-4.9-5.9-4.9z"/><circle class="cutf" cx="9.5" cy="11.4" r="1"/><circle class="cutf" cx="12" cy="11.4" r="1"/><circle class="cutf" cx="14.5" cy="11.4" r="1"/>',
  /* an empty seal with a seed at its heart: room for work */
  invite: '<circle class="ink tint" cx="12" cy="12" r="2.1"/>',
};
/* Anchors are in seal-units around the building's own centre, then scaled by
   the same FAM_SCALE * s.scale * GSCALE the poi uses, so a badge sits on the
   door of a small cottage and the door of a great hall alike. */
const BADGE_ANCHOR = { quest:[-0.62,0.34], seat:[-0.72,-0.06], talk:[-0.5,-0.52], invite:[-0.62,0.34] };
const BADGE_RANK = ['quest','seat','talk','invite'];

/* Weight, from the words a founder already wrote. One scale at map level:
   the card carries the detail, the pips carry the shape of the ask. */
function badgeWeight(q){
  if(q && (q.weight===1||q.weight===2||q.weight===3)) return q.weight; // explicit wins
  const t=String((q&&(q.need||q.r))||'').toLowerCase();
  if(/full day|multi|recurring|intermediate|advanced/.test(t)) return 3;
  if(/session|half|4 hours|per event|per meeting/.test(t)) return 2;
  if(/hour|beginner/.test(t)) return 1;
  return 1;
}
const badgeSkilled = q => /intermediate|advanced|skilled/i.test(String((q&&(q.need||q.r))||''));
/* Which circle does this work belong to?
   A scene quest carries no `aff`: its circle is written into the reward line
   the founder already types ("33 ♥ · Land circle"). Read it from there, let an
   explicit field win when the export or the Loom supplies one, and fall back
   to the circle of the building it sits on. */
function badgeCircle(q,s){
  if(q&&(q.aff||q.circle_aff)) return q.aff||q.circle_aff;
  const m=String((q&&q.r)||'').match(/·\s*([A-Za-z]+)\s+circle/i);
  return (m&&m[1])||(s&&s.circle)||'';
}
function badgePips(n){ // seed dots under the charge, never more than three
  /* On the rim, not inside it. Tucked at cy 19.4 the dots sat on the busiest
     part of the face and vanished; r 1.05 was invisible at 22 px besides. */
  const N=Math.max(1,Math.min(3,n|0)),out=[];
  for(let i=0;i<N;i++) out.push(`<circle class="pip" cx="${12+(i-(N-1)/2)*4.2}" cy="21.6" r="1.5"/>`);
  return out.join('');
}
function badgeSvg(kind,pips){
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_FACE}${BADGE_CHARGE[kind]||''}${pips||''}</svg><span class="bhit"></span>`;
}

const bgEls={}; // one group per structure, a sibling of the poi inside #icons
function makeBadgeGroup(s){
  const g=document.createElement('div');g.className='bgroup';
  iWrap.appendChild(g);bgEls[s.key]=g;return g;
}
for(const s of SCENE.structures) makeBadgeGroup(s);

/* Recompute every badge from the projections. Called on the tick, after an
   edit, and after a restore: never trusted to be in sync on its own. */
function refreshBadges(){
  for(const s of SCENE.structures){
    const g=bgEls[s.key];if(!g)continue;
    const qs=(typeof questsAt==='function')?questsAt(s.key):[];
    const st=(typeof seatsAt==='function')?seatsAt(s.key):[];
    const th=(typeof threadsAt==='function')?threadsAt(s.key):[];
    const marks=[];

    if(qs.length){
      const q=qs[0]; // the heaviest ask leads; the rest live on the card
      const aff=badgeCircle(q,s);
      marks.push({kind:'quest',tint:(window.CIRCLE_COL&&window.CIRCLE_COL[aff])||'',
        pips:badgeWeight(q),
        rim:(q.addr==='creator'||q.address_source==='creator')?'':'r-amber',
        braid:badgeSkilled(q),n:qs.length});
    } else {
      // No work here yet, so the door says there is room for some.
      marks.push({kind:'invite',tint:'',pips:0,rim:'r-open',braid:false,n:0});
    }
    if(st.length) marks.push({kind:'seat',tint:(window.CIRCLE_COL&&window.CIRCLE_COL[st[0].c||s.circle])||'',
      pips:0,rim:'r-silver r-open',braid:false,n:st.length});
    if(th.length) marks.push({kind:'talk',tint:'',pips:0,rim:'r-soft',braid:false,n:th.length});

    const want=marks.map(m=>m.kind).join(',');
    if(g.dataset.sig!==want+'|'+marks.map(m=>m.pips+m.rim+m.tint).join(',')){
      g.innerHTML=marks.map(m=>{
        const cls=['bseal','b-'+m.kind,m.rim,m.braid?'r-braid':''].filter(Boolean).join(' ');
        const tint=m.tint?` style="--btint:${m.tint}"`:'';
        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+
               badgeSvg(m.kind,m.pips?badgePips(m.pips):'')+`</span>`;
      }).join('');
      g.dataset.sig=want+'|'+marks.map(m=>m.pips+m.rim+m.tint).join(',');
    }
  }
}
window.refreshBadges=refreshBadges;
""",
)

# ── 3. Per-frame placement and the zoom gate ─────────────────────────────
# Beside `_crownOff` so the badges travel with the building on every frame,
# using the scale already computed for the poi.
rep(
    "      p.classList.toggle('st-blueprint',s.state==='blueprint')}}\n",
    r"""      p.classList.toggle('st-blueprint',s.state==='blueprint');
      /* Badges ride the same transform maths as the crown. The seal keeps a
         fixed size; only its OFFSET grows with the building, so a great hall
         wears its marks further out and not larger. Below the gate the label
         count chip carries the same facts, so nothing is lost by fading. */
      const bg=bgEls[s.key];
      if(bg){
        const show=(cam.z>=1.0)&&!hideP;
        bg.classList.toggle('on',show);
        bg.classList.toggle('bmid',cam.z<1.45);
        if(show){
          const off=(s._crownOff||30)*0.72;
          bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;
          let i=0;
          for(const seal of bg.children){
            const a=BADGE_ANCHOR[seal.dataset.bkind]||BADGE_ANCHOR.quest;
            seal.style.left=(a[0]*off)+'px';
            seal.style.top=(a[1]*off)+'px';
            i++;
          }
        }
      }
      /* The lantern stays inside the poi where the design and the door suite
         both want it, and is counter-scaled so it matches the other four
         instead of growing with whatever it is pinned to. */
      const ev=p.querySelector('.evbadge');
      if(ev){const ps=(iso||painted)?k*1.35*sc:k*(window.GSCALE||1);
        ev.style.transform=ps?`scale(${(1/ps).toFixed(3)})`:'';}
      /* three braces close, in order: if(ev) above, then if(!hideP), then the
         `for (const s of SCENE.structures)` this whole block lives in. The
         original line ended `)}}` and dropping one of them is a silent dead
         script, not an error the browser will point at. */
      }}
""",
    where="before",
)
src = src.replace(
    "      p.classList.toggle('st-blueprint',s.state==='blueprint')}}\n", "", 1)

# ── 4. Keep them in sync ─────────────────────────────────────────────────
rep(
    "window.refreshEventBadges=refreshEventBadges;\n",
    "try{refreshBadges()}catch(_){}\n"
    "setInterval(()=>{try{refreshBadges()}catch(_){}} ,3000);\n",
)

# The build says what it is. Stays inside the v0.7 family on purpose: the
# site importer accepts `v0.7-*`, and `v0.8-roundD` is reserved for D5.4.
if "BUILD_VERSION='v0.7-voice1'" in src:
    rep("BUILD_VERSION='v0.7-voice1'", "", where="after")  # count guard only
    src = src.replace("BUILD_VERSION='v0.7-voice1'", "BUILD_VERSION='v0.7-voice1-badges1'", 1)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"badges P1 patched: {before} -> {len(src)} bytes (+{len(src)-before})")
