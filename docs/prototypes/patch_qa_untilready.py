#!/usr/bin/env python3
"""A boot wait that says WHICH term never went true.

`until()` takes one predicate and reports one bit. So a predicate that CANNOT
be true - a typo, or `window.X` for a top-level `const`, which lives in script
scope and never becomes a property of window - times out exactly like a slow
boot, and the suite prints "the map finished booting: FAIL" about a map that
booted perfectly. That is not hypothetical: it cost another lane a full
debugging pass on a predicate that had already been fixed.

`untilReady()` takes the terms as NAMED EXPRESSION STRINGS. It waits on all of
them, and on timeout it evaluates each one and names the ones that never went
true. The wait and the diagnosis read the same strings, so they cannot drift.

Files are CRLF; matching is done on LF and written back as CRLF.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
QA = os.path.join(HERE, 'qa')

OLD_UNTIL = """async function until(page, fn, ms = 15000) {
  try { await page.waitForFunction(fn, undefined, { timeout: ms, polling: 100 }); return true; }
  catch (_) { return false; }
}"""

NEW_UNTIL = """async function untilReady(page, terms, ms = 15000) {
  const truth = (src) => {
    const out = {};
    for (const k of Object.keys(src)) {
      try { out[k] = !!eval(src[k]); } catch (_) { out[k] = false; }
    }
    return out;
  };
  try {
    await page.waitForFunction(
      (src) => Object.keys(src).every(k => { try { return !!eval(src[k]); } catch (_) { return false; } }),
      terms, { timeout: ms, polling: 100 });
    return true;
  } catch (_) {
    const t = await page.evaluate(truth, terms);
    const dead = Object.keys(t).filter(k => !t[k]);
    console.log('  waited ' + ms + 'ms. never true: '
      + (dead.join(', ') || '(every term reads true, so the wait itself is wrong)'));
    return false;
  }
}"""

# The comment above the helper, in the two files that carry the short form.
SHORT_DOC_OLD = """/* Wait for a state, not a clock: a fixed post-boot sleep is what makes
 * verify_doors.js fail about once in ten on a cold page. Returns whether the
 * condition arrived, so a real failure reads as a FAIL and not as a stack. */"""

SHORT_DOC_NEW = """/* Wait for a state, not a clock: a fixed post-boot sleep is what makes
 * verify_doors.js fail about once in ten on a cold page. Returns whether the
 * condition arrived, so a real failure reads as a FAIL and not as a stack.
 *
 * Terms are named expression STRINGS, and that is the point. A predicate that
 * can never be true reads exactly like a slow boot, because both arrive as the
 * same timeout: `window.SCENE` is undefined forever, since SCENE is a top-level
 * `const` and lives in script scope rather than on window. On timeout this
 * names the terms that never went true, from the same strings it waited on. */"""

LONG_DOC_TAIL_OLD = """ * the condition arrived rather than throwing, so a genuine failure still
 * prints as a FAIL with its detail instead of a Playwright timeout stack.
 */"""

LONG_DOC_TAIL_NEW = """ * the condition arrived rather than throwing, so a genuine failure still
 * prints as a FAIL with its detail instead of a Playwright timeout stack.
 *
 * Terms are named expression STRINGS so that a timeout can say WHICH one never
 * went true. A structurally false predicate (a typo, or `window.X` for a
 * script-scope `const`) is otherwise indistinguishable from a slow boot.
 */"""

EDITS = {
    'verify_vocab_bridge.js': [
        (SHORT_DOC_OLD, SHORT_DOC_NEW, 1),
        (OLD_UNTIL, NEW_UNTIL, 1),
        ("""  const booted = await until(page, () => typeof SUBTYPES !== 'undefined'
    && typeof SCENE !== 'undefined' && !!(SCENE.vocabulary && SCENE.vocabulary.media)
    && typeof window.phaseName === 'function' && !!window.MEDIA);""",
         """  const booted = await untilReady(page, {
    SUBTYPES: "typeof SUBTYPES !== 'undefined'",
    SCENE: "typeof SCENE !== 'undefined'",
    'SCENE.vocabulary.media': "typeof SCENE !== 'undefined' && !!(SCENE.vocabulary && SCENE.vocabulary.media)",
    'window.phaseName': "typeof window.phaseName === 'function'",
    'window.MEDIA': '!!window.MEDIA',
  });""", 1),
    ],
    'verify_bridge_doors.js': [
        (SHORT_DOC_OLD, SHORT_DOC_NEW, 1),
        (OLD_UNTIL, NEW_UNTIL, 1),
        ("""  const booted = await until(page, () => typeof SKIN !== 'undefined' && typeof SCENE !== 'undefined'
    && Array.isArray(window.EVENTS) && window.EVENTS.length > 0
    && typeof window.promiseWatch === 'function');""",
         """  const booted = await untilReady(page, {
    SKIN: "typeof SKIN !== 'undefined'",
    SCENE: "typeof SCENE !== 'undefined'",
    'window.EVENTS': 'Array.isArray(window.EVENTS) && window.EVENTS.length > 0',
    'window.promiseWatch': "typeof window.promiseWatch === 'function'",
  });""", 1),
    ],
    'verify_doors.js': [
        (LONG_DOC_TAIL_OLD, LONG_DOC_TAIL_NEW, 1),
        (OLD_UNTIL, NEW_UNTIL, 1),
        ("""  await until(page, () => typeof panelKey !== 'undefined' && panelKey === 'kitchen'
    && !document.body.classList.contains('intro'));""",
         """  await untilReady(page, {
    "panelKey === 'kitchen'": "typeof panelKey !== 'undefined' && panelKey === 'kitchen'",
    'intro cleared': "!document.body.classList.contains('intro')",
  });""", 1),
    ],
}


def patch(fname, edits):
    path = os.path.join(QA, fname)
    with io.open(path, 'r', encoding='utf-8', newline='') as fh:
        raw = fh.read()
    crlf = '\r\n' in raw
    src = raw.replace('\r\n', '\n')
    for old, new, count in edits:
        n = src.count(old)
        assert n == count, '%s: expected %d of %r, found %d' % (fname, count, old[:60], n)
        src = src.replace(old, new)
    # nothing may still call the old name
    assert 'await until(' not in src, '%s: an until() call survived' % fname
    assert 'async function until(' not in src, '%s: the old helper survived' % fname
    out = src.replace('\n', '\r\n') if crlf else src
    with io.open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(out)
    print('  patched %s (%d edits)' % (fname, len(edits)))


if __name__ == '__main__':
    print('untilReady: name the term that never went true')
    for fname, edits in EDITS.items():
        patch(fname, edits)
    print('done')
