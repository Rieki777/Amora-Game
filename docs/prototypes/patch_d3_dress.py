#!/usr/bin/env python3
"""D3.2 to D3.4: the rest of the land's dress.

  D3.2  A building in progress read as a rendering bug: `.poi.ph2{opacity:.84}`
        is what a half-loaded image looks like. Opacity goes back up to .92 and
        the building wears a bamboo scaffold instead, which is what a building
        in progress actually looks like. Phase 3 keeps its ghost.
  D3.3  Built, Building, Planned replace 1, 2, 3 on every surface a person
        reads, through `phaseName()` over `SCENE.vocabulary.phases`, so a
        village that says Standing, Rising, Dreamed can say it. Exports keep
        the numbers.
  D3.4  A golden tablet as an alternative to the ribbon: etched plaque, gold
        gradient, really dark ink. `SKIN.label_style` picks it; ribbon stays
        the default until Rye says otherwise.

Both new dials ride inside the skin object, which the site already accepts
and pushes, so there is nothing new to plumb.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d3_dress.py [grounds-v0.html]
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


# ── D3.2 · a building in progress, not a half-loaded image ───────────────
swap(
    "  .poi.ph2{opacity:.84}.poi.ph3{opacity:.62} /* loading into reality — later phases stand more transparent */",
    """  /* .ph2 used to sit at .84, which is exactly what a half-loaded image looks
     like. A building being built wears scaffold; only the dreamed one fades. */
  .poi.ph2{opacity:.92}.poi.ph3{opacity:.62}
  .poi .scaffold{position:absolute;inset:-6% -10% -2% -10%;pointer-events:none;display:none;z-index:2}
  .poi.ph2 .scaffold{display:block}
  .poi .scaffold svg{width:100%;height:100%;overflow:visible;display:block;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
  .poi .scaffold .lash{fill:none;stroke:var(--t-icon);stroke-width:2;stroke-linecap:round;opacity:.92}
  .poi .scaffold .pen{fill:var(--t-accent,#e8a13c);stroke:none;opacity:.95}""",
)
# Static, calm, no animation: two uprights, three rails, one brace, a pennant.
swap(
    """  el.querySelector('.rm').onclick=e=>{e.stopPropagation();removeStructure(s)};""",
    """  el.insertAdjacentHTML('beforeend','<span class="scaffold"><svg viewBox="0 0 64 64" aria-hidden="true">'+
    '<path class="lash" d="M14 60V12M50 60V16"/>'+
    '<path class="lash" d="M14 22h36M14 36h36M14 50h36"/>'+
    '<path class="lash" d="M14 50 50 22"/>'+
    '<path class="lash" d="M14 12v-5"/><path class="pen" d="M14 5l11 3.2-11 3.4z"/>'+
    '</svg></span>');
  el.querySelector('.rm').onclick=e=>{e.stopPropagation();removeStructure(s)};""",
)

# ── D3.3 · the phases get their names back ───────────────────────────────
rep(
    "SCENE.vocabulary=SCENE.vocabulary||{};",
    """
/* Phases are a founder's words too. The map keeps the numbers for the export
   and the importer; a person never has to read one. */
if(!SCENE.vocabulary.phases)SCENE.vocabulary.phases={1:'Built',2:'Building',3:'Planned'};
function phaseName(n){const P=SCENE.vocabulary.phases||{};return P[n]||P[String(n)]||('phase '+n)}
window.phaseName=phaseName;""",
)
swap(
    """    <span class="statepill">${s.event?('✦ '+s.event):('phase '+s.phase)}</span>`;""",
    """    <span class="statepill">${s.event?('✦ '+s.event):phaseName(s.phase)}</span>`;""",
)
swap(
    """    <div style="font-size:10.5px;color:#8a7347;margin-top:3px">${dn} · phase ${s.phase} · AMORA MASTER PLAN V7</div>""",
    """    <div style="font-size:10.5px;color:#8a7347;margin-top:3px">${dn} · ${phaseName(s.phase)} · AMORA MASTER PLAN V7</div>""",
)
swap(
    """     ${[1,2,3].map(ph=>`<label style="display:flex;gap:4px;align-items:center;font-size:12px;cursor:pointer"><input type="radio" name="iPhase" value="${ph}"${s.phase===ph?' checked':''} style="accent-color:var(--gold)">${ph}</label>`).join('')}""",
    """     ${[1,2,3].map(ph=>`<label style="display:flex;gap:4px;align-items:center;font-size:12px;cursor:pointer"><input type="radio" name="iPhase" value="${ph}"${s.phase===ph?' checked':''} style="accent-color:var(--gold)">${phaseName(ph)}</label>`).join('')}""",
)
swap(
    """      vocabulary:{road:SUBTYPES.road.slice(),water:SUBTYPES.water.slice(),zone:SUBTYPES.zone.slice(),
        media:SCENE.vocabulary.media.map(m=>({...m})),""",
    """      vocabulary:{road:SUBTYPES.road.slice(),water:SUBTYPES.water.slice(),zone:SUBTYPES.zone.slice(),
        media:SCENE.vocabulary.media.map(m=>({...m})),
        phases:{...SCENE.vocabulary.phases}, // names only; every row still carries its number""",
)
swap(
    """  if(voc&&Array.isArray(voc.media)&&voc.media.length){""",
    """  if(voc&&voc.phases&&typeof voc.phases==='object')SCENE.vocabulary.phases={...SCENE.vocabulary.phases,...voc.phases};
  if(voc&&Array.isArray(voc.media)&&voc.media.length){""",
)

# ── D3.4 · a golden tablet, for the villages that want one ───────────────
rep(
    "  .banner.district{",
    """  /* An etched plaque instead of a ribbon: gold ground, a cut highlight along
     the top, and really dark ink, which is the whole reason to want it. */
  body.lbl-tablet .banner{color:#241a05;text-shadow:0 1px 0 rgba(255,247,214,.5);
    background:linear-gradient(180deg,#e2b84e,#c49a2e);border:1px solid #8a6a1d;
    box-shadow:inset 0 1px 0 rgba(255,248,220,.65),0 2px 6px rgba(0,0,0,.5)}
  body.lbl-tablet .banner .cdot{box-shadow:0 0 0 1px rgba(36,26,5,.35)}
  body.lbl-tablet .banner.ghosted{opacity:.62}
""",
    where="before",
)
swap(
    "const SKIN={theme:'Emerald Atlas',words:'',accent:null,parch:null,lbl:100,mist:false,glow:true,\n"
    "  flow_style:'glyph'};window.SKIN=SKIN; // 'glyph' | 'gold' | 'medium'",
    "const SKIN={theme:'Emerald Atlas',words:'',accent:null,parch:null,lbl:100,mist:false,glow:true,\n"
    "  flow_style:'glyph',label_style:'ribbon'};window.SKIN=SKIN; // 'glyph'|'gold'|'medium' · 'ribbon'|'tablet'",
)

# ── The two dials, in the skin the site already carries ──────────────────
swap(
    """  parchment:SKIN.parch||null,label_scale:(SKIN.lbl||100)/100,icon_mode:iconMode,""",
    """  parchment:SKIN.parch||null,label_scale:(SKIN.lbl||100)/100,icon_mode:iconMode,
  flow_style:SKIN.flow_style||'glyph',label_style:SKIN.label_style||'ribbon',""",
)
swap(
    """  if(sk.icon_mode&&['auto','painted','iso'].includes(sk.icon_mode))iconMode=sk.icon_mode;
  applySkinOverrides();""",
    """  if(sk.icon_mode&&['auto','painted','iso'].includes(sk.icon_mode))iconMode=sk.icon_mode;
  if(sk.flow_style&&['glyph','gold','medium'].includes(sk.flow_style))SKIN.flow_style=sk.flow_style;
  if(sk.label_style&&['ribbon','tablet'].includes(sk.label_style))SKIN.label_style=sk.label_style;
  applyDress();
  applySkinOverrides();""",
)
rep(
    "window.skinExport=skinExport;\n",
    """/* One place that puts the dress on, so the panel, a restore and a config
   push over the bridge all take the same route. */
function applyDress(){
  document.body.classList.toggle('lbl-tablet',SKIN.label_style==='tablet');
  if($('skFlow'))$('skFlow').value=SKIN.flow_style||'glyph';
  if($('skLabelStyle'))$('skLabelStyle').value=SKIN.label_style||'ribbon';
}
window.applyDress=applyDress;
""",
)
swap(
    """ <div class="srow"><span class="slbl">icon style</span><select id="skIcon">""",
    """ <div class="srow"><span class="slbl">label style</span><select id="skLabelStyle"><option value="ribbon">ribbon · dark plate, parchment letters</option><option value="tablet">tablet · gold plaque, etched</option></select></div>
 <div class="srow"><span class="slbl">flow marks</span><select id="skFlow"><option value="glyph">a mark for every kind</option><option value="gold">one golden orb</option><option value="medium">a coloured dot</option></select></div>
 <div class="srow"><span class="slbl">icon style</span><select id="skIcon">""",
)
rep(
    "window.applySkinExport=applySkinExport;\n",
    """if($('skFlow'))$('skFlow').onchange=()=>{SKIN.flow_style=$('skFlow').value;
  logEdit('flow-style','skin',{to:SKIN.flow_style});toast('Flow marks: '+$('skFlow').selectedOptions[0].textContent+'.')};
if($('skLabelStyle'))$('skLabelStyle').onchange=()=>{SKIN.label_style=$('skLabelStyle').value;applyDress();
  logEdit('label-style','skin',{to:SKIN.label_style});toast('Labels: '+$('skLabelStyle').selectedOptions[0].textContent+'.')};
applyDress();
""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D3.2-D3.4 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
