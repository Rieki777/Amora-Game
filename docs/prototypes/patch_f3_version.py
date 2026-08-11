#!/usr/bin/env python3
"""The artifact says which build it is. Round F.

Round F changed the art: a part-built sprite for every family, and four nav
glyphs that are drawn by this map instead of by the reader's operating system.
The bytes changed, so the label does.

The FAMILY is the contract and does not move. `scripts/import-map-scene.ts`
pins `v0.8` and `qa/verify_features.js` D5.4 asserts the family rather than the
point release, so `v0.8-roundF` is admitted by design.

Matches `v0.8-<anything>` with an exact count of one, for the reason
patch_e9_version.py learned the hard way: pinning the exact predecessor aborts
every time another lane ships a point release, and two lanes ship into this
file.

Run this LAST.
Usage: python3 patch_f3_version.py [grounds-v0.html] [--check]
"""
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)

NEW = "v0.8-roundF"
if NEW in src:
    print(f"  skip  the build label (already {NEW})")
else:
    m = re.findall(r"BUILD_VERSION='(v0\.8-[A-Za-z0-9]+)'", src)
    assert len(m) == 1, f"expected exactly one v0.8 build label, found {m}"
    src = src.replace(f"BUILD_VERSION='{m[0]}'", f"BUILD_VERSION='{NEW}'", 1)
    print(f"  apply the build label {m[0]} -> {NEW}")

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"version patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
