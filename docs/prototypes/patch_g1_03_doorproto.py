#!/usr/bin/env python3
"""L1 / g family / 03 - the four holes the FIRST doors patch opened.

patch_g1_01_doors.py closed the original dead-end census and the published-scene
regression. Review of that pass found four more, and every one of them was
introduced or widened by it. Measured on the working artifact with
qa/_probe_doorproto.js BEFORE this script:

  B1  bindDoor('A door','constructor')  ->  TypeError: r.split is not a function
      and the same throw for __proto__, toString, hasOwnProperty, valueOf.
      renderTab(0) and renderTab(3) BOTH died with it, so a single door with a
      prototype route takes the entire structure panel down and leaves the door
      broken. MODULES and LEGACY_ROUTES are plain object literals, so every name
      on Object.prototype answers a lookup: LEGACY_ROUTES['constructor'] handed
      back the Object FUNCTION, and the next line calls .split on it.

  B2  a structure key of  x');window.__pwn2=1;//  produced
        onclick="openDoorAt('x');window.__pwn2=1;//',0)"
      in the panel, twice, and the smuggled statement RAN on the first click
      (firedOnClick: true). Both lines are lines THIS FAMILY rewrote, and it is
      the same sink class that pass had just fixed for `route`, one field over.
      A structure key is not typed by the viewer: restoreScene rebuilds
      SCENE.structures from the published payload, keys included.

  B3  bindDoor BLESSES a payload label whenever the ROUTE is real:
        bindDoor('<img src=x onerror=...>','/gratitude')
          -> ["<img src=x onerror=...>","/gratitude"]
      and the panel printed that label into innerHTML unescaped. Measured: 1
      <img> element in #panelBody on tab 0 AND on tab 3. The gate's "a payload
      is refused" assertion held only for a door bound to a ROOM, where the
      route resolves the pair and the label is discarded. Every PAGE door is
      the other case, and 13 of the 32 doors are page doors.

  B4  MODULES['constructor'], ['toString'], ['valueOf'] all answered "yes, I am
      a module": doorLabel(['constructor','/gratitude']) returned "Object", and
      openDoor rendered "undefined Objectundefined". #/module/__proto__ typed
      into the address bar reached the same branch.

WHAT THIS DOES, and why each is where it is.

 1. ONE own-property accessor, ownAt(), and the three door tables read through
    it: moduleAt for MODULES, doorDefAt for DOOR_DEFS, and LEGACY_ROUTES at its
    one read site. B1 and B4 are the same missing guard read twice, and fixing
    them table by table is how the fourth table survives. DOOR_DEFS is in here
    for that reason and not because a throw was measured on it.

 2. THE PANEL'S BUTTON CARRIES AN INDEX AND NOTHING ELSE. openDoorHere(i) reads
    the open place from panelKey, which renderTab already read the structure
    from, so the key stops travelling through an attribute at all. Escaping is
    NOT the fix here: the HTML parser turns &#39; back into an apostrophe
    before the handler is compiled, which is exactly why openDoor at :4788 puts
    only the canonical path in its onclick. The two remaining interpolations on
    those lines are a loop index and escq() of text, both of which are safe by
    construction rather than by review.

 3. escq() on the label and the route where they reach innerHTML. That helper
    belongs to the escaping lane and this script only CALLS it, so a later pass
    that strengthens escq strengthens these two sites with it.

 4. tab 0 reads (s.modules||[]) rather than s.modules. #/place/constructor
    reaches openPanel with BY['constructor'], whose .modules is undefined, and
    the .map on it threw in the same panel from a second direction. The BY
    lookup itself is core map machinery rather than a door anchor, so it is
    REPORTED and not touched here; this makes the panel survive it either way.

ANCHORS THIS SCRIPT OWNS, so the escaping lane can be applied in either order:
    :3083   renderTab tab 0, the door button row
    :3094   renderTab tab 3, the doors tab
    :4146   bindInspect, the label/route onchange handler
    :4712   bindDoor, and the ownAt/moduleAt/doorDefAt helpers above it
    :4737   doorLabel / doorRoute
    :4747   openDoorAt, and the openDoorHere helper below it
    :4760   openDoor, both MODULES reads
    :4779   doorBtns and doorClick, and the doorClickHere helper below them
    :4941   routeHash, the #/module/ branch
It does NOT touch escq itself, siteNav, doorRowH, homeSheet, askAboutLiving,
or any generic sink. TWO SINKS OF THIS EXACT SHAPE ARE LEFT DELIBERATELY, both
outside the door block and both reported rather than patched:
    :2877   askAboutLiving('${key}') in homeSheet, same key, same quote
    :4938   BY[m[2]] in routeHash, where #/place/constructor reaches openPanel
            with a structure that has no .modules (tab 0 now reads
            (s.modules||[]) so the panel survives it, but the lookup itself is
            core map machinery rather than a door anchor)

    cd docs/prototypes && python patch_g1_03_doorproto.py [--check]
    node check_blocks.mjs
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "grounds-v0.html")
CHECK = "--check" in sys.argv

# newline='' so LF stays LF. .gitattributes pins this file to `-text`, the
# working tree is bare LF, and Python would otherwise write CRLF on Windows and
# rewrite all 5.4 MB.
with io.open(HTML, encoding="utf-8", newline="") as fh:
    src = fh.read()

before_bytes = len(src)
applied = skipped = 0


def step(name, marker, old, new, count=1):
    """One edit, one guard, one line of output.

    `marker` is a string ONLY this edit writes, so a re-run skips this edit and
    this edit alone. The assert on `count` is the swarm's conflict detector: an
    anchor matching zero or two times aborts before a byte is written.
    """
    global src, applied, skipped
    if marker in src:
        print("  skip   %s" % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, "%s: anchor appears %d times, expected %d" % (name, n, count)
    src = src.replace(old, new, count)
    print("  apply  %s" % name)
    applied += 1


print("patch_g1_03_doorproto.py  ->  %s" % HTML)

# ------------------------------------------------------------------ 1. moduleAt
# Placed immediately above bindDoor, which is its first caller. A function
# declaration at column 0 in this classic script is a window global by
# declaration; the explicit window.moduleAt is for the gate, which reads it by
# name from page.evaluate.
MODAT_OLD = (
    "/* A door a founder adds is born bound, or it is not born. Typing a module key,\n"
)
MODAT_NEW = (
    "/* OWN KEYS ONLY. Every table in this door block is a plain object literal,\n"
    "   so every name on Object.prototype used to answer a lookup in it, and all\n"
    "   FOUR of them are indexed with a string from a published scene:\n"
    "     MODULES['constructor']     handed back the Object function, doorLabel\n"
    "                                called it a module and printed \"Object\",\n"
    "                                openDoor drew \"undefined Objectundefined\",\n"
    "                                and #/module/__proto__ reached the same\n"
    "                                branch from the address bar.\n"
    "     LEGACY_ROUTES['constructor'] handed back a FUNCTION to a line that\n"
    "                                calls .split on it. THIS was the throw, and\n"
    "                                renderTab calls it once per door, so one\n"
    "                                door took down the whole structure panel.\n"
    "     DOOR_DEFS['constructor']   made doorClick open a door whose module is\n"
    "                                undefined.\n"
    "   THREE ACCESSORS AND ONE PREDICATE, because the review note on the last\n"
    "   pass was that the identical hole one field over had been left open. A\n"
    "   published scene names its own keys and the address bar is typed by\n"
    "   anyone, so none of this needs the founder's keyboard to be reached. */\n"
    "function ownAt(o,k){return (o&&typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k))?o[k]:null}\n"
    "function moduleAt(k){return ownAt(MODULES,k)}\n"
    "function doorDefAt(k){return ownAt(DOOR_DEFS,k)}\n"
    "window.ownAt=ownAt;window.moduleAt=moduleAt;window.doorDefAt=doorDefAt;\n"
    "/* A door a founder adds is born bound, or it is not born. Typing a module key,\n"
)
step("1  ownAt()/moduleAt()/doorDefAt(), own-property lookups (above :4712)",
     "function ownAt(o,k){", MODAT_OLD, MODAT_NEW)

# ------------------------------------------------------------------ 2. bindDoor label
BD_OLD = "  if(MODULES[l])return[l,MODULES[l].route];"
BD_NEW = "  const M=moduleAt(l);\n  if(M)return[l,M.route];"
step("2  bindDoor: the label lookup is own-keys only (:4714)",
     "const M=moduleAt(l);", BD_OLD, BD_NEW)

# ------------------------------------------------------------------ 3. bindDoor legacy table
# THIS IS THE THROW. LEGACY_ROUTES['constructor'] is a FUNCTION, r becomes it,
# and the byRoute line below calls r.split. Guarded where it is read rather than
# by rebuilding the table with a null prototype, because window.LEGACY_ROUTES is
# exported and a null-prototype object reads differently in a console.
LEG_OLD = "  if(!realRoute(r)&&LEGACY_ROUTES[bare])r=LEGACY_ROUTES[bare];"
LEG_NEW = ("  const alias=ownAt(LEGACY_ROUTES,bare);\n"
           "  if(!realRoute(r)&&alias)r=alias;")
step("3  bindDoor: the legacy table is own-keys only, which is the throw (:4718)",
     "const alias=ownAt(LEGACY_ROUTES,bare);", LEG_OLD, LEG_NEW)

# ------------------------------------------------------------------ 4. doorLabel / doorRoute
DL_OLD = (
    "function doorLabel(m){const d=doorSlot(m);return MODULES[d[0]]?MODULES[d[0]].name:d[0]}\n"
    "function doorRoute(m){const d=doorSlot(m);return MODULES[d[0]]?MODULES[d[0]].route:d[1]}"
)
DL_NEW = (
    "function doorLabel(m){const d=doorSlot(m),M=moduleAt(d[0]);return M?M.name:d[0]}\n"
    "function doorRoute(m){const d=doorSlot(m),M=moduleAt(d[0]);return M?M.route:d[1]}"
)
step("4  doorLabel/doorRoute read the module through moduleAt (:4737)",
     "const d=doorSlot(m),M=moduleAt(d[0])", DL_OLD, DL_NEW)

# ------------------------------------------------------------------ 5. openDoor, the branch test
OD_OLD = "  const key=MODULES[a]?a:null;"
OD_NEW = "  const key=moduleAt(a)?a:null;"
step("5  openDoor: which branch a door takes is an own-key question (:4760)",
     "const key=moduleAt(a)?a:null;", OD_OLD, OD_NEW)

# ------------------------------------------------------------------ 6. openDoor, the module read
ODM_OLD = "  const M=MODULES[key];const at=ctx&&ctx.at&&BY[ctx.at]?BY[ctx.at]:null;"
ODM_NEW = "  const M=moduleAt(key);const at=ctx&&ctx.at&&BY[ctx.at]?BY[ctx.at]:null;"
step("6  openDoor: the room card reads the module through moduleAt (:4792)",
     "const M=moduleAt(key);", ODM_OLD, ODM_NEW)

# ------------------------------------------------------------------ 7. the address bar
# #/module/__proto__ passed the old test and drew "undefined undefined". The
# regex above admits underscores, so every name on Object.prototype is typeable.
HASH_OLD = "  else if(m[1]==='module'&&MODULES[m[2]])openDoor(m[2],{});"
HASH_NEW = "  else if(m[1]==='module'&&moduleAt(m[2]))openDoor(m[2],{});"
step("7  the #/module/ address is an own-key question too (:4941)",
     "moduleAt(m[2])", HASH_OLD, HASH_NEW)

# ------------------------------------------------------------------ 8. the inspector's own read
KEPT_OLD = "      const kept=!!(d&&MODULES[d[0]])&&String(m[0]).trim().toLowerCase()!==MODULES[d[0]].name.toLowerCase();"
KEPT_NEW = "      const D=d&&moduleAt(d[0]);const kept=!!D&&String(m[0]).trim().toLowerCase()!==D.name.toLowerCase();"
step("8  bindInspect: the rename toast reads the module through moduleAt (:4146)",
     "const D=d&&moduleAt(d[0]);", KEPT_OLD, KEPT_NEW)

KEPT2_OLD = "      if(kept)toast('That door opens the '+MODULES[d[0]].name+' room, so it keeps the name of the room.')}});"
KEPT2_NEW = "      if(kept)toast('That door opens the '+D.name+' room, so it keeps the name of the room.')}});"
step("8b bindInspect: and so does the sentence it says (:4152)",
     "+D.name+' room, so it keeps", KEPT2_OLD, KEPT2_NEW)

# ------------------------------------------------------------------ 9. openDoorHere
HERE_OLD = "window.openDoorAt=openDoorAt;\n"
HERE_NEW = (
    "window.openDoorAt=openDoorAt;\n"
    "/* THE PANEL'S BUTTON CARRIES AN INDEX AND NOTHING ELSE. Those two lines\n"
    "   used to write onclick=\"openDoorAt('${s.key}',${mi})\", and a structure\n"
    "   key is not the viewer's own text: restoreScene rebuilds\n"
    "   SCENE.structures from the published payload, keys included. Measured, a\n"
    "   key of  x');window.__pwn=1;//  produced\n"
    "   onclick=\"openDoorAt('x');window.__pwn=1;//',0)\" and the smuggled\n"
    "   statement ran on the first click.\n"
    "   ESCAPING IS NOT THE FIX FOR THIS SINK. The HTML parser turns &#39; back\n"
    "   into an apostrophe before the handler is compiled, which is the same\n"
    "   reason openDoor below puts only the canonical path in its onclick. So\n"
    "   the key stops travelling through the attribute: the panel is open at\n"
    "   exactly one place, renderTab already read the structure from panelKey,\n"
    "   and this reads the same place. The only thing interpolated into either\n"
    "   button is a loop index. */\n"
    "function openDoorHere(i){return openDoorAt(panelKey,i)}\n"
    "window.openDoorHere=openDoorHere;\n"
)
step("9  openDoorHere(i), so the panel's onclick carries no founder string (:4749)",
     "function openDoorHere(i){", HERE_OLD, HERE_NEW)

# ------------------------------------------------------------------ 10. renderTab tab 0
# Three fixes on one line, all of them this family's own doing:
#   the onclick sink (B2), the unescaped label (B3), and s.modules on a
#   structure that has none, which is how #/place/constructor throws here.
TAB0_OLD = (
    "    <div style=\"margin-top:12px\">${s.modules.map((m,mi)=>`<button class=\"btn\" "
    "style=\"margin:0 6px 6px 0\" onclick=\"openDoorAt('${s.key}',${mi})\">"
    "${doorLabel(m)} ➤</button>`).join('')}</div>"
)
TAB0_NEW = (
    "    <div style=\"margin-top:12px\">${(s.modules||[]).map((m,mi)=>`<button class=\"btn\" "
    "style=\"margin:0 6px 6px 0\" onclick=\"openDoorHere(${mi})\">"
    "${escq(doorLabel(m))} ➤</button>`).join('')}</div>"
)
step("10 renderTab tab 0: index in the onclick, escq on the label (:3083)",
     "onclick=\"openDoorHere(${mi})\">${escq(doorLabel(m))}", TAB0_OLD, TAB0_NEW)

# ------------------------------------------------------------------ 11. renderTab tab 3
TAB3_OLD = (
    "<button class=\"doorbtn\" onclick=\"openDoorAt('${s.key}',${mi})\">"
    "<span><b>${doorLabel(m)}</b><br><span>${doorRoute(m)}</span></span>"
)
TAB3_NEW = (
    "<button class=\"doorbtn\" onclick=\"openDoorHere(${mi})\">"
    "<span><b>${escq(doorLabel(m))}</b><br><span>${escq(doorRoute(m))}</span></span>"
)
step("11 renderTab tab 3: index in the onclick, escq on both fields (:3094)",
     "<b>${escq(doorLabel(m))}</b><br><span>${escq(doorRoute(m))}</span>", TAB3_OLD, TAB3_NEW)

# ------------------------------------------------------------------ 12. the action doors
# THE SAME SINK, ONE BUTTON OVER, and this one was not introduced by round g:
# it is on main. `doorcta` is the "Book a room" / "Reserve a home here" button,
# it is drawn by the same renderTab tab 0 that draws the door row, and it
# interpolates the SAME structure key into the SAME single-quoted onclick.
# Closing B2 and leaving this is how the last pass got its review note, so it
# gets the same treatment rather than a note: the panel is open at one place,
# doorClickHere reads it, and the only thing left in the attribute is `k`,
# which the line above has already proved is a DOOR_DEFS key.
DB_OLD = (
    "    return `<button class=\"btn doorcta${fut?' fut':''}\" "
    "onclick=\"doorClick('${s.key}','${k}')\">"
)
DB_NEW = (
    "    return `<button class=\"btn doorcta${fut?' fut':''}\" "
    "onclick=\"doorClickHere('${k}')\">"
)
step("12 doorBtns: the action door's onclick loses the structure key too (:4781)",
     "onclick=\"doorClickHere('${k}')\"", DB_OLD, DB_NEW)

DD_OLD = "  const btns=Object.keys(s.doors).map(k=>{const D=DOOR_DEFS[k];if(!D)return'';const fut=s.doors[k]==='future';"
DD_NEW = "  const btns=Object.keys(s.doors).map(k=>{const D=doorDefAt(k);if(!D)return'';const fut=s.doors[k]==='future';"
step("12b doorBtns: which kinds are real doors is an own-key question (:4780)",
     "const D=doorDefAt(k);if(!D)return'';const fut=", DD_OLD, DD_NEW)

DC_OLD = "function doorClick(key,k){const s=BY[key];if(!s)return;const D=DOOR_DEFS[k];if(!D)return;"
DC_NEW = "function doorClick(key,k){const s=BY[key];if(!s)return;const D=doorDefAt(k);if(!D)return;"
step("12c doorClick: and so is the click that follows (:4784)",
     "const D=doorDefAt(k);if(!D)return;\n", DC_OLD, DC_NEW)

# ------------------------------------------------------------------ 13. doorClickHere
DCH_OLD = "window.doorClick=doorClick;\n"
DCH_NEW = (
    "window.doorClick=doorClick;\n"
    "/* The panel's other door button, same reason as openDoorHere above: the\n"
    "   key stops travelling through the attribute rather than being escaped\n"
    "   into it. doorBtns is drawn from renderTab tab 0 and nowhere else, so the\n"
    "   place it is drawn for is always the place the panel is open at. */\n"
    "function doorClickHere(k){return doorClick(panelKey,k)}\n"
    "window.doorClickHere=doorClickHere;\n"
)
step("13 doorClickHere(k), the action door's own index-only handler (:4786)",
     "function doorClickHere(k){", DCH_OLD, DCH_NEW)

# ---------------------------------------------------------------------------
print("  ---")
print("  applied %d, skipped %d" % (applied, skipped))
delta = len(src) - before_bytes
if CHECK:
    print("  --check: nothing written (%+d bytes would change)" % delta)
    sys.exit(0)
if delta == 0 and applied == 0:
    print("  0 bytes changed")
    sys.exit(0)
with io.open(HTML, "w", encoding="utf-8", newline="") as fh:
    fh.write(src)
print("  wrote %s  (%+d bytes)" % (HTML, delta))
