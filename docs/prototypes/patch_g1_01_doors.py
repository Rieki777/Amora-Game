#!/usr/bin/env python3
"""L1 / g family / 01 — every door on the map opens something.

WHAT RYE HIT. He clicked a door labelled Gratitude and got "this door is bound,
but its room isn't on the map yet", on a card whose only button says "Back to
the land". Measured with qa/_probe_doors.js before this patch:

    doors:                 32
    bound to a map module: 0
    dead ends (no way on): 32
    routes the site does not serve: 16      (/health x8, /products x4,
                                             /stays x3, /exchange x1)

Every one of the 32 per-building doors in SCENE.structures[].modules[] carries
a DISPLAY LABEL in its first slot ("Gratitude", "Water stewardship"), and
openDoor at :4651 tests that slot against MODULES, whose keys are lowercase
identifiers. Zero of 32 labels is a key, so all 32 take the unbound branch.

SIX THINGS ARE WRONG AND EACH NEEDS ITS OWN FIX. The last three were found by
review AFTER the first three shipped, and every one of them passed the gate
that existed at the time.

 1. THE DATA. 19 of the 32 doors name a room this map already has, in words.
    Those slots become the MODULES key, so the door opens the room. The other
    13 name a page on the site with no room on the map (Gratitude, Governance,
    Badges & Skills, Crowdpool...) and keep their label.

 2. THE ROUTES. 16 doors point at paths the router does not serve. They were
    harmless only because the card had no link. ADDING THE LINK WITHOUT
    RE-ROUTING FIRST CONVERTS 16 QUIET DEAD ENDS INTO 16 LIVE FAILURES, and
    /health is worse than a 404: the server serves it as the ops probe, so
    those eight would have leaked raw JSON at a visitor. Every route here is
    checked against the list scripts/qa/routes.mjs DERIVES from App.tsx, and
    this script re-derives it at apply time and aborts if it has drifted.

 3. THE EDITOR. :4141 pushed free text into s.modules with '/forum' as a
    silent default, so every door a founder added was unbound by construction.
    Fixing only the data means the census re-rots the first time Rye adds a
    door. bindDoor() resolves a module key, a module name or a module route to
    the module, and otherwise demands a route the site actually serves.

 4. THE CARD IS AN ATTRIBUTE SINK. Edit B gives the card an href AND an
    onclick, and realRoute stripped ? and # BEFORE the membership test, so
    /gratitude followed by a fragment passed validation while the RAW string
    reached both attributes: measured,
    onclick="return siteNav(event,'/gratitude#');alert(1);//')" closes the JS
    string and runs, and a route carrying a quote produced a live <img> inside
    #moduleCard. This is a STORED shape rather than self-XSS, because
    restoreScene reads route straight out of bindings.doors[].route on every
    scene push from the shell (client/src/pages/LivingMap.tsx posts the scene
    the SERVER stored, so the string is not one the viewer typed). Fixed
    at the source: realRoute hands back the CANONICAL path, which is one of the
    54 literals this script writes, bindDoor stores THAT, and both attribute
    sites are escaped as well.

 5. THE DATA HALF WAS ARTIFACT-ONLY. restoreScene replaces SCENE.structures
    wholesale, so the 17 edits in E reach the seed literal and nothing else. An
    export taken from the pre-g artifact and restored into the patched one came
    back 0 bound, 16 dead ends, 16 unserved: a village that already published
    got every broken route back, /health included. A round trip that exports
    the ALREADY-FIXED scene cannot see this. Fixed by resolving every door read
    through bindDoor at DRAW time (doorSlot), plus the four-entry LEGACY_ROUTES
    table for the paths this map shipped that the router never served. Nothing
    is written back to the old scene and restoreScene keeps its own shape.

 6. MODULE KEYS IN THE FOUNDER'S LABEL BOX. Slot 0 carries the key on the 19
    bound doors, so after E the box read `stay`, `quests`, `health` 19 times,
    and the obvious move from there, typing a friendlier word, wrote straight
    into s.modules[i][0] and UNBOUND the door. Edits H and I show the room's
    name and rebind on change. qa/verify_door_routes.js now holds the bound
    count at a floor of 19, which it did not before: "nothing is stranded"
    stays true when every door quietly becomes a plain page link.

WHAT THIS DOES NOT TOUCH.
  - restoreScene (:4198, L5). It maps `[d.label, d.route]` and the export at
    :3441 writes `{label:m[0], route:m[1]}`, so a key in slot 0 round-trips
    verbatim and no new per-structure field is needed. Adding a third slot or
    a `module` field to the export WOULD need a line at :4197-4210 and would
    be silently dropped without one. It is deliberately not done here, and
    fix 5 above is deliberately built so that it stays that way: the healing
    happens on the read side, in this lane's own functions.
  - `bindings.doors[].label` in the published payload. Nothing on the site
    reads it: scripts/import-map-scene.ts:102 skips the structures block
    outright ("no map_structures table"). Checked before changing its meaning.

NAMING. `SITE_ROUTES` is ALREADY TAKEN at :4504 by the journey→site map, in the
same script block. A second top-level `const SITE_ROUTES` is a redeclaration
SyntaxError, which in this file means one silently dead script block and no
error anywhere. The route list here is `SITE_PAGES`, and every new identifier
was counted against the artifact before being written.

RE-RUNNABLE. One guard PER EDIT. A single guard at the top would let a run that
applied 19 of 26 edits look finished.

Usage:  python patch_g1_01_doors.py [--check]
"""
import io
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "grounds-v0.html")
ROUTES_MJS = os.path.abspath(os.path.join(HERE, "..", "..", "scripts", "qa", "routes.mjs"))
CHECK = "--check" in sys.argv

# ---------------------------------------------------------------------------
# The site's real routes, DERIVED. A hand-written list goes stale the first
# time somebody adds a page, and this file would then send a visitor at a 404
# with full confidence. The literal below is what gets written into the
# artifact; the derived list is what decides whether writing it is honest.
# ---------------------------------------------------------------------------
SITE_PAGES = [
    "/", "/admin", "/admin/mint", "/badges", "/circles", "/co-creators-guide",
    "/contribute", "/events", "/exit-policy", "/feed", "/feedback", "/first-walk",
    "/forgot-password", "/forum", "/game-mechanics", "/good-neighbor", "/governance",
    "/gratitude", "/housing", "/how-we-create", "/investor", "/journey-to-launch",
    "/library", "/login", "/love-letter", "/map", "/map/circles", "/master-plan",
    "/messages", "/modules", "/network", "/opportunities", "/profile",
    "/profile/characters", "/project-history", "/propose-quest", "/prosperity",
    "/quests", "/register", "/reserve", "/resident", "/resident-rights", "/roles",
    "/seasonal-festivals", "/set-password",
    "/stay", "/steward", "/steward-rights", "/team", "/tokens", "/tools", "/training",
    "/village-health", "/visit", "/wallet", "/work-with-us",
]

# ---------------------------------------------------------------------------
# The four paths this map has shipped that the router has NEVER served, and the
# page each one meant. This is the same reasoning as the 17 data edits in E,
# written once more as a table the artifact carries, because the data edits
# alone only reach the seed literal: restoreScene rebuilds SCENE.structures
# from the published payload, so a village that published before round g gets
# all 32 of its old doors back. Measured on this worktree: an export taken from
# the HEAD artifact and restored into the patched one came back 0 bound, 32
# dead ends, 16 unserved. The read-time resolver uses this table and that same
# restore comes back 19 bound, 0 dead ends, 0 unserved.
#
# /health is the one that matters most: the server answers it with the ops
# probe, so eight doors would have shown a visitor raw JSON rather than a 404.
LEGACY_ROUTES = [
    ("/stays", "/stay"),            # 3 doors. The Stays module's route is /stay.
    ("/health", "/village-health"), # 8 doors. /health is the ops probe, not a page.
    ("/products", "/contribute"),   # 4 doors. Crowdpool and donations both mean this.
    ("/exchange", "/wallet"),       # 1 door.  The Exchange module lives at /wallet.
]

derived = subprocess.check_output(
    [os.environ.get("NODE", "node"), ROUTES_MJS], universal_newlines=True
).split()
derived = [r.strip() for r in derived if r.strip()]
missing = [r for r in derived if r not in SITE_PAGES]
extra = [r for r in SITE_PAGES if r not in derived]
assert not missing and not extra, (
    "the route list in this script has drifted from client/src/App.tsx.\n"
    "  App.tsx has, this script does not: %s\n"
    "  this script has, App.tsx does not: %s\n"
    "  re-derive with: node scripts/qa/routes.mjs" % (missing or "(none)", extra or "(none)")
)
print("routes: %d derived from App.tsx, all present in this script" % len(derived))

# A rewrite that points somewhere the site does not serve is worse than the
# dead route it replaces, because it arrives wearing the authority of a fix.
bad_alias = [(a, b) for a, b in LEGACY_ROUTES if b not in derived]
assert not bad_alias, (
    "a legacy-route rewrite points at a path App.tsx does not serve: %s" % bad_alias)
# And a rewrite for a path the site DOES serve would silently redirect a
# working door, so the left-hand side has to stay dead.
live_alias = [a for a, _ in LEGACY_ROUTES if a in derived]
assert not live_alias, (
    "these paths are served by App.tsx now, so rewriting them would send a "
    "working door somewhere else. Drop them from LEGACY_ROUTES: %s" % live_alias)
print("legacy routes: %d rewrites, every target served by App.tsx, every source still dead"
      % len(LEGACY_ROUTES))

with io.open(HTML, encoding="utf-8", newline="") as fh:
    src = fh.read()

before_bytes = len(src)
applied = skipped = 0


def step(name, marker, old, new, count=1):
    """One edit, one guard, keyed on a string only this edit writes.

    Used where the anchor SURVIVES its own edit: edit A appends to siteHref, so
    the anchor is still there afterwards and only a marker can tell a re-run
    from a first run.
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


def data_step(name, old, new, count, after):
    """A data edit, guarded on the ANCHOR being consumed rather than on a marker.

    THREE OF THE 17 DATA EDITS PRODUCE A BYTE-IDENTICAL REPLACEMENT LINE: ponds,
    greenhouse and the four springs all become
    `circle:"Land",modules:[["health","/village-health"]],`. A marker guard
    keyed on that string would make the second and third edits skip on the
    FIRST run, leaving a file that took 1 of 3 edits and printed "skip" twice
    as if it were finished. That is exactly the "three of four edits look
    finished" failure the per-edit guard exists to prevent, arriving through
    the guard itself.

    So the guard is: the anchor is gone AND the replacement has reached the
    occurrence count this edit is responsible for. `after` is that count, which
    is why it is written down per edit and not inferred.
    """
    global src, applied, skipped
    n = src.count(old)
    if n == 0:
        have = src.count(new)
        assert have >= after, (
            "%s: the anchor is gone and the replacement is present %d time(s), "
            "expected at least %d. Another lane changed this structure; resolve "
            "by hand rather than re-running." % (name, have, after))
        print("  skip   %s" % name)
        skipped += 1
        return
    assert n == count, "%s: anchor appears %d times, expected %d" % (name, n, count)
    src = src.replace(old, new, count)
    assert src.count(new) >= after, "%s: post-edit occurrence count is wrong" % name
    print("  apply  %s" % name)
    applied += 1


print("patch_g1_01_doors.py  ->  %s" % HTML)

# =========================================================== A. the machinery
SITEHREF = "function siteHref(route){return (window.SITE_BASE||'')+route}"
PAGES_JS = ",".join("'%s'" % r for r in SITE_PAGES)
LEGACY_JS = ",".join("'%s':'%s'" % (k, v) for k, v in LEGACY_ROUTES)
MACHINERY = SITEHREF + """
/* ---------- doors: a room on this map, or a page on the site, never neither ----------
   A door's first slot is a MODULES key when the room exists here, and the
   founder's own label when the door leads only to a page on the site. Both
   open something. The third case, a route the site does not serve, is what
   this map used to do 16 times over and it now says so in plain words.

   SITE_PAGES is derived from client/src/App.tsx by scripts/qa/routes.mjs and
   written here by patch_g1_01_doors.py, which aborts if the two have drifted.
   qa/verify_door_routes.js re-derives it and fails when this list rots.
   NOT `SITE_ROUTES`: that name is taken at :4504 by the journey map, and a
   second const of the same name kills this whole script block in silence. */
const SITE_PAGES=[""" + PAGES_JS + """];
window.SITE_PAGES=SITE_PAGES;
/* WHAT COMES BACK IS THE CANONICAL PATH, and that is a security property, not
   a convenience. The membership test strips ? and # FIRST, so `/gratitude`
   followed by a fragment passes it while the caller's raw string still carries
   whatever was in that fragment. The door card is the first place in this file
   where a founder-controlled route reaches an href and an onclick, so handing
   the raw string back would let an APPROVED door carry a payload. This returns
   the matching SITE_PAGES element instead: an approved route is one of the
   literals written above and carries nothing anyone typed.
   '' means the site serves no page there, so `if(!realRoute(r))` and
   `${real?...}` read exactly as they did when this returned a boolean. */
function realRoute(r){const p=String(r||'').trim().split('?')[0].split('#')[0];
  const i=p?SITE_PAGES.indexOf(p):-1;return i<0?'':SITE_PAGES[i]}
window.realRoute=realRoute;
/* The four paths this map shipped that the router has never served, and the
   page each one meant. They live in the artifact rather than only in the seed
   data below because restoreScene rebuilds SCENE.structures wholesale from the
   published payload: a village that published before round g gets all 32 of
   its old doors back verbatim, and /health is worse than a 404 because the
   server answers it with the ops probe in raw JSON.
   Each rewrite only fires when the site does NOT serve the original, so the
   day /health becomes a real page this table goes inert on its own. Every
   target is checked against client/src/App.tsx at patch time. */
const LEGACY_ROUTES={""" + LEGACY_JS + """};
window.LEGACY_ROUTES=LEGACY_ROUTES;
/* A door a founder adds is born bound, or it is not born. Typing a module key,
   a module's name or a module's route all reach the module; anything else has
   to name a page the site actually serves. */
function bindDoor(label,route){
  const l=String(label||'').trim();let r=String(route||'').trim();
  if(MODULES[l])return[l,MODULES[l].route];
  const byName=Object.keys(MODULES).find(k=>MODULES[k].name.toLowerCase()===l.toLowerCase());
  if(byName)return[byName,MODULES[byName].route];
  const bare=r.split('?')[0].split('#')[0];
  if(!realRoute(r)&&LEGACY_ROUTES[bare])r=LEGACY_ROUTES[bare];
  const byRoute=r&&Object.keys(MODULES).find(k=>MODULES[k].route.split('?')[0]===r.split('?')[0]);
  if(byRoute)return[byRoute,MODULES[byRoute].route];
  const rr=realRoute(r);
  if(!rr)return null;
  return[l,rr]}
window.bindDoor=bindDoor;
/* ONE resolver, and every read of a door goes through it. The 17 data fixes
   further down live in the seed literal, and restoreScene replaces
   SCENE.structures wholesale, so they never reach a village that already
   published: measured, an export taken from the pre-g artifact and restored
   here came back 0 bound, 32 dead ends, 16 unserved. Resolving through
   bindDoor at READ time heals that scene as it is DRAWN, with nothing written
   back to it and no line in restoreScene, which is another lane's file.
   A pair bindDoor cannot resolve is handed back untouched, so this invents
   nothing and the card still says the route leads nowhere. */
function doorSlot(m){const a=String((m&&m[0])||''),r=String((m&&m[1])||'');
  return bindDoor(a,r)||[a,r]}
window.doorSlot=doorSlot;
function doorLabel(m){const d=doorSlot(m);return MODULES[d[0]]?MODULES[d[0]].name:d[0]}
function doorRoute(m){const d=doorSlot(m);return MODULES[d[0]]?MODULES[d[0]].route:d[1]}
window.doorLabel=doorLabel;window.doorRoute=doorRoute;
/* Open a door by WHERE IT IS, not by pasting its label into an onclick. The
   panel used to write onclick="openModule('${m[0]}','${m[1]}')", so a founder
   label carrying an apostrophe wrote broken JS into the button, and the route
   string arrived where openDoor expects a context object, which is why a door
   never knew which building it stood on. The key handed to openDoor is the
   RESOLVED one, so a stale slot opens its room instead of the "no room yet"
   card it used to get. */
function openDoorAt(key,i){const s=BY[key];const m=s&&s.modules&&s.modules[i];if(!m)return;
  return openDoor(doorSlot(m)[0],{at:key,route:doorRoute(m),label:doorLabel(m)})}
window.openDoorAt=openDoorAt;"""
step("A  SITE_PAGES + LEGACY_ROUTES + bindDoor/doorSlot/doorLabel/doorRoute/openDoorAt (after siteHref)",
     "window.doorSlot=doorSlot;", SITEHREF, MACHINERY)

# =========================================================== B. openDoor's far side
OPEN_OLD = """function openDoor(a,ctx){
  const key=MODULES[a]?a:null;
  if(!key){ // a founder-bound door with no registered module yet
    const name=a,route=ctx;
    $('moduleCard').innerHTML=`<h2>${name}</h2><div class="route">${route} · bound by the founder</div>
      <p><b>${name}</b>: this door is bound, but its room isn't on the map yet. The site still carries the page; bind it to a room in build mode and it opens here too.</p>
      <div class="acts"><button class="btn" onclick="closeDoor()">Back to the land</button></div>`;
    $('module').classList.add('show');return}"""
OPEN_NEW = """function openDoor(a,ctx){
  const key=MODULES[a]?a:null;
  if(!key){ /* A door that names a PAGE rather than a room on this map.
      This was a true dead end: the route was printed as inert text and the
      only button said "Back to the land". A page the site serves now opens.
      `ctx` arrives two ways and both are honoured, because openModule's
      legacy (label,route) signature is still reachable from a scene published
      before this patch: an object {at,route,label} from openDoorAt, or a bare
      route string from openModule. Reading `ctx` as a route unconditionally is
      what printed [object Object] the moment a caller passed a place. */
    const c=(ctx&&typeof ctx==='object')?ctx:{};
    const name=c.label||a;
    const route=String((typeof ctx==='string'?ctx:c.route)||'').trim();
    const at=c.at&&BY[c.at]?BY[c.at]:null;
    /* TWO ATTRIBUTE SINKS AND ONE FOUNDER STRING, so this needs both locks.
       `real` is the CANONICAL path realRoute recognised, which is one of the
       SITE_PAGES literals in this file, so the href, the onclick and the
       button's own words carry nothing anybody typed. That is the lock that
       counts: HTML-escaping alone CANNOT protect the JS string inside
       onclick="...", because the parser turns &#39; back into an apostrophe
       before the handler is compiled. The raw `route` is shown as text and
       never as an attribute.
       escq is the second lock, on the label as much as the route: the panel's
       old onclick broke on an apostrophe in a founder label, and the same
       string reaching innerHTML unescaped is the same bug wearing a hat. */
    const real=realRoute(route);
    $('moduleCard').innerHTML=`<h2>${escq(name)}</h2><div class="route">${escq(route)||'no page named'}${at?` · through the door of ${escq(at.name)}`:''} · bound by the founder</div>
      <p>${real?`<b>${escq(name)}</b> is a page on the site, and it has no room on this map yet. Open it on the site; bind it to a room in build mode and it opens here too.`:`<b>${escq(name)}</b> points at <b>${escq(route)||'nothing'}</b>, and the site serves no page there. Give it a route the site carries, in build mode, and this door opens.`}</p>
      <div class="acts">
        ${real?`<a class="btn" href="${escq(siteHref(real))}" target="_blank" rel="noopener" onclick="return siteNav(event,'${escq(real)}')">Open ${escq(real)} on the site ↗</a>`:''}
        <button class="btn${real?' ghostbtn':''}" onclick="closeDoor()">Back to the land</button>
      </div>`;
    $('module').classList.add('show');return}"""
step("B  openDoor's unbound branch: a real page opens, and only a canonical one (:4651)",
     "onclick=\"return siteNav(event,'${escq(real)}')\"", OPEN_OLD, OPEN_NEW)

# =========================================================== C. the two door lists
PANEL_OLD = ("<div style=\"margin-top:12px\">${s.modules.map(m=>`<button class=\"btn\" "
             "style=\"margin:0 6px 6px 0\" onclick=\"openModule('${m[0]}','${m[1]}')\">"
             "${m[0]} ➤</button>`).join('')}</div>")
PANEL_NEW = ("<div style=\"margin-top:12px\">${s.modules.map((m,mi)=>`<button class=\"btn\" "
             "style=\"margin:0 6px 6px 0\" onclick=\"openDoorAt('${s.key}',${mi})\">"
             "${doorLabel(m)} ➤</button>`).join('')}</div>")
step("C  panel tab 0 door buttons show the room's name (:3083)",
     "onclick=\"openDoorAt('${s.key}',${mi})\">${doorLabel(m)}", PANEL_OLD, PANEL_NEW)

TAB3_OLD = ("if(i===3)body.innerHTML=((s.modules&&s.modules.length)?s.modules.map(m=>"
            "`<button class=\"doorbtn\" onclick=\"openModule('${m[0]}','${m[1]}')\">"
            "<span><b>${m[0]}</b><br><span>${m[1]}</span></span>"
            "<span class=\"arr\">➤</span></button>`)")
TAB3_NEW = ("if(i===3)body.innerHTML=((s.modules&&s.modules.length)?s.modules.map((m,mi)=>"
            "`<button class=\"doorbtn\" onclick=\"openDoorAt('${s.key}',${mi})\">"
            "<span><b>${doorLabel(m)}</b><br><span>${doorRoute(m)}</span></span>"
            "<span class=\"arr\">➤</span></button>`)")
step("D  panel Enter tab lists the room and its real route (:3094)",
     "<span><b>${doorLabel(m)}</b><br><span>${doorRoute(m)}</span></span>",
     TAB3_OLD, TAB3_NEW)

# =========================================================== E. the data, 32 doors
# Where a label names a room this map has, the slot becomes the MODULES key and
# the route becomes that module's own route, so the two can never disagree.
# Where it names only a page, the label stays and the route is corrected to one
# the site serves. Every target is in SITE_PAGES, asserted against App.tsx above.
HEALTH_LAND = 'circle:"Land",modules:[["health","/village-health"]],'
DATA = [
    # (what changes, anchor, replacement, anchor count, replacement count after)
    ("gate: Welcome & Stays -> stay module; Profiles keeps its page",
     'circle:"Outreach",modules:[["Welcome & Stays","/stays"],["Profiles","/profile"]],',
     'circle:"Outreach",modules:[["stay","/stay"],["Profiles","/profile"]],', 1, 1),
    ("welcome: Stays -> stay, Welcome Aboard quests -> quests",
     'circle:"Community",modules:[["Stays","/stays"],["Welcome Aboard quests","/quests"]],',
     'circle:"Community",modules:[["stay","/stay"],["quests","/quests"]],', 1, 1),
    ("market: Exchange -> wallet, Payments & Donations -> /contribute",
     'circle:"Finance",modules:[["Exchange","/exchange"],["Payments & Donations","/products"]],',
     'circle:"Finance",modules:[["wallet","/wallet"],["Payments & Donations","/contribute"]],', 1, 1),
    # ponds, greenhouse and the springs share HEALTH_LAND byte for byte, so
    # each one carries the running total it is responsible for: 1, then 2,
    # then 6. That number is the guard.
    ("ponds: Village Health -> health module",
     'circle:"Land",modules:[["Village Health","/health"]],', HEALTH_LAND, 1, 1),
    ("greenhouse: Harvest log -> health module",
     'circle:"Land",modules:[["Harvest log","/health"]],', HEALTH_LAND, 1, 2),
    ("community: Forum & Decisions -> forum module; Feed and Tools keep their pages",
     'circle:"Coordination",modules:[["Forum & Decisions","/forum"],["Village Feed","/feed"],["Tools Hub","/tools"]],',
     'circle:"Coordination",modules:[["forum","/forum"],["Village Feed","/feed"],["Tools Hub","/tools"]],', 1, 1),
    ("kitchen: Gratitude keeps its page (Rye's door); Events -> events module, off /feed",
     'circle:"Gathering",modules:[["Gratitude","/gratitude"],["Events","/feed"]],',
     'circle:"Gathering",modules:[["Gratitude","/gratitude"],["events","/events"]],', 1, 1),
    ("library: Material Library -> library module; Badges keeps its page",
     'circle:"Learning",modules:[["Material Library","/library"],["Badges & Skills","/badges"]],',
     'circle:"Learning",modules:[["library","/library"],["Badges & Skills","/badges"]],', 1, 1),
    ("council: Roles keeps its page; Governance -> /governance, off /tools",
     'circle:"Wisdom",modules:[["Stages & Roles","/roles"],["Governance","/tools"]],',
     'circle:"Wisdom",modules:[["Stages & Roles","/roles"],["Governance","/governance"]],', 1, 1),
    ("foodforest: Quests here -> quests module",
     'circle:"Land",modules:[["Quests here","/quests"]],',
     'circle:"Land",modules:[["quests","/quests"]],', 1, 1),
    ("tank: Village Health -> health module",
     'circle:"Building",modules:[["Village Health","/health"]],',
     'circle:"Building",modules:[["health","/village-health"]],', 1, 1),
    # The four springs are ONE edit on purpose: four identical doors, one
    # identical fix, and 4 is the measured count rather than a number raised to
    # make a stubborn anchor fit. If a lane changes one spring, 3 != 4 and this
    # aborts before a byte is written.
    ("spring2/3/4 + possiblespring: Water stewardship -> health module (4 doors)",
     'circle:"Land",modules:[["Water stewardship","/health"]],', HEALTH_LAND, 4, 6),
    ("ridgeA: Crowdpool -> /contribute; Build quests -> quests module",
     'circle:"Building",modules:[["Crowdpool","/products"],["Build quests","/quests"]],',
     'circle:"Building",modules:[["Crowdpool","/contribute"],["quests","/quests"]],', 1, 1),
    ("ridgeB: Crowdpool -> /contribute",
     'circle:"Building",modules:[["Crowdpool","/products"]],',
     'circle:"Building",modules:[["Crowdpool","/contribute"]],', 1, 1),
    ("sanctuary: Design circle -> forum module; Crowdpool -> /contribute",
     'circle:"Healing",modules:[["Design circle","/forum"],["Crowdpool","/products"]],',
     'circle:"Healing",modules:[["forum","/forum"],["Crowdpool","/contribute"]],', 1, 1),
    ("guest: Stays -> stay module",
     'circle:"Community",modules:[["Stays","/stays"]],',
     'circle:"Community",modules:[["stay","/stay"]],', 1, 1),
    ("healing: Village Health -> health module",
     'circle:"Healing",modules:[["Village Health","/health"]],',
     'circle:"Healing",modules:[["health","/village-health"]],', 1, 1),
]
for label, old, new, cnt, after in DATA:
    data_step("E  " + label, old, new, cnt, after)

# pondhomes and trailhead already point at pages the site serves and name no
# room this map has, so their data is correct as it stands. They stop being
# dead ends through edit B, not through a data change. Named here so the
# census reads 32 and not 30.
print("  (no edit) pondhomes 'Member profiles' -> /team, already a real page")
print("  (no edit) trailhead 'Village Network' -> /network, already a real page")

# =========================================================== F. the editor
EDIT_OLD = """  B.querySelector('#iDAdd').onclick=()=>{const l=B.querySelector('#iDLabel').value.trim();if(!l)return;
    (s.modules=s.modules||[]).push([l,B.querySelector('#iDRoute').value.trim()||'/forum']);
    logEdit('door-add','structure:'+s.key,{label:l});renderInspect()};"""
EDIT_NEW = """  B.querySelector('#iDAdd').onclick=()=>{const l=B.querySelector('#iDLabel').value.trim();if(!l)return;
    /* Born bound, or not born. This used to push free text with '/forum' as a
       silent default, so every door a founder added joined the 32 that opened
       nothing, and the census re-rotted the first time anyone used it. */
    const d=bindDoor(l,B.querySelector('#iDRoute').value.trim());
    if(!d){toast('No door added. Name a room ('+Object.keys(MODULES).join(', ')+') or a page the site serves, like /gratitude.');return}
    (s.modules=s.modules||[]).push(d);
    logEdit('door-add','structure:'+s.key,{label:d[0],route:d[1]});renderInspect()};"""
step("F  build-mode door editor: no door is born unbound (:4141)",
     "const d=bindDoor(l,B.querySelector('#iDRoute').value.trim());", EDIT_OLD, EDIT_NEW)

# =========================================================== G. the legacy note
LEG_OLD = ("function openModule(a,b){return openDoor(a,b)} "
           "// legacy (label,route) doors and the new (moduleKey,ctx) both land on openDoor")
LEG_NEW = ("function openModule(a,b){return openDoor(a,b)} "
           "// legacy (label,route) only: openDoor reads a string second argument as a route. "
           "Nothing in this file calls it now; openDoorAt(key,i) is the way in, and it keeps "
           "the place with the door. Kept because a scene published before g1 can still name it.")
step("G  openModule's comment matches what openDoor now does (:3114)",
     "openDoorAt(key,i) is the way in", LEG_OLD, LEG_NEW)

# =========================================================== H. the founder's label box
# Slot 0 carries a MODULES key on the 19 doors that open a room here, so a box
# rendering slot 0 verbatim reads `stay`, `quests`, `health`. The founder's own
# label box is not the place to show an internal key, and the obvious move from
# there, typing a friendlier word, used to UNBIND the door (edit I).
ROW_OLD = ('function doorRowH(m,i){return `<div class="irow">'
           '<input type="text" data-dlab="${i}" value="${escq(m[0])}">'
           '<input type="text" data-drt="${i}" value="${escq(m[1])}" style="max-width:96px">'
           '<button class="xbtn" data-ddel="${i}">✕</button></div>`}')
ROW_NEW = ('/* The box shows the ROOM\'S NAME and the room\'s real route, never the\n'
           '   internal key: after the data fixes above, 19 of these 32 boxes would\n'
           '   otherwise have read `stay`, `quests`, `health`. What is shown is what\n'
           '   the visitor gets, and the handler binds it back on change. */\n'
           'function doorRowH(m,i){return `<div class="irow">'
           '<input type="text" data-dlab="${i}" value="${escq(doorLabel(m))}">'
           '<input type="text" data-drt="${i}" value="${escq(doorRoute(m))}" style="max-width:96px">'
           '<button class="xbtn" data-ddel="${i}">✕</button></div>`}')
step("H  the founder's door boxes show the room's name, not its key (:3986)",
     'value="${escq(doorLabel(m))}"', ROW_OLD, ROW_NEW)

# =========================================================== I. editing an existing door
# #iDAdd was fixed in F, so a door cannot be BORN unbound. These two handlers
# are how it dies later: both wrote the typed text straight into s.modules[i],
# with no bindDoor anywhere, so renaming a bound door broke it.
DEDIT_OLD = """  B.querySelectorAll('[data-dlab]').forEach(inp=>{inp.oninput=()=>{s.modules[+inp.dataset.dlab][0]=inp.value};
    inp.onchange=()=>logEdit('door','structure:'+s.key,{doors:s.modules.map(m=>m[0])})});
  B.querySelectorAll('[data-drt]').forEach(inp=>{inp.oninput=()=>{s.modules[+inp.dataset.drt][1]=inp.value};
    inp.onchange=()=>logEdit('door','structure:'+s.key,{doors:s.modules.map(m=>m[0])})});"""
DEDIT_NEW = """  /* A RENAME CANNOT UNBIND A DOOR. Both of these used to write the typed text
     straight into s.modules[i] with no bindDoor, which is the hole #iDAdd had:
     a founder who improved `stay` to `Guest rooms` was left with a door that
     opened nothing, and the census re-rotted on the first friendly word.
     Typing itself is left alone, because rebinding on every keystroke fights
     the typist. The row resolves on CHANGE through the same bindDoor call the
     add box makes, and an edit that resolves to nothing is put back rather
     than kept. `was` is the pair as the row was drawn, which is the last
     value known to open something. */
  B.querySelectorAll('[data-dlab],[data-drt]').forEach(inp=>{
    const lab=inp.dataset.dlab!==undefined,i=+(lab?inp.dataset.dlab:inp.dataset.drt);
    const was=(s.modules[i]||[]).slice();
    inp.oninput=()=>{const m=s.modules[i];if(m)m[lab?0:1]=inp.value};
    inp.onchange=()=>{const m=s.modules[i];if(!m)return;
      const d=bindDoor(m[0],m[1]);
      /* A door bound to a room wears the room's name, so a founder's own word
         for it has nowhere to live: slot 0 IS the key. Say so rather than
         letting the box quietly snap back. */
      const kept=!!(d&&MODULES[d[0]])&&String(m[0]).trim().toLowerCase()!==MODULES[d[0]].name.toLowerCase();
      s.modules[i]=d||was.slice();
      const row=inp.parentElement,L=row&&row.querySelector('[data-dlab]'),R=row&&row.querySelector('[data-drt]');
      if(L)L.value=doorLabel(s.modules[i]);if(R)R.value=doorRoute(s.modules[i]);
      if(!d)return toast('That door would open nothing, so it is back as it was. Name a room ('+Object.keys(MODULES).join(', ')+') or a page the site serves, like /gratitude.');
      logEdit('door','structure:'+s.key,{doors:s.modules.map(m2=>doorLabel(m2))});
      if(kept)toast('That door opens the '+MODULES[d[0]].name+' room, so it keeps the name of the room.')}});"""
step("I  editing a door rebinds it instead of breaking it (:4124)",
     "A RENAME CANNOT UNBIND A DOOR", DEDIT_OLD, DEDIT_NEW)

# ---------------------------------------------------------------------------
print("  ---")
print("  applied %d, skipped %d" % (applied, skipped))
delta = len(src) - before_bytes
if CHECK:
    print("  --check: nothing written (%+d bytes would change)" % delta)
    sys.exit(0)
if applied == 0:
    print("  0 bytes changed")
    sys.exit(0)
with io.open(HTML, "w", encoding="utf-8", newline="") as fh:
    fh.write(src)
print("  wrote %s  (%+d bytes)" % (HTML, delta))
