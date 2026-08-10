#!/usr/bin/env python3
"""D3.1: every flow type wears its own mark, and the types become vocabulary.

Six coloured dots said "something moves here". Nine glyphs say what. The flow
TYPES themselves become the village's words (q1d): an editable list of
{key, name, color, glyph}, so a village that trades in fish or firewood adds
the type and picks its mark rather than asking for a release.

  the marks    canvas-drawn in the ICONS hand, 2 px stroke, pre-rendered once
               per type and tinted by the type's colour, then drawn along both
               the via-route branch and the straight-line branch
  the taxonomy food splits into unprepared and prepared, materials into raw
               and finished, and money joins. Amora's own flows are reseeded
               to the finer words.
  the dress    SKIN.flow_style keeps three: 'glyph' (the new default), 'gold'
               (one golden orb on every line) and 'medium' (today's dots). In
               every one the route underlay keeps the type colour, so the
               lines still read when the marks are too small to.
  self-heal    a legacy `food` maps to `food-raw`, and any key missing from
               the list is added with a plain seed dot and neutral gold, so
               an old export keeps rendering instead of drawing nothing.

The vocabulary had to be defined in the SECOND script block, before the flow
draw loop, not beside MEDIA in the third: that is why the old draw loop
carried a three-way ternary over colours instead of reading the palette.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d3_flows.py [grounds-v0.html]
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


# ── 1. The media vocabulary, early enough for the draw loop to see it ────
rep(
    "const cv=document.getElementById('scene'),cx=cv.getContext('2d');\n",
    r"""
/* ---------- THE MEDIA VOCABULARY (D3.1) ----------
   What moves through a village is the village's own word for it. This list
   is editable like every other vocabulary: add a type, name it, colour it,
   pick its mark. Amora's nine are a starting set, not a schema. */
window.MEDIA_SEED=[
 {key:'water',              name:'water',               color:'#7cc4d8', glyph:'droplet'},
 {key:'energy',             name:'energy',              color:'#ffdf8a', glyph:'bolt'},
 {key:'money',              name:'money',               color:'#e3c15c', glyph:'coin'},
 {key:'materials-raw',      name:'raw materials',       color:'#c9a25e', glyph:'log'},
 {key:'materials-finished', name:'finished materials',  color:'#b5895a', glyph:'crate'},
 {key:'food-raw',           name:'unprepared food',     color:'#a8d46a', glyph:'fruit'},
 {key:'food-prepared',      name:'prepared food',       color:'#f0a860', glyph:'bowl'},
 {key:'compost',            name:'compost',             color:'#6f9e46', glyph:'leafcurl'},
 {key:'care',               name:'care',                color:'#ff9bb0', glyph:'heart'}
];
SCENE.vocabulary=SCENE.vocabulary||{};
if(!Array.isArray(SCENE.vocabulary.media)||!SCENE.vocabulary.media.length)
  SCENE.vocabulary.media=MEDIA_SEED.map(m=>({...m}));
/* One line of self-healing: the word this map used before the taxonomy got
   finer. Anything else unknown is adopted below rather than dropped. */
const MEDIA_ALIAS={food:'food-raw',materials:'materials-raw'};
function mediaKey(k){k=String(k||'');return MEDIA_ALIAS[k]||k}
window.mediaKey=mediaKey;
function mediaOf(k){k=mediaKey(k);
  const L=SCENE.vocabulary.media;
  let m=L.find(x=>x.key===k);
  if(!m){ // an export from a village that knows a type this map does not
    m={key:k,name:k,color:'#e8c877',glyph:'seed'};L.push(m);
    if(window.rebuildMedia)rebuildMedia()}
  return m}
window.mediaOf=mediaOf;
const mediaColor=k=>mediaOf(k).color;
window.mediaColor=mediaColor;

/* The marks, in the ICONS hand: one path each, stroked at 2, drawn once into
   an offscreen sprite and tinted by the type colour. A dark halo underneath,
   because the land they cross is mostly bright green. */
const GLYPH_PATH={
  droplet:'M12 4.2c-4.6 5.6-5.6 8.4-5.6 10.6a5.6 5.6 0 0011.2 0c0-2.2-1-5-5.6-10.6z',
  bolt:'M13.8 3.4L7.2 13.6h4.2l-1.4 7.2 6.8-10.2h-4.2z',
  coin:'M12 4.6a7.4 7.4 0 110 14.8 7.4 7.4 0 010-14.8zM12 8.6a3.4 3.4 0 110 6.8 3.4 3.4 0 010-6.8z',
  log:'M8.6 9.2h7.6a3 3.4 0 010 6.8H8.6a3 3.4 0 010-6.8zM8.6 9.2a3 3.4 0 000 6.8',
  crate:'M5.8 8.6h12.4v8H5.8zM5.8 11.6h12.4M12 8.6v8',
  fruit:'M12 9c2.4-1.9 6 0 6 3.4 0 3.4-2.7 6.4-6 6.4s-6-3-6-6.4c0-3.4 3.6-5.3 6-3.4zM12 9V5.8M12.2 7.2c1.2-1.6 3.2-1.6 3.2-1.6s0 2-1.6 2.6z',
  bowl:'M4.9 12.9h14.2a7.1 7.1 0 01-14.2 0zM10 10.4c-1.4-1.3.9-2.2-.5-3.5M14.2 10.4c-1.4-1.3.9-2.2-.5-3.5',
  leafcurl:'M6.6 17.8c0-6 4.4-9.7 11.2-10.5.8 6.9-3.6 11.3-9.3 11.3M7.4 17.4c3-3.2 6.1-5.1 9.7-6.5',
  heart:'M12 19.4s-6.5-4.3-6.5-9.1a3.75 3.75 0 016.5-2.4 3.75 3.75 0 016.5 2.4c0 4.8-6.5 9.1-6.5 9.1z',
  seed:'M12 9.2a2.9 2.9 0 110 5.8 2.9 2.9 0 010-5.8z'
};
window.GLYPH_PATH=GLYPH_PATH;
const FLOW_SPR={};
function flowSprite(k){
  const m=mediaOf(k),id=m.glyph+'|'+m.color;
  if(FLOW_SPR[id])return FLOW_SPR[id];
  const c=document.createElement('canvas');c.width=c.height=48;
  const g=c.getContext('2d');g.scale(2,2);
  g.lineJoin='round';g.lineCap='round';
  const p=new Path2D(GLYPH_PATH[m.glyph]||GLYPH_PATH.seed);
  g.strokeStyle='rgba(10,18,10,.7)';g.lineWidth=4.4;g.stroke(p); // the halo
  g.strokeStyle=m.color;g.lineWidth=2;g.stroke(p);
  FLOW_SPR[id]=c;return c}
window.flowSprite=flowSprite;
window.flowSpriteReset=()=>{for(const k in FLOW_SPR)delete FLOW_SPR[k]};
/* Three dresses, one meaning. The mark changes; the line under it never
   stops carrying the type's colour, so distance still reads. */
function flowMark(x,y,k,col){
  const st=(window.SKIN&&SKIN.flow_style)||'glyph';
  if(st==='glyph'){const s=flowSprite(k);cx.drawImage(s,x-6,y-6,12,12);return}
  cx.fillStyle=(st==='gold')?'#ecd08a':col;
  cx.beginPath();cx.arc(x,y,3.1,0,7);cx.fill()}
""",
)

# ── 2. The draw loop reads the palette instead of guessing at three ──────
swap(
    "      const col=f.medium==='water'?'#7cc4d8':(f.medium==='care'?'#ff9bb0':'#e8c877');",
    "      const col=mediaColor(f.medium); // the type's own colour, from the village's own list",
)
swap(
    """            cx.globalAlpha=.3+.62*Math.sin(u*Math.PI);cx.fillStyle=col;
            cx.beginPath();cx.arc(px2,py2,3.1,0,7);cx.fill()}""",
    """            cx.globalAlpha=.3+.62*Math.sin(u*Math.PI);
            flowMark(px2,py2,f.medium,col)}""",
)
swap(
    """          cx.globalAlpha=.3+.62*Math.sin(u*Math.PI);cx.fillStyle=col;
          cx.beginPath();cx.arc(ax2,ay2,3.1,0,7);cx.fill()}""",
    """          cx.globalAlpha=.3+.62*Math.sin(u*Math.PI);
          flowMark(ax2,ay2,f.medium,col)}""",
)

# ── 3. MEDIA becomes a view of the vocabulary ────────────────────────────
swap(
    "const MEDIA={water:'#7cc4d8',food:'#e8c877',materials:'#c9a25e',energy:'#ffe9a3',compost:'#8fd06a',care:'#ff9bb0'};",
    """/* MEDIA is now a view of the vocabulary, not a second copy of it: every
   surface that asked for a colour keeps asking the same way. */
function rebuildMedia(){const m={};SCENE.vocabulary.media.forEach(x=>{m[x.key]=x.color});window.MEDIA=m;return m}
window.rebuildMedia=rebuildMedia;const MEDIA=rebuildMedia();""",
)

# ── 4. The editor offers the village's words, never a hardcoded list ─────
swap(
    """  const medSel=`<select data-fmed="${fi}" style="flex:none;width:88px">${Object.keys(MEDIA).map(m=>`<option value="${m}"${f.medium===m?' selected':''}>${m}</option>`).join('')}</select>`;""",
    """  const medSel=`<select data-fmed="${fi}" style="flex:none;width:132px">${SCENE.vocabulary.media.map(m=>`<option value="${m.key}"${mediaKey(f.medium)===m.key?' selected':''}>${escq(m.name)}</option>`).join('')}</select>`;""",
)
swap(
    """  return `<div class="irow"><span style="flex:none;width:9px;height:9px;border-radius:50%;background:${MEDIA[f.medium]}"></span>""",
    """  return `<div class="irow"><span style="flex:none;width:9px;height:9px;border-radius:50%;background:${mediaColor(f.medium)}"></span>""",
)
swap(
    """      return `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 5px 5px 0;padding:2px 9px;border:1px solid #c8ab6f;border-radius:11px;font-size:11px;background:#fdf6e0"><i style="width:8px;height:8px;border-radius:50%;background:${MEDIA[f.medium]};display:inline-block"></i>""",
    """      return `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 5px 5px 0;padding:2px 9px;border:1px solid #c8ab6f;border-radius:11px;font-size:11px;background:#fdf6e0"><i style="width:8px;height:8px;border-radius:50%;background:${mediaColor(f.medium)};display:inline-block"></i>""",
)
swap(
    """  B.querySelector('#iFOutAdd').onclick=()=>{const other=SCENE.structures.find(x=>x.key!==s.key);
    SCENE.flows.push({from:s.key,to:other?other.key:null,medium:'food',note:'',phase:s.phase});""",
    """  B.querySelector('#iFOutAdd').onclick=()=>{const other=SCENE.structures.find(x=>x.key!==s.key);
    SCENE.flows.push({from:s.key,to:other?other.key:null,medium:'food-raw',note:'',phase:s.phase});""",
)

# ── 5. Amora's own flows, in the finer words ─────────────────────────────
for a, b in [
    ("{from:'greenhouse',to:'kitchen',medium:'food',", "{from:'greenhouse',to:'kitchen',medium:'food-raw',"),
    ("{from:'foodforest',to:'kitchen',medium:'food',", "{from:'foodforest',to:'kitchen',medium:'food-raw',"),
    ("{from:'greenhouse',to:'market',medium:'food',", "{from:'greenhouse',to:'market',medium:'food-raw',"),
    ("{from:'kitchen',to:'community',medium:'food',", "{from:'kitchen',to:'community',medium:'food-prepared',"),
    ("{from:null,to:'kitchen',medium:'food',", "{from:null,to:'kitchen',medium:'food-raw',"),
    # A library lends finished things; what arrives from town is raw.
    ("{from:'library',to:'ridgeA',medium:'materials',", "{from:'library',to:'ridgeA',medium:'materials-finished',"),
    ("{from:'library',to:'community',medium:'materials',", "{from:'library',to:'community',medium:'materials-finished',"),
    ("{from:null,to:'library',medium:'materials',", "{from:null,to:'library',medium:'materials-raw',"),
    ("{from:null,to:'ridgeA',medium:'materials',", "{from:null,to:'ridgeA',medium:'materials-raw',"),
]:
    swap(a, b)

# ── 6. The dress rides the skin, the words ride the scene ────────────────
swap(
    "const SKIN={theme:'Emerald Atlas',words:'',accent:null,parch:null,lbl:100,mist:false,glow:true};window.SKIN=SKIN;",
    "const SKIN={theme:'Emerald Atlas',words:'',accent:null,parch:null,lbl:100,mist:false,glow:true,\n"
    "  flow_style:'glyph'};window.SKIN=SKIN; // 'glyph' | 'gold' | 'medium'",
)
swap(
    """      vocabulary:{road:SUBTYPES.road.slice(),water:SUBTYPES.water.slice(),zone:SUBTYPES.zone.slice(),""",
    """      vocabulary:{road:SUBTYPES.road.slice(),water:SUBTYPES.water.slice(),zone:SUBTYPES.zone.slice(),
        media:SCENE.vocabulary.media.map(m=>({...m})),""",
)
swap(
    """  if(voc)['road','water','zone'].forEach(k2=>{if(Array.isArray(voc[k2])&&voc[k2].length)SUBTYPES[k2]=voc[k2].slice()});""",
    """  if(voc)['road','water','zone'].forEach(k2=>{if(Array.isArray(voc[k2])&&voc[k2].length)SUBTYPES[k2]=voc[k2].slice()});
  if(voc&&Array.isArray(voc.media)&&voc.media.length){
    SCENE.vocabulary.media=voc.media.map(m=>({key:m.key,name:m.name||m.key,color:m.color||'#e8c877',glyph:m.glyph||'seed'}));
    rebuildMedia();flowSpriteReset()}""",
)
swap(
    """  SCENE.flows=(J.map_flows||[]).map(r=>({from:r.from_key,to:r.to_key,medium:r.medium,note:r.note,""",
    """  SCENE.flows=(J.map_flows||[]).map(r=>({from:r.from_key,to:r.to_key,medium:mediaKey(r.medium),note:r.note,""",
)

# ── 7. The copy catches up with the taxonomy ─────────────────────────────
# Two lines named three colours. There are nine kinds now, and each wears its
# own mark, so the sentence that taught the old code is the wrong lesson.
swap(
    "  toast(flowsOn?'Flows lens on. Blue is water, gold is matter, rose is care.':'Flows lens off');",
    "  toast(flowsOn?'Flows lens on. Every kind of moving thing wears its own mark: a droplet for water, a bowl for a cooked meal, a leaf for compost.':'Flows lens off');",
)
swap(
    "    lyFlows:'The village metabolism. Blue is water, gold is matter, rose is care.',",
    "    lyFlows:'The village metabolism. Each kind of moving thing wears its own mark, and the line beneath it keeps that colour.',",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D3.1 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
