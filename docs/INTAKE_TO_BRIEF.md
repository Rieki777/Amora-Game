# The intake becomes the village brief

Date: 2026-08-04
Two codebases, one contract. The application at `regencivics.earth/custom-games/apply`
collects it; a fork's `village_brief` table holds it; the guide reads it before she
suggests anything. This file is the agreement between them.

Companion: `MAIA_BRAIN_SPEC.md` section 3 (why these fields), `shared/villageBrief.ts`
(the section registry, which is the authority for ids).

---

## 1. Why this exists

The platform knew a village's configuration and never knew its purpose. `app_config`
holds content, faqs, brand, settings and visit-config: all of it configuration and
copy. Nothing held the aims.

So the guide could describe what a module does and could not say which seat a village
is missing, because seats come from work that has to be held and nothing recorded the
work. The application already asks twelve sections' worth of good questions. It asks
about identity and intent, and not about the operational substrate that role, circle
and quest proposals are actually made of.

Five fields close most of that gap. The rest is filled after the fork exists, in
conversation, because a founder should not have to answer everything before they have
seen anything.

---

## 2. The five fields to add

Each one is required unless noted, and each maps to exactly one brief section.

### 2.1 The work → `work`

Add to **section 5, Coordination today**. Required, textarea.

> **What has to happen on your land, week to week and season to season?**
> A rough list is fine: the watering, the animals, the bookkeeping, the guest who
> arrives on Tuesday. This is what your roles get built from.

**Why it is first.** This is the single most valuable answer on the form. Roles are
seats over work, so without it every proposed role is a generic permaculture template.
With it, the guide can name which aim each seat serves.

### 2.2 Your core people → `people`

Add to **section 9, Team capacity**, beside the existing team-size question. Required,
repeatable pair of (name, one line).

> **Name the people already carrying this, and what each one carries.**
> Three names is a real answer. We size the game to the people you have, never to the
> org chart you wish you had.

**Why.** Section 9 currently asks team SIZE. A count cannot size seats or propose an
assignment. Names and current load are what let the guide say "you have four people,
so four seats, and Ana already does the water."

### 2.3 Legal entity today → `legal`

Add to **section 3, Vision and story**, or a new short block. Required, short text plus
a jurisdiction field.

> **What exists on paper right now, and where?**
> Who holds the land title? "Nothing yet" is a fine answer.

**Why.** The guide ships with sourced legal material including explicit warnings about
508(c)(1)(A) schemes, and she is instructed never to soften them. Knowing whether a
project has already been sold one is the difference between counsel and a warning that
arrives too late.

### 2.4 Primary language → `language`

Add to **section 2, Project identity**. Required, select plus an "other" field.

> **What language does your community actually coordinate in?**
> If more than one, which comes first?

**Why.** The form never asks, and the first client is bilingual across two countries.
It decides what language every string in the delivered game is written in.

### 2.5 Red lines → `constraints`

Add to **section 5, Coordination today**. Optional, textarea.

> **What must this never become?**
> Anything that has already failed here, or that you have watched fail elsewhere and
> refuse to repeat.

**Why.** This is the guide's safety rail. She proposes structure, and a proposal
engine with no notion of what a community refuses will eventually propose it. It is
optional because a founder who has not thought about it should not be blocked, and she
will ask again later.

---

## 3. Sylva asks for these too

The conversational path and the typed form must collect the same fields, or the
Blueprint differs depending on which one a founder chose. Sylva's field checklist goes
from 15 to 20. The four required additions become required answers in her flow; red
lines stays optional and she asks for it last.

Keep her framing conversational. "What has to happen on your land in an ordinary week?"
gets a better answer than reading the form label aloud.

---

## 4. The full mapping

The application's answers seed a fork's brief at provisioning. Fourteen sections exist;
the application fills nine of them and the guide fills the rest in conversation.

| Brief section | Seeded from the application | Filled later |
|---|---|---|
| `work` | **new field 2.1** | |
| `people` | **new field 2.2** | |
| `constraints` | **new field 2.5** (optional) | when blank |
| `legal` | **new field 2.3** | |
| `language` | **new field 2.4** plus "what do you call your members" | |
| `aims` | section 6, the ranked six, plus "what the game must accomplish" | |
| `vision` | section 3, the big vision and origin story | |
| `values` | section 3, core values | |
| `economy` | section 7, currency name, dues, reward feel, kinds of exchange | |
| `land` | section 2, location, land status, acreage | structures, water, tools |
| `decisions` | section 5, how decisions get made today | which decisions exist, who holds each |
| `membership` | section 4, what you call your members | how someone joins, classes, cost |
| `rhythm` | | entirely: cadence, seasons, when work peaks |
| `tools` | section 12, providers | what they use today and will keep |

Sections with nothing to seed are left ABSENT rather than written empty. A blank
section is a prompt the guide can act on; an empty string looks answered.

---

## 5. What provisioning writes

At fork creation, for each section with an answer:

```
INSERT INTO village_brief
  (id, section, title, body, audience, source, status)
VALUES
  (CONCAT('brief-', ?), ?, ?, ?, ?, 'intake', 'proposed')
```

Three rules:

1. **`source = 'intake'` and `status = 'proposed'`.** Nobody in the village has agreed
   to this yet. The guide still uses it and says out loud that she is working from the
   application rather than from anything they have told her since. A founder confirms
   each section in the admin screen, which is one click and changes `status` and
   records who.
2. **`title` and `audience` come from `shared/villageBrief.ts`**, never from the
   application. The registry is the authority: it decides that `people` and `legal` are
   admin-only, and a seeding script that guessed would leak names to members.
3. **Prose, not JSON.** The body is text a person would recognise as their own answer.
   Where the form collected structured input (the repeatable people rows, the ranked
   six), render it to readable lines. The guide reads this as language.

---

## 6. After provisioning, ReGen keeps no copy

The brief is the village's. It is fork-local, excluded by name from the feedback relay,
the network publish surface and the platform handshake, and there is no read path back.
ReGen holds the application because that is how the build was scoped and sold; the
brief that grows from it belongs to the village from the first write.

Say so on the form. A founder answering "who holds the land title" deserves to know
where that sentence ends up.

---

## 7. Acceptance

- A founder who completes the application produces a fork whose `GET /api/admin/brain`
  shows nine sections `proposed` and five `blank`.
- `GET /api/village/brain?section=index` names the blanks, which is what lets the guide
  raise them unprompted.
- No seeded section is `confirmed` until a human clicks.
- `people` and `legal` never render to a member: `GET /api/village/brain` as a
  non-admin omits them.
