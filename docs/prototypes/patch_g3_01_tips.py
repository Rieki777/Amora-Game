#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_g3_01_tips.py  (L3 INSPECTOR, g family, concern: what the dials mean)

Rye: "what does pool mean, each of these elements needs really clear and simple
tooltips".  Four dials sit in the inspector carrying no explanation of any kind.
Measured with qa/_probe_g3.js before this patch:

    #iFund  (pool)      data-tip: null
    #iScale (size)      data-tip: null
    #iAct   (activity)  data-tip: null
    [name=iPhase]       data-tip: null
    .dchip  (doors)     data-tip: present   <- the only explained control

TIPS at :5018-5046 already holds an `iScale` string and it has never once been
shown: the loop at :5047 does document.getElementById(id) ONCE at boot, and
#iScale is not built until renderInspect() runs.  Every tip here is set in the
template instead, so it is re-applied on every render.

Delivery is weighted to inline helper lines rather than tips, and that is an
accessibility fact rather than a taste call.  The #tip mechanism (:5013-5015)
listens for `pointerover` and `focusin` only.  On touch there is no pointerover,
so the explanation arrives only as a side effect of ACTIVATING the control.
#tip also carries no role, no tabindex, and nothing in the file uses
aria-describedby (measured: 0 elements), so it is decoration to a screen reader.
The panel already had five inline helper lines; this extends that pattern under
one class instead of inventing a second one.

THE FOUR SENTENCES, traced to code rather than to existing copy:

  POOL      derivedState() :1262-1265.  fund < 1 keeps the place unbuilt:
            'funding' under .5, 'building' at or above it.  The ring shows only
            in those two states (.poi.st-funding .prog / .poi.st-building .prog,
            :58), which is why it disappears at 100%.  fund <= 0 AND phase >= 3
            returns 'blueprint', so the pool and the phase radios, 34px apart in
            this same panel, can disagree about what 0% means.  That case gets a
            warn clause that renders only when a founder is actually in it.
  SIZE      s.scale multiplies the emblem transform (:2964, :2966), the crown
            and badge offset (:2965), the sprite scale (:1925, :2023) and the
            spread of the ambient figures (:2018).  It reaches nothing else: not
            state, not doors, not quests.
  ACTIVITY  three canvas branches, all keyed on the DERIVED state, so all three
            values change the map and a CSS-only search answers this wrongly:
            lit windows (:1753), the night lamplight pool (:2005) and the
            walking figures (:2015) each require state 'active' or 'thriving'.
            'quiet' -> dormant loses all three.  'thriving' additionally draws
            the gold arc (:1831), turns on .poi.st-thriving .halo (:63), and
            pushes the figure count over the n<2 floor at :2016.  None of it
            happens while fund < 1, which is the sentence's last clause.
  PHASE     phase >= 3 -> 'blueprint' whenever the pool is full or unset, and
            hideP at :2955 hides a blueprint from Now for anyone not in build
            mode.  .poi.ph3 (:448) fades the emblem at every phase 3.

THE SPLIT.  The inline line carries the shortest sentence that answers "what is
this", and the tip carries the whole rule.  Writing the full sentence in both
places was tried first and measured: it pushed the pool row from 34px below
#iAct to 151px and the doors row from 89px to 282px, which is a wall of text in
a 384px panel.  The short lines land at roughly half that.

The #iAct option VALUES stay steady/high/low while the LABELS stay
steady/thriving/quiet.  This patch does not touch either; it only adds an
attribute to the opening tag.

OBJECTIVE THREE ships here too.  "add a role here" -> "type to create or select
below" was checked against the control before the copy was written, because the
requested wording is a lie if nothing renders below.  It does render:
#seatDrop showed 15 rows on focus in the seed scene (measured shownOnFocus=true,
rowsOnFocus=15).  It becomes a lie in exactly one case, and it is the case a
founder is in while creating, because render() bails at

    if(!unplaced.length&&!elsewhere.length){dd.classList.remove('show');return}

so typing a name no existing role matches hides the list (measured
shownOnNoMatch=false).  The same early return leaves the previous rows sitting
in dd.innerHTML while hidden (measured rowsOnNoMatch=15), so any later show
without a render would paint rows that are no longer true.  Giving the empty
case a rendered row fixes both.

WAVE-1 REJECTION F4, AND WHAT CHANGED.  Five anchors in the first version of
this script were PLAYER COPY: three helper sentences, the seat placeholder, and
a TIPS string, plus a sixth sentence carried inside the big phase/pool/size
anchor.  None of them could go wrong quietly, because an exact-count assert
fires before a byte is written, but any voice pass on this panel would take the
whole script out and it would read as a code conflict rather than as a reworded
sentence.  Every anchor and every guard in this file is now CODE or CSS:

  * the one phase/pool/size swap is decomposed into seven edits (tip-phase-
    radios, tip-activity, help-phase-activity, tip-pool, help-pool, tip-size,
    help-size), each anchored on an element's own id, its inline style, or its
    template expression, so the option labels and the pool sentence are no
    longer inside any anchor;
  * the four sentences that only change class carry the sentence as a `[^<]*`
    WILDCARD between two code fences (swap_re below), so rewording them is
    invisible to this script;
  * every guard is a class or an attribute this script introduces
    (`insp-h-pool`, `id="iFund" data-tip=`), never the wording it writes, so a
    reworded tip cannot make a guard go stale and re-apply an edit.

There is one deliberate consequence: each helper line gains a second class
naming the control it explains, and the seat name input gains a tip it wanted
anyway. Both exist so that the guard can be code. They are not decoration.

RE-RUNNABLE: every step guards itself, per edit, never once at the top.  Run it
a second time and every step prints skip and zero bytes are written.
"""
import os
import re
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

    `mark` must be CODE this edit introduces, never wording it writes. A guard
    made of copy is a guard a voice pass can silently retire, and a retired
    guard re-applies its edit on the next run.
    """
    global src
    assert mark, 'every edit needs an explicit code-only mark: %r' % name
    if mark in src:
        skipped.append(name)
        print('  skip   %s' % name)
        return
    n = src.count(old)
    assert n == count, 'anchor %r appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    applied.append(name)
    print('  APPLY  %s' % name)


def swap_re(name, pattern, repl, count=1, mark=None):
    """Same contract, for the edits whose neighbourhood contains a SENTENCE.

    The literal parts of `pattern` are code fences; the sentence between them is
    matched as a wildcard and carried through `repl` by backreference, so this
    script neither reads nor asserts on a word a player sees.
    """
    global src
    assert mark, 'every edit needs an explicit code-only mark: %r' % name
    if mark in src:
        skipped.append(name)
        print('  skip   %s' % name)
        return
    n = len(re.findall(pattern, src))
    assert n == count, 'anchor %r matches %d times, expected %d' % (name, n, count)
    src = re.sub(pattern, repl, src, count=count)
    applied.append(name)
    print('  APPLY  %s' % name)


# ------------------------------------------------------------------ 1. the class
# One helper-line class, added in #inspect's own CSS block, which is this lane's.
# .insp-tipwrap is the flex row the phase radios move into so the group can carry
# one tip; it lives here rather than inline so that step 2's anchor and guard can
# both be code.
swap(
    'css/.insp-help',
    """  .ilbl{width:64px;flex:none;font-size:10.5px;color:#b9af8f;font-variant:small-caps;letter-spacing:.08em}""",
    """  .ilbl{width:64px;flex:none;font-size:10.5px;color:#b9af8f;font-variant:small-caps;letter-spacing:.08em}
  /* One explanation line under the control it explains. The panel already wrote
     five of these inline; this is the same look with one name. On touch the
     #tip mechanism (:5013-5015 pointerover + focusin) cannot fire without also
     activating the control, so the line is the primary channel here and the
     tip is the secondary one. The second class on each line names the control
     it explains and is what this script's guard reads. */
  .insp-help{font-size:10px;color:#b9af8f;line-height:1.5;margin:-1px 0 7px}
  .insp-help b{font-weight:normal;color:#dcd0ac;font-variant:small-caps;letter-spacing:.08em}
  .insp-help .insp-warn{color:#e0a34e}
  #inspect .insp-tipwrap{display:flex;gap:6px;align-items:center}
  #seatDrop .insp-none{padding:3px 9px 8px;font-size:11px;color:#b9af8f;line-height:1.45}""",
    mark=""".insp-help{font-size:10px""")


# ------------------------------------------- 2. phase: the radios become a group
# Anchored on the radio template's own expression. A radio has no room for a tip
# of its own and three separate tips would say the same thing three times, so the
# three labels move inside one wrapper that carries it.
swap(
    'markup/tip-phase-radios',
    """${[1,2,3].map(ph=>`<label style="display:flex;gap:4px;align-items:center;font-size:12px;cursor:pointer"><input type="radio" name="iPhase" value="${ph}"${s.phase===ph?' checked':''} style="accent-color:var(--gold)">${phaseName(ph)}</label>`).join('')}""",
    """<span class="insp-tipwrap" data-tip="Phase says when this place happens. Planned fades the emblem, and with a full pool a Planned place reads as Blueprint, which visitors only see in the Vision.">${[1,2,3].map(ph=>`<label style="display:flex;gap:4px;align-items:center;font-size:12px;cursor:pointer"><input type="radio" name="iPhase" value="${ph}"${s.phase===ph?' checked':''} style="accent-color:var(--gold)">${phaseName(ph)}</label>`).join('')}</span>""",
    mark="""<span class="insp-tipwrap" data-tip=""")


# ------------------------------------------------------- 3. activity: the select
swap(
    'markup/tip-activity',
    """<select id="iAct" style="flex:none;width:92px">""",
    """<select id="iAct" style="flex:none;width:92px" data-tip="Activity says how busy this place is once the pool is full. steady lights its windows, thriving adds a pulsing ring and people on the ground, quiet takes both away.">""",
    mark="""<select id="iAct" style="flex:none;width:92px" data-tip=""")


# ------------------------------- 4. the line under the phase + activity row
# Anchored on the row's closing sequence. The trailing newline matters: the quest
# weight select at :3984 ends `</select></div></div>` on the same line and would
# otherwise be a second match.
swap(
    'markup/help-phase-activity',
    """).join('')}</select></div>
""",
    """).join('')}</select></div>
   <div class="insp-help insp-h-phase"><b>phase</b> says when this place happens. Planned fades the emblem, and with a full pool it hides from Now.<br><b>activity</b> says how busy it looks once the pool is full. quiet darkens the windows, thriving adds a ring and figures.</div>
""",
    mark="""insp-h-phase""")


# ------------------------------------------------------------- 5. pool: the dial
swap(
    'markup/tip-pool',
    """<input type="range" id="iFund" min="0" max="100\"""",
    """<input type="range" id="iFund" data-tip="Pool is how much of the money for this place is already gathered. Under 100% it wears a gold ring showing the percent and reads as gathering under half, under construction above. At 100% the ring goes and activity takes over." min="0" max="100\"""",
    mark="""<input type="range" id="iFund" data-tip=""")


# ---------------------------------------------- 6. the line under the pool row
# The warn clause renders only for a founder actually in the disagreement:
# fund <= 0 with phase >= 3 is 'blueprint' at derivedState() :1262-1265, so the
# pool and the phase radios 34px away say different things about the same place.
swap(
    'markup/help-pool',
    """<b id="iFundV" style="width:38px;text-align:right;font-size:12px;font-weight:normal">${Math.round((s.fund!=null?s.fund:1)*100)}%</b></div>""",
    """<b id="iFundV" style="width:38px;text-align:right;font-size:12px;font-weight:normal">${Math.round((s.fund!=null?s.fund:1)*100)}%</b></div>
   <div class="insp-help insp-h-pool"><b>pool</b> says how much of its money is gathered. Under 100% it wears a gold ring and counts as unbuilt.${(s.fund!=null&&s.fund<=0&&s.phase>=3)?` <span class="insp-warn">At 0% on a Planned phase this reads as Blueprint.</span>`:''}</div>""",
    mark="""insp-h-pool""")


# ------------------------------------------------------------- 7. size: the dial
swap(
    'markup/tip-size',
    """<input type="range" id="iScale" min="50" max="200\"""",
    """<input type="range" id="iScale" data-tip="Size only changes how large this building's emblem stands on the map, from half to double. Its state, its doors and its quests stay as they are." min="50" max="200\"""",
    mark="""<input type="range" id="iScale" data-tip=""")


# ------------------- 8. the size line takes the place of the old pool sentence
# The one line that already existed sat under all three dials and answered for
# the pool only. It is superseded by the three lines above, so this replaces it
# rather than leaving two pool sentences 40px apart. Its wording is a WILDCARD:
# the anchor is the size row's own closing <b> and the div's inline style.
swap_re(
    'markup/help-size',
    r'(<b id="iScaleV" style="width:38px;text-align:right;font-size:12px;font-weight:normal">\$\{Math\.round\(\(s\.scale\|\|1\)\*100\)\}%</b></div>\n   )<div style="font-size:10px;color:#b9af8f">[^<]*</div>',
    lambda m: m.group(1) + '<div class="insp-help insp-h-size"><b>size</b> only changes how large the emblem stands on the map. State, doors and quests stay as they are.</div>',
    mark="""insp-h-size""")


# ------------------------------- 9. the four helper lines that already existed
# Same look, one name. Separate guarded steps so a voice pass that has already
# reworded one of them cannot block the other three, and each sentence is a
# wildcard so a rewording is invisible to the anchor as well as to the guard.
swap(
    'markup/helper-class-circle',
    """   <div style="font-size:10.5px;color:#b9af8f;margin-bottom:2px">${s.circle?""",
    """   <div class="insp-help insp-h-circle">${s.circle?""",
    mark="""insp-h-circle""")

swap_re(
    'markup/helper-class-doors',
    r'(</span></div>\n   )<div style="font-size:10px;color:#b9af8f">([^<]*)</div>',
    lambda m: m.group(1) + '<div class="insp-help insp-h-doors">' + m.group(2) + '</div>',
    mark="""insp-h-doors""")

swap_re(
    'markup/helper-class-badges',
    r'<div style="font-size:10px;color:#b9af8f;margin-bottom:5px">([^<]*)</div>(\n   <div class="irow" style="flex-wrap:wrap;gap:4px">)',
    lambda m: '<div class="insp-help insp-h-badges" style="margin-bottom:5px">' + m.group(1) + '</div>' + m.group(2),
    mark="""insp-h-badges""")

swap_re(
    'markup/helper-class-flows',
    r'<div style="font-size:10px;color:#b9af8f;margin-bottom:5px">([^<]*)</div>(\n   <div>\$\{flowsIn\.map)',
    lambda m: '<div class="insp-help insp-h-flows" style="margin-bottom:5px">' + m.group(1) + '</div>' + m.group(2),
    mark="""insp-h-flows""")


# -------------------------------------------- 10. the TIPS.iScale string agrees
# The loop at :5047 cannot reach #iScale. Left alone this is a second copy of the
# same explanation that would silently win if anyone ever fixed that loop. The
# anchor is the key and the quotes; the string it replaces is a wildcard.
swap_re(
    'js/TIPS.iScale-agrees',
    r"\n    iScale:'[^']*',",
    lambda m: """
    /* Dead entry: the loop below runs once at boot and #iScale is built by
       renderInspect(), so this has never been applied to anything. The live tip
       is set in the template. Kept in agreement so that fixing that loop later
       cannot resurrect an older wording. */
    iScale:'Size only changes how large this place stands on the map, from half to double.',""",
    mark="""Dead entry: the loop below runs once at boot""")


# --------------------------------------------- 11. objective three: the role row
# The placeholder is the copy this step exists to change, so it cannot also be
# the anchor or the guard: both are the input's own id, and the tip the control
# was missing is what makes a code-only guard possible.
swap_re(
    'markup/seat-placeholder',
    r'<input type="text" id="iSeatName" autocomplete="off" placeholder="[^"]*">',
    # a lambda, not a string: re.sub reads \g and \1 out of a string replacement,
    # so a copy edit that ever introduced a backslash would be silently eaten.
    lambda m: '<input type="text" id="iSeatName" autocomplete="off" data-tip="Name a role. Every role that could move here is listed below: pick one to move it, or press + to create a new one here." placeholder="type to create or select below">',
    mark="""id="iSeatName" autocomplete="off" data-tip=""")

swap(
    'js/seatDrop-empty-state',
    """      if(!unplaced.length&&!elsewhere.length){dd.classList.remove('show');return}""",
    """      if(!unplaced.length&&!elsewhere.length){
        /* The placeholder promises a list below. Bailing here made that promise
           false in exactly the case a founder is in while creating a role, and
           left the previous rows sitting in innerHTML while hidden. */
        dd.innerHTML=`<div class="sgrp">${q?'no role here answers to that name yet':'every role already lives here'}</div>`
          +`<div class="insp-none">＋ adds ${q?'“'+escq(inp.value.trim())+'”':'a new role'} at ${escq(s.name)}.</div>`;
        dd.classList.add('show');return}""",
    mark="""class="insp-none\"""")


# --------------------------------------------------------------------- write out
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
