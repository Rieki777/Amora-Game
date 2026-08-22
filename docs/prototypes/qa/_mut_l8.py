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
    # x1_replies_raw (escq(t.replies) -> t.replies) is GONE on this base. #29
    # coerces replies to a number at restore (:5089), so escq over a number is a
    # no-op and reverting it produces byte-identical output — not a defect, and
    # not catchable. What replaced it is x11, which reverts the coercion itself:
    # that is the line that actually protects this field now.
    "x2_replies_dropped": ("delete the field instead of rendering it: the reader loses the count",
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
    # The bare call appears twice: the map's cvrow (~:3497, template-literal
    # form) and the help sheet's deep-link (~:6852, concatenation form). §2's
    # round-trip check reads ONLY the help-link, so the anchor pins the
    # concatenation form — unique to that site — and the mutation stays the one
    # single edit the check exists to catch.
    "x9_item_normalised": ("a normaliser on the help sheet's deep-link address",
        "data-item=\"'+escq(itemAddr('talk',t))+'\"", "data-item=\"'+escq(itemAddr('talk',t).replace(/[^A-Za-z0-9:_-]/g,'-'))+'\"", 1),

    # ---- #29's own fixes, which the re-derived §1 now ratchets as controls --
    # The gate's §1 was re-derived onto #29 (the lane's real parent). These two
    # revert #29's hardening and prove §1 still reds when it is removed: the
    # place name in the map banner, and the numeric coercion of replies at
    # restore. Each is caught by exactly the check re-derived for it.
    "x10_banner_place_raw": ("revert #29's bannerHTML escq(s.name): the banner injects the poisoned place name again",
        '${escq(s.name)}<span class="cnt">', '${s.name}<span class="cnt">', 1),
    "x11_restore_replies_raw": ("revert #29's Number() coercion: a hostile replies string rides in raw again",
        "Number(t.replies)||0,last:t.last_activity", "t.replies||0,last:t.last_activity", 1),

    # ---- the landscape half ------------------------------------------------
    # l1_cap_unread (max-height stops reading the var) is GONE on this base,
    # the same way x1 went. It was caught by the cap BITING: on #31's base the
    # walk card made the published room smaller than 42vh on the short
    # landscape screens, so a sheet that ignored the var was taller than the
    # room and §4's checks saw it. #32 retired the card and openHelp dismisses
    # the dock, so the room is 209..821px against a 42vh ask on every swept
    # screen: min(42vh, var(...)) and a bare 42vh now compute the same number
    # everywhere the gate can reach, and no single-edit check can tell them
    # apart. The var is not dead — l2/l3 still prove it is declared and
    # published, and §4's inverted ratchet reds the day a tenant makes the
    # room scarce again, which is the day this mutant comes back too.
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

    # ---- the inverted ratchet in §4b ---------------------------------------
    # §4b now asserts NO swept screen starves the list (568x320 did, until #32
    # retired the walk card). Same mutant, re-derived: 34px of padding was
    # enough to starve a second screen when the band could only publish 72px,
    # but with the sheet alone in the band the short screens seat 56px of list
    # under a 134px sheet, so the chrome has to outgrow the SHEET now, not the
    # room. 48px of footer padding takes the chrome past 42vh of a 320px
    # screen and the list back to zero — the regression the inverted check
    # exists to catch.
    "m1_chrome_taller": ("the sheet's footer grows until a short screen's list starves again",
        ".help-work{flex:0 0 auto;padding:9px 14px;", ".help-work{flex:0 0 auto;padding:48px 14px;", 1),

    # ---- one sheet at a time (#32's answer to the band overlap) ------------
    # openHelp dismisses the journey dock before the sheet enters the band;
    # that dismissal is the whole reason the sweep's overlap and starvation
    # checks hold. Keep the dock up and the two sheets share a band neither
    # fits in. The anchor pins openHelp's own removal line — jSheetOff at
    # :6600 carries the other, differently-shaped removal.
    "s1_sheet_keeps_dock": ("openHelp stops dismissing the dock: two sheets share one band",
        "function openHelp(){renderHelp();\n    document.body.classList.remove('msheet');",
        "function openHelp(){renderHelp();", 1),

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
