#!/usr/bin/env python3
"""
L8 / R14 — THE HELP THREADS: the conversations, and the way to each one.

WHAT WAS MEASURED FIRST, through the real handler at 390x844:

    #pbAttn.click()  ->  attnCard.innerHTML = 442 chars
                         getComputedStyle(#attention).display = "none"
                         attnCard visible = false
                         pbBadge = "20"

#pbAttn ran $('attnBtn').click(), which writes the attention card into
#attention — and body.pocket hides #attention with display:none!important
(:601). So on a phone the HELP button flew the camera to a place and then
showed nothing at all, under a badge promising twenty of them. That is the
state R14 was raised from.

WHAT IT SHOWS NOW. "sandwich out like regular social media style comments and
deep links for them to take me to the place for that comment": the village's
conversations, SCENE.threads, which is what a comment is on this map. Rows open
in place, one at a time; nothing navigates until the reader asks.

THE DEEP LINK IS PLUMBING, NOT INVENTION, and none of it is written here.
Every mark on this map is already addressable as #/place/<key>?item=<kind>:<id>;
itemAddr('talk',t) already names a thread (:2533); the Overview tab already
prints .cvrow[data-item="talk:…"] for every thread at a place (:3393); and
focusItem lights it and scrolls to it (:2544). A row calls openPanel(key,0,addr)
— the identical call routeHash makes for a pasted URL — so the row and the link
land on the same beat, and the address is in the bar afterwards either way.

TWO OF THE THIRTEEN LIVE NOWHERE and three live in more than one place. Both
are in the seed on purpose (multi-addressed per D10, `addr:null` for the rest),
so an open row offers ONE LINK PER PLACE it is addressed to, and an unaddressed
thread says so and opens the forum rather than guessing an address for it.

IT IS A TENANT OF THE BOTTOM BAND, not a fourth thing measuring from the same
edge. It hangs off the same measured #pbar floor as the maia sheet and the walk
card and reads --band-b-help, and it is FIRST in that list because it opens
under the thumb that asked for it: everything else in the band yields upward
when it appears, which is the arbitration working rather than a z-index fight.
Opening it also drops body.msheet and closes #pdrawer, because a 390px screen
holds one sheet.

THE BADGE COUNTS THE THING BEHIND IT. It mirrored #attnBadge — open seats and
urgent quests — over a button that opened neither. It now counts the
conversations the sheet lists, and the work that needs hands keeps its own
count, labelled, on the sheet's last row, where it still opens Get Involved.

Z-INDEX ALLOCATION (this lane owns the scale): #help = 57. Above the pocket
maia sheet (56) and below the walk card (58), so a guided walk still wins the
strip it is guiding, and below #pdrawer (59) and #pbar (60) so the tab bar the
reader is aiming at is never covered by what it opened.

Re-runnable. Each edit carries its own guard; a second run is all skips and
zero bytes changed.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "grounds-v0.html")


def load():
    with io.open(TARGET, "r", encoding="utf-8", newline="") as f:
        return f.read()


def save(s):
    with io.open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(s)


APPLIED = []
SKIPPED = []


def edit(src, name, anchor, new, guard, count=1):
    """One anchored replacement. The guard is PER EDIT, never per script."""
    if guard in src:
        SKIPPED.append(name)
        print("  skip   %s (guard already present)" % name)
        return src
    n = src.count(anchor)
    assert n == count, "%s: anchor found %d times, expected %d" % (name, n, count)
    out = src.replace(anchor, new, count)
    assert out != src, "%s: replacement changed nothing" % name
    assert guard in out, "%s: guard absent after apply" % name
    APPLIED.append(name)
    print("  apply  %s" % name)
    return out


src = load()
before = len(src)

# ------------------------------------------------------------------- 1. CSS
CSS_ANCHOR = "  #walkCard .wn{margin-left:auto;font-size:10px;color:#8a7347}"
CSS_NEW = CSS_ANCHOR + """

  /* ---------- HELP — the village talking, and the way to each conversation ----------
     A BAND TENANT, so `bottom` is published, never authored: --band-b-help
     carries the same fallback the toast column uses on this edge, which is
     where this would sit if the band block ever died.
     Capped at 42vh and the LIST scrolls, not the sheet: an uncapped sheet is a
     tenant whose height is the number of threads, and the band would spend the
     whole screen on it and clamp the walk card into the tab bar. */
  #help{position:fixed;left:8px;right:8px;bottom:var(--band-b-help,calc(70px + env(safe-area-inset-bottom,0px)));
    z-index:57;display:none;flex-direction:column;max-height:42vh;
    background:linear-gradient(180deg,rgba(26,19,11,.985),rgba(16,11,6,.99));
    border:1px solid #8a6a33;border-radius:14px;color:var(--parch);
    box-shadow:0 12px 34px rgba(0,0,0,.6);overflow:hidden}
  #help.show{display:flex}
  .help-head{display:flex;align-items:baseline;gap:8px;padding:10px 14px 8px;border-bottom:1px solid #4a3a22;flex:0 0 auto}
  .help-head h4{font-variant:small-caps;letter-spacing:.18em;font-weight:normal;color:var(--gold-b);font-size:12px}
  .help-sub{font-size:10px;color:#8f855f;font-style:italic}
  .help-close{margin-left:auto;appearance:none;background:none;border:none;color:var(--gold);
    font-family:inherit;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}
  /* min-height:0 is load-bearing, not tidiness. A flex child's default
     min-height is `auto`, which refuses to shrink below its content, and an
     overflow-y list inside a capped flex column then grows past its cap with
     its lower rows simply unreachable. Chromium resolves this one without the
     line; the phone this item was raised on is not Chromium. */
  .help-list{overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:0}
  .help-row{border-bottom:1px solid rgba(138,106,51,.28);padding:9px 14px;cursor:pointer}
  .help-row:last-child{border-bottom:none}
  .help-t{display:flex;gap:9px;align-items:flex-start}
  .help-t b{font-weight:normal;color:var(--parch);font-size:12.5px;line-height:1.35}
  .help-m{display:block;color:#8f855f;font-size:10.5px;margin-top:2px;line-height:1.4}
  .help-ex,.help-go{display:none}
  .help-row.open{background:rgba(60,46,26,.5)}
  .help-row.open .help-ex{display:block;font-size:11.5px;color:#d8cba2;line-height:1.45;margin:7px 0 0 25px}
  .help-row.open .help-go{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px 25px}
  .help-go .btn{font-size:11px;padding:4px 11px}
  .help-work{flex:0 0 auto;padding:9px 14px;border-top:1px solid #4a3a22;background:rgba(60,46,26,.35);
    font-size:11.5px;color:#d8cba2;display:flex;align-items:center;gap:9px}
  .help-work .btn{margin-left:auto;font-size:11px;padding:4px 11px}"""

src = edit(src, "help sheet CSS", CSS_ANCHOR, CSS_NEW, guard="/* ---------- HELP — the village talking")

# ---------------------------------------------------------------- 2. markup
src = edit(
    src,
    "help sheet element",
    '<div id="pdrawer"></div>',
    '<div id="help"></div>\n<div id="pdrawer"></div>',
    guard='<div id="help"></div>',
)

# ----------------------------------------------------------- 3. band tenant
src = edit(
    src,
    "help is a bottom-band tenant",
    "  bottom:{floor:'pbar',only:'pocket',pad:10,gap:8,tenants:[\n    {id:'maia',    v:'--band-b-maia'},",
    "  bottom:{floor:'pbar',only:'pocket',pad:10,gap:8,tenants:[\n"
    "    /* FIRST, because it opens under the thumb that asked for it. Order in a\n"
    "       band is priority and the slot nearest the floor is the one that never\n"
    "       moves, so the sheet the reader just summoned gets it and the rest of\n"
    "       the stack yields upward. Closed, this tenant clears its property and\n"
    "       every other tenant lands where it landed before. */\n"
    "    {id:'help',    v:'--band-b-help'},\n"
    "    {id:'maia',    v:'--band-b-maia'},",
    # NO CLOSING BRACE IN THIS GUARD, and the reason is worth the line. A guard
    # that spells out the END of a tenant entry is a guard a LATER patch can
    # delete without touching what this edit did: h8_3 gives this same tenant a
    # `max` property, so `…'--band-b-help'}` stops existing while
    # `…'--band-b-help'` is still exactly as true as it was. With the closing
    # brace in it, replaying the chain sent this edit looking for an anchor that
    # was consumed on run one and died on an assertion instead of skipping.
    # A guard names the thing the edit INTRODUCED, never the punctuation after it.
    guard="{id:'help',    v:'--band-b-help'",
)

# ------------------------------------------------------------ 4. band watch
# A row opening changes the sheet's height until it hits the cap, so the
# ResizeObserver matters as much as the class watch here.
src = edit(
    src,
    "bandWatch observes help",
    "const ids=['pbar','vitals',",
    "const ids=['pbar','help','vitals',",
    guard="const ids=['pbar','help'",
)

# -------------------------------------------------------------- 5. the JS
JS_ANCHOR = (
    "if($('pbAttn'))$('pbAttn').onclick=()=>{$('attnBtn')&&$('attnBtn').click();hap(8)};\n"
    "setInterval(()=>{const b=$('pbBadge');if(b&&$('attnBadge'))b.textContent=$('attnBadge').textContent},3000);"
)

JS_NEW = r"""/* ---------- HELP — the village's conversations, and the way to each one (R14) ----------
   WHAT THIS REPLACED, measured through the real handler at 390x844: #pbAttn
   ran $('attnBtn').click(), the attention card filled with 442 chars of HTML,
   and body.pocket hides its container with display:none!important (:601). The
   button flew the camera somewhere and showed nothing, every time, under a
   badge reading 20. Nothing visible is lost here because nothing was visible.

   THE ROWS ARE BUILT WITH DATA ATTRIBUTES AND ONE DELEGATED LISTENER, not with
   inline handlers carrying quest titles and place names into a JS string. Every
   value that reaches the reader goes through escq; nothing needs escaping for a
   handler because no handler is written. That is also why this survives a
   thread titled with an apostrophe, which two of the thirteen have. */
(function helpSheet(){
  const el=$('help');if(!el)return;
  const threads=()=>(typeof SCENE!=='undefined'&&SCENE.threads)?SCENE.threads:[];
  const placesOf=t=>(t.structures||[]).filter(k=>typeof BY!=='undefined'&&BY[k]);

  function renderHelp(){
    const rows=threads().map(t=>{
      const homes=placesOf(t);
      /* A thread may be addressed to more than one place, and two of the seed
         threads are addressed to none. The row says which, and offers one link
         per place rather than picking a winner the data did not pick. */
      const where=homes.length?homes.map(k=>escq(nameOf(k))).join(' · '):'not pinned to a place yet';
      const links=homes.length
        ? homes.map(k=>'<button class="btn help-link" data-at="'+escq(k)+'" data-item="'+escq(itemAddr('talk',t))+'">take me to '+escq(nameOf(k))+' →</button>').join('')
        : '<button class="btn help-link" data-forum="1">open the forum →</button>';
      return '<div class="help-row" data-id="'+escq(t.id)+'">'
        +'<div class="help-t"><span>💬</span><span><b>'+escq(t.title)+'</b>'
        +'<small class="help-m">'+escq(t.author)+' · '+t.replies+' replies · '+escq(t.last)+' ago · '+where+'</small></span></div>'
        +'<div class="help-ex">'+escq(t.ex||'')+'</div>'
        +'<div class="help-go">'+links+'</div></div>'}).join('');
    const work=(typeof attnItems==='function')?attnItems().length:0;
    el.innerHTML='<div class="help-head"><h4>help</h4>'
      +'<span class="help-sub">what the village is saying, and where</span>'
      +'<button class="help-close" aria-label="close">✕</button></div>'
      +'<div class="help-list">'+(rows||'<div class="help-row"><div class="help-t"><span>💬</span><span><b>Nobody has said anything yet.</b><small class="help-m">be the first voice</small></span></div></div>')+'</div>'
      +'<div class="help-work"><span>⚑ <b>'+work+'</b> thing'+(work===1?'':'s')+' need hands</span>'
      +'<button class="btn help-wall">Get Involved →</button></div>'}

  /* ONE SHEET AT A TIME. The maia sheet, the drawer and this all hang off the
     same 60px bar on a 390px screen; the band can only arbitrate what fits, and
     three of them do not. */
  function openHelp(){renderHelp();
    document.body.classList.remove('msheet');
    const dr=$('pdrawer');if(dr)dr.classList.remove('open');
    el.classList.add('show');
    if(typeof bandSoon==='function')bandSoon()}
  function closeHelp(){el.classList.remove('show');
    if(typeof bandSoon==='function')bandSoon()}
  function toggleHelp(){el.classList.contains('show')?closeHelp():openHelp()}

  el.addEventListener('click',e=>{
    const t=e.target;if(!t||!t.closest)return;
    const lk=t.closest('.help-link');
    if(lk){e.stopPropagation();closeHelp();
      /* The same call routeHash makes: it sets #/place/<key>?item=<addr>, opens
         the door, and focusItem lights the row the comment came from. */
      if(lk.dataset.forum){if(typeof openDoor==='function')openDoor('forum',{});return}
      if(typeof openPanel==='function')openPanel(lk.dataset.at,0,lk.dataset.item);
      return}
    if(t.closest('.help-wall')){closeHelp();
      const w=$('wall');if(w){w.classList.add('show');if(typeof buildWall==='function')buildWall()}return}
    if(t.closest('.help-close')){closeHelp();return}
    const row=t.closest('.help-row');
    if(row){const was=row.classList.contains('open');
      el.querySelectorAll('.help-row.open').forEach(r=>r.classList.remove('open'));
      if(!was)row.classList.add('open');
      hap(5)}});

  /* Tap the land to put it away, the way the vital dropdown already does
     (:5738). #pbAttn is excluded or its own click would reopen what this just
     closed. */
  document.addEventListener('pointerdown',e=>{
    if(!el.classList.contains('show'))return;
    const t=e.target;if(t&&t.closest&&(t.closest('#help')||t.closest('#pbAttn')))return;
    closeHelp()},true);

  if($('pbAttn'))$('pbAttn').onclick=()=>{toggleHelp();hap(8)};

  /* THE BADGE COUNTS WHAT THE SHEET LISTS. It mirrored #attnBadge, which counts
     open seats and urgent quests, over a button that opened neither of them.
     The same 3s tick, because a live thread feed is the point of the surface. */
  function helpBadge(){const b=$('pbBadge');if(!b)return;
    const n=threads().length;b.textContent=String(n);b.style.display=n?'':'none'}
  helpBadge();setInterval(helpBadge,3000);

  window.openHelp=openHelp;window.closeHelp=closeHelp;window.toggleHelp=toggleHelp;
  window.renderHelp=renderHelp;
})();"""

src = edit(src, "help sheet behaviour", JS_ANCHOR, JS_NEW, guard="(function helpSheet(){")

if APPLIED:
    save(src)

print("\npatch_h8_2: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
