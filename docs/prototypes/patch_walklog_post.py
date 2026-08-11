#!/usr/bin/env python3
"""Wire the Welcome Walk's log to POST /api/map/walk-log.

Until now the walk recorded its steps into `window.WALK_LOG`, and those rows
only ever left the browser inside a scene export. The site side has a home for
them (0061) and a report that answers "which step loses people"; this is the
last wire.

WHAT IT SENDS: one request per run, at the end, carrying the whole log. Not a
request per step: a walk is five or six beats and a newcomer on a phone should
not pay six round trips to be measured.

WHEN: from endWalk, which fires on both endings, complete and abandoned. The
abandoned case usually means the newcomer tapped a door, so the request is
`keepalive` and survives the navigation that follows it.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_walklog_post.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
# Text mode would translate every newline on the way in and back out, so a
# one-anchor edit would rewrite all of this LF file as CRLF. The artifact is
# `-text` in .gitattributes: bytes in, same bytes out. Keep newline="".
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)


def rep(anchor, addition, where="after", count=1):
    global src
    n = src.count(anchor)
    assert n == count, f"anchor appears {n} times, expected {count}: {anchor[:70]!r}"
    src = src.replace(anchor, anchor + addition if where == "after" else addition + anchor, 1)


# ── 1. A key per run, and the sender ─────────────────────────────────────
rep(
    "window.startWalk=startWalk;\n",
    r"""/* One key per run of the walk. Not a person and not a device: enough to tell
   one newcomer's steps from another's when counting, and nothing more. It is
   regenerated on every startWalk, so a second walk is a second run. */
function newWalkSession(){return 'w-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
window.WALK_SESSION=window.WALK_SESSION||newWalkSession();

/* Send the run to the village, once, at the end.
   Quiet by design: a failed send is a lost measurement and must never be
   something a newcomer notices. `keepalive` because abandoning the walk
   usually means tapping a door, and the page is navigating as this fires. */
function sendWalkLog(){
  try{
    if(location.protocol==='file:')return;            // opened from disk, nothing to post to
    const rows=(window.WALK_LOG||[]).slice();
    if(!rows.length)return;
    fetch('/api/map/walk-log',{method:'POST',keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sessionKey:window.WALK_SESSION,
        lang:(document.documentElement.lang||'en'),rows})}).catch(()=>{});
    window.WALK_LOG=[];                                // sent once, never twice
  }catch(_){}
}
window.sendWalkLog=sendWalkLog;
""",
)

# ── 2. Fire it on both endings, and start a fresh run ────────────────────
# `endWalk` already pushes the terminal row; the send goes straight after it so
# `complete` / `abandoned` travels with the steps it belongs to.
rep(
    "  WALK_LOG.push({step:done?'complete':'abandoned',at_index:WIDX,ts_seq:WALK_LOG.length})}\n",
    """  WALK_LOG.push({step:done?'complete':'abandoned',at_index:WIDX,ts_seq:WALK_LOG.length});
  sendWalkLog()}
""",
    where="before",
)
src = src.replace(
    "  WALK_LOG.push({step:done?'complete':'abandoned',at_index:WIDX,ts_seq:WALK_LOG.length})}\n",
    "", 1)

# A replayed walk is a NEW run, or every replay would fold into the first
# session and the counts would read as one very indecisive newcomer.
rep(
    "  WIDX=-1;nextWalk()}\n",
    "",  # count guard only
)
src = src.replace(
    "  WIDX=-1;nextWalk()}\n",
    "  WIDX=-1;window.WALK_SESSION=newWalkSession();window.WALK_LOG=[];nextWalk()}\n",
    1,
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"walk-log POST wired: {before} -> {len(src)} chars (+{len(src)-before})")
