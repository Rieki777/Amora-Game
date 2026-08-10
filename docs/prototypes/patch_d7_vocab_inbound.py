#!/usr/bin/env python3
"""The village's words arrive whole, whichever door they come through.

THE FIFTH INSTANCE. Round D closed with a table of four bugs that were one bug:
a value crossed a boundary and lost the parts the far side had no slot for,
none of them raised, none was caught by a test that already existed. This is
the same bug, in the map, on the inbound edge of the bridge.

`SCENE.vocabulary` has five keys: road, water, zone, media, phases. There were
two places that absorbed one, and only one of them grew:

  grounds-v0.html:3987  scene file import  road water zone  media  phases
  grounds-v0.html:5040  {type:'config'}    road water zone  --     --

So a village whose founder renamed the phases, or coloured its own flows, got
those words back on a file import and lost them on every live push from the
shell. The land drew in the platform's default words and nothing anywhere
raised. The site half has been shipping since `GET /api/map/config` started
returning `{skin, walk, vocabulary}` in one call; the map has been dropping
two fifths of it the whole time.

Both handoffs record this as "nothing reads `map_vocabulary` inbound", which
is what made it invisible: an absorber that handles three of five keys looks,
from the outside, exactly like an absorber. It is worse than nothing missing,
because the three that land are evidence the wiring works.

THE FIX IS NOT A THIRD ENUMERATION. Two lists of the same keys that must agree
forever is what produced this, and adding a third would guarantee the sixth
instance. One `applyVocabulary()` absorbs a vocabulary from wherever it came,
`VOCAB_KEYS` names what that is, and `qa/verify_vocab_bridge.js` asserts every
key the export emits is a key the absorber takes. A key added to one side and
not the other now fails a gate instead of dressing the land in defaults.

Media entries normalise to {key, name, color, glyph} rather than passing
through. That is deliberate and it is not the same shape as the bug: those
four fields ARE the medium in this map (colour reaches CSS, glyph indexes
GLYPH_PATH), the map is where the media vocabulary is defined, and the site's
own sanitiser is stricter still. The tripwire covers the case that actually
bit twice, which is a new key at the TOP level of the vocabulary.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_d7_vocab_inbound.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


def step(name, old, new, marker):
    """One edit, skipped when its marker says it already landed.

    Per step rather than one guard at the top: a global guard would make a
    file that got three of four edits look finished, which is the same shape
    as the bug this patch is here to remove.
    """
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ---------------------------------------------------------------- 1. the absorber
# Defined beside rebuildMedia, which it calls, and above both callers.
step(
    "the absorber",
    "window.rebuildMedia=rebuildMedia;const MEDIA=rebuildMedia();",
    """window.rebuildMedia=rebuildMedia;const MEDIA=rebuildMedia();
/* ---------- ONE DOOR FOR THE VILLAGE'S WORDS (D7) ----------
   A vocabulary arrives two ways: inside a scene file a founder imports, and
   over the bridge as `{type:'config'}` from the shell. It used to be absorbed
   by two separate enumerations of the keys, and when `media` and `phases`
   joined the vocabulary only the file one grew. The bridge kept absorbing
   three of five and looked, from outside, exactly like it was working.
   VOCAB_KEYS is the list; qa/verify_vocab_bridge.js asserts the export emits
   nothing that is not on it. Returns the keys it actually took, so a caller
   can say so and a test can read it. State only: refreshing the HUD belongs
   to the caller, because a scene import rebuilds it wholesale anyway and
   re-entering renderInspect() halfway through one reads a half-built SCENE. */
const VOCAB_KEYS=['road','water','zone','media','phases'];
function applyVocabulary(voc){
  if(!voc||typeof voc!=='object')return[];
  const took=[];
  ['road','water','zone'].forEach(k=>{
    if(Array.isArray(voc[k])&&voc[k].length){SUBTYPES[k]=voc[k].slice();took.push(k)}});
  /* Merged, not replaced: a village that names only phase 2 keeps Built and
     Planned. Keys arrive as numbers or strings depending on the JSON trip;
     phaseName() already reads both. */
  if(voc.phases&&typeof voc.phases==='object'&&!Array.isArray(voc.phases)&&Object.keys(voc.phases).length){
    SCENE.vocabulary.phases={...SCENE.vocabulary.phases,...voc.phases};took.push('phases')}
  if(Array.isArray(voc.media)&&voc.media.length){
    SCENE.vocabulary.media=voc.media.map(m=>({key:m.key,name:m.name||m.key,color:m.color||'#e8c877',glyph:m.glyph||'seed'}));
    rebuildMedia();flowSpriteReset();took.push('media')}
  return took}
window.applyVocabulary=applyVocabulary;window.VOCAB_KEYS=VOCAB_KEYS;""",
    "VOCAB_KEYS",
)

# ------------------------------------------------- 2. the scene-file door uses it
# vision_bound stays exactly where it was; only the vocabulary lines move.
step(
    "the scene-file door",
    """  const voc=J.map_scene&&J.map_scene.vocabulary;
  if(voc)['road','water','zone'].forEach(k2=>{if(Array.isArray(voc[k2])&&voc[k2].length)SUBTYPES[k2]=voc[k2].slice()});
  const vb=J.map_scene&&J.map_scene.vision_bound;
  SCENE.vision_bound=(Array.isArray(vb)&&vb.length>2)?vb.map(p=>[p[0],p[1]]):null;
  if(voc&&voc.phases&&typeof voc.phases==='object')SCENE.vocabulary.phases={...SCENE.vocabulary.phases,...voc.phases};
  if(voc&&Array.isArray(voc.media)&&voc.media.length){
    SCENE.vocabulary.media=voc.media.map(m=>({key:m.key,name:m.name||m.key,color:m.color||'#e8c877',glyph:m.glyph||'seed'}));
    rebuildMedia();flowSpriteReset()}""",
    """  applyVocabulary(J.map_scene&&J.map_scene.vocabulary);
  const vb=J.map_scene&&J.map_scene.vision_bound;
  SCENE.vision_bound=(Array.isArray(vb)&&vb.length>2)?vb.map(p=>[p[0],p[1]]):null;""",
    "applyVocabulary(J.map_scene",
)

# ----------------------------------------------------- 3. the bridge door uses it
# The refresh is the same one a phase rename does by hand, minus the toast: a
# push from Village Settings is not the person's own edit and should not talk.
step(
    "the bridge door",
    """  if(d.vocabulary)['road','water','zone'].forEach(k=>{if(Array.isArray(d.vocabulary[k])&&d.vocabulary[k].length)SUBTYPES[k]=d.vocabulary[k].slice()});""",
    """  if(d.vocabulary&&applyVocabulary(d.vocabulary).length){
    /* The land redraws itself every frame, but these are DOM and do not. */
    if(typeof renderMediaVocab==='function')renderMediaVocab();
    if(typeof renderPhaseVocab==='function')renderPhaseVocab();
    if(typeof renderInspect==='function'&&typeof inspKey!=='undefined'&&inspKey)renderInspect();
    if(typeof panelKey!=='undefined'&&panelKey)openPanel(panelKey)}""",
    "applyVocabulary(d.vocabulary)",
)

# --------------------------------------------------------- 4. say which build
# The artifact's bytes changed, so the artifact says so. Shipping changed code
# under an unchanged label is the same silence this patch exists to remove, and
# `/grounds/manifest.json` verification greps this string to tell live from
# stale. The FAMILY is what the site importer pins (`v0.8`), so a point release
# inside it is admitted by design; qa/verify_features.js moves with it.
step(
    "the build label",
    "BUILD_VERSION='v0.8-roundD'",
    "BUILD_VERSION='v0.8-roundD1'",
    "v0.8-roundD1",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"vocabulary inbound patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
