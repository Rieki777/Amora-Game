#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_g3_04_import_types.py  (L3 INSPECTOR, g family, concern: what a scene BRINGS)

WAVE-2 REJECTION, the one defect this lane's own fix opened.

STORED-SCENE HTML/JS INJECTION THROUGH h.total AND h.storedTaken.
patch_g3_03_homes.py wrote rigorous validation on the WRITE path (housingNum:
whole numbers, 0..10000, refused out loud, previous number left standing) and
NONE AT ALL on the READ path it also wrote.  housingImport() null-checked and
copied.  So a stored scene carrying

    housing:{rows:[{structureKey:'pondhomes',total:'" onfocus="alert(1)',
                    storedTaken:'<img src=x onerror=alert(1)>'}]}

landed those two strings in SCENE.housing untouched, and from there:

  * into value="..." on #iHomesTotal and #iHomesTaken, a double-quoted
    attribute built by string concatenation, which the first string closes;
  * into the help line as element text, which the second string is markup in;
  * into window.LOTS, which THREE player-facing surfaces render as element text
    and none of them escape either: the hover card, the panel, and the Housing
    sheet's sample block.  Grep `LOTS[s.key].sold` and `const L=LOTS[k]` for
    them; line numbers are not written down here because this file moves under
    four other lanes and a stale number reads as a fact;
  * and back out through housingExport into `rows` AND into the public
    `entries` block with configured:true, where open became NaN and serialised
    to JSON null, which this lane's own contract reads as UNSET on a row that
    reports itself fully set.  Three lanes read entries.

REACHABILITY is the dominant path by this lane's own docstring: applyScene()
calls restoreScene() on EVERY shell scene push, the Restore button calls it
directly, and scheduleAutosave ships the whole export to draft-save.  A server
round trip, not a local concern.

CALIBRATION, honestly.  This class is not new to the artifact: the pristine file
is exploitable the same way through map_structures[].circle_id.  This lane did
not invent the pattern.  It added two more instances on an import path it wrote
itself, which is what makes them this lane's to close.

--------------------------------------------------------------------------
BOTH HALVES, and which one is load-bearing.

HALF 1, THE TYPE, on the read path.  housingNum guards what a founder TYPES;
nothing guarded what a scene BRINGS.  The wave-1 note claimed the read-side
clamp in housingOpen defends rows written before that validation existed.  It
defends the ARITHMETIC and says nothing about the TYPE: Math.max(0, '<img
...>' - 3) is NaN, and NaN renders, exports and serialises perfectly happily.

The read path now runs the SAME predicate as the write path, housingNum itself,
because housing rows have exactly ONE producer in the world -- housingExport --
and it can only ever carry what housingNum already accepted.  So reusing it
refuses everything hostile and deletes nothing legitimate.  `undefined` means
refuse, and refusing on import is unset, because there is no founder standing
there to refuse to: the row then reports itself NOT set, drops out of entries,
stops mirroring into LOTS, and every surface falls back to its example numbers.
Fail-closed, and COUNTED rather than swallowed -- one console.warn naming how
many fields were refused, so a poisoned scene is visible instead of quiet.

This is the load-bearing half.  Once a field can only be a finite number or
null, String() on it can only ever produce digits, and the three unescaped LOTS
render sites this lane feeds stop being reachable from here at all.  Those three
sites belong to other lanes and to the escaping lane's sweep in wt-doors; this
script deliberately does not touch them, because two lanes rewriting the same
lines is an integration conflict and the source is closed either way.

HALF 2, THE ESCAPE, at the render sites this lane owns.  Defence in depth, and
the rule the escaping lane established in this file: escq for element text and
for double-quoted attributes, escj only for a JS string inside a handler.  There
is no handler in this block, so it is escq four times and no new helper.  The
local `const val=v=>v==null?'':String(v)` is gone: a stringifier that only
stringified was the whole hole, and escq(null) is already '' by its own
contract, so the four call sites need nothing else.

HALF 3, WHICH IS REALLY HALF 1 AGAIN.  The predicate that decides "fully set"
was `!=null` in three places and is now `typeof === 'number'` in ONE, with the
other two calling it.  housingSet gates the help line; housingSync's mirror into
window.LOTS re-tested the same thing inline and now calls housingSet; the
entries filter re-tested it a third time and now tests the type.  So a string
can no longer publish itself as configured with open serialising to null, even
if some future path writes one straight into SCENE.housing.

--------------------------------------------------------------------------
WHAT IS DELIBERATELY NOT DONE.

RANGE IS NOT RE-ENFORCED SEPARATELY ON IMPORT, it comes along with housingNum,
and the clamp in housingOpen STAYS.  It is now belt and braces rather than the
only defence, and removing a fail-closed clamp because a second guard arrived is
how the second guard becomes the only one.

structureKey must be a string or the row is dropped: an object key becomes
'[object Object]' and mints a phantom hamlet.  label is coerced and capped at
the 190 the input carries, so a 10 MB "label" cannot ride in through a restore.
takenSource is coerced to a string or falls back to 'founder'; it reaches three
lanes through entries.

ANCHORS ARE CODE.  Every anchor here is a declaration, a predicate or an
interpolation.  The one anchor that neighbours a sentence (the help line) is
split into three interpolation-only edits so a voice pass on that sentence
cannot take this script out.

RE-RUNNABLE: every step guards itself, per edit.  Second run prints skip for
every step and writes zero bytes.
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


def _do(name, text, old, new, count, mark, regex):
    """Exact-count anchor. Zero or two matches aborts before a byte is written.

    `mark` is a short string unique to THIS edit and is what the guard tests.
    Guarding on the whole replacement is wrong when two scripts in this family
    share a neighbourhood: each one's replacement stops being a substring once
    the other runs, both guards go stale, and the second pass re-applies both
    edits. A guard asks "is MY edit here", never "is my whole neighbourhood
    still byte-identical".

    `mark` must be CODE this edit introduces, never wording it writes. A guard
    made of copy is a guard a voice pass can silently retire.
    """
    assert mark, 'every edit needs an explicit code-only mark: %r' % name
    if mark in text:
        skipped.append(name)
        print('  skip   %s' % name)
        return text
    if regex:
        n = len(re.findall(old, text))
    else:
        n = text.count(old)
    assert n == count, 'anchor %r appears %d times, expected %d' % (name, n, count)
    out = re.sub(old, new, text, count=count) if regex else text.replace(old, new, count)
    applied.append(name)
    print('  APPLY  %s' % name)
    return out


def swap(name, old, new, count=1, mark=None):
    global src
    src = _do(name, src, old, new, count, mark, False)


# ================================================== 1. the read side of the domain
# Inserted directly after housingNum, because it is the same predicate pointed
# the other way and the two have to be read together or the next person adds a
# third rule somewhere else.
swap(
    'js/housing-read-num',
    """  const n=+t;return (n>=0&&n<=10000)?n:undefined}""",
    """  const n=+t;return (n>=0&&n<=10000)?n:undefined}
/* The READ side of that same domain, and the half that was missing. housingNum
   guards what a founder TYPES; nothing guarded what a scene BRINGS, so a stored
   row could carry a string, an object or an array through housingImport and
   straight into a value="" attribute, into the help line, into window.LOTS
   (three player surfaces render it) and back out through the export with
   configured:true. The clamp in housingOpen defends the ARITHMETIC of a row
   written before this validation existed and says nothing about its TYPE.

   Same predicate as the write path, deliberately: housing rows have exactly one
   producer in the world, housingExport, and it can only carry what housingNum
   already accepted, so reusing it refuses everything hostile and deletes nothing
   legitimate. undefined means refuse, and a refusal on import is unset, because
   there is no founder standing there to refuse to: the row then reports itself
   NOT set, drops out of entries, stops mirroring into LOTS, and every surface
   falls back to its example numbers. `bad` carries the count out so the refusal
   is said once out loud rather than swallowed. */
function housingReadNum(v,bad){const n=housingNum(v);
  if(n===undefined){if(bad)bad.n++;return null}
  return n}""",
    mark="""function housingReadNum(v,bad){""")


# ============================================ 2. one predicate for "fully set"
# It was !=null in three places. A string is !=null, which is how a poisoned row
# reported itself fully set: it rendered its own help line, mirrored itself into
# window.LOTS and published itself into entries with open serialising to null.
swap(
    'js/housing-set-typed',
    """function housingSet(k){const h=housingGet(k);return !!(h&&h.total!=null&&h.storedTaken!=null)}""",
    """/* "Fully set" is a NUMBER test, not a not-null test, and it is asked here and
   nowhere else. A string is !=null, so the old predicate let a poisoned row
   render its own help line, mirror itself into window.LOTS and publish itself
   into entries with open serialising to JSON null. */
function housingSet(k){const h=housingGet(k);
  return !!(h&&typeof h.total==='number'&&typeof h.storedTaken==='number')}""",
    mark="""return !!(h&&typeof h.total==='number'""")

# The mirror re-tested the same thing inline. One predicate, three surfaces.
swap(
    'js/housing-sync-predicate',
    """  if(h&&h.total!=null&&h.storedTaken!=null)window.LOTS[k]={sold:housingTaken(k),total:h.total};""",
    """  if(housingSet(k))window.LOTS[k]={sold:housingTaken(k),total:h.total};""",
    mark="""  if(housingSet(k))window.LOTS[k]=""")


# ================================================== 3. the import path itself
swap(
    'js/housing-import-types',
    """  rows.forEach(r=>{if(!r||!r.structureKey)return;
    /* legacy: a row exported before stored and effective were split carries
       only `taken`, and reading that as the founder's typed number is only safe
       while the row itself says the founder is the authority. */
    const auth=r.takenSource||'founder';
    const st=(r.storedTaken!=null)?r.storedTaken:((auth==='founder'&&r.taken!=null)?r.taken:null);
    SCENE.housing[r.structureKey]={total:(r.total==null?null:r.total),
      storedTaken:(st==null?null:st),label:r.label||null,takenSource:auth}});
  housingSyncAll()}""",
    """  /* NOTHING ARRIVING HERE IS TRUSTED. Every field below leaves this line as a
     number, a null, or a bounded string. structureKey has to BE a string or the
     row is dropped: an object key stringifies to '[object Object]' and mints a
     phantom hamlet. label is capped at the 190 its own input carries, so a
     restore cannot smuggle a megabyte through it. takenSource reaches three
     lanes through entries and is a string or it is 'founder'. */
  const bad={n:0};
  rows.forEach(r=>{if(!r||typeof r.structureKey!=='string'||!r.structureKey)return;
    /* legacy: a row exported before stored and effective were split carries
       only `taken`, and reading that as the founder's typed number is only safe
       while the row itself says the founder is the authority. */
    const auth=(typeof r.takenSource==='string'&&r.takenSource)?r.takenSource.slice(0,40):'founder';
    const st=(r.storedTaken!=null)?r.storedTaken:((auth==='founder'&&r.taken!=null)?r.taken:null);
    SCENE.housing[r.structureKey]={total:housingReadNum(r.total,bad),
      storedTaken:housingReadNum(st,bad),
      label:(r.label==null?null:(String(r.label).slice(0,190)||null)),takenSource:auth}});
  /* Said once, not per row: a bent file is a fact about the file. */
  if(bad.n)console.warn('housing: '+bad.n+' imported number'+(bad.n===1?'':'s')+' refused and left unset. A hamlet takes a whole number from 0 to 10000.');
  housingSyncAll()}""",
    mark="""  const bad={n:0};""")


# ================================================ 4. the public block's filter
swap(
    'js/housing-entries-typed',
    """  const entries=rows.filter(r=>r.total!=null&&r.storedTaken!=null).map(r=>({structureKey:r.structureKey,""",
    """  /* the same NUMBER test housingSet asks, asked here because this is the block
     three lanes read: a row holding a string would otherwise publish itself as
     configured with open serialising to JSON null, which this contract reads as
     unset on a row that reports itself fully set. */
  const entries=rows.filter(r=>typeof r.total==='number'&&typeof r.storedTaken==='number').map(r=>({structureKey:r.structureKey,""",
    mark="""  const entries=rows.filter(r=>typeof r.total==='number'""")


# ====================================== 5. the render sites, escq like the rest
# escq(null) is '' by its own contract, so the local stringifier had nothing left
# to do once the four sites escape. A formatter that only stringified was the
# hole: it is what carried the string intact into a double-quoted attribute.
swap(
    'js/housing-render-val',
    """  const h=housingGet(s.key)||{},set=housingSet(s.key),op=housingOpen(s.key);
  const val=v=>v==null?'':String(v);""",
    """  const h=housingGet(s.key)||{},set=housingSet(s.key),op=housingOpen(s.key);
  /* No local stringifier any more: every value below leaves through escq, the
     way the rest of this panel already does it. escq(null) is '' by its own
     contract, so nothing else was formatting. */""",
    mark="""  /* No local stringifier any more:""")

# The help line neighbours a sentence, so it is split into three edits that touch
# only interpolations. The sentence between them is never in an anchor.
#
# ORDER IS LOAD-BEARING and it is the guard that makes it so. The attribute edit
# below introduces value="${escq(h.total)}", which CONTAINS the help edit's mark
# ${escq(h.total)}. Run the attribute first and the help edit's guard reads its
# own mark in somebody else's edit and skips a change it never made, on the FIRST
# run, silently. The help edits go first, where their marks cannot exist yet.
swap(
    'js/housing-render-help-open',
    """<b>${op}</b>""",
    """<b>${escq(op)}</b>""",
    mark="""<b>${escq(op)}</b>""")

swap(
    'js/housing-render-help-taken',
    """${housingTaken(s.key)}""",
    """${escq(housingTaken(s.key))}""",
    mark="""${escq(housingTaken(s.key))}""")

swap(
    'js/housing-render-help-total',
    """${h.total}""",
    """${escq(h.total)}""",
    mark="""${escq(h.total)}""")

swap(
    'js/housing-render-total-attr',
    """value="${val(h.total)}\"""",
    """value="${escq(h.total)}\"""",
    mark="""value="${escq(h.total)}\"""")

swap(
    'js/housing-render-taken-attr',
    """value="${val(h.storedTaken)}\"""",
    """value="${escq(h.storedTaken)}\"""",
    mark="""value="${escq(h.storedTaken)}\"""")


# -------------------------------------------------------------------- write out
out = src.encode('utf-8')
if out == raw:
    print('\n  grounds-v0.html   no change: %d bytes' % before_len)
else:
    with open(PATH, 'wb') as f:
        f.write(out)
    print('\n  grounds-v0.html   %d -> %d bytes (%+d)' % (before_len, len(out), len(out) - before_len))

print('  applied %d, skipped %d' % (len(applied), len(skipped)))
if not applied:
    print('  RE-RUN CLEAN: every step already present, zero bytes changed')
sys.exit(0)
