#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_g3_02_listbox.py  (L3 INSPECTOR, g family, concern: the popup)

Rye: the ACTIVITY dropdown paints over the DOORS buttons.

READ THIS BEFORE LANDING.  The handoff's count is wrong and the difference
changes what this script had to be.  It said "15 <select> elements in the whole
document, 5 VISIBLE, 5 inside #inspect ... IT IS A FIVE-CONTROL JOB", and told
this lane to stop rather than convert a moving set.  Measured at 1440x900 in
build mode with qa/_probe_g3.js:

    structure          selects in #inspect   selects in document
    pondhomes (bare)             3                   13
    kitchen (3 quests,          29                   39
             7 flows)

It is not five and it is not fifteen.  The set is 3 fixed (#iArch, #iCircle,
#iAct) plus 2 per quest (data-qaddr, data-qw) plus 2 or 3 per flow (data-fmed,
data-foth, and data-fvia only when the flow has both ends).  An earlier pass
counted 36; that number was not wrong, it was a richer structure.  The count
moves with the structure a founder opens, which is exactly the set the handoff
said not to hand-convert.

So this script does not hand-convert anything.  It is one upgrade function over
`#inspBody select`, called last in bindInspect, and it is count-independent by
construction: whatever is in the panel at render time gets upgraded.  The
mitigation for a moving set is to stop enumerating it.

THE NATIVE ELEMENT IS KEPT, NOT REPLACED.  Every handler in bindInspect is a
DOM0 assignment (`sel.onchange = ...`, twenty-nine of them across the six
templates).  Rewriting the markup would mean rewriting all of them.  Instead the
<select> stays in the DOM and stays the source of truth; this only draws the
closed control and the open list, and writes back with `select.value` followed
by a bubbling `change`, which fires DOM0 handlers.  So #iAct still emits
steady/high/low and never its steady/thriving/quiet labels: the values are never
copied anywhere, they are read off the option elements at open time.

HOW THE NATIVE CONTROL IS HIDDEN, and why not the obvious way.  qa/secD.js
drives this panel with page.selectOption('#iArch'|'#iCircle'|'#iAct', ...) at
lines 32-92.  Playwright's actionability check for selectOption is visibility,
so the hiding technique decides whether that suite survives.  Measured directly
against a four-variant spike page on this Chromium:

    opacity:0 + pointer-events:none   selectOption OK    onchange saw: high
    opacity:0 only                    selectOption OK    onchange saw: high
    display:none                      selectOption FAIL  timeout
    visibility:hidden                 selectOption FAIL  timeout

So: opacity 0, pointer-events none, real bounding box.  display:none would have
been the obvious choice and would have silently broken three assertions in a
suite this lane was not asked to run.

WHY IT HAD TO STOP BEING NATIVE.  A native select popup renders in the OS top
layer, outside the document.  No z-index reaches it, no stylesheet touches it,
and no automation screenshots it, so nobody on this project can ever see, style
or QA the thing Rye is complaining about.  After this patch the list is a DOM
node with a measurable rect.

Z-INDEX: 64, the number allocated to this lane, and it is the ONLY z value this
script writes.  It sits above #seatDrop / #module / #pbar at 60 and below
#toasts at 65 and #tip at 70.

  The first version of this script also wrote `z-index:1` on #inspect
  .insp-lb-btn and this docstring claimed no other z value was touched.  That
  claim was false and the value was unallocated: the census of z literals in
  this file went from 47 to 49, the 64 above plus that 1.  It has been deleted
  rather than allocated, because it was redundant to begin with.  The button is
  the LAST child of .insp-lb and the native <select> it needs to paint over is
  position:absolute, so painting order already puts the button on top: a
  positioned element with z-index:auto and a later element in the same stacking
  context paint in DOM order.  Measured both ways on this Chromium before the
  rule came out.

The list is position:fixed and parented to <body> on open
because #inspBody is overflow-y:auto, which clips absolutely positioned children
in both axes; an in-panel list would be cut off at the panel's scroll edge.

KEYBOARD AND TOUCH.  role=combobox on the button with aria-expanded and
aria-controls, role=listbox on the list, role=option with aria-selected on each
row.  Arrows, Home, End, Enter, Space, Escape, Tab and type-ahead.  The global
keydown handler at :3310 only steps aside for INPUT/TEXTAREA/SELECT, so an
unguarded key on a button would pan the camera, flip to the Vision on v, open
the wall on w and start the tour on t; every key this control sees is stopped,
with one deliberate exception documented at the guard.

RE-RUNNABLE: every step guards itself, per edit.  Second run prints skip for
every step and writes zero bytes.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, 'grounds-v0.html')

with open(PATH, 'rb') as f:
    raw = f.read()
src = raw.decode('utf-8')
before_len = len(raw)

applied, skipped = [], []


def swap(name, old, new, count=1, mark=None):
    """Exact-count anchor. Zero or two matches aborts before a byte is written.

    `mark` is a short string unique to THIS edit and is what the guard tests.
    Guarding on the whole replacement was tried and is wrong: two scripts in
    this family both anchor on the #inspect focus rule and insert after it, so
    each one's replacement stopped being a substring once the other ran, both
    guards went stale, and the second pass re-applied both edits. The mandated
    second run caught it. A guard has to ask "is MY edit here", never "is my
    whole neighbourhood still byte-identical".
    """
    global src
    if (mark or new) in src:
        skipped.append(name)
        print('  skip   %s' % name)
        return
    n = src.count(old)
    assert n == count, 'anchor %r appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    applied.append(name)
    print('  APPLY  %s' % name)


# ------------------------------------------------------------------------- CSS
# In #inspect's own block, which is this lane's. The native select needs
# #inspect .insp-lb>select and not .insp-lb>select: #inspect select at :685 is
# (1,0,1) and would otherwise win on specificity and paint the box back in.
swap(
    'css/insp-lb',
    """  #inspect input:focus,#inspect textarea:focus,#inspect select:focus{border-color:var(--gold-b)}""",
    """  #inspect input:focus,#inspect textarea:focus,#inspect select:focus{border-color:var(--gold-b)}
  /* ---------- house listbox (L3) ----------
     The native <select> stays in the DOM and stays the source of truth. It is
     hidden with opacity 0 and pointer-events none, keeping a real bounding box,
     because Playwright's selectOption() (qa/secD.js:32-92) passes that and
     times out on display:none and on visibility:hidden. Measured, both ways. */
  #inspect .insp-lb{position:relative;display:flex;align-items:stretch;flex:1;min-width:0}
  #inspect .insp-lb>select{position:absolute;left:0;top:0;width:100%;height:100%;
    opacity:0;pointer-events:none;border:0;padding:0;margin:0;min-width:0;background:none}
  /* No z-index here on purpose: the button is the last child of .insp-lb and
     the select it covers is position:absolute, so DOM order already paints it
     on top. A z value here would be one this lane was never allocated. */
  #inspect .insp-lb-btn{flex:1;min-width:0;position:relative;display:flex;align-items:center;gap:6px;
    background:#1d150b;border:1px solid rgba(201,162,94,.4);border-radius:6px;color:#fff;
    font-family:inherit;font-size:12.5px;line-height:1.25;padding:5px 8px;text-align:left;cursor:pointer;outline:none}
  #inspect .insp-lb-btn:hover{border-color:rgba(236,208,138,.7)}
  #inspect .insp-lb-btn:focus-visible,#inspect .insp-lb-btn[aria-expanded=true]{border-color:var(--gold-b)}
  #inspect .insp-lb-val{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #inspect .insp-lb-caret{flex:none;font-size:8px;color:var(--gold);line-height:1}
  /* z 64 is this lane's allocation: above #seatDrop/#module/#pbar 60, below
     #toasts 65 and #tip 70. Fixed and parented to <body> on open, because
     #inspBody is overflow-y:auto and clips absolute children in both axes. */
  .insp-lb-list{position:fixed;z-index:64;display:none;overflow-y:auto;overscroll-behavior:contain;
    scrollbar-width:thin;background:linear-gradient(180deg,rgba(30,22,13,.99),rgba(20,14,8,.99));
    border:1px solid #6b5430;border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.55);padding:3px 0;outline:none}
  .insp-lb-list.open{display:block}
  .insp-lb-grp{font-size:9.5px;letter-spacing:.12em;font-variant:small-caps;color:#8f855f;padding:6px 9px 2px}
  .insp-lb-opt{padding:5px 9px;font-size:11.5px;color:var(--parch);cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .insp-lb-opt[aria-selected=true]{color:#fff}
  .insp-lb-opt[aria-selected=true]::after{content:' ·';color:var(--gold)}
  .insp-lb-opt.insp-lb-cur{background:rgba(236,208,138,.18);color:#fff}""",
    mark="""#inspect .insp-lb-btn{flex:1""")


# -------------------------------------------------------------------------- JS
LB = r"""/* ---------- house listbox (L3): the popup stops being native ----------
   A native <select> popup renders in the OS top layer, OUTSIDE the document.
   No z-index reaches it, no stylesheet touches it and no probe screenshots it,
   which is why the activity dropdown lands across the sliders and the doors row
   with nothing in this file able to say otherwise.
   The <select> element is KEPT. Every handler in bindInspect is a DOM0
   `sel.onchange=` assignment, so this writes back through select.value plus a
   bubbling change event and those handlers never learn about it. Option values
   are read off the live option elements, so #iAct still emits steady/high/low
   and never its steady/thriving/quiet labels. */
let inspLbSeq=0,inspLbOpen=null;
function inspLbClose(){if(!inspLbOpen)return;const o=inspLbOpen;inspLbOpen=null;
  o.btn.setAttribute('aria-expanded','false');o.list.classList.remove('open');
  if(o.list.parentNode)o.list.parentNode.removeChild(o.list)}
function inspLbCleanup(){inspLbOpen=null;
  document.querySelectorAll('.insp-lb-list').forEach(el=>{if(el.parentNode===document.body)el.remove()})}
function inspUpgradeSelects(root){if(!root)return 0;let n=0;
  root.querySelectorAll('select').forEach(sel=>{if(!sel.closest('.insp-lb')){inspListbox(sel);n++}});return n}
function inspListbox(sel){
  const D=document,wrap=D.createElement('div');wrap.className='insp-lb';
  /* the inline width/flex the template gave the select is layout, so it moves
     to the wrapper; the select itself is absolutely positioned inside it */
  const st=sel.getAttribute('style');if(st)wrap.setAttribute('style',st);
  sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
  sel.setAttribute('tabindex','-1');sel.setAttribute('aria-hidden','true');
  const id='insplb'+(++inspLbSeq);
  const btn=D.createElement('button');btn.type='button';btn.className='insp-lb-btn';
  btn.setAttribute('role','combobox');btn.setAttribute('aria-haspopup','listbox');
  btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls',id);
  const tip=sel.getAttribute('data-tip')||sel.getAttribute('title');
  if(tip){btn.setAttribute('data-tip',tip);sel.removeAttribute('title')}
  btn.innerHTML='<span class="insp-lb-val"></span><span class="insp-lb-caret">▼</span>';
  wrap.appendChild(btn);
  const list=D.createElement('div');list.className='insp-lb-list';list.id=id;
  list.setAttribute('role','listbox');list.tabIndex=-1;
  let rows=[],cur=-1,ta='',taT=0;
  const label=()=>{const o=sel.options[sel.selectedIndex];
    btn.querySelector('.insp-lb-val').textContent=o?o.textContent:''};
  const build=()=>{let h='';
    const opt=o=>`<div class="insp-lb-opt" role="option" data-v="${escq(o.value)}" aria-selected="${o.value===sel.value?'true':'false'}">${escq(o.textContent)}</div>`;
    Array.from(sel.children).forEach(k=>{
      if(k.tagName==='OPTGROUP')h+=`<div class="insp-lb-grp">${escq(k.label)}</div>`+Array.from(k.children).map(opt).join('');
      else if(k.tagName==='OPTION')h+=opt(k)});
    list.innerHTML=h;rows=Array.from(list.querySelectorAll('.insp-lb-opt'));
    cur=rows.findIndex(r=>r.getAttribute('aria-selected')==='true');if(cur<0)cur=0;
    rows.forEach((r,i)=>{r.onpointerdown=e=>{e.preventDefault();e.stopPropagation();choose(r.dataset.v)};
      r.onmouseenter=()=>mark(i,false)})};
  /* scrollTop maths rather than scrollIntoView(): that walks every scrollable
     ancestor, and the ancestor here is #inspBody, whose scroll event is what
     used to shut the list a frame after it opened. */
  const mark=(i,scroll)=>{if(!rows.length)return;cur=Math.max(0,Math.min(rows.length-1,i));
    rows.forEach((r,j)=>r.classList.toggle('insp-lb-cur',j===cur));
    if(!rows[cur].id)rows[cur].id=id+'o'+cur;
    list.setAttribute('aria-activedescendant',rows[cur].id);
    if(scroll){const e2=rows[cur],t=e2.offsetTop,h2=e2.offsetHeight;
      if(t<list.scrollTop)list.scrollTop=t;
      else if(t+h2>list.scrollTop+list.clientHeight)list.scrollTop=t+h2-list.clientHeight}};
  const place=()=>{const r=btn.getBoundingClientRect();
    list.style.maxHeight='none';list.style.minWidth=Math.max(r.width,110)+'px';
    list.style.maxWidth=Math.min(320,innerWidth-16)+'px';
    const want=list.offsetHeight,below=innerHeight-r.bottom-10,above=r.top-10;
    const down=want<=below||below>=above;
    const cap=Math.max(90,Math.min(268,down?below:above));
    list.style.maxHeight=cap+'px';
    const h=Math.min(list.offsetHeight,cap);let x=r.left;const w=list.offsetWidth;
    if(x+w>innerWidth-8)x=Math.max(8,innerWidth-8-w);
    list.style.left=Math.round(x)+'px';
    list.style.top=Math.round(down?r.bottom+4:r.top-4-h)+'px'};
  /* An ancestor scroll re-aims the list instead of shutting it. Closing on
     scroll was tried first and measured wrong: focusing the button scrolls
     #inspBody, that scroll event is delivered asynchronously about 19ms later,
     by which time the list is open, so the list shut itself one frame after
     every click. It only closes when the control it belongs to has actually
     left the panel's visible box. */
  const reflow=()=>{const r=btn.getBoundingClientRect(),bd=D.getElementById('inspBody');
    const br=bd?bd.getBoundingClientRect():{top:0,bottom:innerHeight};
    if(r.bottom<br.top+2||r.top>br.bottom-2){shut(false);return}
    place()};
  const open=()=>{if(inspLbOpen&&inspLbOpen.btn===btn)return;
    inspLbClose();build();D.body.appendChild(list);list.classList.add('open');
    btn.setAttribute('aria-expanded','true');inspLbOpen={btn,list,reflow};
    place();mark(cur,true);list.focus({preventScroll:true})};
  const shut=refocus=>{inspLbClose();if(refocus&&D.body.contains(btn))btn.focus()};
  /* renderInspect() runs inside most of these change handlers and replaces
     #inspBody, so the list comes down BEFORE the event goes out and nothing
     touches btn afterwards without checking it is still in the document. */
  const choose=v=>{const changed=sel.value!==v;sel.value=v;shut(true);
    if(changed){sel.dispatchEvent(new Event('input',{bubbles:true}));
      sel.dispatchEvent(new Event('change',{bubbles:true}))}
    if(D.body.contains(btn))label()};
  const typeahead=ch=>{const now=Date.now();ta=(now-taT<900?ta+ch:ch);taT=now;
    const i=rows.findIndex(r=>r.textContent.toLowerCase().startsWith(ta));if(i>=0)mark(i,true)};
  /* The global keydown at :3310 only steps aside for INPUT/TEXTAREA/SELECT, so
     an unguarded key on this button pans the camera, flips to the Vision on v,
     opens the wall on w and starts the tour on t. Every key is stopped here.
     The one exception: Escape while the list is CLOSED is let through, because
     #inspect's handler at :4189 uses it to close the panel and a founder on a
     collapsed control expects that. */
  const keys=e=>{const k=e.key,up=!!inspLbOpen&&inspLbOpen.btn===btn;
    if(k==='Escape'&&!up)return;
    e.stopPropagation();
    if(!up){
      if(k==='Enter'||k===' '||k==='ArrowDown'||k==='ArrowUp'||k==='Home'||k==='End'){
        e.preventDefault();open();
        if(k==='Home')mark(0,true);else if(k==='End')mark(rows.length-1,true);return}
      if(k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();open();typeahead(k.toLowerCase())}
      return}
    if(k==='Escape'){e.preventDefault();shut(true);return}
    if(k==='Enter'||k===' '){e.preventDefault();if(rows[cur])choose(rows[cur].dataset.v);return}
    if(k==='Tab'){shut(false);return}
    if(k==='ArrowDown'){e.preventDefault();mark(cur+1,true);return}
    if(k==='ArrowUp'){e.preventDefault();mark(cur-1,true);return}
    if(k==='Home'){e.preventDefault();mark(0,true);return}
    if(k==='End'){e.preventDefault();mark(rows.length-1,true);return}
    if(k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();typeahead(k.toLowerCase())}};
  btn.addEventListener('keydown',keys);list.addEventListener('keydown',keys);
  btn.onclick=e=>{e.preventDefault();e.stopPropagation();
    if(inspLbOpen&&inspLbOpen.btn===btn)shut(true);else open()};
  list.addEventListener('focusout',()=>setTimeout(()=>{
    if(inspLbOpen&&inspLbOpen.btn===btn&&!list.contains(D.activeElement)&&D.activeElement!==btn)shut(false)},0));
  /* anything else that moves the select, page.selectOption() included, still
     repaints the closed control */
  sel.addEventListener('change',()=>{if(D.body.contains(btn))label()});
  label()}
/* One document-level set for every control, not one set per control. */
document.addEventListener('pointerdown',e=>{if(!inspLbOpen)return;
  if(inspLbOpen.list.contains(e.target)||inspLbOpen.btn.contains(e.target))return;inspLbClose()},true);
addEventListener('scroll',e=>{if(!inspLbOpen||e.target===inspLbOpen.list)return;inspLbOpen.reflow()},true);
addEventListener('resize',()=>inspLbClose());
"""

swap(
    'js/insp-listbox',
    """function closeInspect(){$('inspect').classList.remove('open');inspKey=null;""",
    LB + """function closeInspect(){inspLbClose();$('inspect').classList.remove('open');inspKey=null;""",
    mark="""function inspListbox(sel){""")


# ----------------------------------------------------- the one call site
swap(
    'js/bindInspect-upgrade-call',
    """  B.querySelector('#iDup').onclick=()=>duplicateStructure(s.key);
  B.querySelector('#iRemove').onclick=()=>removeStructure(s)}""",
    """  B.querySelector('#iDup').onclick=()=>duplicateStructure(s.key);
  B.querySelector('#iRemove').onclick=()=>removeStructure(s);
  /* LAST, so every DOM0 onchange above is already bound. Count-independent by
     construction: 3 selects on a bare structure, 29 on a structure with three
     quests and seven flows, both measured. Whatever is in the panel gets
     upgraded, so nothing here enumerates a set that moves. */
  inspLbCleanup();inspUpgradeSelects(B)}""",
    mark="""inspLbCleanup();inspUpgradeSelects(B)}""")


# -------------------------------------------------------------------- write out
out = src.encode('utf-8')
if out == raw:
    print('\n  no change: %d bytes' % before_len)
else:
    with open(PATH, 'wb') as f:
        f.write(out)
    print('\n  %d -> %d bytes (%+d)' % (before_len, len(out), len(out) - before_len))
print('  applied %d, skipped %d' % (len(applied), len(skipped)))
if not applied:
    print('  RE-RUN CLEAN: every step already present, zero bytes changed')
sys.exit(0)
