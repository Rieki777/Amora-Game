#!/usr/bin/env python3
"""The artifact says which build it is.

Round E changed the plates, the ring, the tap resolution and the toasts, so the
label moves with the bytes. Shipping changed code under an unchanged label is
the same silence the round before this one existed to remove, and
`/grounds/manifest.json` verification greps this string to tell live from
stale.

The FAMILY is the contract and it does not change: `scripts/import-map-scene.ts`
pins `v0.8`, `qa/verify_features.js` D5.4 asserts the family and not the point
release, so `v0.8-roundE` is admitted by design where a `v0.9` would be refused
loudly and deliberately.

Run this LAST, after every other round E script has landed.

House protocol: exact-count anchor, refuse on any count that is not 1.
Usage: python3 patch_e9_version.py [grounds-v0.html] [--check]
"""
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)

NEW = "v0.8-roundE"
if NEW in src:
    print(f"  skip  the build label (already {NEW})")
else:
    # The label this replaces is whatever the OTHER lane last set inside the
    # same family, which moved twice while round E was being written (roundD,
    # roundD1, roundD2). Pinning the exact predecessor aborts every time they
    # ship a point release, so the anchor is the family and the count still
    # has to be one. Round E sits on top of whatever D reached.
    m = re.findall(r"BUILD_VERSION='(v0\.8-[A-Za-z0-9]+)'", src)
    assert len(m) == 1, f"expected exactly one v0.8 build label, found {m}"
    src = src.replace(f"BUILD_VERSION='{m[0]}'", f"BUILD_VERSION='{NEW}'", 1)
    print(f"  apply the build label {m[0]} -> {NEW}")

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"version patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
