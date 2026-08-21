# -*- coding: utf-8 -*-
"""L5/17: three small ones the review named, none of them cosmetic.

1. THE BRAIDED RIM IS THE THINNEST RIM AT MID RANGE.

   Two rules, both three classes, so specificity is a TIE and source order
   decides:

       line 592   .bmid .bseal .rim, ... {stroke-width:2.6}
       line 628   .bseal.r-braid .rim  {stroke-dasharray:6 2 2 2;stroke-width:2.4}

   The braid comes later, so the braid WINS - with 2.4, against the 2.6 every
   other rim gets. So the mark that means "this ask wants a skill" is heaviest
   of all at near range (2.4 against a 2 base) and LIGHTEST of all at mid range,
   which is the range the whole R4 pass was about. The braid is the only rim
   whose weight is part of its meaning, so it gets the mid-range rule the others
   got, at the same 1.2x it carries at near range.

   R4c COULD NOT HAVE SEEN THIS. It builds `<div class="bseal">` with a bare
   `.rim` inside and never puts `r-braid` on it, so it measured the plain rim
   going 2 -> 2.6 and reported "the mid mark reads heavier" about a mark that
   was getting lighter. Fixed in qa/verify_org_lens.js alongside this.

2. `roleApplyLive` KEYS A PLAIN OBJECT ON NAMES A STRANGER CHOSE.

       const by={};
       for(const r of rows) by[r.name.trim().toLowerCase()]=r;
       ...
       const r=by[String(x.s||'').trim().toLowerCase()];
       if(!r){...continue}
       x._state=roleStateIn(r.state); ... n++

   `by` inherits Object.prototype, so `by['constructor']` is truthy before a
   single row arrives: a seat named "constructor" - or "valueOf", or "toString"
   - matches a phantom row, takes `roleStateIn(undefined)` (undefined, so it
   draws open) and INCREMENTS n. The count this returns is what the shell shows
   and what verify_org_lens R2 asserts `=== 1` on, so the number was unsound in
   both places.

   And `by['__proto__'] = r` does not create a property at all: it re-parents
   the map onto `r`, after which every seat whose name matches a field of that
   row - `name`, `state`, `archetypes` - matches it.

   Neither needs a hostile village. `SCENE.seats` is founder-typed and
   `roleApplyLive` is fed straight off the bridge from /api/map. Object.create(null)
   is the whole fix and it costs nothing.

3. TIPS.lyOrg DESCRIBES THE BEHAVIOUR PATCH 01 DELETED.

       'Circle colours wash over the land: who tends what.'

   There is no wash over the land. There are ten halos at the buildings circles
   actually live at, and a satellite for every role, in three inks. The tooltip
   is the only sentence on the screen that says what the button does and it was
   describing a loop that no longer exists.

    python patch_h5_17_three.py
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


# ---- 1/3 the braid keeps its weight at mid range ----
OLD = (
    "  .bseal.r-braid .rim{stroke-dasharray:6 2 2 2;stroke-width:2.4}\n"
)
NEW = (
    "  .bseal.r-braid .rim{stroke-dasharray:6 2 2 2;stroke-width:2.4}\n"
    "  /* A SPECIFICITY TIE THE BRAID WON WITH THE WRONG NUMBER. `.bmid .bseal\n"
    "     .rim` and `.bseal.r-braid .rim` are both three classes, so source order\n"
    "     decides and the braid rule above is later - which meant the braid took\n"
    "     2.4 at mid range while every other rim took 2.6. The one rim whose\n"
    "     weight carries meaning was the LIGHTEST mark on the screen at exactly\n"
    "     the range the mid-range pass was written for. Same 1.2x over the base\n"
    "     that it carries at near range (2.4 on 2), applied to the 2.6. */\n"
    "  .bmid .bseal.r-braid .rim{stroke-width:3.1}\n"
)
swap('1/3 the braided rim keeps its weight at mid range', OLD, NEW,
     mark='  .bmid .bseal.r-braid .rim{stroke-width:3.1}\n')

# ---- 2/3 a name from the village cannot reach Object.prototype ----
OLD = (
    "function roleApplyLive(rows){\n"
    "  ROLE_LIVE=Array.isArray(rows)?rows:null;\n"
    "  const by={};\n"
)
NEW = (
    "function roleApplyLive(rows){\n"
    "  ROLE_LIVE=Array.isArray(rows)?rows:null;\n"
    "  /* KEYED ON NAMES THIS FILE DID NOT CHOOSE, so the map may not inherit\n"
    "     anything. On a plain object `by['constructor']` is truthy before a row\n"
    "     arrives, so a seat called \"constructor\" or \"valueOf\" matches a phantom,\n"
    "     draws open, and increments the count this returns - which is what the\n"
    "     shell reports and what the suite asserts on. `by['__proto__']=r` is\n"
    "     worse: it does not store the row, it re-parents the map onto it. */\n"
    "  const by=Object.create(null);\n"
)
swap('2/3 the live merge cannot be reached through a prototype', OLD, NEW,
     mark='  const by=Object.create(null);\n')

# ---- 3/3 the tooltip says what the button does now ----
OLD = (
    "    lyOrg:'Circle colours wash over the land: who tends what.',\n"
)
NEW = (
    "    lyOrg:'Org: a ring where each circle lives, and one satellite per role. "
    "Hollow is open, half is partly held, solid is filled.',\n"
)
swap('3/3 the tooltip describes the lens that is actually there', OLD, NEW,
     mark="    lyOrg:'Org: a ring where each circle lives,")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
