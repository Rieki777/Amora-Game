# -*- coding: utf-8 -*-
"""L5/15: a governing role gathers at its OWN circle's home.

THE MAP CONTRADICTED ITSELF, at exactly the two buildings this rule touched:

    Community Center   hovercard "0 seats open", no seat badge  |  lens drew 3
    Council Fire       hovercard "4 seats open", seat badge 4    |  lens drew 1

Both numbers are right about their own question and the reader has no way to
know there are two questions. Dumped off the live artifact, here is the whole
of it - three rows:

    seat                             circle   at        classify   drew
    Development Board of Directors   Wisdom   council   resolver   community
    Community Advisory Council       Wisdom   council   resolver   community
    Leadership Council               Wisdom   council   resolver   community

Three WISDOM roles, ADDRESSED AT COUNCIL, dragged to the Community Center. And
CIRCLE_HOMES says:

    Wisdom -> council

They were already home. `roleHome` moved them anyway, because ROLE_GOV_HOME is
a single hardcoded building and Wisdom is in ROLE_GOV. The review put it
plainly: ROLE_GOV_HOME='community' contradicts CIRCLE_HOMES for three of the
four circles it claims to govern - Outreach lives at the gate, Finance at the
market, Wisdom at the council fire - and the one it agrees with, Coordination,
it agrees with by accident.

So it is not reconciled, it is replaced by the table that was already right.

    A GOVERNING ROLE NOBODY PLACED GATHERS AT ITS CIRCLE'S HOME.

`ROLE_GOV` keeps its whole meaning, which was never about WHICH building: it is
the answer to "may this role be gathered at all". A Land role at the ridge
belongs to the ridge - the circle is place-bound and the address is the fact.
A Wisdom role with a guessed address belongs wherever Wisdom lives, and where
Wisdom lives is a thing this file already knows.

ROLE_GOV_HOME survives as the last resort and nothing more: a governing circle
whose home has been deleted from the land, or is a blueprint in `now` mode,
still has to draw somewhere, and the village centre is the honest guess. On the
shipped land it now fires ZERO times, which is the point - the three moves it
used to make were all wrong.

WHAT THIS DOES TO THE CONTRADICTION. Nothing moves any more, so:

    seatsAt(council) 4    the lens draws 4     hovercard "4 seats open"
    seatsAt(community) 0  the lens draws 0     hovercard "0 seats open"

The two projections agree at every building on this land, and where they ever
disagree the difference is now exactly the set roleDefaulted() names. That is
asserted, both ways, in qa/verify_org_ground.js S1-S4, off the hovercard's own
text and the seat badge's own pip count rather than off either function.

THE HONESTY COLUMN THE FIRST REPORT LEFT OUT. Even after this, the Wisdom halo
at the council fire carries one ARTS satellite - Storyweaver, addressed at
council by a founder. That is not a contradiction and it is not fixed here: the
halo says which circle LIVES at a building and a satellite's colour says which
circle a ROLE belongs to, and a storyteller keeping her seat by the fire is
exactly the kind of thing a village does. It is written down so the next reader
does not have to rediscover that the two colours answer different questions.

    python patch_h5_15_govhome.py
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


def swap(name, old, new, count=1, mark=None):
    global src, applied, skipped
    if (mark or new) in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# ---- 1/2 the constant stops claiming to be the home of four circles ----
OLD = (
    "const ROLE_GOV={Outreach:1,Finance:1,Coordination:1,Wisdom:1};\n"
    "const ROLE_GOV_HOME='community';\n"
)
NEW = (
    "const ROLE_GOV={Outreach:1,Finance:1,Coordination:1,Wisdom:1};\n"
    "/* THE LAST RESORT, AND ONLY THAT. It used to be where all four of those\n"
    "   circles gathered, which contradicted CIRCLE_HOMES for three of them\n"
    "   (Outreach lives at the gate, Finance at the market, Wisdom at the council\n"
    "   fire) and agreed with the fourth by accident. A governing role gathers at\n"
    "   ITS OWN circle's home now; this is what is left when that home is not on\n"
    "   the land - deleted, or a blueprint in `now` mode - and the village centre\n"
    "   is the honest guess for a role with nowhere else to be. It fires zero\n"
    "   times on the shipped land. */\n"
    "const ROLE_GOV_HOME='community';\n"
)
swap('1/2 the fallback stops pretending to be a rule', OLD, NEW,
     mark="/* THE LAST RESORT, AND ONLY THAT. It used to be where all four of those\n")

# ---- 2/2 the rule itself ----
OLD = (
    "  if(ROLE_GOV[x.c]&&BY[ROLE_GOV_HOME])return ROLE_GOV_HOME;\n"
    "  return own}\n"
)
NEW = (
    "  /* A GOVERNING ROLE NOBODY PLACED GATHERS AT ITS CIRCLE'S HOME. Not at one\n"
    "     hardcoded building: CIRCLE_HOMES already answers \"where does this circle\n"
    "     live\", the halos are drawn from it, and asking it here is what stops the\n"
    "     ring and the wash from disagreeing. Three Wisdom roles addressed at the\n"
    "     council fire were being dragged to the Community Center by the old line,\n"
    "     against a table that said Wisdom lives at the council fire. */\n"
    "  if(ROLE_GOV[x.c]){\n"
    "    const h=CIRCLE_HOMES[x.c];\n"
    "    if(h&&BY[h])return h;\n"
    "    if(BY[ROLE_GOV_HOME])return ROLE_GOV_HOME}\n"
    "  return own}\n"
)
swap('2/2 the circle says where its roles gather', OLD, NEW,
     mark="  if(ROLE_GOV[x.c]){\n    const h=CIRCLE_HOMES[x.c];\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
