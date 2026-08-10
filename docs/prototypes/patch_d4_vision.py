#!/usr/bin/env python3
"""D4.4: the Vision gets a boundary of its own.

Rye: "vision mode can have its own boundary." A village that means to buy the
next ridge should be able to draw the ridge, without the map treating it as
land it already owns.

`SCENE.vision_bound` is optional and null by default, in which case the Vision
uses the real line and nothing changes. In build mode WHILE in Vision, the
◇ Boundary button edits the dreamed line instead: the same editor, the same
drag, the same undo, a second target. It draws only in Vision, dashed and
gold, outside the line that is real.

The stranded check keeps using the REAL bound, always. A building inside the
dream and outside the deed is still outside the deed.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d4_vision.py [grounds-v0.html]
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


# ── 1. Two lines, one editor ─────────────────────────────────────────────
swap(
    "let boundaryMode=false,boundDrag=null,boundPrev=null;",
    """let boundaryMode=false,boundDrag=null,boundPrev=null;
/* Which line the editor has hold of. In Vision it is the dreamed one, and
   everywhere else it is the deed. */
function editingVision(){return typeof mode!=='undefined'&&mode==='vision'&&buildMode}
function boundTarget(){
  if(!editingVision())return SCENE.bound;
  if(!Array.isArray(SCENE.vision_bound)||SCENE.vision_bound.length<3){
    /* Seeded from the real line pushed outward, so there is something to take
       hold of on the first drag rather than an empty field to click at. */
    const c=SCENE.bound.reduce((a,p)=>[a[0]+p[0]/SCENE.bound.length,a[1]+p[1]/SCENE.bound.length],[0,0]);
    SCENE.vision_bound=SCENE.bound.map(p=>[c[0]+(p[0]-c[0])*1.18,c[1]+(p[1]-c[1])*1.18]);
    logEdit('vision-boundary-seed','vision_bound',{vertices:SCENE.vision_bound.length});
  }
  return SCENE.vision_bound}
window.boundTarget=boundTarget;window.editingVision=editingVision;""",
)
swap(
    """function boundHit(px,py){const n=SCENE.bound.length;
  for(let i=0;i<n;i++){const[sx,sy]=worldToScreen(SCENE.bound[i][0],SCENE.bound[i][1]);
    if(((sx/DPR-px)**2+(sy/DPR-py)**2)<12*12)return{t:'v',i}}
  for(let i=0;i<n;i++){const a=SCENE.bound[i],b=SCENE.bound[(i+1)%n];""",
    """function boundHit(px,py){const B=boundTarget(),n=B.length;
  for(let i=0;i<n;i++){const[sx,sy]=worldToScreen(B[i][0],B[i][1]);
    if(((sx/DPR-px)**2+(sy/DPR-py)**2)<12*12)return{t:'v',i}}
  for(let i=0;i<n;i++){const a=B[i],b=B[(i+1)%n];""",
)
swap(
    """  const h=boundHit(e.clientX,e.clientY);if(!h)return false;
  boundPrev=SCENE.bound.map(pt=>[pt[0],pt[1]]);
  if(h.t==='m'){const[wx,wy]=screenToWorld(e.clientX,e.clientY);
    SCENE.bound.splice(h.i+1,0,[wx,wy]);boundDrag={i:h.i+1,moved:true}}
  else boundDrag={i:h.i,moved:false};""",
    """  const h=boundHit(e.clientX,e.clientY);if(!h)return false;
  const B=boundTarget(),vis=editingVision();
  boundPrev=B.map(pt=>[pt[0],pt[1]]);
  if(h.t==='m'){const[wx,wy]=screenToWorld(e.clientX,e.clientY);
    B.splice(h.i+1,0,[wx,wy]);boundDrag={i:h.i+1,moved:true,vis}}
  else boundDrag={i:h.i,moved:false,vis};""",
)
swap(
    """  const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  SCENE.bound[boundDrag.i][0]=wx;SCENE.bound[boundDrag.i][1]=wy;boundDrag.moved=true});""",
    """  const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  const B=boundDrag.vis?SCENE.vision_bound:SCENE.bound;
  if(B&&B[boundDrag.i]){B[boundDrag.i][0]=wx;B[boundDrag.i][1]=wy}boundDrag.moved=true});""",
)
swap(
    """  if(boundDrag.moved){UNDO.push({t:'bound',prev:boundPrev});
    logEdit('boundary-edit','boundary',{vertices:SCENE.bound.length});
    strandedCheck(true);paintTerrain();mmDirty=true}""",
    """  if(boundDrag.moved){const vis=boundDrag.vis;
    UNDO.push({t:'bound',prev:boundPrev,vis});
    logEdit(vis?'vision-boundary-edit':'boundary-edit',vis?'vision_bound':'boundary',
      {vertices:(vis?SCENE.vision_bound:SCENE.bound).length});
    /* the dream never strands anybody: the deed decides who is outside */
    if(!vis)strandedCheck(true);
    paintTerrain();mmDirty=true}""",
)
swap(
    """  const h=boundHit(e.clientX,e.clientY);
  if(h&&h.t==='v'){if(SCENE.bound.length<=3)return toast('A boundary needs at least three corners.');
    UNDO.push({t:'bound',prev:SCENE.bound.map(pt=>[pt[0],pt[1]])});
    SCENE.bound.splice(h.i,1);logEdit('boundary-delete-vertex','boundary',{vertices:SCENE.bound.length});
    strandedCheck(true);paintTerrain();mmDirty=true}});""",
    """  const h=boundHit(e.clientX,e.clientY);
  const B=boundTarget(),vis=editingVision();
  if(h&&h.t==='v'){if(B.length<=3)return toast('A boundary needs at least three corners.');
    UNDO.push({t:'bound',prev:B.map(pt=>[pt[0],pt[1]]),vis});
    B.splice(h.i,1);logEdit(vis?'vision-boundary-delete-vertex':'boundary-delete-vertex',vis?'vision_bound':'boundary',{vertices:B.length});
    if(!vis)strandedCheck(true);
    paintTerrain();mmDirty=true}});""",
)
swap(
    """  if(u.t==='bound'){SCENE.bound.length=0;u.prev.forEach(pt=>SCENE.bound.push(pt));strandedCheck(false);paintTerrain();mmDirty=true}""",
    """  if(u.t==='bound'){
    if(u.vis){SCENE.vision_bound=u.prev.map(pt=>[pt[0],pt[1]])}
    else{SCENE.bound.length=0;u.prev.forEach(pt=>SCENE.bound.push(pt));strandedCheck(false)}
    paintTerrain();mmDirty=true}""",
)
# the editor draws whichever line it holds
swap(
    """  const z=cam.z,n=SCENE.bound.length;
  cx.save();
  cx.setLineDash([12/z,8/z]);cx.strokeStyle='rgba(236,208,138,.95)';cx.lineWidth=2.6/z;
  cx.beginPath();SCENE.bound.forEach((pt,i)=>i?cx.lineTo(pt[0],pt[1]):cx.moveTo(pt[0],pt[1]));cx.closePath();cx.stroke();
  cx.setLineDash([]);
  for(let i=0;i<n;i++){const a=SCENE.bound[i],b=SCENE.bound[(i+1)%n];""",
    """  const B=boundTarget(),z=cam.z,n=B.length;
  cx.save();
  cx.setLineDash([12/z,8/z]);cx.strokeStyle='rgba(236,208,138,.95)';cx.lineWidth=2.6/z;
  cx.beginPath();B.forEach((pt,i)=>i?cx.lineTo(pt[0],pt[1]):cx.moveTo(pt[0],pt[1]));cx.closePath();cx.stroke();
  cx.setLineDash([]);
  for(let i=0;i<n;i++){const a=B[i],b=B[(i+1)%n];""",
)
swap(
    """  for(let i=0;i<n;i++){const pt=SCENE.bound[i];
    const drag=boundDrag&&boundDrag.i===i;""",
    """  for(let i=0;i<n;i++){const pt=B[i];
    const drag=boundDrag&&boundDrag.i===i;""",
)
swap(
    "$('boundBtn').onclick=()=>{boundaryMode=!boundaryMode;",
    """/* The button says which line it is about to hand you. */
function syncBoundBtn(){const b=$('boundBtn');if(!b)return;
  b.textContent=(typeof mode!=='undefined'&&mode==='vision')?'◇ Vision boundary':'◇ Boundary'}
window.syncBoundBtn=syncBoundBtn;syncBoundBtn();
$('boundBtn').onclick=()=>{boundaryMode=!boundaryMode;""",
)

# ── 2. The dreamed line, drawn only in the dream ─────────────────────────
swap(
    "  if(window.drawBoundaryEditor)window.drawBoundaryEditor(t);",
    """  /* The acquisition, drawn where it belongs: in the Vision, outside the
     line that is real, and never mistaken for it. */
  if(mode==='vision'&&Array.isArray(SCENE.vision_bound)&&SCENE.vision_bound.length>2){
    cx.save();cx.setLineDash([16/cam.z,11/cam.z]);
    cx.strokeStyle='rgba(236,208,138,.55)';cx.lineWidth=2.2/cam.z;
    cx.beginPath();SCENE.vision_bound.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));
    cx.closePath();cx.stroke();cx.setLineDash([]);cx.restore()}
  if(window.drawBoundaryEditor)window.drawBoundaryEditor(t);""",
)
# and the camera lets you reach it while you are dreaming
swap(
    """  for(const s of SCENE.structures){
    if(s.x<x0)x0=s.x;if(s.x>x1)x1=s.x;
    if(s.y<y0)y0=s.y;if(s.y>y1)y1=s.y}""",
    """  for(const s of SCENE.structures){
    if(s.x<x0)x0=s.x;if(s.x>x1)x1=s.x;
    if(s.y<y0)y0=s.y;if(s.y>y1)y1=s.y}
  /* In the Vision the dreamed line is part of what there is to look at. */
  if(typeof mode!=='undefined'&&mode==='vision'&&Array.isArray(SCENE.vision_bound))
    for(const p of SCENE.vision_bound){
      if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];
      if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}""",
)

# ── 3. The contract ──────────────────────────────────────────────────────
swap(
    """      vision_of:null,exported_at:iso},""",
    """      vision_of:null,exported_at:iso,
      /* null means the Vision uses the real line, which is the default and
         the only thing most villages will ever need */
      vision_bound:Array.isArray(SCENE.vision_bound)?SCENE.vision_bound.map(p=>[p[0],p[1]]):null},""",
)
swap(
    """  if(voc&&voc.phases&&typeof voc.phases==='object')""",
    """  const vb=J.map_scene&&J.map_scene.vision_bound;
  SCENE.vision_bound=(Array.isArray(vb)&&vb.length>2)?vb.map(p=>[p[0],p[1]]):null;
  if(voc&&voc.phases&&typeof voc.phases==='object')""",
)
rep(
    "SCENE.vocabulary=SCENE.vocabulary||{};",
    "\nSCENE.vision_bound=SCENE.vision_bound||null; // the dreamed acquisition, drawn only in the Vision",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D4.4 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
