#!/usr/bin/env python3
"""
L8 / R15 — THE TOP BAND: the vitals dropdown joins it.

WHAT WAS MEASURED, through the app's own openers, at 390x844 (pocket) and
1280x800 (desk), with the intro dismissed via leaveIntro():

    tap a vital -> #tip 43..75  and  #vdrop 46..193   =>  5887 px^2 of overlap
    same tap on desk            -> tip 44..76, vdrop 46..193  =>  6060 px^2
    desk, with one toast up     -> toasts 42..70, vdrop 46..193 => 6912 px^2
    bandBox('top') on pocket    -> null

The tip's text in that state is, verbatim, "reads Village Health · module
sample" — the string in the screenshot the item was raised from. The "claim
card" underneath it is the dropdown's own "⚑ Claim: …" button, and the "news
line" is the toast that lands on top of the same dropdown on a desk. All three
boxes, one strip.

THE CAUSE IS ONE LINE. #vdrop was the only overlay anchored to the top edge
that was never made a tenant of the top band: it carried a hardcoded
`top:46px` — the DESK bar height — while the bar it hangs from is 35px in a
hand. So it neither measured its own floor nor knew about the bars beside it,
and the band could not step anything around it either: with the dropdown
invisible to bandPlace, bandBox('top') reported the toast column alone, which
is why the tip on the desk run moved out of the toast and straight into the
dropdown.

NO NEW MECHANISM. This is three lines of registration in the band that already
ships: a var with the old literal as its fallback, a tenant entry, and the
element added to the watch list so opening the dropdown schedules a layout.

WHY LAST IN THE TENANT LIST. Order inside a band is priority, and every tenant
already there is a persistent bar the reader did not ask for (draft, restore,
the toast column). The dropdown is transient and reader-summoned, so it yields
to them rather than shoving them: with the dropdown closed every existing
tenant lands on the byte it landed on before this patch, and opening it moves
only itself.

Re-runnable. Each edit carries its own guard; a second run is all skips and
zero bytes changed.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "grounds-v0.html")


def load():
    with io.open(TARGET, "r", encoding="utf-8", newline="") as f:
        return f.read()


def save(s):
    with io.open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(s)


APPLIED = []
SKIPPED = []


def edit(src, name, anchor, new, guard, count=1):
    """One anchored replacement. The guard is PER EDIT, never per script."""
    if guard in src:
        SKIPPED.append(name)
        print("  skip   %s (guard already present)" % name)
        return src
    n = src.count(anchor)
    assert n == count, "%s: anchor found %d times, expected %d" % (name, n, count)
    out = src.replace(anchor, new, count)
    assert out != src, "%s: replacement changed nothing" % name
    assert guard in out, "%s: guard absent after apply" % name
    APPLIED.append(name)
    print("  apply  %s" % name)
    return out


src = load()
before = len(src)

# ---------------------------------------------------------------- 1. the var
# The literal stays as the fallback, so a dead band block leaves the dropdown
# exactly where it has always been: wrong on a phone, and not broken.
src = edit(
    src,
    "vdrop reads --band-t-vdrop",
    "  #vdrop{position:absolute;top:46px;z-index:46;",
    "  #vdrop{position:absolute;top:var(--band-t-vdrop,46px);z-index:46;",
    guard="--band-t-vdrop,46px",
)

# ------------------------------------------------------------- 2. the tenant
src = edit(
    src,
    "vdrop is a top-band tenant",
    "    {id:'toasts',    v:'--band-t-toasts',only:'desk'}]},",
    "    {id:'toasts',    v:'--band-t-toasts',only:'desk'},\n"
    "    /* LAST, and that is the whole argument for where it sits. The three\n"
    "       above are bars the reader did not summon; this one opens under the\n"
    "       finger that tapped a vital and closes on the next tap anywhere else.\n"
    "       Placed last, an open dropdown moves nothing but itself, and a closed\n"
    "       one leaves this band bit-for-bit what it was. Measured before this\n"
    "       line existed: tip 43..75 over vdrop 46..193 on a phone from ONE tap,\n"
    "       and a desk toast at 42..70 sitting on the same dropdown. */\n"
    "    {id:'vdrop',     v:'--band-t-vdrop'}]},",
    guard="{id:'vdrop',     v:'--band-t-vdrop'}",
)

# --------------------------------------------------------------- 3. the watch
# openVitalDrop adds .show AND writes style.left, so either observer would
# catch it; both are already filtered here for the other tenants.
src = edit(
    src,
    "bandWatch observes vdrop",
    "'draftBar','restoreBar'];",
    "'draftBar','restoreBar','vdrop'];",
    guard="'restoreBar','vdrop']",
)

if APPLIED:
    save(src)

print("\npatch_h8_1: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
