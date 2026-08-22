# -*- coding: utf-8 -*-
"""Three holes in the dock's second layer, found by reading the layer instead
of the outcome.

None of the three is live today, and that is exactly why they are worth
closing: each one is held shut by something OTHER than itself.

  1. escq is entity-only. It replaces &, < and " so a value is safe to sit
     inside an attribute, and it says nothing about what that attribute then
     DOES. `javascript:alert(1)` goes through it unchanged. Two hrefs in the
     dock are built that way, and both take their value from data the map did
     not author: d.href arrives on the promise-result message, and a route
     comes off SITE_ROUTES, which restoreScene rebuilds. It is latent only
     because target="_blank" declines a javascript: URL, and a defence that
     rests on another attribute's side effect is not a defence.

  2. maiaClean removes banned ELEMENTS and never looks at attributes, so a
     live on* handler passes straight through it. Layer two is meant to hold
     when layer one regresses; against attributes it held nothing.

  3. <style>, <marquee> and <details> were absent from MSAY_BAN. <style> is
     the one that matters: a single rule can cover the page.

THE HANDLER ALLOWLIST IS OVER THE VALUE, NEVER OVER THE ELEMENT, because the
dock writes its own controls as <button onclick="jNext()"> and a rule about
elements cannot tell those from an attacker's. Four bare calls and one
claimQuest with two properly escaped string arguments is the whole set this
file writes. The claimQuest pattern refuses an unescaped quote inside either
argument, which is precisely what escja guarantees, so a regression in escja
now shows up in layer two as well as layer one.

WHAT WAS STRIPPED IS RECORDED. A strip that quietly removed one of the dock's
own controls would look exactly like a control that was never written, so
maiaClean keeps the last few it removed and the gate reads that list on a
clean run and requires it to be empty.
"""
import io, os, sys

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grounds-v0.html")
s = io.open(ART, encoding="utf-8").read()
before = len(s)

# Re-run guard, added on the 2026-08-22 replay onto main a897583: a second run
# used to re-find edit 1's anchor (its replacement keeps the anchor as a
# prefix) and then abort on edit 2's, which is a refusal where the rest of the
# set skips. safeHref and the stripped-recorder exist only once this file has
# run, so together they are the fingerprint of a finished application.
if "function safeHref(u){" in s and "window.MSAY_STRIPPED=[];" in s:
    print("H7 dock hardening: skip, already applied")
    sys.exit(0)

EDITS = []

# ---- 1. safeHref, beside the rest of the escaping family ------------------
EDITS.append((
    "function escja(t){return escq(String(t==null?'':t).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,\"\\\\'\"))}\n"
    "window.escja=escja;\n",

    "function escja(t){return escq(String(t==null?'':t).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,\"\\\\'\"))}\n"
    "window.escja=escja;\n"
    "\n"
    "/* A URL IS NOT TEXT, and escq only knows about text. It makes a value safe to\n"
    "   SIT inside an attribute and says nothing about what the attribute then does:\n"
    "   `javascript:alert(1)` survives it letter for letter. Both hrefs this dock\n"
    "   writes take their value from data the map did not author, so both go through\n"
    "   here. Anything whose scheme is not http or https becomes '#'.\n"
    "\n"
    "   THE SCHEME IS READ OFF THE STRING THE BROWSER WILL SEE. Tabs, newlines and\n"
    "   other control characters are dropped from a URL before the scheme is parsed,\n"
    "   so \"java\\tscript:x\" runs while a naive test reads it as a relative path. */\n"
    "function safeHref(u){const raw=String(u==null?'':u);\n"
    "  const m=/^([a-z][a-z0-9+.-]*):/i.exec(raw.replace(/[\\u0000-\\u0020]/g,''));\n"
    "  return (m&&!/^https?$/i.test(m[1]))?'#':escq(raw.trim())}\n"
    "window.safeHref=safeHref;\n",
))

# ---- 2. MSAY_BAN gains the three that were missing ------------------------
EDITS.append((
    "const MSAY_BAN='script,img,iframe,object,embed,svg,link,meta,base,form,"
    "input,textarea,video,audio,source,track';",

    "const MSAY_BAN='script,img,iframe,object,embed,svg,link,meta,base,form,"
    "input,textarea,video,audio,source,track,style,marquee,details';\n"
    "\n"
    "/* The handlers this file writes, matched on the VALUE. A rule about elements\n"
    "   cannot separate the dock's own <button onclick=\"jNext()\"> from an\n"
    "   attacker's, and a rule about values can: these five are the entire set of\n"
    "   inline handlers in every maiaSay call site here. The claimQuest form\n"
    "   accepts two single-quoted arguments with every inner quote and backslash\n"
    "   escaped, which is what escja produces and what a broken escja would not,\n"
    "   so this catches an escaping regression a second time from the other side. */\n"
    "const MSAY_ON_OK=/^(?:jNext\\(\\)|jMore\\(\\)|jEnd\\(\\)|startTour\\(\\)|"
    "claimQuest\\('(?:\\\\.|[^'\\\\])*','(?:\\\\.|[^'\\\\])*'\\))$/;\n"
    "/* A strip that removed one of the dock's own controls would look exactly like\n"
    "   a control that was never written. The gate reads this on a clean run. */\n"
    "window.MSAY_STRIPPED=[];",
))

# ---- 3. maiaClean also strips handlers ------------------------------------
EDITS.append((
    "function maiaClean(html){\n"
    "  const t=document.createElement('template');\n"
    "  t.innerHTML=String(html==null?'':html);\n"
    "  t.content.querySelectorAll(MSAY_BAN).forEach(function(el){el.remove()});\n"
    "  return t.content}",

    "function maiaClean(html){\n"
    "  const t=document.createElement('template');\n"
    "  t.innerHTML=String(html==null?'':html);\n"
    "  t.content.querySelectorAll(MSAY_BAN).forEach(function(el){el.remove()});\n"
    "  /* Attributes, not just elements. Removing an element is the easy half; a\n"
    "     live on* handler on a <b> the parser was happy to keep is the other. */\n"
    "  t.content.querySelectorAll('*').forEach(function(el){\n"
    "    for(let i=el.attributes.length-1;i>=0;i--){const a=el.attributes[i];\n"
    "      if(!/^on/i.test(a.name))continue;\n"
    "      if(MSAY_ON_OK.test(String(a.value).trim()))continue;\n"
    "      el.removeAttribute(a.name);\n"
    "      MSAY_STRIPPED.push(el.tagName.toLowerCase()+'['+a.name.toLowerCase()+']');\n"
    "      while(MSAY_STRIPPED.length>24)MSAY_STRIPPED.shift()}});\n"
    "  return t.content}",
))

# ---- 4. both hrefs the dock writes ----------------------------------------
EDITS.append((
    "maiaSay(`That one is kept against your name, so it needs a name. "
    "<a href=\"${escq(d.href)}\" target=\"_blank\" rel=\"noopener\">Sign in</a>"
    " and tap it again; nothing is lost.`);",

    "maiaSay(`That one is kept against your name, so it needs a name. "
    "<a href=\"${safeHref(d.href)}\" target=\"_blank\" rel=\"noopener\">Sign in</a>"
    " and tap it again; nothing is lost.`);",
))

EDITS.append((
    "+'<a href=\"'+escq(siteHref(route))+'\" target=\"_blank\" rel=\"noopener\">'+escq(route)+'</a>. '",
    "+'<a href=\"'+safeHref(siteHref(route))+'\" target=\"_blank\" rel=\"noopener\">'+escq(route)+'</a>. '",
))

for i, (find, repl) in enumerate(EDITS, 1):
    n = s.count(find)
    if n != 1:
        sys.exit("ABORT: edit %d anchor found %d times, expected 1.\n---\n%s\n---" % (i, n, find[:200]))
    s = s.replace(find, repl, 1)

# Prove each one landed, on the text and not on the intention.
CHECKS = [
    ("safeHref defined", "function safeHref(u){"),
    ("safeHref exported", "window.safeHref=safeHref;"),
    ("style banned", "track,style,marquee,details';"),
    ("handler allowlist", "const MSAY_ON_OK="),
    ("stripped recorder", "window.MSAY_STRIPPED=[];"),
    ("maiaClean strips attrs", "MSAY_STRIPPED.push(el.tagName.toLowerCase()"),
    ("sign-in href", "<a href=\"${safeHref(d.href)}\""),
    ("route href", "safeHref(siteHref(route))"),
]
missing = [n for n, m in CHECKS if m not in s]
if missing:
    sys.exit("ABORT: applied but not present: " + ", ".join(missing))
if "escq(d.href)" in s:
    sys.exit("ABORT: the old sign-in href survived")

io.open(ART, "w", encoding="utf-8", newline="").write(s)
print("patched %s  (%d -> %d bytes)" % (ART, before, len(s)))
for n, _m in CHECKS:
    print("  ok  " + n)
