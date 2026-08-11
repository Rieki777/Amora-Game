#!/usr/bin/env python3
"""An unfinished building is its own sprite, not a lattice laid over a finished one.

Rye: "I want the under construction to not just be some scaffolding on the
current sprites but to generate a whole new set of them where their finished
buildings are the context for recreating them to be under construction."

Phase 2 drew `.scaffold`, an SVG lattice, ON TOP of the finished sprite. The
building underneath was complete: roof clad, garden grown, glass in. A viewer
read "finished building behind a fence" because that is what it was.

`gen_wip_sprites.py` now makes a second sprite per family, image-to-image, with
the FINISHED sprite as the reference so the pair are the same building at two
moments rather than two different buildings. This wires them in.

THE SWAP IS CSS, NOT A REPAINT. Both images sit in the DOM together and `.ph2`
decides which one is drawn. `syncBanners` already toggles `.ph2` every frame, so
a founder moving a building between phases needs no repaint and no cache
invalidation: the class flips and the other image is showing. `paintPoiArt`
rebuilds innerHTML for other reasons and cannot be relied on to run.

`has-wip` is toggled in the same per-frame line as `ph2` rather than set once,
because `setDerived` assigns `el.className` wholesale and would wipe anything
written at build time. A family with no unfinished sprite yet keeps the drawn
scaffold, so this is additive: the old behaviour is the fallback, not a
casualty.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP.
Usage: python3 patch_f1_wip.py [grounds-v0.html] [--check]
"""
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


def step(name, old, new, marker):
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ------------------------------------------------------------------ 1. the CSS
# Mirrors `.poi .sprite` exactly, including the blueprint override, so the two
# images occupy the same box and only one is ever drawn.
step(
    "the unfinished sprite's box",
    """  .poi.m-painted .sprite{display:block}
  .poi.st-blueprint .sprite{display:none!important}""",
    """  .poi.m-painted .sprite{display:block}
  .poi.st-blueprint .sprite{display:none!important}
  /* THE UNFINISHED TWIN. Same box as .sprite, drawn instead of it while the
     building is in phase 2. `.ph2` is toggled every frame by syncBanners, so
     the swap needs no repaint. A family with no unfinished sprite has no
     `has-wip` and keeps the drawn scaffold below. */
  .poi .sprite-wip{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);height:76px;display:none;pointer-events:none}
  .poi.m-painted.has-wip.ph2 .sprite{display:none}
  .poi.m-painted.has-wip.ph2 .sprite-wip{display:block}
  .poi.st-blueprint .sprite-wip{display:none!important}""",
    ".poi .sprite-wip{position:absolute",
)

# ------------------------------------------- 2. the drawn scaffold steps aside
# Only where a real unfinished sprite exists. Everywhere else it is still the
# only thing saying "being built".
step(
    "the drawn scaffold yields",
    """  .poi.ph2 .scaffold{display:block}""",
    """  .poi.ph2 .scaffold{display:block}
  /* The lattice was a stand-in for art that did not exist. Where it does now,
     the sprite says it better and the two together read as a fence. */
  .poi.has-wip.ph2 .scaffold{display:none}""",
    ".poi.has-wip.ph2 .scaffold{display:none}",
)

# -------------------------------------------------------------- 3. the element
step(
    "the unfinished image",
    """    ${(window.SPRITES&&SPRITES[base])?`<img class="sprite" src="${SPRITES[base]}" draggable="false" alt="">`:''}""",
    """    ${(window.SPRITES&&SPRITES[base])?`<img class="sprite" src="${SPRITES[base]}" draggable="false" alt="">`:''}
    ${(window.SPRITES_WIP&&SPRITES_WIP[base])?`<img class="sprite-wip" src="${SPRITES_WIP[base]}" draggable="false" alt="">`:''}""",
    'class="sprite-wip" src=',
)

# --------------------------------------------------------------- 4. the toggle
# In the same per-frame line as ph2 on purpose: setDerived assigns
# el.className wholesale, so anything set once is wiped the next time a
# building's state is recomputed.
step(
    "has-wip rides with ph2",
    """    p.classList.toggle('ph2',s.phase===2);p.classList.toggle('ph3',s.phase>=3);""",
    """    p.classList.toggle('ph2',s.phase===2);p.classList.toggle('ph3',s.phase>=3);
    p.classList.toggle('has-wip',!!(window.SPRITES_WIP&&SPRITES_WIP[fam]));""",
    "p.classList.toggle('has-wip'",
)

# ------------------------------------------------------------- 5. the data slot
# Empty until embed_wip_sprites.py fills it, and declared next to SPRITES so a
# reader finds both in one place. Kept as its own marker pair so the two embeds
# never have to know about each other.
step(
    "the data slot",
    """/*SPRITES_DATA*/""",
    """/*SPRITES_WIP_DATA*/window.SPRITES_WIP={};/*SPRITES_WIP_DATA_END*/
/*SPRITES_DATA*/""",
    "/*SPRITES_WIP_DATA*/",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"wip sprites wired into {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
