#!/usr/bin/env python3
"""Stage one single-edit MUTATION of the patched artifact as a control.

A gate nobody has watched go red is a gate that reports what a gate that cannot
run reports. This stages the artifact with ONE thing broken, AS
<dir>/grounds-v0.html with qa/ beside it on a real C:/ path — a control under
another name, or under /tmp, does not load for the browser here — and the
runner beside it asserts a NON-ZERO check count before believing any verdict.

    python _mut_l8.py <name> <outdir>      # stage
    python _mut_l8.py --list               # names
"""
import io, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "grounds-v0.html")

# name -> (what it breaks, anchor, replacement, expected count)
MUT = {
    # ---- the escaping half -------------------------------------------------
    "x1_replies_raw": ("the reviewer's own defect, restored verbatim",
        "+escq(t.replies)+' replies · '", "+t.replies+' replies · '", 1),
    "x2_replies_dropped": ("the plausible WRONG fix: delete the field instead of escaping it",
        "+escq(t.replies)+' replies · '", "+' replies · '", 1),
    "x3_title_raw": ("t.title unescaped",
        "<b>'+escq(t.title)+'</b>", "<b>'+t.title+'</b>", 1),
    "x4_author_raw": ("t.author unescaped",
        "'<small class=\"help-m\">'+escq(t.author)+", "'<small class=\"help-m\">'+t.author+", 1),
    "x5_last_raw": ("t.last unescaped",
        "+escq(t.last)+' ago · '", "+t.last+' ago · '", 1),
    "x6_excerpt_raw": ("t.ex unescaped",
        "'<div class=\"help-ex\">'+escq(t.ex||'')+", "'<div class=\"help-ex\">'+(t.ex||'')+", 1),
    "x7_place_raw": ("nameOf() unescaped in the row's where-line",
        "homes.map(k=>escq(nameOf(k))).join(' · ')", "homes.map(k=>nameOf(k)).join(' · ')", 1),
    "x8_id_normalised": ("a NORMALISER on the identifier instead of escape-only",
        "data-id=\"'+escq(t.id)+'\"", "data-id=\"'+escq(String(t.id).replace(/[^A-Za-z0-9_-]/g,'-'))+'\"", 1),
    "x9_item_normalised": ("a normaliser on the deep-link address",
        "escq(itemAddr('talk',t))", "escq(itemAddr('talk',t).replace(/[^A-Za-z0-9:_-]/g,'-'))", 1),

    # ---- the landscape half ------------------------------------------------
    "l1_cap_unread": ("the landscape regression itself: the sheet stops reading the room",
        "max-height:min(42vh,var(--band-b-help-max,42vh));", "max-height:42vh;", 1),
    "l2_tenant_no_max": ("the tenant stops declaring it can shrink",
        "{id:'help',    v:'--band-b-help',max:'--band-b-help-max'},",
        "{id:'help',    v:'--band-b-help'},", 1),
    "l3_room_never_published": ("the band computes the room and publishes nothing",
        "    set[t.max]=Math.max(0,limit-base-pad-taken)+'px'}",
        "    void(Math.max(0,limit-base-pad-taken))}", 1),
    "l4_room_chases_itself": ("the room counts the tenant it is sizing",
        "for(const o of B.tenants)if(o!==t&&seen(o))", "for(const o of B.tenants)if(seen(o))", 1),

    # ---- the top band ------------------------------------------------------
    "v1_vdrop_literal": ("#vdrop stops reading the var and sits on the 46px fallback",
        "#vdrop{position:absolute;top:var(--band-t-vdrop,46px);",
        "#vdrop{position:absolute;top:46px;", 1),
    "v2_vdrop_not_tenant": ("#vdrop is not a tenant of the top band",
        "    {id:'vdrop',     v:'--band-t-vdrop'}]},", "    ]},", 1),

    # ---- the band's floor (§5b) --------------------------------------------
    # b1 restores the defect verbatim: an unmeasurable floor falls through to
    # base=0 and the top band's first tenant lands at pad. b2 is the opposite
    # failure and is why §5b asserts RECOVERY as well — a band that clears
    # unconditionally would satisfy "publishes nothing" forever.
    "b1_floor_zero": ("an unmeasurable floor is treated as a floor at zero again",
        "  if(fl&&!bandShown(fl)){\n"
        "    for(const t of B.tenants){clear.push(t.v);if(t.max)clear.push(t.max)}\n"
        "    return {set,clear,box:null,base:0,over:0}}\n"
        "  const fr=bandShown(fl)?fl.getBoundingClientRect():null;",
        "  const fr=bandShown(fl)?fl.getBoundingClientRect():null;", 1),
    "b2_band_never_publishes": ("the band clears unconditionally and never comes back",
        "  if(fl&&!bandShown(fl)){", "  if(fl){", 1),

    # ---- the pinned measurement in §4b -------------------------------------
    # §4b names ONE screen whose room is smaller than the sheet's own chrome.
    # Grow the chrome and a second screen joins it, which is the direction that
    # check exists to catch. Without this, §4b would be a sentence about a
    # number rather than an assertion about one.
    "m1_chrome_taller": ("the sheet's footer grows and starves a second screen's list",
        ".help-work{flex:0 0 auto;padding:9px 14px;", ".help-work{flex:0 0 auto;padding:34px 14px;", 1),

    # ---- refusing to pass on nothing ---------------------------------------
    "z1_zero_rows": ("the renderer runs and renders no rows at all",
        "const rows=threads().map(t=>{", "const rows=[].map(t=>{", 1),
    "z2_button_dead": ("the button no longer opens the sheet",
        "$('pbAttn').onclick=()=>{toggleHelp();hap(8)}", "$('pbAttn').onclick=()=>{hap(8)}", 1),
}

if "--list" in sys.argv:
    for k, v in MUT.items():
        print("%-22s %s" % (k, v[0]))
    sys.exit(0)

name, outdir = sys.argv[1], os.path.abspath(sys.argv[2])
what, anchor, repl, cnt = MUT[name]

with io.open(ART, "r", encoding="utf-8", newline="") as f:
    src = f.read()
n = src.count(anchor)
assert n == cnt, "%s: anchor found %d times, expected %d" % (name, n, cnt)
out = src.replace(anchor, repl, cnt)
assert out != src, "%s: mutation changed nothing" % name

os.makedirs(os.path.join(outdir, "qa"), exist_ok=True)
# Staged under the artifact's OWN name, with qa/ beside it, exactly as the real
# tree is laid out. A control named anything else has cost this round already.
with io.open(os.path.join(outdir, "grounds-v0.html"), "w", encoding="utf-8", newline="") as f:
    f.write(out)
for f in ("verify_help_l8.js", "env.sh"):
    shutil.copy2(os.path.join(HERE, f), os.path.join(outdir, "qa", f))
print("staged %s -> %s  (%s)" % (name, outdir, what))
