# scratch: anchor counts for the L5 fix pass. Substring counts only, no regex
# over a 5.5 MB file.
import io, os
HERE = os.path.dirname(os.path.abspath(__file__))
s = io.open(os.path.join(HERE, '..', 'grounds-v0.html'), encoding='utf-8', newline='').read()
tests = {
    'css icons': "  #icons{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10}\n",
    'dom canvas': '<canvas id="scene"></canvas>\n<div id="icons"></div>\n',
    'fit': "function fit(){DPR=Math.min(window.devicePixelRatio||1,2);cv.width=innerWidth*DPR;cv.height=innerHeight*DPR;cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px'}\n",
    'drawcall': "  if(orgOn&&typeof roleLens==='function')roleLens(cx,mode,t);\n",
    'window.roleLens': "window.roleLens=roleLens;\n",
    'satcall': "      roleSat(cx,s.x+R*Math.cos(a),s.y+R*Math.sin(a),\n",
    'setTransform': "cx.setTransform(cam.z*DPR,0,0,cam.z*DPR,cv.width/2-cam.x*cam.z*DPR,cv.height/2-cam.y*cam.z*DPR);",
    'let DPR': 'let DPR',
    'const cv=': "const cv=document.getElementById('scene')",
    'let cam': 'let cam=',
    'const cam': 'const cam=',
    'fit();addEventListener': "fit();addEventListener('resize',()=>{fit();mmDirty=true});",
}
for k, v in tests.items():
    print('%-18s %d' % (k, s.count(v)))
for probe in ('cam={', 'DPR=1', 'window.ROLE_LAST_SATS'):
    i = s.find(probe)
    print('%-18s first at %d' % (probe, i))
    if i > 0:
        print('    ...' + s[max(0, i - 90):i + 90].replace('\n', ' | '))
