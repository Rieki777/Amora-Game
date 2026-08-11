#!/usr/bin/env python3
"""Six artifact writers rewrote every line ending in the file.

`open(p, "w", encoding="utf8")` is TEXT mode, so on Windows Python translates
every \\n it writes into \\r\\n. Reading the same way translates back. So a
script that reads the artifact, edits one anchor and writes it out does not
change one region: it rewrites all 5.4 MB from LF to CRLF.

Why that matters here rather than being cosmetic:

- `.gitattributes` marks the artifact `-text`, bytes in and same bytes out, on
  purpose. Git will NOT normalise this away. A one-anchor edit therefore lands
  as a whole-file diff, which is unreviewable and buries whatever actually
  changed.
- It breaks the property that made round E provable. Two lanes replayed the
  same eleven scripts in different worktrees and got a byte-identical artifact
  whose sha256 matched the content-hashed filename production serves. One
  text-mode writer anywhere in the chain and those two artifacts differ by
  every line, and the whole argument evaporates.
- A `.gitattributes` that diverges between worktrees is already a live blocker
  in this repo, and the same file sitting LF in one tree and CRLF in another is
  exactly the shape of it.

The round E and F scripts, and every patch_d*/patch_badges_p2-p4, already pass
`newline=""`. These six predate that habit. The round F lane found the one in
`embed_sprites.py`; the other five came from enumerating every writer rather
than fixing the one that was reported.

`patch_qa_untilready.py` looks like a seventh and is not: it passes
`newline=''` in single quotes, which a grep for `newline=""` misses.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

NOTE = ('# Text mode would translate every newline on the way in and back out, so a\n'
        '# one-anchor edit would rewrite all of this LF file as CRLF. The artifact is\n'
        '# `-text` in .gitattributes: bytes in, same bytes out. Keep newline="".\n')

FILES = [
    'embed_paint.py',
    'embed_plate.py',
    'embed_sprites.py',
    'patch_badges_p1.py',
    'patch_walklog_atindex.py',
    'patch_walklog_post.py',
]

READ_OLD = 'open(HTML, encoding="utf8").read()'
READ_NEW = 'open(HTML, encoding="utf8", newline="").read()'
WRITE_OLD = 'open(HTML, "w", encoding="utf8")'
WRITE_NEW = 'open(HTML, "w", encoding="utf8", newline="")'


def patch(fname):
    path = os.path.join(HERE, fname)
    with io.open(path, 'r', encoding='utf-8', newline='') as fh:
        raw = fh.read()
    crlf = '\r\n' in raw
    src = raw.replace('\r\n', '\n')

    for old, count in ((READ_OLD, 1), (WRITE_OLD, 1)):
        n = src.count(old)
        assert n == count, '%s: expected %d of %r, found %d' % (fname, count, old, n)

    src = src.replace(READ_OLD, READ_NEW)
    src = src.replace(WRITE_OLD, WRITE_NEW)

    # The note goes immediately above the read, once.
    line = [l for l in src.split('\n') if READ_NEW in l][0]
    indent = line[:len(line) - len(line.lstrip())]
    if 'Keep newline=' not in src:
        src = src.replace(line, ''.join(indent + l + '\n' for l in NOTE.rstrip('\n').split('\n')) + line, 1)

    assert 'open(HTML, encoding="utf8").read()' not in src, fname
    assert 'open(HTML, "w", encoding="utf8").' not in src, fname

    out = src.replace('\n', '\r\n') if crlf else src
    with io.open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(out)
    print('  patched %s' % fname)


if __name__ == '__main__':
    print('newline safety: the artifact keeps the bytes it came in with')
    for f in FILES:
        patch(f)
    print('done')
