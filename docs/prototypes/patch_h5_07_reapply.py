# -*- coding: utf-8 -*-
"""L5/7: the live seat states survive a scene push, whatever order it arrives in.

THE DEFECT, found by reading the shell rather than the artifact.

`LivingMap.tsx` fires both pushes on the boot handshake and awaits neither:

    if (data.type === "grounds-ready") { ... pushConfig(); pushHand(); }

`pushConfig` carries the published scene, which reaches `applyScene` and then
`restoreScene`, and `restoreScene` REBUILDS `SCENE.seats` from scratch. Every
`_state` and `_tags` the hand merged onto the old seat objects goes with them,
because the objects themselves are replaced.

Two ways this bites, and only the first is a race:

  1. The two messages are independent promises. `pushHand` now makes three
     requests to `pushConfig`'s one, so config usually lands first and the merge
     usually survives. Usually is not a guarantee, and the failure is invisible:
     every seat quietly draws open.

  2. `pushConfig` is fired again on its own, with no hand beside it, whenever
     the skin is saved and on the cross-tab storage event. That one is not a
     race at all. It is a certainty, every time, and the seat states would never
     come back until the page was reloaded.

THE FIX IS THE ONE restoreScene ALREADY USES. Its last lines are a run of
re-syncs, each guarded, each rebuilding something that depends on the scene it
just replaced:

    if(typeof rebuildVitals==='function')rebuildVitals();
    if(typeof refreshEventBadges==='function')refreshEventBadges();
    if(typeof renderVocab==='function')renderVocab();

The live rows are remembered when they arrive and re-applied here, so the merge
is a property of the last thing the village said rather than of which message
won a race. Remembering is also what makes the re-apply honest: it replays the
same rows, so a seat the village has since stopped naming still loses its live
answer on the next push.

    python patch_h5_07_reapply.py
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


def swap(name, old, new, count=1, mark=None):
    """One edit, one guard.

    The guard is a SENTINEL that no later patch in this family touches. It is
    not the whole inserted block, because guarding on the block makes a patch
    re-apply itself the moment a later patch edits one line inside it, and
    then a second pass over the family duplicates work instead of skipping.
    Falls back to the block when an edit is nobody else's anchor.

    An anchor matching anything other than `count` times aborts before a byte
    is written."""
    global src, applied, skipped
    if (mark or new) in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# ---------------------------------------------------------------- 1/2  remember, and replay
OLD = (
    "function roleApplyLive(rows){\n"
    "  const by={};\n"
)
NEW = (
    "/* The last thing the village said about its seats. Remembered because\n"
    "   restoreScene rebuilds SCENE.seats from scratch and the merged fields go\n"
    "   with the objects they were on, and because the shell re-pushes the scene\n"
    "   on its own (a skin save, a cross-tab storage event) with no hand beside\n"
    "   it. Null until a hand arrives, which is a visitor and a file:// QA run. */\n"
    "let ROLE_LIVE=null;\n"
    "function roleReapplyLive(){\n"
    "  if(ROLE_LIVE)return roleApplyLive(ROLE_LIVE);\n"
    "  if(typeof refreshBadges==='function')refreshBadges();\n"
    "  return 0}\n"
    "window.roleReapplyLive=roleReapplyLive;\n"
    "function roleApplyLive(rows){\n"
    "  ROLE_LIVE=Array.isArray(rows)?rows:null;\n"
    "  const by={};\n"
)
swap('1/2 the village\'s last word is remembered so it can be replayed', OLD, NEW,
     mark='let ROLE_LIVE=null;')

# ---------------------------------------------------------------- 2/2  the re-sync run
OLD = "  strandedCheck(false);refreshWork();paintTerrain();mmDirty=true;\n"
NEW = (
    "  strandedCheck(false);refreshWork();paintTerrain();mmDirty=true;\n"
    "  /* SCENE.seats is a NEW set of objects, so the live states merged onto the\n"
    "     old ones are gone. Replayed here rather than left to whichever of the\n"
    "     shell's two independent pushes happened to land second. */\n"
    "  if(typeof roleReapplyLive==='function')roleReapplyLive();\n"
)
swap('2/2 restoreScene replays it, beside the re-syncs already there', OLD, NEW,
     mark='roleReapplyLive();')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
