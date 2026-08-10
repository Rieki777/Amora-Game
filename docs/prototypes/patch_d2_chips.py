#!/usr/bin/env python3
"""Round D, amendments A2 and A3: one glyph language at every distance.

A2. The label carried `⚑1 ⛨2 ⌂2/5 ✦` as text. Nobody saw it through a whole
    testing session, which is the only verdict that matters: small parchment
    glyphs inside a dark plate, at the far zoom where the plate itself is the
    size of a fingernail. It goes. Below the badge gate a building now wears
    ONE activity seal: a round chip, parchment ink on dark ground, carrying
    the count of everything open there. Its rim breathes when an event is two
    days out or nearer. Tapping it flies you in to where the marks take over.

A3. Housing was a fragment of that same unreadable string. A home is a door,
    so it gets one: a ⌂ chip that is always there and always tappable, opening
    an in-map sheet with the occupancy and the way to ask.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d2_chips.py [grounds-v0.html]
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


# ── 1. The far chips, in CSS ─────────────────────────────────────────────
# Dark ground, parchment ink, gold rim: the inverse of the near seal, because
# at this distance the chip has to win against whatever the land is doing
# behind it, and the land is mostly bright green.
rep(
    "  .bseal .cnum{fill:var(--ink);font:600 10px/1 Georgia,serif;text-anchor:middle}",
    """
  /* ── the far view: one seal for the whole building, and its front door ── */
  .bgroup .aseal,.bgroup .hchip{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;
    pointer-events:auto;cursor:pointer;display:none}
  .bgroup.far .aseal{display:block}
  /* The gate has two sides. `far` used to only raise the group's opacity, so
     the seals it was supposed to replace came up with it. */
  .bgroup.far .bseal{display:none}
  .bgroup .hchip{display:block} /* a home is a door at every distance */
  .aseal svg,.hchip svg{width:100%;height:100%;display:block;overflow:visible;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
  .aface{fill:#20160c;fill-opacity:.94}
  .arim{fill:none;stroke:var(--gold);stroke-width:2}
  .anum{fill:var(--parch);font:600 12px/1 Georgia,serif;text-anchor:middle}
  .hink{fill:none;stroke:var(--parch);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
  /* A gold rim that breathes: an event two days out or nearer. Stroke only,
     so nothing moves and nothing else on the land has to be redrawn. */
  @keyframes brim{0%,100%{stroke:var(--gold);stroke-width:2}50%{stroke:var(--gold-b);stroke-width:2.9}}
  .aseal.soon .arim{animation:brim 2.4s ease-in-out infinite}""",
)
swap(
    "  #badges .bgroup.on{opacity:.6}",
    "  #badges .bgroup.on{opacity:.6}\n"
    "  #badges .bgroup.far{opacity:1} /* the far seal is the only mark left, so it gets full contrast */",
)
swap(
    "    .bseal,#loomWires .lw.staged,#orgSvg .ovac,.poi.talk{animation:none!important}",
    "    .bseal,.aseal .arim,#loomWires .lw.staged,#orgSvg .ovac,.poi.talk{animation:none!important}",
)

# ── 2. The text chips leave the label ────────────────────────────────────
swap(
    """    el.querySelector('.cnt').textContent=(q?`⚑${q} `:'')+(st?`⛨${st}`:'')+((window.LOTS&&LOTS[s.key])?` ⌂${LOTS[s.key].sold}/${LOTS[s.key].total}`:'')+((s.event||(window.eventsAt&&eventsAt(s.key).length))?' ✦':'');""",
    """    /* The counts used to live here as text and nobody found them. They are
       the activity seal and the home chip now, in the badge plane, at a size
       and a contrast a person can actually see. */
    el.querySelector('.cnt').textContent='';""",
)

# ── 3. The two chips join the group ──────────────────────────────────────
swap(
    "const BADGE_SLOT = { quest:215, invite:215, seat:165, talk:115, event:55 };",
    "const BADGE_SLOT = { quest:215, invite:215, seat:165, talk:115, event:55, home:15 };",
)
rep(
    """    g.dataset.kinds=marks.map(m=>m.kind).join(',');""",
    """
    /* The far seal counts everything a person could act on here, in one
       number, because at that distance one number is all there is room for. */
    const lot=(window.LOTS||{})[s.key],room=(window.ROOMS||{})[s.key];
    const open=qs.length+st.length+th.length+ev.length;
    const soon=ev.length?Math.min(...ev.map(e=>e.days)):99;
    const asig=open+'|'+(soon<=2?'soon':'')+'|'+(lot?lot.sold+'/'+lot.total:room?room.taken+'/'+room.total:'');
    if(g.dataset.asig!==asig){
      const a=g.querySelector('.aseal'),h=g.querySelector('.hchip');
      if(a)a.remove();if(h)h.remove();
      if(open)g.insertAdjacentHTML('beforeend',
        `<span class="aseal${soon<=2?' soon':''}" data-bk="${s.key}"><svg viewBox="0 0 24 24">`+
        `<circle class="aface" cx="12" cy="12" r="11"/><circle class="arim" cx="12" cy="12" r="11"/>`+
        `<text class="anum" x="12" y="16.4">${open>9?'9+':open}</text></svg><span class="bhit"></span></span>`);
      if(lot||room)g.insertAdjacentHTML('beforeend',
        `<span class="hchip" data-bk="${s.key}"><svg viewBox="0 0 24 24">`+
        `<circle class="aface" cx="12" cy="12" r="11"/><circle class="arim" cx="12" cy="12" r="11"/>`+
        `<path class="hink" d="M6.8 12.2L12 7.6l5.2 4.6"/><path class="hink" d="M8.4 11.6v4.8h7.2v-4.8"/>`+
        `</svg><span class="bhit"></span></span>`);
      g.dataset.asig=asig;
    }
    if(lot||room)g.dataset.kinds=g.dataset.kinds?g.dataset.kinds+',home':'home';""",
)

# ── 4. Placement: the near ring keeps only its seals ─────────────────────
# `bg.children` now holds two things that are not seals, and both carry no
# `data-bkind`, so the old loop would have parked them on top of the quest.
swap(
    """    } else for(const seal of g.bg.children){
      const a=(BADGE_SLOT[seal.dataset.bkind]!==undefined?BADGE_SLOT[seal.dataset.bkind]:215)*Math.PI/180;
      seal.style.left=(Math.cos(a)*g.R)+'px';
      seal.style.top=(-Math.sin(a)*g.R)+'px'; // screen y grows downward
    }""",
    """    } else for(const seal of g.bg.querySelectorAll('.bseal')){
      const a=(BADGE_SLOT[seal.dataset.bkind]!==undefined?BADGE_SLOT[seal.dataset.bkind]:215)*Math.PI/180;
      seal.style.left=(Math.cos(a)*g.R)+'px';
      seal.style.top=(-Math.sin(a)*g.R)+'px'; // screen y grows downward
    }
    /* The far seal sits over the crown; the home chip takes its own slot on
       whatever ring is in force, so it never lands on another mark. */
    const fr=Math.max(g.off,16),a2=g.bg.querySelector('.aseal'),hc2=g.bg.querySelector('.hchip');
    if(a2){a2.style.left=(0.62*fr)+'px';a2.style.top=(-0.72*fr)+'px'}
    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      hc2.style.left=(Math.cos(ha)*hr)+'px';hc2.style.top=(-Math.sin(ha)*hr)+'px'}""",
)
# A hidden building must not keep its marks. The whole badge block lives
# inside `if(!hideP)`, so a blueprint that was lit in Vision mode kept its
# seals hanging over empty ground after switching back to Now. Found by a
# gate check reporting four marks that should not have been on screen.
swap(
    "    p.style.display=hideP?'none':'block';",
    """    p.style.display=hideP?'none':'block';
    if(hideP&&bgEls[s.key]){bgEls[s.key].classList.remove('on','far');bgEls[s.key]._on=false}""",
)

# `far` is the other half of the gate: below it the seals go and the chip
# comes. And BOTH sides have to travel with the building. Only the near side
# did, so the far seal kept the position it held when the reader last crossed
# z 1.0 and drifted off its own roof, and layoutBadges never saw a far group
# at all, so nothing knew where those chips were.
swap(
    """        const show=(cam.z>=1.0)&&!hideP;
        bg.classList.toggle('on',show);
        bg.classList.toggle('bmid',cam.z<1.45);
        if(show){
          const off=(s._crownOff||30)*0.72;
          bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;
          bg._off=off;bg._cx=sx/DPR;bg._cy=sy/DPR;bg._on=true;
        } else bg._on=false;""",
    """        const show=(cam.z>=1.0)&&!hideP;
        bg.classList.toggle('on',show);
        bg.classList.toggle('far',!show&&!hideP); // one glyph language: far is one seal, near is the set
        bg.classList.toggle('bmid',cam.z<1.45);
        bg.style.transform=`translate(${sx/DPR}px,${sy/DPR}px)`;
        bg._off=(s._crownOff||30)*0.72;bg._cx=sx/DPR;bg._cy=sy/DPR;bg._on=!hideP;""",
)

# ── 4b. The label engine learns what a mark is ───────────────────────────
# Labels already avoid each other and their neighbours' doorsteps. They knew
# nothing about the marks, so the far seal landed in the middle of VILLAGE
# HEART. layoutBadges publishes where every visible mark ended up, and both
# kinds of plate step over them.
swap(
    """  for(const g of groups){
    g.bg.classList.toggle('clustered',g.cluster);""",
    """  const pts=window.BADGE_PTS=[]; // where every visible mark ends up, for the plates to avoid
  for(const g of groups){
    g.bg.classList.toggle('clustered',g.cluster);""",
)
swap(
    """    const fr=Math.max(g.off,16),a2=g.bg.querySelector('.aseal'),hc2=g.bg.querySelector('.hchip');
    if(a2){a2.style.left=(0.62*fr)+'px';a2.style.top=(-0.72*fr)+'px'}
    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      hc2.style.left=(Math.cos(ha)*hr)+'px';hc2.style.top=(-Math.sin(ha)*hr)+'px'}""",
    """    const fr=Math.max(g.off,16),a2=g.bg.querySelector('.aseal'),hc2=g.bg.querySelector('.hchip');
    if(a2){a2.style.left=(0.62*fr)+'px';a2.style.top=(-0.72*fr)+'px'}
    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      hc2.style.left=(Math.cos(ha)*hr)+'px';hc2.style.top=(-Math.sin(ha)*hr)+'px'}
    const far=g.bg.classList.contains('far');
    if(far){if(a2)pts.push({x:g.cx+0.62*fr,y:g.cy-0.72*fr})}
    else if(g.cluster)pts.push({x:g.cx-0.82*CR(g),y:g.cy+0.57*CR(g)});
    else for(const kd of g.kinds){if(kd==='home')continue;
      const a=(BADGE_SLOT[kd]!==undefined?BADGE_SLOT[kd]:215)*Math.PI/180;
      pts.push({x:g.cx+Math.cos(a)*g.R,y:g.cy-Math.sin(a)*g.R})}
    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      pts.push({x:g.cx+Math.cos(ha)*hr,y:g.cy-Math.sin(ha)*hr})}""",
)
rep(
    """window.layoutBadges=layoutBadges;\n""",
    """window.BADGE_PTS=[];
/* A plate steps up until it is clear of every mark. Marks win, because a
   mark is a door and a plate is a name. */
function dodgeMarks(x,y,w,h){
  const P=window.BADGE_PTS||[];
  for(let g=0;g<4;g++){let moved=false;
    for(let i=0;i<P.length;i++){const p=P[i];
      if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18){y=p.y-(h+18);moved=true}}
    if(!moved)break}
  return y;
}
window.dodgeMarks=dodgeMarks;
""",
    where="before",
)
# the district plates, at the far zoom where the activity seal lives
swap(
    """  for(const d of SCENE.districts){const el=bEls['d_'+d.id];const[sx,sy]=worldToScreen(d.x,d.y-46);
    el.style.display=(zoomed||!roomy)?'none':'block';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'}""",
    """  const placedD=[]; // district plates dodge the marks, then each other
  for(const d of SCENE.districts){const el=bEls['d_'+d.id];const[sx,sy]=worldToScreen(d.x,d.y-46);
    const hideD=(zoomed||!roomy);el.style.display=hideD?'none':'block';if(hideD)continue;
    const dw=el.offsetWidth||140,dh=el.offsetHeight||22;
    const dx=sx/DPR;let dy=dodgeMarks(dx,sy/DPR,dw,dh),g2=0,hit2=true;
    while(hit2&&g2++<4){hit2=false;
      for(let i=0;i<placedD.length;i++){const o=placedD[i];
        if(Math.abs(dx-o.x)*2<(dw+o.w)+14&&Math.abs(dy-o.y)<dh+8){dy=o.y-(dh+8);hit2=true}}
      const ny=dodgeMarks(dx,dy,dw,dh);if(ny!==dy){dy=ny;hit2=true}}
    el.style.left=dx+'px';el.style.top=dy+'px';placedD.push({x:dx,y:dy,w:dw})}""",
)
# and the building labels, at the near zoom where the marks are
swap(
    """      for(let kk=0;kk<iconPts.length;kk++){const ic=iconPts[kk];if(ic.k===s.key)continue;
        if(Math.abs(px-ic.x)*2<w+44&&Math.abs(py-ic.y)<27){py=ic.y-40;hit=true}}}""",
    """      for(let kk=0;kk<iconPts.length;kk++){const ic=iconPts[kk];if(ic.k===s.key)continue;
        if(Math.abs(px-ic.x)*2<w+44&&Math.abs(py-ic.y)<27){py=ic.y-40;hit=true}}
      const ny=dodgeMarks(px,py,w,h);if(ny!==py){py=ny;hit=true}}""",
)

# ── 5. What the two chips do ─────────────────────────────────────────────
rep(
    "window.layoutBadges=layoutBadges;\n",
    r"""/* A home is a door, and this is the front of it. The request and booking
   rows that used to hide in the generic panel are answered here instead. */
function homeSheet(key){
  const s=BY[key];if(!s)return;
  const lot=(window.LOTS||{})[key],room=(window.ROOMS||{})[key];
  const line=lot?`${lot.sold} of ${lot.total} spoken for`
            :room?`${room.taken} of ${room.total} full tonight`:'';
  /* A lodge takes bookings and a hamlet takes requests; the sheet is the
     same door either way, and only the route behind it changes. */
  const route=room?'/stay':'/request-a-house?structure='+encodeURIComponent(key);
  setHash('#/place/'+key);
  $('moduleCard').innerHTML=`<h2>⌂ Request a home at ${s.name}</h2>
    <div class="route">${line}</div>
    <p>Tell us who is coming and when, and a steward answers. Nothing is held until you hear back.</p>
    <div class="acts">
      <a class="btn" href="${siteHref(route)}" target="_blank" rel="noopener" onclick="return siteNav(event,'${route}')">Begin your request</a>
      <button class="btn ghostbtn" onclick="askAboutLiving('${key}')">Ask Maia about living here</button>
      <button class="btn ghostbtn" onclick="closeDoor()">Back to the land</button>
    </div>`;
  $('module').classList.add('show');
}
window.homeSheet=homeSheet;
function askAboutLiving(key){const s=BY[key];closeDoor();
  $('maia').classList.remove('min');
  if(document.body.classList.contains('pocket'))document.body.classList.add('msheet');
  $('maiaText').value=`I am thinking about living at ${s?s.name:'the village'}. Where do I begin?`;
  setTimeout(()=>$('maiaText').focus(),120);
}
window.askAboutLiving=askAboutLiving;
/* Its own listener, on the same plane: the seal handler above returns early
   when the tap was not on a `.bseal`, and these two are not. */
$('badges').addEventListener('click',e=>{
  const a=e.target.closest('.aseal');
  if(a){e.stopPropagation();const s=BY[a.dataset.bk];if(!s)return;window.hap&&hap(6);
    travelTo(s.x,s.y,Math.max(cam.z,1.15));return} // in to where the marks take over
  const h=e.target.closest('.hchip');
  if(h){e.stopPropagation();window.hap&&hap(8);homeSheet(h.dataset.bk)}
});
""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D2 A2+A3 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
