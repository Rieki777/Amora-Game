#!/usr/bin/env python3
"""The geography names join the collision engine.

With the land extended out to the rim, the whole-land view is the view people
will actually sit in, and in it "Poza Azul falls" printed straight through
"The Arrival". District plates learned to dodge the marks and each other in
D2; the geography names never learned anything, because until now they had a
lot of empty sea to sit in.

A geography name yields to a district plate rather than the other way round: a
district is the village's own word for a place, and a river is context.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d3_geolabels.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


swap(
    """  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);
    el.style.display=(cam.z<1.25&&roomy)?'block':'none';el.style.left=sx/DPR+'px';el.style.top=sy/DPR+'px'});""",
    """  GEO.forEach((g,i)=>{const el=bEls['g_'+i];const[sx,sy]=worldToScreen(g.x,g.y);
    const hideG=!(cam.z<1.25&&roomy);el.style.display=hideG?'none':'block';if(hideG)return;
    /* Last into the same pass the district plates just ran, so a place-name
       steps around a district rather than through it. */
    const gw=el.offsetWidth||120,gh=el.offsetHeight||20;
    const gx2=sx/DPR;let gy2=dodgeMarks(gx2,sy/DPR,gw,gh),g3=0,hit3=true;
    while(hit3&&g3++<4){hit3=false;
      for(let i2=0;i2<placedD.length;i2++){const o=placedD[i2];
        if(Math.abs(gx2-o.x)*2<(gw+o.w)+14&&Math.abs(gy2-o.y)<gh+8){gy2=o.y-(gh+8);hit3=true}}
      const ny=dodgeMarks(gx2,gy2,gw,gh);if(ny!==gy2){gy2=ny;hit3=true}}
    el.style.left=gx2+'px';el.style.top=gy2+'px';placedD.push({x:gx2,y:gy2,w:gw})});""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D3 geo labels patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
