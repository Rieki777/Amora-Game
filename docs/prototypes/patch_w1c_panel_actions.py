# -*- coding: utf-8 -*-
"""W1c: an action point in a place panel looks like an action.

THE DEFECT, in the founder's words: "in the living map UI when I click on a
building and see different elements I can interact with (like RSVP) those
should REALLY stand out as buttons to clearly indicate an action point, right
now they're the same size as regular text and hard to see."

RSVP was the example, not the scope. Driven on the pristine artifact at
1480x1180, with the panel open at the Greenhouse and at Ridge Hamlet North,
every actionable thing in #panel measured:

    RSVP                      51 x 20     .btn + an inline 10.5px/3px shrink
    Reserve a home here      161 x 29     .btn.doorcta, from doorBtns()
    Village Health arrow      128 x 30     a module door on the Overview
    Claim this quest          123 x 28     tab 1
    Raise a hand              102 x 28     tab 2
    a conversation row        362 x 47     a <div onclick>: no role, no keyboard
    a tab                     100 x 38     #tabs button
    the close cross            30 x 30     #panelClose
    a door row                362 x 52     tab 3 .doorbtn, the one that was fine

Body copy in that panel is 13.5px Georgia at line-height 1.5, so a 20px
control with a hairline round it is a phrase with a border, and that is
exactly how it read. Seven of the nine were under the 44px thumb in at least
one dimension, and one of them was not a control at all.

THE PLAQUE IS THIS FILE'S OWN ANSWER and it is already on the land: the label
banners under body.lbl-tablet wear a gold ground, a cut highlight along the
top edge, dark ink and small caps. The panel's controls wear the same thing at
thumb size. Nothing foreign arrives with this patch; every colour below is a
token already in the sheet.

Five things this changes and two it does not:

  1. #panel .btn gets 44px in BOTH dimensions, bought with padding rather than
     a fixed height, so a founder label that wraps to two lines grows instead
     of clipping. 14px small caps with letter-spacing, which is the vocabulary
     every other control in this file speaks, so a control is legible AS a
     control beside 13.5px prose.
  2. The conversation row becomes a real <button>. It opened the Forum on
     click and did not exist for a keyboard or a screen reader.
  3. #tabs button and #panelClose reach 44px. The head gains right padding so
     the bigger cross cannot sit on a long place name.
  4. Hover AND :focus-visible on every one of them. The focus ring is a ring,
     not a tint, so nothing here is signalled by colour alone.
  5. The room a door opens (#moduleCard) wears the same plaque, because RSVP
     is drawn there too and a control that changes size when you walk through
     a door is two designs. That card also gains a scroll of its own, so a
     taller control can never push its last row out of reach.

  It does NOT touch .doorbtn's layout. Tab 3 was already 362 x 52 and already
  a control; it only gains the plaque's shadow and the shared focus ring.

  It does NOT touch one word of copy. Every label, every promise line and
  every toast is byte-identical, so a test that matches a sentence still
  matches it.

ESCAPING. Two of these edits carry escq()/escj() through them. The RSVP button
keeps escq(e.id) in its data attribute and escj(e.id) in its handler; the
conversation row keeps escq(itemAddr('talk',t)), escj(s.key), and escq over
title, author, replies and last. Both were copied through verbatim and the
only bytes that moved are the tag name and the class list.

    python patch_w1c_panel_actions.py
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
    """One edit, one guard.

    The guard is a SENTINEL a later patch has no reason to touch, so a second
    run of this file finds every edit already present and writes zero bytes.
    An anchor matching anything other than `count` times aborts before a byte
    is written."""
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


# ------------------------------------------------------- 1/9  the plaque itself
OLD = "  .doorbtn .arr{color:#8a6a33;font-size:16px}\n"
NEW = (
    "  .doorbtn .arr{color:#8a6a33;font-size:16px}\n"
    "\n"
    "  /* ---------- W1c: AN ACTION POINT LOOKS LIKE AN ACTION ----------\n"
    "     Measured on the pristine artifact at 1480x1180, panel open at the\n"
    "     Greenhouse and at Ridge Hamlet North: RSVP 51x20, the door CTA\n"
    "     161x29, a module door 128x30, Claim this quest 123x28, Raise a hand\n"
    "     102x28, a tab 100x38, the close cross 30x30. Panel prose is 13.5px\n"
    "     Georgia at line-height 1.5, so those are phrases with borders, which\n"
    "     is how the founder read them. Only the Enter tab's .doorbtn, at\n"
    "     362x52, was already a control.\n"
    "\n"
    "     The plaque is this map's own answer and body.lbl-tablet .banner\n"
    "     already wears it: a gold ground, a cut highlight along the top edge,\n"
    "     really dark ink, small caps. Every value below is a token already in\n"
    "     this sheet, sized to a thumb.\n"
    "\n"
    "     44px in BOTH dimensions, bought with padding and min-height rather\n"
    "     than a fixed height, so a founder label that wraps to two lines grows\n"
    "     instead of clipping. Nothing is signalled by colour alone: a control\n"
    "     carries a border, a fill and a shadow that prose does not, and the\n"
    "     focus state is a ring rather than a tint. */\n"
    "  #panel .btn,#moduleCard .btn{min-height:44px;min-width:44px;padding:11px 18px;\n"
    "    font-size:14px;line-height:1.15;letter-spacing:.09em;font-variant:small-caps;\n"
    "    border-radius:6px;border-width:1.5px;\n"
    "    box-shadow:inset 0 1px 0 rgba(255,248,220,.7),0 2px 5px rgba(36,26,16,.3)}\n"
    "  #panel .btn:hover,#moduleCard .btn:hover{filter:brightness(1.08);border-color:#6b4d1e}\n"
    "  #panel .btn:active,#moduleCard .btn:active{transform:translateY(1px);\n"
    "    box-shadow:inset 0 2px 4px rgba(36,26,16,.42)}\n"
    "  /* The row of module doors on the Overview is drawn with inline margins\n"
    "     of 6px and the door CTAs with a 7px flex gap, so 44px targets already\n"
    "     stand apart. The seat row is the one that needed telling: a wider\n"
    "     control there used to crush the seat's own name. */\n"
    "  #panel .seatrow{gap:12px;padding:10px 2px}\n"
    "  #panel .seatrow .nm{flex:1 1 auto;min-width:0}\n"
    "  /* Tab 3 was already a control. It only joins the shadow and the ring. */\n"
    "  #panel .doorbtn{border-width:1.5px;\n"
    "    box-shadow:inset 0 1px 0 rgba(255,248,220,.7),0 2px 5px rgba(36,26,16,.28)}\n"
    "  /* The conversation row was a <div> with cursor:pointer that opened the\n"
    "     Forum. A pointer is not a role: it had no keyboard, no Enter, and no\n"
    "     name for a screen reader. It is a <button> now and it is raised like\n"
    "     one, a step below the brass so the hierarchy still reads. */\n"
    "  #panel .cvrow{appearance:none;font-family:inherit;width:100%;text-align:left;\n"
    "    align-items:center;min-height:44px;padding:9px 11px;\n"
    "    border-width:1.5px;border-color:#a3854a;\n"
    "    background:linear-gradient(180deg,#fdf6e0,#f0e2bd);\n"
    "    box-shadow:inset 0 1px 0 rgba(255,252,238,.9),0 1px 3px rgba(36,26,16,.2)}\n"
    "  #panel .cvrow:hover{filter:brightness(1.04);border-color:#8a6a33}\n"
    "  #panel .cvrow:active{transform:translateY(1px)}\n"
    "  #tabs button:hover{background:rgba(255,247,224,.35);color:#3a2b12}\n"
    "  /* THE HOVER RULE OUTRANKS .on BY ORDER, not by weight: both selectors\n"
    "     weigh the same and this block sits below the tab strip's, so without\n"
    "     this line pointing at the CURRENT tab washed it out, .5 fill down to\n"
    "     .35 and #241a08 ink up to #3a2b12. Hovering the tab you are already\n"
    "     on now reads as more of it rather than less. */\n"
    "  #tabs button.on:hover{background:rgba(255,247,224,.66);color:#241a08}\n"
    "  /* ONE RING FOR EVERY CONTROL IN THE PANEL. Dark ink on parchment and\n"
    "     offset clear of the plaque's own edge, so it reads on the pale fills\n"
    "     and on the dark .doorcta alike. */\n"
    "  #panel .btn:focus-visible,#panel .cvrow:focus-visible,#panel .doorbtn:focus-visible,\n"
    "  #tabs button:focus-visible,#panelClose:focus-visible,\n"
    "  #moduleCard .btn:focus-visible{outline:3px solid #2c2008;outline-offset:3px}\n"
    "  /* A press is a direct answer to a finger and stays. The easing is the\n"
    "     motion, so the easing is what a reduced-motion reader loses. */\n"
    "  @media (prefers-reduced-motion:no-preference){\n"
    "    #panel .btn,#panel .cvrow,#panel .doorbtn,#tabs button,#panelClose,\n"
    "    #moduleCard .btn{transition:filter .12s ease,box-shadow .12s ease,\n"
    "      background .12s ease,border-color .12s ease,transform .08s ease}}\n"
    "  /* The room the door opens grows with its controls, so it gets a scroll\n"
    "     of its own before a taller row can push the last one off the screen.\n"
    "     body.pocket #moduleCard already caps itself and outranks this. */\n"
    "  #moduleCard{max-height:88vh;overflow-y:auto}\n"
)
swap('1/9 the plaque: 44px controls, one focus ring, and a scroll for the room',
     OLD, NEW, mark='W1c: AN ACTION POINT LOOKS LIKE AN ACTION')

# --------------------------------------------------- 2/9  the head makes room
OLD = "  #panelHead{padding:18px 20px 12px;border-bottom:1px solid #c8ab6f;background:\n"
NEW = (
    "  /* The right padding is the close cross's 44px plus its offset plus a\n"
    "     gap. Without it a long place name runs under the bigger cross. */\n"
    "  #panelHead{padding:18px 62px 12px 20px;border-bottom:1px solid #c8ab6f;background:\n"
)
swap('2/9 the panel head makes room for a 44px cross', OLD, NEW,
     mark='#panelHead{padding:18px 62px 12px 20px;')

# --------------------------------------------------- 3/9  the close is a target
OLD = (
    "  #panelClose{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:50%;border:1px solid #8a6a33;\n"
    "    background:linear-gradient(180deg,#e9cf93,#cda45c);cursor:pointer;font-size:14px;color:#221807;font-family:inherit}\n"
)
NEW = (
    "  #panelClose{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:50%;border:1.5px solid #8a6a33;\n"
    "    background:linear-gradient(180deg,#e9cf93,#cda45c);cursor:pointer;font-size:17px;color:#221807;font-family:inherit;\n"
    "    box-shadow:inset 0 1px 0 rgba(255,248,220,.7),0 2px 5px rgba(36,26,16,.3)}\n"
    "  #panelClose:hover{filter:brightness(1.08);border-color:#6b4d1e}\n"
    "  #panelClose:active{transform:translateY(1px)}\n"
)
swap('3/9 the close cross is 44x44 with a hover and a press', OLD, NEW,
     mark='#panelClose{position:absolute;top:10px;right:10px;width:44px;height:44px;')

# --------------------------------------------------- 4/9  the tabs are targets
OLD = (
    "  #tabs button{flex:1;appearance:none;border:none;background:transparent;font-family:inherit;font-variant:small-caps;\n"
    "    letter-spacing:.1em;font-size:12.5px;padding:10px 4px;cursor:pointer;color:#6b4d1e;border-bottom:3px solid transparent}\n"
)
NEW = (
    "  #tabs button{flex:1;appearance:none;border:none;background:transparent;font-family:inherit;font-variant:small-caps;\n"
    "    letter-spacing:.1em;font-size:12.5px;padding:12px 4px;min-height:44px;cursor:pointer;color:#6b4d1e;border-bottom:3px solid transparent}\n"
)
swap('4/9 a tab is a 44px target', OLD, NEW,
     mark='padding:12px 4px;min-height:44px;cursor:pointer;color:#6b4d1e')

# ------------------------------------------- 5/9  RSVP stops shrinking itself
# The inline style beat any rule short of !important, so the shrink goes and
# the plaque above sizes it. escq() stays on the id in the attribute and
# escj() stays on the id in the handler, byte for byte.
OLD = (
    "\n   <button class=\"btn\" data-ev=\"${escq(e.id)}\" style=\"font-size:10.5px;padding:3px 10px\""
    " onclick=\"evRSVP('${escj(e.id)}')\">"
)
NEW = (
    "\n   <button class=\"btn\" type=\"button\" data-ev=\"${escq(e.id)}\""
    " onclick=\"evRSVP('${escj(e.id)}')\">"
)
swap('5/9 the panel RSVP drops its inline shrink', OLD, NEW,
     mark="\n   <button class=\"btn\" type=\"button\" data-ev=\"${escq(e.id)}\"")

# ------------------------------- 6/9  the conversation row becomes a control
# Same four escq() calls and the same escj() call, in the same order. Only the
# tag name and the attribute order move.
OLD = (
    "<div class=\"cvrow\" data-item=\"${escq(itemAddr('talk',t))}\""
    " onclick=\"openDoor('forum',{at:'${escj(s.key)}'})\">"
    "<span>\U0001f4ac</span><span><b>${escq(t.title)}</b>"
    "<small>${escq(t.author)} · ${escq(t.replies)} replies · ${escq(t.last)} ago</small></span></div>"
)
NEW = (
    "<button type=\"button\" class=\"cvrow\" data-item=\"${escq(itemAddr('talk',t))}\""
    " onclick=\"openDoor('forum',{at:'${escj(s.key)}'})\">"
    "<span>\U0001f4ac</span><span><b>${escq(t.title)}</b>"
    "<small>${escq(t.author)} · ${escq(t.replies)} replies · ${escq(t.last)} ago</small></span></button>"
)
swap('6/9 the conversation row is a real button', OLD, NEW,
     mark="<button type=\"button\" class=\"cvrow\" data-item=")

# --------------------------------------- 7..9/9  the room stops shrinking too
# THREE INLINE SHRINKS IN THE MODULE CARD, and they have to go or the plaque
# above is a half-measure: the card's own .acts buttons would reach 44px while
# the three rows inside it stayed at 20, which is one card wearing two designs.
#
# Edit 8's anchor matches TWICE on the pristine file, at the panel's RSVP and
# at the room's. It is unique only after edit 5 above has rewritten the panel's
# copy, which is why these three sit below it and not beside it.
OLD = (
    "<button class=\"btn\" style=\"font-size:10.5px;padding:3px 10px\""
    " onclick=\"playJourney('${escj(j.id)}')\">"
)
NEW = "<button class=\"btn\" type=\"button\" onclick=\"playJourney('${escj(j.id)}')\">"
swap('7/9 the Journeys room: walk it', OLD, NEW,
     mark="<button class=\"btn\" type=\"button\" onclick=\"playJourney(")

OLD = (
    "<button class=\"btn\" data-ev=\"${escq(e.id)}\" style=\"font-size:10.5px;padding:3px 10px\""
    " onclick=\"evRSVP('${escj(e.id)}')\">"
)
NEW = (
    "<button class=\"btn\" type=\"button\" data-ev=\"${escq(e.id)}\""
    " onclick=\"evRSVP('${escj(e.id)}')\">"
)
swap('8/9 the Events room: RSVP', OLD, NEW,
     mark="      <button class=\"btn\" type=\"button\" data-ev=\"${escq(e.id)}\"")

OLD = (
    "<button class=\"btn\" style=\"font-size:10.5px;padding:3px 10px\""
    " onclick=\"$('module').classList.remove('show');openSkin()\">"
)
NEW = (
    "<button class=\"btn\" type=\"button\""
    " onclick=\"$('module').classList.remove('show');openSkin()\">"
)
swap('9/9 the Village Settings room: open the step', OLD, NEW,
     mark="<button class=\"btn\" type=\"button\" onclick=\"$('module').classList.remove('show');openSkin()\">")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
