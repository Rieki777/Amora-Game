# -*- coding: utf-8 -*-
"""Re-derive SITE_PAGES after /introductions landed in the client.

SITE_PAGES is DERIVED from client/src/App.tsx by scripts/qa/routes.mjs. The
comment above it in the artifact says so, and patch_g1_01_doors.py aborts when
the two have drifted, which is the design working.

They drifted. L7 merged `/introductions` (App.tsx:96 registers the label,
App.tsx:328 mounts the Route) after the doors lane derived its list, so the
artifact carried 56 entries against the client's 57.

WHAT IT COSTS, and what it does not.

`siteHref` returns '' for a route that is not in the list, so a door pointing at
/introductions silently does not navigate. It is an ALLOWLIST, so the failure is
safe-by-default: no unapproved route becomes reachable, the approved one just
goes dead. Not a security defect. It is still a door that does nothing, and the
founder gets no feedback about why.

WHY THIS REPLACES THE WHOLE ARRAY rather than inserting one string: the array is
derived output, and the only way it cannot drift again by hand is for the patch
to write exactly what the deriver emits. The guard is a full-array compare, so a
second drift fails loudly here instead of shipping.

Re-runnable: prints a skip and writes nothing when the array already matches.

    python patch_g1_04_routes_rederive.py
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
TARGET = os.path.join(HERE, 'grounds-v0.html')

# The deriver is the authority. Never a hand-typed list.
out = subprocess.check_output(
    [('node.exe' if os.name == 'nt' else 'node'), os.path.join(REPO, 'scripts', 'qa', 'routes.mjs')],
    cwd=REPO).decode('utf-8')
routes = [r.strip() for r in out.replace('\r', '').split('\n') if r.strip().startswith('/')]
assert len(routes) > 40, 'deriver emitted only %d routes; refusing to shrink the allowlist' % len(routes)
assert '/introductions' in routes, 'deriver no longer emits /introductions; re-read App.tsx before trusting this patch'

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))

m = re.search(r'SITE_PAGES=\[(.*?)\];', src, re.S)
assert m, 'SITE_PAGES array not found'
old_body = m.group(1)
old = [x for x in re.findall(r"'([^']*)'", old_body)]
new_body = ','.join("'%s'" % r for r in routes)

if old == routes:
    print('  skip   SITE_PAGES already matches the deriver (%d routes)' % len(routes))
    print('\n  0 bytes changed (%d)' % start_bytes)
    sys.exit(0)

added = [r for r in routes if r not in old]
removed = [r for r in old if r not in routes]
print('  derived %d routes, artifact had %d' % (len(routes), len(old)))
print('  adding:   %s' % (', '.join(added) or '(none)'))
print('  removing: %s' % (', '.join(removed) or '(none)'))
# A removal means a route left the client. That is real, but it retires a door a
# founder may already have placed, so it does not happen silently.
assert not removed, 'the deriver dropped %s; a retired route needs its own review' % removed

n = src.count(old_body)
assert n == 1, 'SITE_PAGES body appears %d times, expected 1' % n
src = src.replace(old_body, new_body, 1)

# Byte-exact round-trip: what we wrote is what the deriver said, in order.
chk = re.search(r'SITE_PAGES=\[(.*?)\];', src, re.S)
assert [x for x in re.findall(r"'([^']*)'", chk.group(1))] == routes, 'round-trip mismatch'

io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
end_bytes = len(src.encode('utf-8'))
print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
print('  1 applied, 0 skipped')
