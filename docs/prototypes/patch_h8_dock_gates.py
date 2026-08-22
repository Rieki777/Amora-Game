# -*- coding: utf-8 -*-
"""The gates for patch_h7, and the breaker rows that prove they are load-bearing.

Eight checks and three new mutations. Every check here is written so that the
mutation named beside it turns it red, and the run that shows that is the only
reason to believe any of them:

  J6  the handler allowlist took NOTHING on a run where it should not have
  J7  the element survives, so the village still reads its own text
  J7b no live handler survives, driven by a real mouseover and a real click
  J7c and the record says what it took, which is what makes J6 mean something
  J8  style, marquee and details are gone from the dock as well
  K1  the shell really can put a sign-in door in the dock
  K2  and a javascript: URL never becomes its href
  K3  and the real door still opens, ampersand and all

J6 IS THE ONE THAT EARNED ITS PLACE THE HARDEST. An allowlist over handler
VALUES cannot be verified by grepping 37 call sites for `onclick=`, because a
template literal puts the handler on a different line from the maiaSay that
carries it. So maiaClean records what it removed, and by the time section J
runs, the suite has driven the tour, a journey from both entry points, the
concierge, the claim link and two poisoned scenes over the bridge. An empty
record after all of that is an enumeration. A grep is not.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "qa", "verify_maia_journey.js")
BREAKER = os.path.join(HERE, "qa", "break_maia_journey.py")
ART = os.path.join(HERE, "grounds-v0.html")

# ---------------------------------------------------------------- the checks
J5_ANCHOR = """  ok(j4.b === 1 && j4.btn === 1,
    `J5: and keeps the markup the dock is built from, including its own onclick controls (b=${j4.b}, button=${j4.btn})`);
"""

NEW_CHECKS = J5_ANCHOR + """
  /* J6. THE ALLOWLIST'S OWN POSITIVE CONTROL, and the reason the strip below
     can be trusted at all. maiaClean now removes every on* attribute whose
     value is not one of the five handlers this file writes, and the failure
     mode of an allowlist is silent: a stripped onclick renders as a button
     that does nothing, which looks exactly like a button nobody wired.

     SO THE STRIP KEEPS A RECORD AND THIS READS IT. By this line the suite has
     driven the tour, a journey from both entry points, the concierge, the
     claim link whose onclick carries an escja'd quest name, and two poisoned
     scenes over the config bridge. The record has to be empty. That is an
     enumeration; a grep over 37 call sites is not, because a template literal
     puts the handler on a different line from the maiaSay carrying it. */
  const j6 = await page.evaluate(() => (window.MSAY_STRIPPED || []).slice());
  ok(j6.length === 0,
    `J6: nothing the dock wrote for itself was stripped by the handler allowlist (${j6.length}${j6.length ? ': ' + j6.join(' ') : ''})`);

  /* J7. LAYER TWO AGAINST ATTRIBUTES, which is the half it did not have.
     maiaClean removed banned ELEMENTS and never looked at attributes, so a
     live on* handler on a <b> the parser was happy to keep went straight
     through it. Layer two exists for the day a call site forgets to escape,
     so this hands maiaSay a raw string on purpose, which is exactly that day.

     THEN IT DRIVES THE RENDERED ELEMENT WITH A REAL EVENT. An attribute list
     is a description of the page; a handler that fires is the thing a
     person's mouse finds. */
  const j7 = await page.evaluate(async () => {
    if (window.MSAY_STRIPPED) window.MSAY_STRIPPED.length = 0; else window.MSAY_STRIPPED = [];
    window.__ATTR = 0;
    document.getElementById('maiaLog').innerHTML = '';
    maiaSay('<b id="__probe" onmouseover="window.__ATTR=1" onclick="window.__ATTR=2">hover me</b>');
    const el = document.getElementById('__probe');
    if (el) {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 250));
    return { kept: !!el, text: el ? el.textContent : '', fired: window.__ATTR,
             on: el ? [...el.attributes].map(a => a.name).filter(n => /^on/i.test(n)) : null,
             took: (window.MSAY_STRIPPED || []).slice() };
  });
  ok(j7.kept && j7.text === 'hover me',
    `J7: the element itself is still kept, so the village still reads what it wrote ("${j7.text}")`);
  ok(j7.fired === 0 && j7.on && j7.on.length === 0,
    `J7b: and no live handler survives the parse, driven by a real mouseover and a real click (fired=${j7.fired}, on=${JSON.stringify(j7.on)})`);
  ok(j7.took.length === 2,
    `J7c: and the strip says what it took, which is what makes J6's empty list mean something (${JSON.stringify(j7.took)})`);

  /* J8. The three elements that were missing from MSAY_BAN. <style> is the one
     that matters: a single rule reaches the whole page, and a dock that prints
     a village's own text is a place a rule can arrive. */
  const j8 = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.appendChild(window.maiaClean(
      '<style>body{display:none}</style><marquee>m</marquee>' +
      '<details><summary>s</summary></details><b>kept</b>'));
    return { style: probe.querySelectorAll('style').length,
             marquee: probe.querySelectorAll('marquee').length,
             details: probe.querySelectorAll('details').length,
             b: probe.querySelectorAll('b').length };
  });
  ok(j8.style === 0 && j8.marquee === 0 && j8.details === 0 && j8.b === 1,
    `J8: style, marquee and details go too, and the text beside them stays (style=${j8.style}, marquee=${j8.marquee}, details=${j8.details}, b=${j8.b})`);

  /* ---------- K. a URL is not text ----------
     escq replaces &, < and ", which makes a value safe to SIT inside an
     attribute and says nothing about what the attribute then DOES.
     `javascript:alert(1)` goes through it letter for letter. The dock builds a
     sign-in door out of d.href, and d.href arrives on the promise-result
     message over the same bridge section H drives, so it is reachable by
     exactly the path this lane already hardened for scene text.

     IT IS LATENT AND NOT LIVE, AND THE CHECK IS HERE ANYWAY. A javascript:
     URL on an anchor carrying target="_blank" is declined by the browser, so
     nothing fires today. A defence that rests on another attribute's side
     effect is not a defence. The assertion is therefore on the href the anchor
     carries: clicking this one would measure the browser's rule and never the
     map's, and a green from it would be a green about somebody else's code. */
  const k1 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    promiseWatch('claim', 'kprobe', 'kn1', function () {});
    window.postMessage({ type: 'promise-result', id: 'kprobe', kind: 'claim', nonce: 'kn1',
                         ok: false, reason: 'anonymous', href: 'javascript:window.__HREF=1' }, '*');
    await new Promise(r => setTimeout(r, 600));
    const a = document.querySelector('#maiaLog a[target="_blank"]');
    return { drove: !!a, href: a ? a.getAttribute('href') : null, label: a ? a.textContent.trim() : '' };
  });
  ok(k1.drove && k1.label === 'Sign in',
    `K1: the shell really can put a sign-in door in the dock, so the poisoner is not posting into thin air ("${k1.label}")`);
  ok(k1.href === '#', `K2: and a javascript: URL never becomes its href (href="${k1.href}")`);

  const k3 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    promiseWatch('claim', 'kprobe2', 'kn2', function () {});
    window.postMessage({ type: 'promise-result', id: 'kprobe2', kind: 'claim', nonce: 'kn2',
                         ok: false, reason: 'anonymous', href: 'https://village.example/sign-in?a=1&b=2' }, '*');
    await new Promise(r => setTimeout(r, 600));
    const a = document.querySelector('#maiaLog a[target="_blank"]');
    return { href: a ? a.getAttribute('href') : null };
  });
  ok(k3.href === 'https://village.example/sign-in?a=1&b=2',
    `K3: and the real door still opens, ampersand and all (${k3.href})`);
"""

# --------------------------------------------------------- the header manifest
HDR_OLD = """ *   she stops speaking as a resident   -> B3, F7, G5
 *   the voice ships defaulted to hear  -> F1b
 *   the arrival callback drops its
 *     JWALK re-check                   -> C7b
 */
const BREAKS = 12;"""

HDR_NEW = """ *   she stops speaking as a resident   -> B3, F7, G5
 *   the voice ships defaulted to hear  -> F1b
 *   the arrival callback drops its
 *     JWALK re-check                   -> C7b
 *   MSAY_BAN loses <style>             -> J8
 *   maiaClean stops reading attributes -> J7b
 *   the sign-in href goes back to escq -> K2
 */
const BREAKS = 15;"""

EXPECTED_OLD = "  const EXPECTED = 73;"
EXPECTED_NEW = "  const EXPECTED = 81;"

# ------------------------------------------------------------ the breaker rows
BRK_ANCHOR = """    ("the voice ships defaulted to speaking",
     ("const MVOICE={mode:'read',tier:null,engine:'idle'};",
      "const MVOICE={mode:'hear',tier:null,engine:'idle'};"),
     ["F1b"]),
]"""

BRK_NEW = """    ("the voice ships defaulted to speaking",
     ("const MVOICE={mode:'read',tier:null,engine:'idle'};",
      "const MVOICE={mode:'hear',tier:null,engine:'idle'};"),
     ["F1b"]),

    # The three from the second layer. Each one is held shut today by something
    # OTHER than itself, which is why each needed a check of its own before it
    # could be called closed.
    ("MSAY_BAN loses style",
     (",track,style,marquee,details';",
      ",track,marquee,details';"),
     ["J8"]),

    ("maiaClean stops reading attributes",
     ("  t.content.querySelectorAll('*').forEach(function(el){\\n"
      "    for(let i=el.attributes.length-1;i>=0;i--){const a=el.attributes[i];\\n"
      "      if(!/^on/i.test(a.name))continue;\\n"
      "      if(MSAY_ON_OK.test(String(a.value).trim()))continue;\\n"
      "      el.removeAttribute(a.name);\\n"
      "      MSAY_STRIPPED.push(el.tagName.toLowerCase()+'['+a.name.toLowerCase()+']');\\n"
      "      while(MSAY_STRIPPED.length>24)MSAY_STRIPPED.shift()}});\\n",
      ""),
     ["J7b"]),

    ("the sign-in href goes back to escq",
     ('<a href="${safeHref(d.href)}" target="_blank" rel="noopener">Sign in</a>',
      '<a href="${escq(d.href)}" target="_blank" rel="noopener">Sign in</a>'),
     ["K2"]),
]"""

# ------------------------------------------------- one clarifying artifact line
ART_OLD = """   sites in this file writes any of them. <button onclick> is deliberately NOT
   here: the journey's own controls are that, and they are markup this file
   wrote rather than anything that came over a bridge. */"""

ART_NEW = """   sites in this file writes any of them. <button> is deliberately NOT here:
   the journey's own controls are that, and they are markup this file wrote
   rather than anything that came over a bridge. Their onclick is not left
   alone though. MSAY_ON_OK below is the rule for attributes, and it names the
   five handlers this file writes rather than trusting the element. */"""


def patch(path, edits, label, final=None):
    """`final` names a string that only the finished file carries (h9/h10
    renumber this patch's own insertions, so the NEW text cannot be the
    guard). Present == the committed file is already past this patch: leave
    it alone and skip its marker check."""
    s = io.open(path, encoding="utf-8").read()
    if final is not None and final in s:
        print("skip  %s (already final: carries %r)" % (label, final))
        return None
    for i, (find, repl) in enumerate(edits, 1):
        n = s.count(find)
        if n != 1:
            sys.exit("ABORT: %s edit %d anchor found %d times, expected 1.\n---\n%s\n---"
                     % (label, i, n, find[:240]))
        s = s.replace(find, repl, 1)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    return s


suite = patch(SUITE, [(J5_ANCHOR, NEW_CHECKS), (HDR_OLD, HDR_NEW),
                      (EXPECTED_OLD, EXPECTED_NEW)], "suite",
              final="const EXPECTED = 82;")
breaker = patch(BREAKER, [(BRK_ANCHOR, BRK_NEW)], "breaker",
                final="the sign-in href goes back to escq")
art = patch(ART, [(ART_OLD, ART_NEW)], "artifact")

for label, text, markers in (
    ("suite", suite, ["J6: nothing the dock wrote", "J7b: and no live handler",
                      "J7c: and the strip says", "J8: style, marquee and details go too",
                      "K1: the shell really can put", "K2: and a javascript: URL",
                      "K3: and the real door still opens",
                      "const EXPECTED = 81;", "const BREAKS = 15;"]),
    ("breaker", breaker, ["MSAY_BAN loses style", "maiaClean stops reading attributes",
                          "the sign-in href goes back to escq"]),
    ("artifact", art, ["MSAY_ON_OK below is the rule for attributes"]),
):
    if text is None:
        continue  # skipped as already-final above; the suite run itself is the proof
    missing = [m for m in markers if m not in text]
    if missing:
        sys.exit("ABORT: %s applied but not present: %s" % (label, missing))
    print("ok  %s" % label)

# The breaker's own anchors have to resolve against the artifact on disk, or
# the row reports NO-RUN and the mutation proves nothing. Check that here
# rather than 20 minutes into a breaker run.
src = io.open(ART, encoding="utf-8").read()
for anchor in (",track,style,marquee,details';",
               "  t.content.querySelectorAll('*').forEach(function(el){\n",
               '<a href="${safeHref(d.href)}" target="_blank" rel="noopener">Sign in</a>'):
    n = src.count(anchor)
    print("  breaker anchor x%d  %s" % (n, anchor.strip()[:64]))
    if n != 1:
        sys.exit("ABORT: breaker anchor resolves %d times in the artifact, expected 1" % n)
print("done")
