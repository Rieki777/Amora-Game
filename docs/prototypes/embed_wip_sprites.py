#!/usr/bin/env python3
"""Embed sprites_wip/*.png into grounds-v0.html between the WIP markers.

The twin of embed_sprites.py, for the part-built sprite set. Separate markers
so the two embeds never have to know about each other, and either can be re-run
alone.

TWO DIFFERENCES FROM embed_sprites.py, BOTH DELIBERATE.

`newline=""` on the write. The artifact is LF-only and pinned that way by
`.gitattributes` (`docs/prototypes/grounds-v0.html -text`) precisely so the
bytes the generator wrote are the bytes git stores. Python's text mode
translates "\\n" to os.linesep on write, so on Windows the default would rewrite
all 4.7 MB as CRLF: every line of a generated artifact changed, in a commit
about ten images. Every patch script in this directory already passes
`newline=""`; embed_sprites.py does not, and has evidently only ever been run
on Linux.

An absent directory is a no-op rather than an error, because a checkout that
has never run `gen_wip_sprites.py` should still be able to run this without
being told it is broken.

Usage: python3 embed_wip_sprites.py [grounds-v0.html]
"""
import base64, glob, os, sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sprites_wip")

entries = []
for f in sorted(glob.glob(os.path.join(SRC, "*.png"))):
    fam = os.path.splitext(os.path.basename(f))[0]
    b64 = base64.b64encode(open(f, "rb").read()).decode()
    entries.append(f"{fam}:'data:image/png;base64,{b64}'")

# AN EMPTY DIRECTORY IS A MISTAKE, NOT AN INSTRUCTION. The sprite folders are
# working areas and are not in git: the ARTIFACT carries the art, which is why
# `sync_sprites_from_artifact.py` exists. So on a fresh checkout this directory
# is empty, and embedding what it holds would replace thirty images with `{}`
# and report success. Recover with `sync_wip_from_artifact.py` first.
if not entries:
    sys.exit("sprites_wip/ is empty: run sync_wip_from_artifact.py first, "
             "or gen_wip_sprites.py to make them. Refusing to embed nothing.")

data = "/*SPRITES_WIP_DATA*/window.SPRITES_WIP={" + ",".join(entries) + "};/*SPRITES_WIP_DATA_END*/"
# `newline=""` on the READ as well as the write. On this LF artifact the write
# alone is enough, but a default-mode read normalizes CRLF to LF in the string,
# so running this in a worktree where the file had become CRLF would rewrite all
# 5.4 MB to LF while reporting only that it embedded some images. Verbatim in,
# verbatim out, whichever the file happens to be.
src = open(HTML, encoding="utf8", newline="").read()
try:
    a = src.index("/*SPRITES_WIP_DATA*/")
    b = src.index("/*SPRITES_WIP_DATA_END*/") + len("/*SPRITES_WIP_DATA_END*/")
except ValueError:
    sys.exit("no /*SPRITES_WIP_DATA*/ markers: run patch_f1_wip.py first")

before = len(src)
src = src[:a] + data + src[b:]
open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"embedded {len(entries)} unfinished sprites -> {HTML}: {before} -> {len(src)} chars")
