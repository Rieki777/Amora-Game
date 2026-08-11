#!/usr/bin/env python3
"""A draft you can throw away.

FOUND BY ITS OWN TRIPWIRE, which is the reason to write tripwires. D8 defined
four scene verbs, the shell routed four, the server grew a `DELETE
/api/map/draft` to serve one of them, and the map had no way to say it.
`qa/verify_publish.js` section G compares the two lists and named it:

    FAIL and every verb the map posts is one the shell routes
         -- DROPPED SILENTLY: draft-save, publish, restore

Read the other way: `draft-discard` was routed by everything and posted by
nothing. A route with no caller is worse than a missing feature, because it
reads as finished on every side you look at it from.

WHY DISCARD MATTERS ONCE DRAFTS ARE ON A SERVER. While a draft lived in
localStorage a bad one was one browser away from gone. A draft that follows
you between machines has no such escape, so without this a founder who made a
mess of the land carries it to every device they own, forever, with the live
map they actually want sitting right there behind it.

The live map is never touched by this, and neither is anyone else's draft.
Those are the two sentences the card leads with, because they are the two
things a person needs to know before pressing a button with "throw away" on
it.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable: detects its own marker and skips rather than double-applying.
Apply AFTER patch_d8_publish.py and patch_d8b_standalone_hand.py.
Usage: python3 patch_d8c_discard.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)

if "STANDALONE_HAND" not in src:
    print(f"refusing: {HTML} is missing D8/D8b; run those patches first")
    sys.exit(1)

if "openDiscard" in src:
    print(f"already applied to {HTML} (openDiscard present); nothing to do")
    sys.exit(0)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ------------------------------------------------------------------ 1. the door
swap(
    """  <button class="btn ghostbtn" id="visitBtn" style="font-size:11px;padding:4px 12px">View as visitor</button>""",
    """  <button class="btn ghostbtn" id="visitBtn" style="font-size:11px;padding:4px 12px">View as visitor</button>
  <button class="btn ghostbtn" id="dropBtn" style="font-size:11px;padding:4px 12px">Discard draft</button>""",
)

# ------------------------------------------------------------------ 2. the act
swap(
    "/* Live since, with the undo sitting right there for the minute it matters. */",
    """/* Throwing a draft away.
   The same card publishing uses, in its refusal colour, because this is the
   other irreversible-feeling act in build mode and it deserves the same room
   to explain itself. The two facts a person needs before pressing it lead the
   card: the live map does not move, and nobody else's draft is touched. */
function openDiscard(){
  const n=unpublished().length;
  if(!n)return toast('There is no unpublished work to throw away.');
  if(!inShell())return toast('This map is running on its own. Reload the page to start over.');
  const card=$('pubCard');card.classList.add('conflict');
  $('pubTitle').textContent='Throw away my draft';
  $('pubBlast').innerHTML=`Your <b>${n}</b> unpublished change${n===1?'':'s'} will be gone. `+
    `The live map does not move, and nobody else's draft is touched.`;
  $('pubList').innerHTML='<li>The map goes back to the version everyone sees.</li>';
  $('pubNote').style.display='none';
  $('pubConfirm').textContent='Throw it away';
  $('pubConfirm').onclick=doDiscard;
  $('pubWrap').classList.add('show');
}
async function doDiscard(){
  $('pubConfirm').disabled=true;
  const r=await shellAsk('draft-discard',{});
  $('pubConfirm').disabled=false;closePublish();
  if(r.quiet)return toast('No village to reach from here. Nothing was thrown away.');
  if(!r.ok)return toast(r.error||'That draft could not be thrown away.');
  /* Back to the live land. Falling back to a reload rather than leaving the
     discarded work on screen: the row is gone, and a map still showing it
     would be the one lie this whole round exists to stop telling. */
  if(LIVE_SCENE&&restoreScene(LIVE_SCENE)){PUBLISH_MARK=0;DRAFT_HOLD=null;renderDraftBar();
    return toast('Draft thrown away. You are looking at the live map.')}
  toast('Draft thrown away.');
}

/* Live since, with the undo sitting right there for the minute it matters. */""",
)

# ----------------------------------------------------------------- 3. the wiring
swap(
    "  $('visitBtn').onclick=toggleVisitor;",
    "  $('visitBtn').onclick=toggleVisitor;\n  $('dropBtn').onclick=openDiscard;",
)

# The bar hides publishing standalone; the same is true of discarding, which
# needs a village to discard on.
swap(
    "    go.style.display='none';$('visitBtn').style.display='none';return}\n"
    "  go.style.display='';$('visitBtn').style.display='';",
    "    go.style.display='none';$('visitBtn').style.display='none';\n"
    "    $('dropBtn').style.display='none';return}\n"
    "  go.style.display='';$('visitBtn').style.display='';$('dropBtn').style.display='';",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"discard patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
