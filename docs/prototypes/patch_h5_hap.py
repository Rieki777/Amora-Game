#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H5. The phone stops asking for a buzz it cannot have.

WHAT IS WRONG, AND IT IS NOT NEW. On the pocket profile the boot starts the
newcomer's walk 700ms in, before the visitor has had any chance to touch the
screen. The walk's first stop calls hap(), hap() calls navigator.vibrate, and a
browser refuses a vibrate on a frame nobody has tapped yet and logs it:

  Blocked call to navigator.vibrate because user hasn't tapped on the frame
  or any embedded frame yet

PROVEN PRE-EXISTING, not introduced by this round: the same one-line console
error comes out of origin/main's artifact (3c295b8) on a 390x844 hasTouch
context, with nothing driving it but the boot. It is fixed here because this
round takes ownership of that first walk, and because a console error that
fires on every real phone load makes "zero console errors" an assertion no
gate can ever hold.

THE FIX IS TO ASK AT THE RIGHT TIME, not to swallow the message. try/catch
cannot suppress it, because a blocked vibrate does not throw: it returns false
and logs. So hap() waits for the same moment the browser is waiting for. The
latch is set by the first real gesture, in the capture phase, once per event
type, and after that hap() behaves exactly as it always did.

`var`, deliberately: hap() is hoisted and is called from 14 places, so a `let`
would leave a temporal-dead-zone window where the very first call throws into
its own try/catch and silently does nothing.

Re-runnable. Guarded, applies once, prints apply or skip.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "grounds-v0.html")

src = io.open(ART, encoding="utf-8").read()
orig = src
applied, skipped = [], []


def edit(name, anchor, new, count=1, mode="after", guard=None):
    global src
    if guard is not None and guard in src:
        skipped.append(name)
        return
    n = src.count(anchor)
    if n != count:
        print("ABORT %s: anchor found %d times, expected %d" % (name, n, count))
        print("  anchor: %r" % (anchor[:120],))
        sys.exit(2)
    if mode == "after":
        src = src.replace(anchor, anchor + new, 1)
    elif mode == "before":
        src = src.replace(anchor, new + anchor, 1)
    else:
        src = src.replace(anchor, new, 1)
    applied.append(name)


HAP_OLD = (
    "function hap(p){try{if(navigator.vibrate&&document.body.classList.contains('pocket'))navigator.vibrate(p)}catch(_){}}\n"
    "window.hap=hap;\n"
)

HAP_NEW = r"""/* A buzz nobody has touched the screen for is refused by the browser and
   logged as an error, and the pocket boot opens the newcomer's walk 700ms in,
   which is before anybody has had the chance to touch anything. Every phone
   load therefore asked for one vibrate that could not happen and left an error
   in the console to show for it. HAPTIC_OK latches on the first real gesture,
   which is the same moment the browser starts allowing the call. A blocked
   vibrate does not throw, so the try/catch below never saw this and never
   could. `var` because hap() is hoisted and is called from fourteen places. */
var HAPTIC_OK=false;
['pointerdown','touchstart','keydown'].forEach(function(t){
  addEventListener(t,function(){HAPTIC_OK=true},{capture:true,once:true})});
function hap(p){try{if(HAPTIC_OK&&navigator.vibrate&&document.body.classList.contains('pocket'))navigator.vibrate(p)}catch(_){}}
window.hap=hap;
"""

edit("js: haptics wait for the first gesture", HAP_OLD, HAP_NEW, mode="replace",
     guard="var HAPTIC_OK=false;")

if src != orig:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)

print("H5 haptics:")
for a in applied:
    print("  apply  " + a)
for s in skipped:
    print("  skip   " + s + " (already present)")
print("  bytes  %+d" % (len(src.encode("utf-8")) - len(orig.encode("utf-8"))))
