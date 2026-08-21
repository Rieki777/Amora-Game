# -*- coding: utf-8 -*-
"""L5/8: ROLE_PARTY is declared before the functions that read it.

NOT A BUG TODAY. A TRAP LAID FOR THE NEXT LANE.

`let ROLE_PARTY=null;` was written in patch 01 immediately after the halo
constants. Every patch since anchored on one of those constants and inserted
after it, so the declaration drifted downward while its readers did not:

    4374  function roleAny(list){ ... ROLE_PARTY ... }
    4380  function roleSetParty(v){ ROLE_PARTY = ... }
    4407  function roleApplyLive(rows){ ... }
    4423  let ROLE_PARTY=null;              <- below all three
    4427  function roleRelevant(tags){ ... ROLE_PARTY ... }

`let` has a temporal dead zone, and unlike a `var` it THROWS on read rather than
answering undefined. Function bodies are fine, because they run long after the
block is evaluated, and that is why nothing is broken now: the only TOP-LEVEL
`refreshBadges()` in the file sits at 5142, past the declaration.

What makes it worth a patch is what it costs when it does fire. Line 5142 is

    try{refreshBadges()}catch(_){}

so a top-level call inserted anywhere between `refreshBadges` at 2419 and this
declaration would throw a ReferenceError into a swallowing catch, and the whole
badge language would go quiet with nothing in the console to say why. That is
the same shape as the boot-order trap where a guard reading a game variable
before initStores() silently reads the platform default: correct code, wrong
line, no signal.

So the declaration moves up beside ROLE_GOV, above every reader, where the next
insertion cannot get under it.

Two edits: one adds it in the right place, one removes it from the wrong place.
Each is separately guarded, and a deletion needs the opposite guard from an
insertion, which is what `cut` below is for.

    python patch_h5_08_tdz.py
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0

BLOCK = (
    "/* The party the player has chosen, as archetype keys, pushed over the\n"
    "   CREDENTIALED hand. Null until then, and null means every role is relevant:\n"
    "   a map with nobody signed in narrows nothing.\n"
    "\n"
    "   DECLARED HERE, ABOVE EVERY READER, on purpose. `let` throws on a read in\n"
    "   its dead zone rather than answering undefined, and the file's only\n"
    "   top-level refreshBadges() call is wrapped in a swallowing catch, so a\n"
    "   reader that got above this line would silence the badge language with\n"
    "   nothing in the console. */\n"
    "let ROLE_PARTY=null;\n"
)


def swap(name, old, new, count=1, mark=None):
    """One edit, one guard.

    The guard is a SENTINEL that no later patch in this family touches. It is
    not the whole inserted block, because guarding on the block makes a patch
    re-apply itself the moment a later patch edits one line inside it, and
    then a second pass over the family duplicates work instead of skipping.
    Falls back to the block when an edit is nobody else's anchor.

    An anchor matching anything other than `count` times aborts before a byte
    is written."""
    """An insertion: skip when the result is already present."""
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


def cut(name, old, count=1):
    """A deletion: skip when the text is already gone. The opposite guard from
    swap's, because `new in src` is meaningless when `new` is nothing."""
    global src, applied, skipped
    n = src.count(old)
    if n == 0:
        print('  skip   %s' % name)
        skipped += 1
        return
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, '', count)
    print('  apply  %s' % name)
    applied += 1


# ---------------------------------------------------------------- 1/2  declare it first
OLD = "const ROLE_GOV_HOME='community';\n"
swap('1/2 the party is declared above every reader', OLD, OLD + BLOCK,
     mark='DECLARED HERE, ABOVE EVERY READER')

# ---------------------------------------------------------------- 2/2  and not twice
STALE = (
    "/* The party the player has chosen, as archetype keys, pushed over the\n"
    "   CREDENTIALED hand. Null until then, and null means every role is relevant:\n"
    "   a map with nobody signed in narrows nothing. */\n"
    "let ROLE_PARTY=null;\n"
)
cut('2/2 the drifted declaration is removed', STALE)

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
