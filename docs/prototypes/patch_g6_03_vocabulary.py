#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.03 — THE FOUNDER VOCABULARY, AT THE READERS AND AT THE DOOR.

g6.01 closed the JS-string class and called the class closed. g6.02 closed the
element and attribute sinks IT ENUMERATED and called that class closed. Both
times the enumeration was the whole answer, and both times it was short. This
patch closes the vocabulary — and does it at the ABSORBER as well as at the six
readers, because a list of readers is a thing that grows and an absorber is a
thing that holds.

WHAT WAS STILL RAW. `map_scene.vocabulary` arrives through applyVocabulary(),
which took `color:m.color||'#e8c877'` and `SUBTYPES[k]=voc[k].slice()` with no
validation of any kind. Six readers put those two values straight into markup.
Measured on the shipped bytes with qa/_probe_vocab_sinks.js, one marker per
field, through the real restoreScene:

    after restoreScene                      els=  9   (media.color, NO CLICK)
    renderDrawPanel options (:3689/:3700)   els= 25
    settled                                 els= 25  fired= 7

    by field: media.color 9 · subtype.road.attr 1 · subtype.road.text 4
              subtype.zone.attr 1 · subtype.zone.text 10

Nine elements land on a plain restore or config push with no click at all,
because restoreScene calls renderMediaVocab() and the media chip writes the
colour into a style attribute.

THE SIX SINKS, and the escape at each:

    :5274  renderMediaVocab   background:${m.color}      style="" is a
                              double-quoted attribute            escq
    :5286  mediaEditor        value="${m.color}"                 escq
    :3057  renderTab          background:${mediaColor(...)}       escq
    :4014  renderInspect      background:${mediaColor(...)}       escq
    :3689  renderDrawPanel    <option value="${s2}">${s2}</option>
                              — BOTH contexts in one line          escq x2
    :3700  renderDrawPanel    the same line for the selected feature, whose
                              fallback reads the FEATURE's subtype  escq x2

escq and only escq. None of the six is a JS string, and escj outside a JS
string ships a backslash into the reader's text — the rule g6.02 wrote down.

AND AT THE ABSORBER, WHICH IS THE HALF THAT HOLDS.

  A COLOUR IS A COLOUR. `accent` and `parchment` already reach the map's CSS
  through shared/mapSkin.ts, where the house answer is written down: held to
  `/^#[0-9a-f]{6}$/i` "rather than escaped: a colour picker has no legitimate
  reason to emit anything else, and an allowlist cannot be talked around the
  way an escaping rule can". The same rule, the same regex, now applies to
  media[].color, and the fallback is '#e8c877' — the exact default the line
  already carried. Rejected: dropping the whole medium the way the site's
  inbound sanitiser does. That deletes the founder's WORD over a bad colour,
  and mediaOf() would re-invent the key with '#e8c877' on the next read
  anyway, so it costs data and buys the same end state.

  A SUBTYPE IS A WORD, and it has a shape the artifact already enforces on
  itself: the zone editor stores `inp.value.trim().toLowerCase()`. That
  normalisation is now a named helper, vocabWord(), and BOTH doors call it —
  the panel a founder types into and applyVocabulary() the bridge pushes
  through — so a word that arrives over the wire is byte-identical to the same
  word typed by hand. Empty entries and duplicates are dropped; a list that
  normalises to nothing leaves the existing list alone rather than installing
  an empty <select> a founder cannot draw from.

  DELIBERATELY NO LENGTH CAP, and the first draft of this patch had one. 48
  characters, borrowed from the media name, truncated the escaping gate's own
  payload mid-tag — so the subtype counters would have read zero because the
  attack was cut in half, not because escq caught it. A cap that makes an
  escape unmeasurable costs more than it buys, an over-long word here is a
  layout problem rather than a safety one, and the panel a founder types into
  has no cap either, so adding one at the bridge would create exactly the
  asymmetry this helper exists to remove.

  Rejected for subtypes: an allowlist. "Your land, your words" is the feature
  — renderVocab exists to let a founder rename a zone to anything — so a
  closed set would delete it. Rejected too: stripping markup out of the word.
  That silently rewrites what a person typed, and it is not a safety property:
  the word still lands in five other places. Normalise at the door, escape at
  the reader, and neither one is asked to do the other's job.

  map_zones[].subtype IS A SECOND DOOR and it never touched applyVocabulary:
  restoreScene copies it straight onto the feature, and renderDrawPanel's
  `(SUBTYPES[sel.kind]||[sel.subtype])` reads it back. It takes vocabWord()
  too. This is the difference between closing an instance and closing a class.

AND FOUR READERS THE LIST DID NOT HAVE, which is the argument above arriving
in the same patch that makes it. The six sinks came from an enumeration; these
four came from the MEASUREMENT, after the escaping gate's poisoner was taught
to move an identifier and every field that names it TOGETHER:

    :4022  structOpts        <option value="${s.key}">          22 elements
    :3691  renderDrawPanel   <option value="${s2.key}">         22 elements
                             (the `footprint` kind's owner list)
    :4038  flowRowH medSel   <option value="${m.key}">          the medium key,
                             which IS the vocabulary — my own door
    :4044  flowRowH viaSel   <option value="${x.id}">           the drawn
                             feature's id

(Those four line numbers are read off the file with THIS PATCH'S ABSORBER BLOCK
already in it, which is where the measurement was taken; the six above are read
off the shipped g6.02 bytes. The absorber adds 31 lines above :4014, so the
inspect flow row is the same site under two numbers.)

Every one is a double-quoted attribute, so every one takes escq. None was
reachable before, and that is the finding rather than the fix: the gate poisoned
`map_structures[0].key` ALONE, which severed quests[].structure_key,
map_flows[].from_key and nine other fields that still named the old key, so the
rows that call structOpts were filtered out before they rendered and the gate
printed `elements 0, cap 0` about a surface that never ran. Same shape as the
neutered poisoner, one level in: a payload that unhooks its own reader and a
clean surface print the same zero. Measured on the same artifact and the same
payload: key alone 0 elements, key + references 44, and 280 once renderInspect
was also driven on a building that is the END of a flow (the medium and via
selects render nowhere else).

NO ABSORBER FOR THESE FOUR, and that is deliberate. A colour has a shape and a
subtype has a shape, so both are held at the door. An identifier's only shape is
that it must come back BYTE-EXACT — every one of these values is read straight
back out of `select.value` and assigned to `q.at`, `f.from`, `f.medium`,
`f.via`, and a key that a normaliser touched stops matching the row it names.
Normalising here would break the references this same patch just proved the
gate needs. So: escaped at the reader, untouched at the door, and the round trip
through `select.value` is asserted in the gate's over-escaping section.

WHAT IS DELIBERATELY LEFT ALONE. The colour strings in CIRCLE_COL and THEMES
(:3179, :4383, :5032-5037) are code literals a stored scene cannot reach, and
`staked &amp; pooled` in the Housing room is hand-written HTML that escq would
double-encode into a visible entity. m.color reaching canvas at :1476 is a
property assignment, not markup, and a bad value there is ignored by the
canvas rather than parsed.

ORDER: after g6.01 and g6.02. This patch touches no line either of them wrote,
so it neither supersedes nor is superseded; it is ordered last only because
:5274 and :5286 sit beside escq() calls those patches added.

Re-runnable: every edit is guarded on its own, the RESULT is tested before the
ANCHOR, and a second run is all skips and zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')


def say(s):
    """Print without assuming the operator's console speaks Unicode.

    Same helper as g6.01 and g6.02: one edit name carries a character cp1252
    has no glyph for, and a UnicodeEncodeError on the PRINT would leave a run
    that wrote its bytes and could not report them.
    """
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []


def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


# ===================== THE ABSORBER =====================
# Two helpers, defined immediately above the one door they guard. VOCAB_KEYS is
# the anchor because it is the line that already says "this is where the
# village's words arrive".
edit('the two vocabulary validators, at the door they guard',
  """const VOCAB_KEYS=['road','water','zone','media','phases'];
function applyVocabulary(voc){""",
  """const VOCAB_KEYS=['road','water','zone','media','phases'];
/* ---------- A COLOUR IS A COLOUR, AND A WORD IS A WORD (g6.03) ----------
   Escaping six readers of a value leaves the seventh reader for the next lane
   to add. These two are the shape the vocabulary has, enforced where it
   arrives, so the readers below them are defence and not the whole defence.

   VOCAB_HEX is the same rule shared/mapSkin.ts holds `accent` and `parchment`
   to, for the reason written there: a colour picker has no legitimate reason
   to emit anything else, and an allowlist cannot be talked around the way an
   escaping rule can. A colour that is not one falls back to the default this
   line always carried rather than dropping the medium, because dropping it
   would delete the founder's WORD over a bad colour and mediaOf() would
   re-invent the key with this very default on the next read.

   vocabWord is not a safety rule and is not asked to be one; it is the
   normalisation the zone editor already did inline (trim, lower case), lifted
   out so the panel a founder types into and the bridge the shell pushes
   through agree byte for byte. No length cap on purpose: the panel has none,
   and a cap here would truncate the escaping gate's payload mid-tag and read
   as a clean surface for the wrong reason. The escaping at the readers is
   what makes the word safe; this only makes it the same word. */
const VOCAB_HEX=/^#[0-9a-f]{6}$/i;
const MEDIA_COLOR='#e8c877';
function vocabColor(c){const v=String(c==null?'':c).trim();return VOCAB_HEX.test(v)?v:MEDIA_COLOR}
function vocabWord(w){return String(w==null?'':w).trim().toLowerCase()}
window.vocabColor=vocabColor;window.vocabWord=vocabWord;
function applyVocabulary(voc){""")

edit('applyVocabulary: the subtype lists arrive as words, not as markup',
  """  ['road','water','zone'].forEach(k=>{
    if(Array.isArray(voc[k])&&voc[k].length){SUBTYPES[k]=voc[k].slice();took.push(k)}});""",
  """  ['road','water','zone'].forEach(k=>{
    if(!Array.isArray(voc[k])||!voc[k].length)return;
    /* Dropped: empties and duplicates. NOT dropped: the list itself when it
       normalises to nothing — an empty SUBTYPES[k] is a draw panel with no
       types in it, which is a worse answer than the words already there. */
    const w=[];voc[k].forEach(x=>{const v=vocabWord(x);if(v&&w.indexOf(v)<0)w.push(v)});
    if(!w.length)return;
    SUBTYPES[k]=w;took.push(k)});""")

edit('applyVocabulary: a medium keeps its word and loses only a colour that is not one',
  """    SCENE.vocabulary.media=voc.media.map(m=>({key:m.key,name:m.name||m.key,color:m.color||'#e8c877',glyph:m.glyph||'seed'}));""",
  """    SCENE.vocabulary.media=voc.media.map(m=>({key:m.key,name:m.name||m.key,color:vocabColor(m.color),glyph:m.glyph||'seed'}));""")

# The OTHER door for the same value. restoreScene never routes a feature's
# subtype through applyVocabulary at all, and renderDrawPanel reads it back
# through `(SUBTYPES[sel.kind]||[sel.subtype])`.
edit("restoreScene: a feature's own subtype comes in the same shape as the vocabulary's",
  """    points:(r.polygon||r.path).map(pt=>[pt[0],pt[1]]),subtype:r.subtype,phase:r.phase,""",
  """    points:(r.polygon||r.path).map(pt=>[pt[0],pt[1]]),subtype:r.subtype?vocabWord(r.subtype):r.subtype,phase:r.phase,""")

# ONE RULE, BOTH DOORS. Without these two the founder's own hand would be the
# one path that skips the normaliser, and the panel and the bridge would store
# two different spellings of the same word.
edit('the zone renamer: the founder’s hand goes through the same normaliser as the bridge',
  """    inp.onkeydown=e=>{if(e.key==='Enter'){const v=inp.value.trim().toLowerCase();""",
  """    inp.onkeydown=e=>{if(e.key==='Enter'){const v=vocabWord(inp.value);""")

edit('the media editor: the picker’s value goes through the same colour rule as the bridge',
  """    const color=box.querySelector('.vmc').value,glyph=box.querySelector('.vmg').value;""",
  """    const color=vocabColor(box.querySelector('.vmc').value),glyph=box.querySelector('.vmg').value;""")

# ===================== THE SIX READERS =====================
# Every one is an element or a double-quoted attribute. escq, never escj.

edit('the media chip: the colour dot is a style attribute (:5274, escq)',
  """      `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:5px;vertical-align:middle"></i>${escq(m.name)}</button>`).join('')""",
  """      `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escq(m.color)};margin-right:5px;vertical-align:middle"></i>${escq(m.name)}</button>`).join('')""")

edit('the media editor: the colour input’s value (:5286, escq — its name beside it already had one)',
  """    `<input class="vmc" type="color" value="${m.color}" style="width:26px;height:22px;padding:0;border:1px solid #c9a25e;border-radius:6px;background:none">`+""",
  """    `<input class="vmc" type="color" value="${escq(m.color)}" style="width:26px;height:22px;padding:0;border:1px solid #c9a25e;border-radius:6px;background:none">`+""")

edit('the overview flow chip: mediaColor returns the raw vocabulary colour (:3057, escq)',
  """      return `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 5px 5px 0;padding:2px 9px;border:1px solid #c8ab6f;border-radius:11px;font-size:11px;background:#fdf6e0"><i style="width:8px;height:8px;border-radius:50%;background:${mediaColor(f.medium)};display:inline-block"></i>${o?escq(o.name):(dir==='in'?'imported ⚠':'off-land')}</span>`};""",
  """      return `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 5px 5px 0;padding:2px 9px;border:1px solid #c8ab6f;border-radius:11px;font-size:11px;background:#fdf6e0"><i style="width:8px;height:8px;border-radius:50%;background:${escq(mediaColor(f.medium))};display:inline-block"></i>${o?escq(o.name):(dir==='in'?'imported ⚠':'off-land')}</span>`};""")

edit('the inspect flow row: the same sink, one panel over (:4014, escq)',
  """  return `<div class="irow"><span style="flex:none;width:9px;height:9px;border-radius:50%;background:${mediaColor(f.medium)}"></span>${medSel}""",
  """  return `<div class="irow"><span style="flex:none;width:9px;height:9px;border-radius:50%;background:${escq(mediaColor(f.medium))}"></span>${medSel}""")

edit('the draw panel’s type list: RAW IN BOTH the attribute and the text (:3689, escq twice)',
  """  $('dSub').innerHTML=SUBTYPES[drawKind].map(s2=>`<option value="${s2}">${s2}</option>`).join('');""",
  """  $('dSub').innerHTML=SUBTYPES[drawKind].map(s2=>`<option value="${escq(s2)}">${escq(s2)}</option>`).join('');""")

edit('the selected feature’s type list, whose fallback reads the FEATURE’s own subtype (:3700, escq twice)',
  """    $('dSelSub').innerHTML=(SUBTYPES[sel.kind]||[sel.subtype]).map(s2=>`<option value="${s2}"${s2===sel.subtype?' selected':''}>${s2}</option>`).join('');""",
  """    $('dSelSub').innerHTML=(SUBTYPES[sel.kind]||[sel.subtype]).map(s2=>`<option value="${escq(s2)}"${s2===sel.subtype?' selected':''}>${escq(s2)}</option>`).join('');""")


# ===================== THE FOUR THE MEASUREMENT FOUND =====================
# Identifiers, not words. escq at the reader; nothing at the door, because a
# key that a normaliser touched stops matching the rows that name it.

edit('structOpts: a structure key straight into a double-quoted attribute (:4022, escq)',
  """function structOpts(sel,excl){return SCENE.structures.filter(s=>s.key!==excl).map(s=>`<option value="${s.key}"${s.key===sel?' selected':''}>${escq(s.name)}</option>`).join('')}""",
  """function structOpts(sel,excl){return SCENE.structures.filter(s=>s.key!==excl).map(s=>`<option value="${escq(s.key)}"${s.key===sel?' selected':''}>${escq(s.name)}</option>`).join('')}""")

edit("the footprint kind's owner list, which no gate ever pressed the button for (:3691, escq)",
  """  if(drawKind==='structure-area')$('dOwner').innerHTML=SCENE.structures.map(s2=>`<option value="${s2.key}">${escq(s2.name)}</option>`).join('');""",
  """  if(drawKind==='structure-area')$('dOwner').innerHTML=SCENE.structures.map(s2=>`<option value="${escq(s2.key)}">${escq(s2.name)}</option>`).join('');""")

edit('the flow row’s medium select: the medium KEY, beside the name that already had escq (:4038)',
  """  const medSel=`<select data-fmed="${fi}" style="flex:none;width:132px">${SCENE.vocabulary.media.map(m=>`<option value="${m.key}"${mediaKey(f.medium)===m.key?' selected':''}>${escq(m.name)}</option>`).join('')}</select>`;""",
  """  const medSel=`<select data-fmed="${fi}" style="flex:none;width:132px">${SCENE.vocabulary.media.map(m=>`<option value="${escq(m.key)}"${mediaKey(f.medium)===m.key?' selected':''}>${escq(m.name)}</option>`).join('')}</select>`;""")

edit('the flow row’s via select: a drawn feature’s id, beside its name (:4044, escq)',
  """  const viaSel=(f.from&&f.to)?`<select data-fvia="${fi}" title="route along a drawn line" style="flex:none;width:74px"><option value="">bow</option>${routes.map(x=>`<option value="${x.id}"${f.via===x.id?' selected':''}>${escq((x.name||x.subtype).slice(0,16))}</option>`).join('')}</select>`:'';""",
  """  const viaSel=(f.from&&f.to)?`<select data-fvia="${fi}" title="route along a drawn line" style="flex:none;width:74px"><option value="">bow</option>${routes.map(x=>`<option value="${escq(x.id)}"${f.via===x.id?' selected':''}>${escq((x.name||x.subtype).slice(0,16))}</option>`).join('')}</select>`:'';""")


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
