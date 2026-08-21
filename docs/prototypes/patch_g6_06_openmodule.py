#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.06 — THE openModule SINK, AND THE SIBLING THE ESCAPING PASS WALKED PAST.

THE LANE WAS SENT AT THIS:

    grounds-v0.html  renderTab, tabs 0 and 3
        onclick="openModule('${m[0]}','${m[1]}')"      BOTH ARGUMENTS UNESCAPED

    a door route of   x');window.__PWN.push('OWNED');('   renders as
        openModule('Sign in','x');window.__PWN.push('OWNED');('')
    and EXECUTES ON A REAL CLICK.

It is real, it is on origin/main today, and the coordinator's blast radius was
six live nodes across three hosts rather than one: `#banners`, `#panelHead`,
`#panelBody`.

WHAT THIS PATCH ACTUALLY HAD LEFT TO DO, WHICH IS NOT WHAT IT WAS SENT AT.

All six were already closed in this lane, by patches written for other reasons
and never measured against this claim:

    #banners     bannerHTML          escq(s.name)          patch_g6_01
    #panelHead   openPanel           escq(s.name/.circle/.event)   g6_01, g6_02
    #panelBody   renderTab tab 0     escq(s.blurb)         patch_g6_01
    #panelBody   renderTab tab 0     escq(t.title)         patch_g6_01
    #panelBody   renderTab tabs 0,3  onclick="openDoorHere(<index>)"   g1_03

The last of those is the headline, and it is closed in the strongest available
way rather than by escaping: the founder's two strings do not travel through
the attribute AT ALL any more, only the door's integer index does. `${s.role}`,
the sixth node, cannot be reached by a stored payload in the first place —
restoreScene sets `s.role` from `ROLE_LINE`, a code table, and never from the
payload. It is escaped regardless.

So this patch closes the one nothing in the lane had closed, which the gate
written for the six found on its first red run.

────────────────────────────────────────────────────────────────────────────
THE SIBLING THAT LOOKS NUMERIC.

    <small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago</small>

Escaped on the left, escaped on the right, raw in the middle — through four
rounds of an escaping gate and three separate lanes. Nobody escaped it because
the field is called `replies` and reads as a count.

IT IS NOT A COUNT. `restoreScene` stores it as

    replies:t.replies||0

and `'<img src=x onerror=…>' || 0` is the string, not 0. `||` only defends
against the falsy. A founder scene whose `forum_threads[].replies` is a payload
comes back out of the door as that payload and goes straight to innerHTML.

It is a STORED sink, on the same path as the rest of this family:
`persistenceBoot` reads `localStorage['amora-grounds-scene']` on every load and
offers to restore it, and `scheduleAutosave` ships the same export to
draft-save, so the value round-trips through the server to every visitor.

THREE RENDER SITES, and closing one closes a third of it:

    :3458  the place panel, tab 0        the coordinator's own host
    :5203  the Journeys room
    :5454  the module room's thread rows

TWO DOORS, and the export one is not decoration:

    :5050  restoreScene            replies:t.replies||0      IN
    :3897  the export builder      replies:t.replies||0      OUT

The import door is the security boundary. The export door is how this artifact
WRITES a poisoned count back to the server for the next visitor, so a fix that
only cleans the way in leaves the map able to publish the payload it just
refused to render.

WHAT IT DOES, AND WHY BOTH HALVES.

  1. Coerce at both doors: `Number(t.replies)||0`. A count that is a number is
     closed for every reader, including readers not written yet — which is the
     whole reason three sites existed to be missed in the first place.
  2. Escape at all three sinks anyway: `escq(t.replies)`.

Neither half is redundant, and `qa/verify_doorsink.js` holds them as SEPARATE
assertions (D1 the type at the door, B1/D2b the elements at the sink) precisely
so that breaking one alone still goes red. Belt and braces asserted as one thing
is a belt.

MEASURED, on the real click path — seed storage, click the Restore bar, click a
building, click all four tabs, click the doors:

    artifact                              elements the payload built in #panelBody
    pristine origin/main                  236 across the four tabs (worst tab 59)
    + the lane's chain, before this patch   52 across the four tabs (worst tab 13)
    + this patch                             0

The 52 are the thirteen conversation rows, once per tab that draws them.

ANCHOR NOTE. The three sink anchors are written to be the substring that is
IDENTICAL before and after `patch_g6_01_escaping.py`, and both door anchors are
untouched by the whole chain, so this patch applies to pristine `origin/main`
as well as to the lane's artifact. What it cannot do standalone is close the
openModule attribute, because that fix is `openDoorHere` and it lives in
`patch_g1_03_doorproto.py`. This script CHECKS for it and exits non-zero
saying so rather than reporting a clean run over a live sink.
"""

import io
import os
import sys
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

DOT = u'·'


def say(m):
    print(m)


# (name, old, new, expected_count)
EDITS = [
    (u'the panel, the Journeys room and the module room: a count is escaped '
     u'like every other founder string (3 sites, one anchor)',
     DOT + u' ${t.replies} replies ' + DOT,
     DOT + u' ${escq(t.replies)} replies ' + DOT,
     3),

    (u'the door IN: restoreScene stores a count as a number (:5050)',
     u"    replies:t.replies||0,last:t.last_activity||'',ex:t.excerpt||'',src:t.src||'sample',",
     u"    replies:Number(t.replies)||0,last:t.last_activity||'',ex:t.excerpt||'',src:t.src||'sample',",
     1),

    (u'the door OUT: the export cannot publish a count that is not one (:3897)',
     u"      author:t.author,audience:t.aud||'member',replies:t.replies||0,last_activity:t.last||'',",
     u"      author:t.author,audience:t.aud||'member',replies:Number(t.replies)||0,last_activity:t.last||'',",
     1),
]


def main():
    if not os.path.exists(TARGET):
        sys.exit('no artifact at ' + TARGET)
    src = io.open(TARGET, encoding='utf-8', newline='').read()
    before = src
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        # THE RESULT IS TESTED BEFORE THE ANCHOR, the same order patch_g6_01
        # settled on and for the same reason: every `new` here still contains
        # its own `old` as a substring is FALSE for these three, but the rule
        # costs nothing and a re-run that is not a re-run is the failure it
        # prevents.
        if new in src:
            say('  skip   ' + name)
            n_skip += 1
            continue
        if old not in src:
            say('  GONE   ' + name)
            gone.append(name)
            continue
        got = src.count(old)
        assert got == count, ('anchor count wrong for "%s": expected %d, found %d'
                              % (name, count, got))
        src = src.replace(old, new)
        say('  apply  ' + name + ('' if count == 1 else '  (x%d)' % count))
        n_apply += 1

    if src == before:
        say('\n%d applied, %d skipped, %d gone. 0 bytes written.'
            % (n_apply, n_skip, len(gone)))
    else:
        with io.open(TARGET, 'w', encoding='utf-8', newline='') as f:
            f.write(src)
        say('\n%d applied, %d skipped, %d gone. %d -> %d bytes (%+d).'
            % (n_apply, n_skip, len(gone), len(before.encode('utf-8')),
               len(src.encode('utf-8')),
               len(src.encode('utf-8')) - len(before.encode('utf-8'))))
        say('sha256 ' + hashlib.sha256(src.encode('utf-8')).hexdigest()[:16])

    # ── THE HEADLINE, WHICH THIS SCRIPT DOES NOT OWN ─────────────────────
    # A run that says nothing about openModule on an artifact where openModule
    # is still live reads exactly like a run on an artifact where it is closed.
    # So it is asked, out loud, every time.
    live_attr = u"onclick=\"openModule('${m[0]}','${m[1]}')\""
    # The comment patch_g1_03 leaves behind quotes the old attribute verbatim,
    # so counting the string alone would report the sink as live forever.
    # `openDoorHere` is the thing that actually replaced it.
    closed = u'openDoorHere(' in src
    attrs = src.count(live_attr)
    if closed:
        say('\nopenModule: CLOSED by patch_g1_03_doorproto.py '
            '(the panel writes openDoorHere(<index>); %d quotation(s) of the old '
            'attribute survive in comments and are not sinks).' % attrs)
    else:
        say('\n' + '=' * 70)
        say('THE openModule SINK IS STILL LIVE IN THIS ARTIFACT.')
        say('  %d occurrence(s) of %s' % (attrs, live_attr))
        say('  Both arguments are founder-controlled and reach a JS string')
        say('  inside an inline handler. A door route of')
        say("      x');window.__PWN.push('OWNED');('")
        say('  executes on a real click.')
        say('  THIS PATCH DOES NOT CLOSE IT. patch_g1_03_doorproto.py does,')
        say('  by taking the founder strings out of the attribute entirely')
        say('  and writing openDoorHere(<index>) instead. Run it, then')
        say('  qa/verify_doorsink.js section C1.')
        say('=' * 70)

    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY '
            '— read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)
    if not closed:
        sys.exit(4)


if __name__ == '__main__':
    main()
