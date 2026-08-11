#!/usr/bin/env python3
"""Standalone means full access, because there is nobody to ask.

WHAT D8 GOT WRONG. It hid the Build button behind `body.can-edit`, a class the
shell sets from the village's answer about who is holding the map. That is
right inside the site and wrong everywhere else, because the artifact's oldest
and most load-bearing property is that it runs ALONE: from `file://`, with no
parent, as the design tool a founder opens to shape the land and export a
seed. With no shell there is no `hand` message, so `can-edit` never arrived
and the Build button was invisible forever.

`qa/verify_doors.js` caught it in one line, which is the entire argument for
that suite existing:

    page.click: Timeout 30000ms exceeded
      - waiting for locator('#buildBtn')
      - element is not visible

This is the same shape as the bug the map lane already wrote down twice: a
value crossed a boundary and the far side had no slot for it. Here the far
side was SILENCE, and silence got read as "you may not". The artifact already
has the right rule written down for the promise bridge, and this simply
applies it to the hand: SILENCE MEANS LOCAL ONLY. No village to ask is not a
refusal, it is nobody asking, and a design tool with no village behind it is
fully the founder's.

So: default the hand to open when there is no shell, and let a shell that IS
present close it. A visitor inside the site is told what they may do by the
server, which is the only place that could ever be trusted to say. The button
was always cosmetics; this patch makes it cosmetics that tell the truth in
both worlds.

Publishing stays shut standalone, and says why in its own words rather than
accusing a lone founder of not being a cartographer.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable: detects its own marker and skips rather than double-applying.
Apply AFTER patch_d8_publish.py.
Usage: python3 patch_d8b_standalone_hand.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)

if "PUBLISH_MARK" not in src:
    print(f"refusing: {HTML} has no D8 publish block; run patch_d8_publish.py first")
    sys.exit(1)

if "STANDALONE_HAND" in src:
    print(f"already applied to {HTML} (STANDALONE_HAND present); nothing to do")
    sys.exit(0)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ------------------------------------------------------------ 1. the default
swap(
    "  $('pubCancel').onclick=closePublish;",
    """  $('pubCancel').onclick=closePublish;
  /* STANDALONE_HAND. No shell means no village to ask, and no village to ask
     means this is the founder's own design tool exactly as it has always
     been. Reading silence as a refusal locked the Build button away from
     every file:// session and every QA suite. A shell that IS present will
     overrule this the moment it answers, which is the only opinion that
     counts inside the site. */
  if(!inShell()){HAND.canEdit=true;document.body.classList.add('can-edit')}""",
)

# --------------------------------------------------------- 2. the honest bar
# Standalone there is no live map, no draft on a server and nothing to publish
# to, so the bar says the true thing instead of three misleading ones.
swap(
    "  const st=$('draftState'),lv=$('draftLive'),go=$('pubGo');if(!st)return;",
    """  const st=$('draftState'),lv=$('draftLive'),go=$('pubGo');if(!st)return;
  if(!inShell()){
    st.innerHTML='<b>Build mode.</b> This map is running on its own.';
    lv.textContent='⤓ Export scene hands you the file.';
    go.style.display='none';$('visitBtn').style.display='none';return}
  go.style.display='';$('visitBtn').style.display='';""",
)

# ------------------------------------------------------- 3. the quiet autosave
# `shellPost` already no-ops without a parent, so this only stops an eight
# second timer being armed on every keystroke of a session that can never be
# answered.
swap(
    "    if(HAND.canEdit&&!VISITOR_VIEW)shellAsk('draft-save',{scene:J,baseVersion:BASE_VERSION});",
    "    if(inShell()&&HAND.canEdit&&!VISITOR_VIEW)shellAsk('draft-save',{scene:J,baseVersion:BASE_VERSION});",
)

# ----------------------------------------------------------- 4. the true words
swap(
    "    toast(HAND.canEdit",
    "    toast(inShell()&&HAND.canEdit",
)

swap(
    "  if(!HAND.canPublish)return toast('Publishing the map is a cartographer\\'s work.');",
    "  if(!HAND.canPublish)return toast(inShell()\n"
    "    ?'Publishing the map is a cartographer\\'s work.'\n"
    "    :'This map is running on its own, with no village to publish to. ⤓ Export scene hands you the file.');",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"standalone hand patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
