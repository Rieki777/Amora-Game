#!/usr/bin/env python3
"""Quest keys stop being truncated, because a truncated join key collides.

The site lane caught this and it was mine: I took `/^[a-z0-9_-]{1,32}$/` from
their MEDIA vocabulary rules and applied it to quest keys. Media keys index a
small fixed table of flow types, where 32 is generous. A quest key is a join
key derived from a free-text title and has no reason to be short.

Measured on the seed before this patch: 2 of 20 keys sat exactly on the cap.

  32  welcome-walk-greeting-saturday-s   <- Welcome walk, greeting Saturday's visitors
  32  walk-the-possible-spring-with-th   <- Walk the possible spring with the hydrologist

A truncated key COLLIDES. "Walk the possible spring with the hydrologist" and
"Walk the possible spring with the surveyor" are the same string for the first
32 characters, so both cut to `walk-the-possible-spring-with-th`. Once
`map_key` is the join, two quests address one row and the second overwrites
the first in silence, which is worse than the title matching being replaced:
a title mismatch at least fails loudly as NO MATCH.

There was a second truncation underneath: `slugify` capped everything at 48,
which is right for a URL fragment and wrong for a join key. It takes a limit
now, and only the key asks for the long one. The site takes 190, the utf8mb4
limit for an indexed varchar.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d6c_questkeys.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# 48 stays the default, because a deep-link fragment wants to be readable and
# an item address is scoped to one building. Only the join key asks for room.
swap(
    "function slugify(t){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)}",
    "function slugify(t,max){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,max||48)}",
)
swap(
    """  const base=slugify(q&&q.q).slice(0,32)||'quest';
  let k=base,n=1;
  while(SCENE.quests.some(x=>x!==q&&x.key===k))k=(base+'-'+(++n)).slice(0,32);""",
    """  /* Full slug, never cut to fit. 190 is the site's limit for an indexed
     varchar in utf8mb4 and is far past any real title; the suffix eats into
     the base rather than off the end, so disambiguation cannot be truncated
     away either. */
  const KMAX=190;
  const base=slugify(q&&q.q,KMAX)||'quest';
  let k=base,n=1;
  while(SCENE.quests.some(x=>x!==q&&x.key===k)){const sfx='-'+(++n);k=base.slice(0,KMAX-sfx.length)+sfx}""",
)
swap(
    """  SCENE.quests.push({q:q.text.trim(),key:slugify(q.text.trim()).slice(0,32),at:r.key,r:'20 ♥',need:'hands welcome',""",
    """  SCENE.quests.push({q:q.text.trim(),key:slugify(q.text.trim(),190),at:r.key,r:'20 ♥',need:'hands welcome',""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"quest keys patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
