#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_g3_03_homes.py  (L3 INSPECTOR, g family, concern: homes per hamlet)

Objective FOUR.  Rye wants a founder to set homes-available and homes-taken per
hamlet in BUILDER MODE as well as in Admin.  Builder mode is renderInspect /
bindInspect, which is this lane's surface, so the fields land here.  The shape
comes from HOUSING_AVAILABILITY_CONTRACT.md (L7, this run) as amended by the
coordinator's wave-1 ruling on storedTaken, below.

THIS SCRIPT WRITES TWO FILES.  grounds-v0.html is the artifact.
shared/mapScene.ts is the site's half of the publish bridge, and it is here
because the same three verbs have to exist on both sides or they exist on
neither: see BLOCKING 1 below.  Each file is guarded, counted and reported
separately, and either can be all-skips while the other applies.

A THIRD SCRIPT.  The lane brief names two patch files.  This is a separate
concern from the tooltips and from the listbox, the brief's own rule is one
script per concern, and the coordinator can land or hold it on its own without
touching the other two.

--------------------------------------------------------------------------
WAVE-1 REJECTION.  Four things were wrong and all four are fixed here.

BLOCKING 1a - THE CONCATENATED ACTION NAME.  The first version logged the two
number edits from a loop: `logEdit('housing-'+field, ...)`.  qa/verify_publish.js
section G scrapes `logEdit\\('([a-z-]+)'` out of the SOURCE, so it read the
action as the bare prefix `housing-`, reported it missing from both word lists,
and would have gone on hiding the real actions from that gate for good even
after somebody named the prefix.  That gate is the only thing in this repo that
compares the map's vocabulary against the site's; it has already caught this
class twice (`media` and `phases`).  The two calls are now written out in full,
one per handler, and nothing builds an action name from a variable.

BLOCKING 1b - ONE LIST, NEVER TWO.  The three verbs were added to the
ARTIFACT's EDIT_VERBS and not to shared/mapScene.ts:227, which is the gate's
stated consequence: a publish confirm rendering a raw key on one surface and a
sentence on the other.  That is the second file this script writes.

BLOCKING 2 - SCENE.housing DID NOT SURVIVE THE ROUND TRIP.  The first version
called this "stale" and left it to L5.  Measured, it is destroyed: restoreScene
never read the housing block back, so a hamlet set to 8/3 came back as an empty
object, window.LOTS reverted to the seeded sample and the export was empty.
This is not an edge path.  applyScene() calls restoreScene on EVERY shell scene
push and the localStorage Restore button calls it directly, so the dominant
path (reload, Restore; or a publish reaching a viewer) is the broken one.  The
coordinator granted this lane ONE line inside restoreScene for SCENE.housing.
It is this, and it is the whole grant:

    housingImport(J); /* L3, by coordinator ruling: the one line that restores SCENE.housing */

Everything it does lives in housingImport() in this lane's own block.  The
restore REPLACES SCENE.housing rather than merging it, which is what
SCENE.flows and SCENE.features already do: this session's numbers sitting on
top of an incoming file is the silent wrong answer.

F5 - SILENT UNSET ON UNPARSEABLE INPUT.  Validation was loud for 4.5 and for
taken-above-total and silent for anything the control cannot parse: housingNum
read the empty value as a deliberate clear, and a good total of 8 became null
with no toast and the row dropped out of `entries`.  The three named strings do
NOT behave alike, which the first fix for this assumed and which is why it only
worked for two of them.  Measured on this Chromium, in a field holding 8:

    abc     value ''      badInput false   valid TRUE
    8e      value ''      badInput true    valid false
    1.2.3   value '1.23'  badInput false   valid false

validity answers `8e` and `1.2.3`.  It cannot answer `abc`, because Chromium
throws the letters away and hands `change` a control that is byte for byte a
cleared field.  The difference survives one event earlier, as INTENT against
RESULT: beforeinput carries `data` for an insertion and null for a deletion,
so an insertion that leaves the field empty is one the control ate, and a
deletion still clears.  The same rule covers a PASTED `abc`, which arrives in
exactly the same shape.  All four are now refused, out loud, with the previous
number left standing.  Two cheaper rules were measured wrong before this one;
both are written up at housingWatch so nobody re-derives them.

--------------------------------------------------------------------------
CONTRACT COMPLIANCE, point by point.

  A  Unset is NULL on homes_total and homes_taken INDEPENDENTLY, never a
     sentinel.  An empty field here is null, and a row where both are null is
     deleted rather than kept, because in this artifact nothing needs a row to
     exist before a number does.  A row existing is still not the same as a
     hamlet being set, which is the trap the contract names: the entries filter
     below is what decides that, not the presence of the row.
  A  homes_open is DERIVED, never stored.  max(0, total - taken) is computed in
     the helper line and in the export and is not a field.
  A  taken is stored AND its authority is recorded: takenSource defaults to
     'founder' on every row this panel writes.
  A* STORED vs EFFECTIVE, the coordinator's wave-1 ruling, shared with L7's
     HousingRow.  `storedTaken` is the founder's TYPED number and is the only
     thing a founder surface ever writes.  `taken` is the EFFECTIVE number a
     surface displays, and which one is authoritative is what takenSource
     names: while it says 'founder' the two agree, and when the reservation
     system lands `taken` becomes a live count while storedTaken stays exactly
     what the founder typed.  So this panel's fields SEND storedTaken and never
     taken; `rows`, the write view, carries no `taken` at all; and `entries`,
     the public read block, carries the effective `taken` with `open` derived
     from it.  Collapsing the two is how a count overwrites a founder's number
     and locks them out of their own row, which is the bug L7 is fixing on the
     data side this wave.
  B  structureKey is the map's key byte for byte.  The map mints it, nothing
     derives it from a label.
  C  entries carries ONLY fully set hamlets and is the public shape; the filter
     is applied once, server-side in the real system and here in the export, so
     the three consuming lanes test presence and never NULLs.
  D  Validation is loud: whole numbers, 0 or more, total at most 10000, taken
     above total refused rather than clamped, and an unparseable read refused
     rather than treated as a clear (F5).  The read-side clamp in the derived
     open() defends rows written before that validation existed.
  F  The example rule is not implemented here.  This lane writes the numbers;
     the three player-facing surfaces at :3025, :3062 and :4587 are the F lanes'
     work and this patch does not touch them.

ONE PLACE THE CONTRACT DOES NOT REACH, and what was done about it.  The contract
describes two APIs: a public GET /api/map/config carrying `housing.entries`
(fully set rows only) and a gated GET /api/housing/availability carrying every
row with nulls.  It says nothing about the artifact's own export file, which is
this prototype's only round trip.  Emitting only `entries` would silently drop a
half-typed row on export, which is the exact class of bug this session exists to
remove.  So the export carries both: `entries` exactly as the contract specifies
it, and `rows` beside it as the gated view and the write shape.  Flagged in the
report as an extension, not a contract change: nothing reads `rows` except a
restore.

WHY window.LOTS IS MIRRORED.  The three player surfaces read window.LOTS
({sold,total}, seeded at :4511).  Writing only to SCENE.housing would leave a
founder typing numbers that change nothing anybody can see.  So a fully set row
mirrors to LOTS, and clearing a row restores the seeded sample from a snapshot
taken on first write.  Sample data is never deleted, only shadowed, so the F
lanes still have their example numbers to label.

ANCHORS ARE CODE, GUARDS ARE CODE.  The markup insert used to anchor on the
"roles here" heading, which is player copy.  It now anchors on ${seatsHere.map,
with the heading itself a wildcard, so a voice pass on that heading cannot take
this script out.  Every mark is a function name, a selector or a key.

RE-RUNNABLE: every step guards itself, per edit.  Second run prints skip for
every step in both files and writes zero bytes.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, 'grounds-v0.html')
TS = os.path.normpath(os.path.join(HERE, '..', '..', 'shared', 'mapScene.ts'))

with open(PATH, 'rb') as f:
    raw = f.read()
src = raw.decode('utf-8')
before_len = len(raw)

with open(TS, 'rb') as f:
    traw = f.read()
tsrc = traw.decode('utf-8')
tbefore_len = len(traw)

# The artifact is pinned to LF by .gitattributes (`grounds-v0.html -text`).
# shared/mapScene.ts is NOT pinned, so core.autocrlf hands it back CRLF on a
# Windows checkout and LF on CI. A CRLF-blind anchor matched zero times here and
# the assert fired, which is the guard working; hardcoding \r\n would have been
# the same bug pointed the other way. The anchors below are written with \n and
# translated to whatever this checkout actually uses.
TS_NL = '\r\n' if '\r\n' in tsrc else '\n'

applied, skipped = [], []


def _do(name, text, old, new, count, mark, regex):
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


def swap_re(name, old, new, count=1, mark=None):
    """Same contract, for an edit whose neighbourhood contains a SENTENCE: the
    literal parts are code fences and the sentence between them is a wildcard
    carried through unchanged."""
    global src
    src = _do(name, src, old, new, count, mark, True)


def swap_ts(name, old, new, count=1, mark=None):
    """Anchors are written with \\n and translated to this checkout's endings."""
    global tsrc
    tsrc = _do(name, tsrc, old.replace('\n', TS_NL), new.replace('\n', TS_NL),
               count, mark, False)


# =========================================================== FILE 1: the artifact

# --------------------------------------------------------------------- 1. CSS
# input[type=number] was never styled here because the panel had none. Both
# rules are in #inspect's own block, which is this lane's.
swap(
    'css/number-field',
    """  #inspect input[type=text],#inspect textarea,#inspect select{flex:1;""",
    """  #inspect input[type=text],#inspect input[type=number],#inspect textarea,#inspect select{flex:1;""",
    mark="""#inspect input[type=text],#inspect input[type=number],""")

swap(
    'css/number-focus',
    """  #inspect input:focus,#inspect textarea:focus,#inspect select:focus{border-color:var(--gold-b)}""",
    """  #inspect input:focus,#inspect textarea:focus,#inspect select:focus{border-color:var(--gold-b)}
  #inspect input[type=number]{max-width:82px}
  #inspect input[type=number]::-webkit-inner-spin-button{opacity:.45}""",
    mark="""#inspect input[type=number]{max-width:82px}""")


# ------------------------------------------------------------- 2. the store
HOUSE = r"""/* ---------- homes per hamlet (L3, HOUSING_AVAILABILITY_CONTRACT.md) ----------
   SCENE.housing[structureKey] = {total, storedTaken, label, takenSource}, and
   null is unset on total and storedTaken INDEPENDENTLY. Never a sentinel: -1
   survives total - taken as a plausible wrong integer instead of failing.
   `open` is DERIVED here and in the export and is never a field.

   STORED vs EFFECTIVE. storedTaken is the founder's TYPED number and is the
   only thing a founder surface ever writes. taken is the EFFECTIVE number a
   surface displays, and takenSource names which one is authoritative: while it
   says 'founder' the two agree, and when the reservation system lands taken
   becomes a live count while storedTaken stays exactly what the founder typed.
   Collapsing them is how a count overwrites a founder's number. */
function housingRows(){SCENE.housing=SCENE.housing||{};return SCENE.housing}
function housingGet(k){return housingRows()[k]||null}
function housingRow(k,make){const H=housingRows();
  if(!H[k]&&make)H[k]={total:null,storedTaken:null,label:null,takenSource:'founder'};
  return H[k]||null}
/* The EFFECTIVE taken, for display only. No reservation source exists in this
   artifact, so it reads the founder's number; the two names stay apart because
   the write side must never send this one. */
function housingTaken(k){const h=housingGet(k);return h?h.storedTaken:null}
function housingSet(k){const h=housingGet(k);return !!(h&&h.total!=null&&h.storedTaken!=null)}
function housingOpen(k){const h=housingGet(k);
  /* the clamp is fail-closed for a row written before the validation existed:
     it must never render negative and never read as unlimited */
  return housingSet(k)?Math.max(0,h.total-housingTaken(k)):null}
/* whole number, 0..10000. '' is unset and returns null; undefined means refuse,
   which is the 400 the contract asks for rather than a silent clamp. */
function housingNum(v){const t=String(v==null?'':v).trim();
  if(!t)return null;
  if(!/^\d{1,7}$/.test(t))return undefined;
  const n=+t;return (n>=0&&n<=10000)?n:undefined}
/* Everything a number input cannot parse arrives at `change` looking exactly
   like a field a founder emptied on purpose, which is how a good total of 8
   became null with nothing said. Measured on this Chromium, typing into a
   control holding 8:

     abc     value ''      badInput false   valid TRUE    <- the hard one
     8e      value ''      badInput true    valid false
     1.2.3   value '1.23'  badInput false   valid false
     4.5     value '4.5'   badInput false   valid false
     (clear) value ''      badInput false   valid true

   So validity answers three of the four and is deliberately read BEFORE the
   value. It cannot answer `abc`: Chromium THROWS THE LETTERS AWAY, and by the
   time change fires the control is byte for byte a cleared field.

   The difference survives one event earlier, and the rule is INTENT vs RESULT:
   beforeinput carries `data` for an INSERTION and null for a deletion, so an
   insertion that leaves the field empty is an insertion the control ate. That
   is the whole test. Measured, and two cheaper rules were measured wrong first:

     * "beforeinput with no input after it" fails on the FIRST character, which
       does fire input because it wipes the selection: 8 selected, `a` typed,
       input fires with value ''.
     * "check dataTransfer for a paste" is answering a question the browser
       does not ask. Pasting `abc` over a selected 8 arrives as
       beforeinput{inputType:'insertFromPaste', data:'abc', dataTransfer:null}
       followed by input with value '' — the SAME shape as typing it, which is
       why one rule covers both and the dataTransfer branch covered nothing.

   The refusal is narrowed to an insertion that left the field EMPTY. Typing 5a
   leaves 5 showing and writes 5, because what the field shows is what a person
   means; it is an empty field after an insertion that never landed which must
   never be read as "clear this". A deletion carries data null and still
   clears. */
function housingWatch(el){if(!el||el._hWatch)return;el._hWatch=1;
  el.addEventListener('beforeinput',e=>{if(e.data)el._hIns=1});
  el.addEventListener('input',()=>{if(String(el.value).trim())el._hIns=0})}
function housingReadEl(el){if(!el)return null;
  if(el.validity&&el.validity.badInput)return undefined;
  if(el._hIns&&!String(el.value).trim())return undefined;
  return housingNum(el.value)}
function housingClean(k){const H=housingRows(),h=H[k];
  if(h&&h.total==null&&h.storedTaken==null&&!h.label)delete H[k];
  housingSync(k)}
/* The three player surfaces read window.LOTS ({sold,total}, seeded at the
   sample assignment further down this file). A founder's numbers have to reach
   them or this panel writes to nothing anybody can see. The seed is snapshotted
   on first write and restored when a row is cleared, so the example numbers the
   labelling lanes need are shadowed and never destroyed. */
function housingSync(k){if(!window.LOTS)return;
  window.LOTS_SAMPLE=window.LOTS_SAMPLE||JSON.parse(JSON.stringify(window.LOTS));
  const h=housingGet(k);
  if(h&&h.total!=null&&h.storedTaken!=null)window.LOTS[k]={sold:housingTaken(k),total:h.total};
  else if(window.LOTS_SAMPLE[k])window.LOTS[k]={...window.LOTS_SAMPLE[k]};
  else delete window.LOTS[k]}
/* LOTS itself is in the sweep, not just the sample and the rows: a restore can
   retire a key that is currently mirrored into LOTS and present in neither of
   the other two, and iterating two of the three left that one standing. */
function housingSyncAll(){if(!window.LOTS)return;
  Object.keys({...(window.LOTS_SAMPLE||{}),...(window.LOTS||{}),...housingRows()}).forEach(housingSync)}
window.housingSyncAll=housingSyncAll;
/* The restore, called by the one granted line in restoreScene. SCENE.housing is
   REPLACED, never merged, which is what SCENE.flows and SCENE.features already
   do: this session's numbers left sitting on top of an incoming file is the
   silent wrong answer. It reads `rows`, the gated view, so a half-typed row
   survives the round trip. */
function housingImport(J){SCENE.housing={};
  /* Array.isArray, not `||[]`: restoreScene runs inside one try/catch, so a
     `rows` that arrives as an object from a shell push would throw here and
     take the WHOLE scene restore down with it. This one block failing closed
     to "no housing" is the right blast radius. */
  const rows=(J&&J.housing&&Array.isArray(J.housing.rows))?J.housing.rows:[];
  rows.forEach(r=>{if(!r||!r.structureKey)return;
    /* legacy: a row exported before stored and effective were split carries
       only `taken`, and reading that as the founder's typed number is only safe
       while the row itself says the founder is the authority. */
    const auth=r.takenSource||'founder';
    const st=(r.storedTaken!=null)?r.storedTaken:((auth==='founder'&&r.taken!=null)?r.taken:null);
    SCENE.housing[r.structureKey]={total:(r.total==null?null:r.total),
      storedTaken:(st==null?null:st),label:r.label||null,takenSource:auth}});
  housingSyncAll()}
window.housingImport=housingImport;
/* entries is the public /api/map/config block: fully set rows only, no identity
   fields, filtered ONCE here so three surfaces cannot disagree about what
   "example" means, and its `taken` is the EFFECTIVE number with `open` derived
   from it. rows is the WRITE view and the gated read: the typed number under
   its own name, nulls included, and no `taken` at all, because sending the
   effective number back is how a live count gets written in as though a
   founder had typed it. Without rows a half-typed row would not survive an
   export. */
function housingExport(){const H=housingRows();
  const rows=Object.keys(H).sort().map(k=>{const h=H[k]||{};
    return {structureKey:k,total:(h.total==null?null:h.total),
      storedTaken:(h.storedTaken==null?null:h.storedTaken),
      takenSource:h.takenSource||'founder',label:h.label||null}});
  const entries=rows.filter(r=>r.total!=null&&r.storedTaken!=null).map(r=>({structureKey:r.structureKey,
    total:r.total,taken:housingTaken(r.structureKey),
    open:Math.max(0,r.total-housingTaken(r.structureKey)),
    takenSource:r.takenSource,label:r.label}));
  return {entries,configured:entries.length>0,rows,
    note:'entries is the public block: fully set hamlets only, absence from it is the whole example predicate, and its taken is the effective number. rows is the write view and the gated read: storedTaken is the number the founder typed, nulls included, and no effective count is ever written back.'}}
/* Which structures get the fields. REG's third column is the category the
   archetype picker groups by, so 'Living' is the founder's own answer to what a
   hamlet is; 'homes' is the legacy archetype the seed structures carry and is
   not a REG key. Anything already carrying numbers keeps them reachable. */
function housingApplies(s){if(!s)return false;
  const r=(typeof REG!=='undefined')&&REG.find(x=>x[0]===s.archetype);
  return !!(r&&r[2]==='Living')||s.archetype==='homes'
    ||!!housingGet(s.key)||!!(window.LOTS&&window.LOTS[s.key])}
function housingRowsH(s){if(!housingApplies(s))return '';
  const h=housingGet(s.key)||{},set=housingSet(s.key),op=housingOpen(s.key);
  const val=v=>v==null?'':String(v);
  return `<h5>homes here</h5>
   <div class="irow"><span class="ilbl">homes</span><input type="number" id="iHomesTotal" min="0" max="10000" step="1" inputmode="numeric" placeholder="not set" value="${val(h.total)}" data-tip="How many homes this hamlet has to offer. Leave it empty and every surface keeps showing its example numbers.">
     <span class="ilbl" style="width:auto">taken</span><input type="number" id="iHomesTaken" min="0" max="10000" step="1" inputmode="numeric" placeholder="not set" value="${val(h.storedTaken)}" data-tip="How many are already spoken for, including anyone who spoke for one before the platform existed. Open is worked out from these two and is never typed."></div>
   <div class="irow"><span class="ilbl">hamlet name</span><input type="text" id="iHomesLabel" maxlength="190" value="${escq(h.label||'')}" placeholder="${escq(s.name)}"></div>
   <div class="insp-help insp-h-homes">${set?`<b>${op}</b> open · ${housingTaken(s.key)} of ${h.total} spoken for. Reservations read these numbers.`:`Both numbers are empty, so this hamlet counts as unset and every surface keeps showing example numbers.`}</div>`}
"""

swap(
    'js/housing-store',
    """function renderInspect(){const s=BY[inspKey];if(!s){closeInspect();return}""",
    HOUSE + """function renderInspect(){const s=BY[inspKey];if(!s){closeInspect();return}""",
    mark="""function housingExport(){""")


# ------------------------------------------------------------- 3. the markup
# Anchored on ${seatsHere.map, which is code. The heading above it is a
# wildcard: it is player copy, it is not this script's business, and a voice
# pass that rewords it must not read as a code conflict.
swap_re(
    'markup/homes-section',
    r'(\n   )(<h5>[^<]*</h5>\n   <div>\$\{seatsHere\.map)',
    lambda m: m.group(1) + '${housingRowsH(s)}' + m.group(1) + m.group(2),
    mark="""${housingRowsH(s)}""")


# ------------------------------------------------------------ 4. the handlers
# The two logEdit calls are WRITTEN OUT, one per handler. qa/verify_publish.js
# scrapes logEdit('...') as a source literal to hold the map's word list against
# the site's, so an action name built from a loop variable is not merely missing
# from that gate, it is invisible to it for good.
swap(
    'js/housing-bind',
    """  B.querySelector('#iSeatAdd').onclick=()=>{const n=B.querySelector('#iSeatName').value.trim();if(!n)return;""",
    """  /* Loud on write, per the contract: whole numbers, 0..10000, taken above
     total refused rather than clamped, because a clamp would silently rewrite a
     founder's number into one they did not type, and an unparseable read
     refused rather than read as a deliberate clear. */
  const homesRead=el=>{const v=housingReadEl(el);
    if(v===undefined){toast('Homes take a whole number from 0 to 10000.');renderInspect()}
    return v};
  /* The founder types into storedTaken. taken is the effective number and is
     never what a founder surface writes. */
  const homesPut=(field,v)=>{const row=housingRow(s.key,true),prev=row[field];row[field]=v;
    if(row.total!=null&&row.storedTaken!=null&&row.storedTaken>row.total){row[field]=prev;
      toast('Homes taken cannot pass homes total.');renderInspect();return false}
    row.takenSource=row.takenSource||'founder';return true};
  (()=>{const el=B.querySelector('#iHomesTotal');if(!el)return;housingWatch(el);
    el.onchange=()=>{const v=homesRead(el);if(v===undefined)return;
      if(!homesPut('total',v))return;
      logEdit('housing-total','structure:'+s.key,{to:v});
      housingClean(s.key);renderInspect()}})();
  (()=>{const el=B.querySelector('#iHomesTaken');if(!el)return;housingWatch(el);
    el.onchange=()=>{const v=homesRead(el);if(v===undefined)return;
      if(!homesPut('storedTaken',v))return;
      logEdit('housing-taken','structure:'+s.key,{to:v});
      housingClean(s.key);renderInspect()}})();
  (()=>{const el=B.querySelector('#iHomesLabel');if(!el)return;
    el.onchange=()=>{const t=el.value.trim(),row=housingRow(s.key,!!t);
      if(row){row.label=t||null;logEdit('housing-label','structure:'+s.key,{to:row.label})}
      housingClean(s.key);renderInspect()}})();
  B.querySelector('#iSeatAdd').onclick=()=>{const n=B.querySelector('#iSeatName').value.trim();if(!n)return;""",
    mark="""B.querySelector('#iHomesTotal')""")


# ------------------------------------------------------------- 5. the export
swap(
    'js/housing-export',
    """    stays_occupancy:{lots:window.LOTS||null,rooms:window.ROOMS||null,""",
    """    housing:housingExport(),
    stays_occupancy:{lots:window.LOTS||null,rooms:window.ROOMS||null,""",
    mark="""    housing:housingExport(),""")


# ------------------------------------------------------ 6. THE GRANTED LINE
# restoreScene is L5's surface. The coordinator granted this lane ONE line in it
# for SCENE.housing and nothing else, because without it a hamlet set to 8/3
# comes back as an empty object on the dominant path: applyScene() calls
# restoreScene on every shell scene push, and the Restore button calls it
# directly. Everything the line does lives in housingImport() above.
swap(
    'js/housing-restore',
    """  if(J.vital_overrides)window.VITAL_OVR=J.vital_overrides;""",
    """  if(J.vital_overrides)window.VITAL_OVR=J.vital_overrides;
  housingImport(J); /* L3, by coordinator ruling: the one line that restores SCENE.housing */""",
    mark="""  housingImport(J); /* L3, by coordinator ruling""")


# -------------------------------------------------- 7. the edit story reads it
# EDIT_VERBS falls back to the raw action string, so on this side it is
# legibility; the SITE's copy of this list, in file 2, is the one the publish
# confirm reads, and a verb present on one side only is what section G of
# verify_publish exists to refuse.
# Anchored on the DECLARATION, not on the list's last two verbs: every value in
# this object is a sentence the publish confirm renders, so the tail of it is
# the last place an anchor belongs. Prepending also means this never has to know
# what the list currently ends with.
swap(
    'js/housing-edit-verbs',
    """const EDIT_VERBS={""",
    """const EDIT_VERBS={
  'housing-total':'set the homes at','housing-taken':'set the homes taken at',
  'housing-label':'named the hamlet at',
  """,
    mark="""'housing-total':""")


# ======================================================= FILE 2: shared/mapScene.ts
# The site's half of the same list. Anchored on the declaration that follows it,
# which is code; the verbs above it are copy and are not in the anchor.
swap_ts(
    'ts/mapScene-edit-verbs',
    """};

export interface SceneChange {""",
    """  "housing-total": "set the homes at",
  "housing-taken": "set the homes taken at",
  "housing-label": "named the hamlet at",
};

export interface SceneChange {""",
    mark=""""housing-total":""")


# -------------------------------------------------------------------- write out
out = src.encode('utf-8')
if out == raw:
    print('\n  grounds-v0.html   no change: %d bytes' % before_len)
else:
    with open(PATH, 'wb') as f:
        f.write(out)
    print('\n  grounds-v0.html   %d -> %d bytes (%+d)' % (before_len, len(out), len(out) - before_len))

tout = tsrc.encode('utf-8')
if tout == traw:
    print('  shared/mapScene.ts  no change: %d bytes' % tbefore_len)
else:
    with open(TS, 'wb') as f:
        f.write(tout)
    print('  shared/mapScene.ts  %d -> %d bytes (%+d)' % (tbefore_len, len(tout), len(tout) - tbefore_len))

print('  applied %d, skipped %d' % (len(applied), len(skipped)))
if not applied:
    print('  RE-RUN CLEAN: every step already present in both files, zero bytes changed')
sys.exit(0)
