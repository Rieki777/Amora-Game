#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Break the things verify_maia_journey.js guards, and watch it go red.

WHY THIS FILE EXISTS. A check that CANNOT run reports exactly what a check that
PASSED reports. Seven times this round a guard was believed because it printed
green, and each time the green was about a function that did not exist, a
payload that planted nothing, a surface nobody rendered, or a scratch canvas.
The only way to know an assertion is load-bearing is to break the thing it
guards and see it fail. This runs that experiment, one mutation at a time.

HOW A MUTANT IS STAGED. Each one is written as <dir>/grounds-v0.html under a
real C:/ path, because a control under /tmp does not resolve for the browser on
Windows, and because a suite that derives anything from its own filename must
find the name it expects.

WHAT COUNTS AS A PROOF. Three things together, and any one of them alone is
worthless:
  1. the mutation actually applied      (the anchor was found and replaced)
  2. the run produced a NON-ZERO check count, and not far short of the control
  3. the EXPECTED check names went red

A crash contributes an empty set of FAIL lines, which reads identically to a
clean pass if you only grep for failures. So the check count is compared, not
assumed.

  cd docs/prototypes/qa && source ./env.sh && python3 break_maia_journey.py
"""
import io, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "grounds-v0.html")

# THE SUITE IS OVERRIDABLE SO TWO VERSIONS OF IT CAN BE PUT AGAINST THE SAME
# MUTANT. A guard fix has to be shown to change something, and the only honest
# way to show it is to run the mutant twice: once against the suite as it was,
# once against the suite as it is, alternating, with nothing else moving. Both
# runs still use the artifact in this worktree, so the mutation is identical.
#   MAIA_SUITE=/path/to/verify_maia_journey.PRE.js python3 break_maia_journey.py
SUITE = os.environ.get("MAIA_SUITE") or os.path.join(HERE, "verify_maia_journey.js")

# MAIA_ONLY narrows the run to named breaks while a fix is being iterated on.
# A narrowed run says so in its own banner and in its last line, because a
# partial pass reads exactly like a full one once it is pasted into a report.
ONLY = [s.strip() for s in os.environ.get("MAIA_ONLY", "").split(",") if s.strip()]

SRC = io.open(ART, encoding="utf-8").read()

# Somewhere real on C:, never /tmp: the browser has to be able to open it.
STAGE = os.path.join(os.environ.get("LOCALAPPDATA", tempfile.gettempdir()),
                     "amora-maia-breaks")

# name, (find, replace), the checks that MUST go red.
#
# EACH LIST IS WHAT WAS OBSERVED, NOT WHAT WAS PREDICTED, and the difference
# taught something. Un-escaping the journey title turns J3 red and leaves J2
# green, because the structure name beside it is still escaped and still puts
# an "&lt;img" in front of the parser; J3, which refuses to see a LIVE "<img",
# is the sharp one. Removing maiaClean from maiaSay turns J1 and J2 red and
# leaves J4 green, because maiaClean still works perfectly when called
# directly: what broke is that nobody calls it. Writing the prediction first
# and then reading the run is the only reason either of those is understood.
BREAKS = [
    ("journey title unescaped again",
     ("const title=escq((x.st.stage?x.st.stage+': ':'')+(x.st.t||''));",
      "const title=(x.st.stage?x.st.stage+': ':'')+(x.st.t||'');"),
     ["J3"]),

    ("the dock parses in a live document again",
     ("d.appendChild(maiaClean((from==='me'?'':'<span class=\"from\">maia</span>')+html));",
      "d.innerHTML=(from==='me'?'':'<span class=\"from\">maia</span>')+html;"),
     ["J1", "J2"]),

    ("maiaContext prints the place name raw",
     ("maiaSay(`${escq(s.name)}: ${escq(s.blurb.split('.')[0].toLowerCase())}. ",
      "maiaSay(`${s.name}: ${s.blurb.split('.')[0].toLowerCase()}. "),
     ["I2"]),

    # THIS ROW MOVED WHEN LAYER TWO ARRIVED, and it moved for a good reason.
    # I6 measures executions. maiaClean now strips a handler whose value is not
    # one this file writes, so a broken escja produces an INERT anchor and I6
    # reads zero executions whether escaping works or not. The first run after
    # the strip landed reported exactly that:
    #   the claim attribute loses its JS escape  81  SILENT  I5,J3b  MISSING I6
    # I6b reads the string the parser was handed, before any strip, so it is
    # the one that can still see layer one. I5 and J3b go red too and are NOT
    # required: I5 because the anchor lost its onclick, J3b because the strip
    # records that the dock lost a control it wrote. Those are layer two doing
    # its job, and requiring them would make this row red for something that is
    # not the escaping.
    ("the claim attribute loses its JS escape",
     ("<a onclick=\"claimQuest('${escja(best.q)}','${escja(nm)}')\">",
      "<a onclick=\"claimQuest('${escq(best.q)}','${escq(nm)}')\">"),
     ["I6b"]),

    ("the phone sheet never opens",
     ("document.body.classList.add('msheet');JSHEET=true}}",
      "JSHEET=true}}"),
     ["D4", "D5", "D3"]),

    ("#maia gets a bottom literal instead of the band",
     ("body.pocket.msheet #maia{display:block;left:0;right:0;bottom:var(--band-b-maia,64px)",
      "body.pocket.msheet #maia{display:block;left:0;right:0;bottom:64px"),
     ["D5"]),

    ("the third answer disappears",
     ("+(more?'<button class=\"btn ghostbtn\" onclick=\"jMore()\">\u261e tell me more</button>':'')",
      "+''"),
     ["C1", "D6"]),

    ("the engine is reached for on file://",
     ("if(location.protocol==='file:')return false;\n  if(typeof WebAssembly==='undefined')return false;",
      "if(typeof WebAssembly==='undefined')return false;"),
     ["F4"]),

    ("haptics stop waiting for a gesture",
     ("function hap(p){try{if(HAPTIC_OK&&navigator.vibrate",
      "function hap(p){try{if(navigator.vibrate"),
     ["D10"]),

    ("she stops speaking as a resident",
     ("gate:'I am Maia. I live up past the ponds.",
      "gate:'Welcome to the village tour experience.'||'I am Maia. I live up past the ponds.",
      ),
     ["B3", "F7", "G5"]),

    # The guard Rye named by hand, and the row that most repaid running rather
    # than reasoning. The prediction was "a flight that lands after the walk
    # ended speaks one more stop into a closing dock". It does not. Without the
    # guard the callback reaches jRow(JWALK.i+1, ...) with JWALK already null,
    # so it THROWS while building maiaSay's argument and never speaks at all.
    # The row count is therefore identical with and against the guard, and the
    # first draft of C7b measured exactly that and stayed green. C7b counts
    # page errors now, which is what the artifact's own comment beside the
    # guard said all along: "it is the only one that threw".
    #
    # Observed red set is C7b, G7, F7. Only C7b is required here. G7 is the
    # blanket desk error count, which catches the same throw from further away,
    # and F7 is a knock-on from the disturbed state after it. Requiring the
    # knock-ons would make this row red for reasons that are not the guard.
    ("the arrival callback stops re-checking JWALK",
     ("the only callback that fires late, so it is the only one that threw. */\n"
      "      if(!JWALK||JWALK.id!==id)return;\n",
      "the only callback that fires late, so it is the only one that threw. */\n"),
     ["C7b"]),

    ("the voice ships defaulted to speaking",
     ("const MVOICE={mode:'read',tier:null,engine:'idle'};",
      "const MVOICE={mode:'hear',tier:null,engine:'idle'};"),
     ["F1b"]),

    # The three from the second layer. Each one is held shut today by something
    # OTHER than itself, which is why each needed a check of its own before it
    # could be called closed.
    ("MSAY_BAN loses style",
     (",track,style,marquee,details';",
      ",track,marquee,details';"),
     ["J7"]),

    ("maiaClean stops reading attributes",
     ("  t.content.querySelectorAll('*').forEach(function(el){\n"
      "    for(let i=el.attributes.length-1;i>=0;i--){const a=el.attributes[i];\n"
      "      if(!/^on/i.test(a.name))continue;\n"
      "      if(MSAY_ON_OK.test(String(a.value).trim()))continue;\n"
      "      el.removeAttribute(a.name);\n"
      "      MSAY_STRIPPED.push(el.tagName.toLowerCase()+'['+a.name.toLowerCase()+']');\n"
      "      while(MSAY_STRIPPED.length>24)MSAY_STRIPPED.shift()}});\n",
      ""),
     ["J6b"]),

    ("the sign-in href goes back to escq",
     ('<a href="${safeHref(d.href)}" target="_blank" rel="noopener">Sign in</a>',
      '<a href="${escq(d.href)}" target="_blank" rel="noopener">Sign in</a>'),
     ["K2"]),
]


def run(path):
    env = dict(os.environ)
    env["GROUNDS_FILE"] = "file:///" + path.replace("\\", "/")
    p = subprocess.run(["node", SUITE], capture_output=True, text=True,
                       env=env, cwd=HERE, encoding="utf-8", errors="replace")
    out = (p.stdout or "") + (p.stderr or "")
    m = re.search(r"checks run: (\d+)", out)
    n = int(m.group(1)) if m else 0
    red = set(re.findall(r"^FAIL ([A-Z]\d+[a-z]?):", out, re.M))
    threw = "SUITE THREW" in out
    return n, red, threw, out


def stage(name, text):
    d = os.path.join(STAGE, re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"))
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "grounds-v0.html")   # the name the suite expects
    io.open(p, "w", encoding="utf-8", newline="").write(text)
    return p


print("suite:  " + SUITE)
if ONLY:
    print("PARTIAL RUN: only breaks matching %s. This is not a 12 of 12." % ONLY)
print("CONTROL: the artifact as it stands")
cpath = stage("control", SRC)
cn, cred, cthrew, cout = run(cpath)
print("  checks=%d  red=%s  threw=%s" % (cn, sorted(cred) or "none", cthrew))
if cn == 0 or cthrew:
    print("\nABORT: the control produced no checks. Nothing below would mean anything.")
    print(cout[-1500:])
    sys.exit(2)
control_n = cn

print("\n%-46s %-6s %-7s %s" % ("BREAK", "CHECKS", "VERDICT", "WENT RED"))
print("-" * 100)

bad = 0
ran = 0
for name, (find, repl), expect in BREAKS:
    if ONLY and not any(o.lower() in name.lower() for o in ONLY):
        continue
    ran += 1
    if SRC.count(find) != 1:
        print("%-46s %-6s %-7s anchor found %d times, expected 1"
              % (name[:46], "-", "NO-RUN", SRC.count(find)))
        bad += 1
        continue
    n, red, threw, out = run(stage(name, SRC.replace(find, repl, 1)))
    missing = [e for e in expect if e not in red]
    if threw or n == 0:
        verdict, bad = "CRASH", bad + 1
    elif n < control_n - 2:
        verdict, bad = "SHORT", bad + 1
    elif missing:
        verdict, bad = "SILENT", bad + 1
    else:
        verdict = "RED ok"
    print("%-46s %-6d %-7s %s%s"
          % (name[:46], n, verdict, ",".join(sorted(red)) or "(nothing)",
             ("   MISSING " + ",".join(missing)) if missing else ""))

print("-" * 100)
print("control ran %d checks; %d of %d break(s) proven, %d failed to prove their guard.%s"
      % (control_n, ran - bad, ran, bad,
         "  PARTIAL RUN, %d of %d rows." % (ran, len(BREAKS)) if ONLY else ""))
print("staged under " + STAGE)
sys.exit(1 if bad else 0)
