#!/usr/bin/env python3
"""The top of a phone screen is not a noticeboard.

THE COMPLAINT: "Need to deal with the overlap dialogue boxes on the top."

The top band is the most contested space on the map and a toast was winning it
without earning it. Everything that lives up there, by z-index:

    #vitals      30   top:0     always present
    #hovercard   40             whatever a tap opened
    #toasts      65   top:64px  the least important thing on the list

A toast outranked the card a person had just opened by twenty-five z-index
levels, so a village that spoke while you were reading covered what you were
reading. And toasts stack: `flex-direction:column`, six seconds of life each,
so three arriving inside one window grew a column down over the land. Both are
visible in the report, one box over another over the vitals bar.

TWO CHANGES, and neither is a z-index war.

The lane moves. On a pocket the toast column goes to the bottom, just above the
pocket bar, which is the one horizontal strip on a phone with nothing else in
it. Nothing up top has to yield because nothing is up there any more. On a desk
it stays at the top, where there is room for it and where it has always been.

The column is capped. Three at once, oldest out first, because a village that
is talking a lot is exactly when the column used to reach the middle of the
map, and the ones worth reading are the ones that just arrived. The 6.2 second
life is unchanged; this only bounds how many can be alive together.

Also a width. A long message used to run the full width of the screen; it is
held to the width of a comfortable line and centred.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e3_toasts.py [grounds-v0.html] [--check]
  --check verifies every anchor against the file and writes nothing.
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
    """One edit, skipped when its marker says it already landed."""
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ------------------------------------------------------------------ 1. the lane
step(
    "the toast lane",
    """  #toasts{position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:65;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}""",
    """  #toasts{position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:65;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;
    width:min(92vw,420px)}
  /* On a phone the top band already holds the vitals bar, the plates, and
     whatever card a tap opened, and a toast is the least important thing in
     that list. So it takes the one strip with nothing else in it: just above
     the pocket bar. Nothing up top has to yield because nothing is up there. */
  body.pocket #toasts{top:auto;bottom:calc(70px + env(safe-area-inset-bottom,0px));width:min(94vw,420px)}""",
    "body.pocket #toasts",
)

# ----------------------------------------------------------------- 2. the width
step(
    "a comfortable line",
    """  .toast{background:rgba(20,14,8,.88);border:1px solid rgba(201,162,94,.6);color:var(--parch);border-radius:16px;
    padding:5px 16px;font-size:12px;letter-spacing:.04em;box-shadow:0 4px 12px rgba(0,0,0,.5);
    animation:toastin .3s ease, toastout .5s ease 5.4s forwards}""",
    """  .toast{background:rgba(20,14,8,.88);border:1px solid rgba(201,162,94,.6);color:var(--parch);border-radius:16px;
    padding:5px 16px;font-size:12px;letter-spacing:.04em;box-shadow:0 4px 12px rgba(0,0,0,.5);
    max-width:100%;text-align:center;
    animation:toastin .3s ease, toastout .5s ease 5.4s forwards}""",
    "max-width:100%;text-align:center;",
)

# ------------------------------------------------------------------- 3. the cap
step(
    "three at once",
    """function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;
  $('toasts').appendChild(t);setTimeout(()=>t.remove(),6200)}""",
    """/* Three alive at once, oldest out first. Each one lives 6.2 seconds, so a
   village in full voice used to grow a column from the vitals bar down over
   the land. The ones worth reading are the ones that just arrived. */
const TOAST_MAX=3;
function toast(msg){const box=$('toasts');
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  box.appendChild(t);
  while(box.children.length>TOAST_MAX&&box.firstElementChild)box.removeChild(box.firstElementChild);
  setTimeout(()=>t.remove(),6200)}""",
    "TOAST_MAX",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"toasts patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
