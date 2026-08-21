#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.05 — THE TWO SINKS NO INSTRUMENT IN THIS LANE COULD REACH.

g6.01 closed the JS-string class. g6.02 closed the sinks it enumerated. g6.03
closed the four identifier attributes a MEASUREMENT found once the poisoner
stopped unhooking its own reader. g6.04 closed the Loom wire, the badge seals
and one CSS selector, and its own docstring said the census is the class. Four
passes, four declarations that the class was closed, and each time the next hole
sat under a surface nothing had rendered.

These two are one level out from all of that, and they are invisible for two
DIFFERENT reasons — which is the point. Neither shows up as an element, neither
fires a handler, neither reaches the RAW scan, and neither is a renderer:

    :2598  focusItem     `[data-item="${addr}"]`      2 throws, 5 raw sites
    :6194  tips.show     tp.innerHTML = getAttribute('data-tip')

THE SELECTOR (:2598). focusItem lights the row a badge tap points at:

    const el=$('panelBody')&&$('panelBody').querySelector(`[data-item="${addr}"]`);

`addr` is itemAddr(), which returns 'quest:'+questKey(q) and 'talk:'+t.id. Both
are founder identifiers: questKey returns `q.key` verbatim when the stored quest
carries one, and a thread's id is whatever the site wrote. This is the same
defect g6.04 fixed at :4524 in the Loom hover, in a second place, and fixing one
instance is how the previous four rounds each ended.

WHY NOTHING SAW IT, three ways at once:
  * focusItem writes no HTML, so the renderer census cannot classify it — it is
    not in `found`, so it can be neither driven nor declared not-driven.
  * it is in no __SURFACES row, so the render pass never calls it.
  * the RAW scan wraps querySelector, but a wrapper only reports about calls
    that HAPPEN. Nothing in this lane has ever called focusItem on a poisoned
    scene, so the scan printed `0 distinct raw sites` — a zero about a function
    that had not run.
  * and the poisoner could not have reached it anyway: __PLANT_FIELDS declares
    37 fields and neither `quests[].key` nor `forum_threads[].id` is among
    them, so every restore in this gate's history rebuilt the scene with CLEAN
    quest keys and CLEAN thread ids. patch_g6_05_gate.py plants both.

Measured, with every string leaf of buildExportJSON() poisoned and the real
openPanel(key, tab, itemAddr(...)) call the seal handler makes at :2643:

    querySelector()  raw markup        [data-item="quest:plant-the-dry-season-beds…<img src="pwn-q"…
    querySelector()  raw double quote  …" data-pwn="attr" onmouseover="window.__pwn…
    querySelector()  raw markup        [data-item="talk:t1…<img src="pwn-q"…
    SyntaxError: Failed to execute 'querySelector' on 'Element'  (x2)

A visitor taps the ⚑ on a building whose stored quest key holds one double
quote, and the panel opens with the row never lit — or, on the delegated seal
listener where nothing catches, with an uncaught error and the tap doing
nothing at all. Not a look that is spoiled: a door that stops opening.

FIXED THE WAY g6.04 FIXED :4524, and for the same reason: the value never has
to be a selector. Every candidate row carries the same address in its own
dataset, so the line compares two strings. That is strictly better than a third
escape — nothing to get wrong, nothing to keep in step with escq and escj, and
the identifier stays byte-exact on both sides, which is what an identifier is
FOR. No normaliser at the door either, for the reason g6.03 wrote down: a key a
normaliser touched stops matching the row it names.

THE TOOLTIP (:6194) IS THE OTHER SHAPE — a reader that undoes the escape:

    const show=el=>{const s2=el.getAttribute('data-tip');if(!s2)return;tp.innerHTML=s2;…}

Every data-tip in this file is written escaped — `data-tip="${escq(d.how)} ·
${escq(d.src)}"` at :3101, `data-tip="${escq(SCENE.moonName)}"` at :3102 — and
the escape is CORRECT for the attribute. The HTML parser then turns &quot; and
&lt; back into characters when it stores the attribute, so `getAttribute`
returns the founder's raw text, and this line hands it to the HTML parser a
SECOND time. One escape at one end of a two-hop round trip is not an escape:
the exact sentence g6.04 wrote about data-conn, in a sink that is not a
renderer, is not on window, and no census can enumerate.

It is not live TODAY — measured: 0 of 62 tips carry the payload on a
deep-poisoned scene, because moonName is not in restoreScene's whitelist and
vitalsData()'s `how`/`src` are const strings. It is one restored field away
from being live, and the artifact's own authors escaped both values, which is
the file saying it believes they are founder text.

textContent, not a third escape. Measured before choosing it: of the 62 tips
live on the page, exactly two contain any of `< > &` — "reads Stages & Roles on
the site" and "ring & gold" — and both are a literal ampersand in prose, which
renders identically either way. No tip in this file contains markup, so nothing
a reader sees changes.

TWO MORE OF THE SAME SHAPE, CLOSED HERE BECAUSE THE INVARIANT IS WORTH MORE
THAN THE THREE SITES. evRSVP (:5382, :5388) and the terrain switch (:5977) also
build a selector by concatenation. Neither is founder-reachable today — EVENTS
is a literal array baked at :5357 and skTerr's three options are hand-written at
:930 — but `escq(e.id)` and `escj(e.id)` sit at the write sites, which is the
file already treating an event id as untrusted. With these four closed, THE
ARTIFACT COMPILES NO SELECTOR FROM A NON-CONSTANT VALUE AT ALL, which is a
property `qa/raw_interp_census.mjs` can assert statically and one that cannot
rot behind a hand list.

DELIBERATELY NOT DONE. No CSS.escape anywhere: it is a third escape to keep in
step with two others, and every one of these four values is available as a
dataset string on the elements being searched. No normaliser on any identifier.
No change to what any of the four searches MATCH — each new form finds exactly
the elements the selector found, by the same string equality the browser was
doing, and the gate asserts the round trips byte-exact.

ORDER: after g6.01 through g6.04. It touches no line any of them wrote.

Re-runnable: every edit is guarded on its own, the RESULT is tested before the
ANCHOR, and a second run is all skips and zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')


def say(s):
    """Print without assuming the operator's console speaks Unicode.

    Same helper as g6.01 through g6.04: an edit name here carries ✔ and ·, and a
    UnicodeEncodeError on the PRINT would leave a run that wrote its bytes and
    could not report them.
    """
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []


def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


# ===================== SINK 1: THE BADGE TAP =====================

edit('focusItem: match the item address, do not compile it into a selector (:2598)',
  """  const el=$('panelBody')&&$('panelBody').querySelector(`[data-item="${addr}"]`);
  if(!el)return false;""",
  """  /* MATCHED, NOT INTERPOLATED (g6.05), and the same answer :4524 got.
     `addr` is itemAddr(): 'quest:'+questKey(q) and 'talk:'+t.id, both founder
     identifiers straight off a stored scene. Concatenated into a selector, one
     double quote in a quest key threw a SyntaxError out of the delegated seal
     listener at :2643 — the panel opened, the row never lit, and the page
     collected an uncaught error per tap. Every candidate carries the same
     address in its own dataset, so compare the strings: nothing to escape,
     nothing to keep in step with escq and escj, and the identifier stays
     byte-exact on both sides, which is the whole reason it is an identifier. */
  const host=$('panelBody');
  let el=null;
  if(host)host.querySelectorAll('[data-item]').forEach(n=>{if(!el&&n.dataset.item===addr)el=n});
  if(!el)return false;""")


# ===================== SINK 2: THE TOOLTIP =====================

edit('tips.show: a tip is text, and getAttribute already undid the escape (:6194)',
  """  const show=el=>{const s2=el.getAttribute('data-tip');if(!s2)return;tp.innerHTML=s2;tp.classList.add('show');""",
  """  /* TEXT, NOT MARKUP (g6.05). Every data-tip in this file is written through
     escq — :3101 and :3102 are founder values — and that escape is correct for
     the attribute and is UNDONE by the parser before this line runs:
     getAttribute hands back the decoded characters, and innerHTML parsed them a
     second time. One escape at one end of a two-hop round trip is not an
     escape. Measured before changing it: of the 62 tips live on this page
     exactly two contain any of < > &, both a literal ampersand in prose, which
     reads the same either way. No tip in this file carries markup. */
  const show=el=>{const s2=el.getAttribute('data-tip');if(!s2)return;tp.textContent=s2;tp.classList.add('show');""")


# ===================== THE SAME SHAPE, TWICE MORE =====================
# Not founder-reachable today. Closed so the artifact compiles NO selector from
# a non-constant value, which is a property a static census can assert and a
# hand list of three sites cannot.

edit('evRSVP: the RSVP buttons, matched rather than compiled (:5382)',
  """  document.querySelectorAll(`[data-ev="${id}"]`).forEach(b=>{b.textContent=on?'✔ Going · tap to change':'RSVP';b.disabled=false});""",
  """  /* the third selector built by concatenation (g6.05). An event id is baked
     into EVENTS at :5357 today, but :5375 already writes it through escq AND
     escj, which is this file treating it as untrusted. Matched instead. */
  document.querySelectorAll('[data-ev]').forEach(b=>{if(b.dataset.ev!==id)return;b.textContent=on?'✔ Going · tap to change':'RSVP';b.disabled=false});""")

edit('evRSVP: and the rollback path, which is the one that runs unattended (:5388)',
  """    document.querySelectorAll(`[data-ev="${id}"]`).forEach(b=>{b.textContent=on?'RSVP':'✔ Going · tap to change'});""",
  """    document.querySelectorAll('[data-ev]').forEach(b=>{if(b.dataset.ev!==id)return;b.textContent=on?'RSVP':'✔ Going · tap to change'});""")

edit('the terrain switch: the last selector concatenation in the file (:5977)',
  """$('skTerr').onchange=()=>{const b=document.querySelector(`[data-tm="${$('skTerr').value}"]`);if(b)b.click()};""",
  """$('skTerr').onchange=()=>{/* matched, not compiled (g6.05) — the fourth and last */
  const v=$('skTerr').value;let b=null;
  document.querySelectorAll('[data-tm]').forEach(x=>{if(!b&&x.dataset.tm===v)b=x});
  if(b)b.click()};""")


def main():
    if not os.path.exists(TARGET):
        sys.exit('no artifact at ' + TARGET)
    src = io.open(TARGET, encoding='utf-8', newline='').read()
    before = src
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        # GUARD PER EDIT, three outcomes rather than two, and THE RESULT IS
        # TESTED BEFORE THE ANCHOR. Several lanes work this artifact at once, so
        # "anchor absent, result absent" means the site MOVED OR WENT AWAY:
        # recorded, printed under its own heading, and the run exits non-zero so
        # nobody reads it as clean.
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
    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY - read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)


if __name__ == '__main__':
    main()
