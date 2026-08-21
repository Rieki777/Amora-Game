#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.05 (gate) — THE THREE THINGS THAT LET THE GATE MISS g6.05's TWO SINKS.

The artifact half of g6.05 closes two sinks. This half is the reason they were
open: every one of these three is a place where a check that CANNOT run reports
what a check that PASSED reports, and all three are in the instrument rather
than in the artifact.

  1. THE POISONER NEVER TOUCHES TWO FOUNDER IDENTIFIERS.
     __PLANT_FIELDS declares 37 fields. `quests[].key` and
     `forum_threads[].id` are not among them, and restoreScene reads BOTH —
     `key:r.key||undefined` at :5031 and `id:t.id` at :5037. So every restore
     in this gate's history rebuilt the scene with CLEAN quest keys and CLEAN
     thread ids, and every counter downstream was taken over a scene whose
     identifiers were the shipped slugs.

     This is not a small omission. `quests[].key` is the value questKey()
     returns verbatim once a stored quest carries one, so the poisoned TITLE
     could never become the key: `questKey` returns `q.key` at its second line
     and never looks at the title again. A poisoner that plants the title and
     not the key is a poisoner that plants nothing at all, for every reader of
     the key — which is the same shape as the `structures[0].key` mistake g6.03
     wrote down, one level further in.

     And g6.04's own docstring rests on it: "forum_threads[].id and
     journeys[].id reach a double-quoted attribute". journeys[].id is planted.
     forum_threads[].id never was. Half of that measurement was taken over a
     clean value.

     Neither field is named by any other export field, so neither needs the
     identifier-group remap that the structure key, the drawn-feature id and
     the medium key need. They are planted directly.

  2. A DECORATOR HIDES A RENDERER FROM THE CENSUS, AND ONE ALREADY DOES.
     The census walks Object.getOwnPropertyNames(window) and keeps the
     functions whose OWN SOURCE writes HTML. :6789 rebinds one:

         const _openPanelW=openPanel;openPanel=function(k,t,i){window.WGATE&&(WGATE.tap=true);return _openPanelW(k,t,i)};

     so `window.openPanel`'s source is that two-line wrapper, the HTML-write
     test fails, and openPanel is not in `found`. It is therefore neither
     "driven" nor "declared not-driven" — it is ABSENT, which is the one
     outcome the census was built to make impossible. Measured: the census
     reports 35 renderers and openPanel is not one of them, while
     $('panelHead').innerHTML and $('tabs').innerHTML — the panel a visitor
     reads, carrying s.name, s.circle and s.event — are written on every tap.
     The census's own failure mode is the failure mode it exists to catch.

     Repaired narrowly: only names that are PROVABLY decorated in the artifact's
     own script text get looked up by declaration, so a coarse source slice
     cannot sweep anything else in. A decorated name whose declaration cannot be
     found is reported rather than dropped.

  3. THE DEEP AND RAW VARIANTS CANNOT EXIT 0, WHICH IS A RED THAT MEANS NOTHING.
     qa/README.md already names this as the next thing worth fixing. Both
     variants append a payload to every string leaf, which sends `map_zones[]`
     rows down a different branch, so `map_zones[].id` and `map_zones[].name`
     legitimately stop being drawn and stateOnly reads 6 against the shipped
     gate's 4. The generators now raise the cap to 6 IN THE GENERATED FILE ONLY,
     with the two extra field names written beside it, so the variant's red
     means something again — and the shipped gate's cap of 4 is untouched.
     A cap with no reason beside it is how a ratchet becomes a shrug.

WHAT THIS PATCH DOES NOT DO. It adds no page.reload() — make_raw_scan.py
asserts exactly six and carries the count into `RAWACC.loads === 7`, so a
seventh load here would take the generated file red for a reason that has
nothing to do with escaping. It adds no second `ok(perr.length === 0,`, which is
that generator's report anchor. The new section is inserted in front of it.

SEEN TO FAIL FIRST, all three:
  * revert either new plant field and section G goes red naming it;
  * delete the decorator repair and the census prints
    `openPanel  (never called at all)` under NEVER DRIVEN;
  * put the variant cap back to 4 and the generated files exit 2 again.

Re-runnable: every edit is guarded on its own, the RESULT is tested before the
ANCHOR, and a second run is all skips and zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.join(HERE, 'qa')
GATE = os.path.join(QA, 'verify_escaping.js')
DEEPGEN = os.path.join(QA, 'make_deep_poison.py')
RAWGEN = os.path.join(QA, 'make_raw_scan.py')


def say(s):
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []   # (target, name, old, new, count)


def edit(target, name, old, new, count=1):
    EDITS.append((target, name, old, new, count))


def _nl(text, crlf):
    """Match and write in the file's OWN line endings.

    verify_escaping.js is 1536 CRLF lines and zero bare LF; the two generators
    and the artifact are pure LF. The first run of this patch matched every
    single-line anchor and reported GONE on all four multi-line ones — four
    silent misses that looked exactly like four sites another lane had moved —
    and the three edits that DID land wrote LF into a CRLF file. Anchors are
    written with \\n here and translated once, per file.
    """
    return text.replace('\n', '\r\n') if crlf else text


# ============ 1. THE TWO FOUNDER IDENTIFIERS THE POISONER NEVER MOVED ============

edit(GATE, 'declare quests[].key and forum_threads[].id (__PLANT_FIELDS)',
  """      'quests[].title',
      'quests[].reward',""",
  """      'quests[].title',
      /* THE KEY, NOT THE TITLE. questKey() returns `q.key` verbatim on its
         second line whenever a stored quest carries one, so poisoning the
         title could never reach the key and every reader of the key — itemAddr,
         and through it focusItem's selector — was measured over the shipped
         slug. Nothing else in the export names a quest key, so it needs no
         remap. */
      'quests[].key',
      'quests[].reward',""")

edit(GATE, 'declare forum_threads[].id beside the fields that already name a thread',
  """      'forum_threads[].title',
      'forum_threads[].author',""",
  """      /* g6.04 escaped `data-conn="${cs}"` on the strength of "forum_threads[]
         .id and journeys[].id reach a double-quoted attribute". journeys[].id
         was planted. THIS ONE NEVER WAS, so half of that measurement was taken
         over a clean value, and itemAddr('talk', t) — the other reader — was
         never poisoned at all. */
      'forum_threads[].id',
      'forum_threads[].title',
      'forum_threads[].author',""")

edit(GATE, 'plant quests[].key (__poison)',
  """        r.title = KW[i % KW.length] + ' Quest' + P('quests[].title');
        r.reward = 'Reward' + P('quests[].reward');""",
  """        r.title = KW[i % KW.length] + ' Quest' + P('quests[].title');
        /* PLANTED, and the title cannot stand in for it: restoreScene keeps
           `key:r.key||undefined` and questKey() returns it unchanged. */
        if (r.key != null) r.key = String(r.key) + P('quests[].key');
        r.reward = 'Reward' + P('quests[].reward');""")

edit(GATE, 'plant forum_threads[].id (__poison)',
  """      (J.forum_threads || []).forEach(r => {
        r.title = 'Thread' + P('forum_threads[].title');""",
  """      (J.forum_threads || []).forEach(r => {
        if (r.id != null) r.id = String(r.id) + P('forum_threads[].id');
        r.title = 'Thread' + P('forum_threads[].title');""")


# ============ 2. THE CENSUS CANNOT BE BLINDED BY A WRAPPER ============

edit(GATE, 'the census follows a decorated global to its declaration',
  """      }
      /* AND THE CONTEXT HAS TO SURVIVE A DEFERRAL, or the census reports a""",
  """      }
      /* A DECORATED GLOBAL IS STILL A RENDERER, and this file has one.
         :6789 does `const _openPanelW=openPanel;openPanel=function(k,t,i){…
         return _openPanelW(k,t,i)}`, so window.openPanel's SOURCE is the
         wrapper, the HTML-write test above fails, and openPanel never joined
         `found`. Not driven, not declared: ABSENT — the one outcome this
         census exists to make impossible. It writes $('panelHead').innerHTML
         and $('tabs').innerHTML with s.name, s.circle and s.event on every tap.
         ONLY PROVABLY DECORATED NAMES get this treatment, so the coarse slice
         below (declaration to the next column-0 `function `) cannot sweep in
         anything else, and a decorated name whose declaration cannot be found
         is reported rather than dropped.
         DONE HERE, INSIDE __instrumentRenderers, AND NOT IN THE CENSUS. The
         first draft added the name in __rendererCensus, which runs after the
         render pass: the name joined `found` but was never REBOUND, so nothing
         ever pushed it onto __RSTACK, __RWROTE never saw it, and the gate went
         red with `openPanel (never called at all)` about a function the render
         pass had called four times. A renderer has to be wrapped BEFORE it is
         driven or the count is about nothing. */
      const TXT = Array.prototype.map.call(
        document.querySelectorAll('script:not([src])'), s => s.textContent).join('\\n');
      /* BUILT FROM PIECES, NOT WRITTEN AS A LITERAL, and the first run of this
         edit proves why: a literal here put the token `insertAdjacent`+`HTML`
         into __rendererCensus's own source, the enumeration above matched its
         own reporter, and the census went red naming ITSELF as an undriven
         renderer. The instrument must not be findable by the instrument. */
      const H = 'HTML';
      const HTMLW = new RegExp('\\\\.inner' + H + '\\\\s*=|insertAdjacent' + H + '|\\\\.outer' + H + '\\\\s*=');
      const hidden = [], lost = [];
      const dre = /const\\s+(_[A-Za-z_$][\\w$]*)\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*;\\s*\\2\\s*=\\s*function/g;
      let dm;
      while ((dm = dre.exec(TXT)) !== null) {
        const nm = dm[2];
        if (found.indexOf(nm) >= 0 || typeof window[nm] !== 'function') continue;
        const at = TXT.indexOf('\\nfunction ' + nm + '(');
        if (at < 0) { lost.push(nm + '  (decorated, and its declaration could not be located)'); continue; }
        const rest = TXT.slice(at + 1);
        const end = rest.indexOf('\\nfunction ');
        if (!HTMLW.test(end < 0 ? rest : rest.slice(0, end))) continue;
        found.push(nm);
        hidden.push(nm);
        /* WRAPPED LIKE ANY OTHER, or the name is in the list and the count is
           still about nothing. Calls now go wrapper -> decorator -> original. */
        const g = window[nm];
        window[nm] = function () {
          window.__RENT[nm] = (window.__RENT[nm] || 0) + 1;
          window.__RSTACK.push(nm);
          try { return g.apply(this, arguments); } finally { window.__RSTACK.pop(); }
        };
      }
      window.__HIDDEN = hidden.concat(lost);
      /* AND THE CONTEXT HAS TO SURVIVE A DEFERRAL, or the census reports a""")

edit(GATE, 'and says which renderers only the decorator repair could see',
  """    `every renderer in the artifact is driven by this gate (${CENSUS.driven} of ${CENSUS.found} wrote; ${NDRIVEN} declared not-driven)` +""",
  """    `every renderer in the artifact is driven by this gate (${CENSUS.driven} of ${CENSUS.found} wrote; ${NDRIVEN} declared not-driven` +
    (CENSUS.hidden && CENSUS.hidden.length ? `; ${CENSUS.hidden.length} reachable only through a decorator: ${CENSUS.hidden.join(', ')}` : '') + ')' +""")

edit(GATE, 'carry the decorated names out of the census',
  """      return { found: found.length, driven: found.filter(n => wrote[n]).length, undriven, rotten, phantom };""",
  """      return { found: found.length, driven: found.filter(n => wrote[n]).length, undriven, rotten, phantom,
               hidden: window.__HIDDEN || [] };""")


# ============ 3. THE VARIANTS GET THEIR OWN CAP, WITH THE REASON BESIDE IT ============

def main():
    missing = [p for p in (GATE, DEEPGEN, RAWGEN) if not os.path.exists(p)]
    if missing:
        sys.exit('missing: ' + ', '.join(missing))

    files = {}
    n_apply = n_skip = 0
    gone = []

    crlf = {}
    for target, name, old, new, count in EDITS:
        if target not in files:
            files[target] = io.open(target, encoding='utf-8', newline='').read()
            crlf[target] = files[target].count('\r\n') > 0
        src = files[target]
        old, new = _nl(old, crlf[target]), _nl(new, crlf[target])
        # RESULT BEFORE ANCHOR, three outcomes, per edit.
        if new in src:
            say('  skip   ' + name)
            n_skip += 1
            continue
        if old not in src:
            say('  GONE   ' + name)
            gone.append(name)
            continue
        got = src.count(old)
        assert got == count, ('anchor count wrong for "%s": expected %d, found %d'
                              % (name, count, got))
        files[target] = src.replace(old, new)
        say('  apply  ' + name)
        n_apply += 1

    # ---- the variant cap, done in the GENERATORS so the shipped gate keeps its 4 ----
    for gen, who in ((DEEPGEN, 'deep'), (RAWGEN, 'raw')):
        txt = files.get(gen) or io.open(gen, encoding='utf-8', newline='').read()
        if 'STATE_CAP_VARIANT' in txt:
            say('  skip   %s variant: its own stateOnly cap, with the reason beside it' % who)
            n_skip += 1
            files[gen] = txt
            continue
        anchor = "    src = src.replace(A_WRAP, WRAP + A_WRAP)" if who == 'deep' \
            else "    src = src.replace(A_WRAP, DEEP_WRAP + A_WRAP)"
        if anchor not in txt:
            say('  GONE   %s variant: its own stateOnly cap' % who)
            gone.append('%s variant cap' % who)
            files[gen] = txt
            continue
        helper = '''
# ---- STATE_CAP_VARIANT (g6.05) -------------------------------------------
# Appending a payload to EVERY string leaf sends `map_zones[]` rows down a
# different branch, so two fields legitimately stop being drawn and this
# variant's stateOnly reads 6 against the shipped gate's 4. Measured identical
# on the g6.03 rung and the g6.04 rung, so it is a property of the payload and
# not of any patch. Left at 4 the generated file could never exit 0, and a red
# that is always red is a red that means nothing. RAISED HERE ONLY: the shipped
# gate keeps its cap of 4, so a genuinely new stateOnly field still takes the
# gate red. The two names are written into the generated file beside the number,
# because a cap with no reason beside it is how a ratchet becomes a shrug.
STATE_CAP_VARIANT = (
    "const CAP = { els: 0, fired: 0, stateOnly: 4 };",
    "const CAP = { els: 0, fired: 0, stateOnly: 6 };\\n"
    "/* THIS VARIANT ONLY (g6.05). stateOnly is 6 here and 4 in the shipped gate.\\n"
    "   The two extra are map_zones[].id and map_zones[].name: appending a payload\\n"
    "   to every string leaf sends those rows down a different branch, so they stop\\n"
    "   being drawn. Measured identical on the g6.03 rung and the g6.04 rung, so it\\n"
    "   is a property of this payload and not of any patch. THE ELEMENT AND FIRE\\n"
    "   CAPS ARE STILL ZERO; only this one moved, and only here. */",
)


def _raise_state_cap(src):
    """Raise the cap in the GENERATED file, and refuse to be silent about it."""
    old, new = STATE_CAP_VARIANT
    n = src.count(old)
    if n != 1:
        sys.exit('stateOnly cap anchor appears %d times, expected 1 - the gate moved '
                 'and this generator has to be re-read, not re-run' % n)
    return src.replace(old, new)

'''
        marker = "def main():"
        if marker not in txt:
            say('  GONE   %s variant: no main() to insert before' % who)
            gone.append('%s variant cap' % who)
            files[gen] = txt
            continue
        txt = txt.replace(marker, helper.lstrip('\n') + '\n' + marker, 1)
        txt = txt.replace(anchor, "    src = _raise_state_cap(src)\n" + anchor, 1)
        files[gen] = txt
        say('  apply  %s variant: its own stateOnly cap, with the reason beside it' % who)
        n_apply += 1

    wrote = 0
    for path, txt in files.items():
        orig = io.open(path, encoding='utf-8', newline='').read()
        if txt == orig:
            continue
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(txt)
        wrote += 1
        say('  wrote  %s  %d -> %d bytes (%+d)  sha256 %s'
            % (os.path.basename(path), len(orig.encode('utf-8')), len(txt.encode('utf-8')),
               len(txt.encode('utf-8')) - len(orig.encode('utf-8')),
               hashlib.sha256(txt.encode('utf-8')).hexdigest()[:16]))

    say('\n%d applied, %d skipped, %d gone. %d file(s) written.'
        % (n_apply, n_skip, len(gone), wrote))
    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY - read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)


if __name__ == '__main__':
    main()
