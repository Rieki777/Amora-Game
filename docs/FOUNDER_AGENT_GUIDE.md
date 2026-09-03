# Founder Agent Guide

**You are reading this because a founder pointed you at this repository and
asked you to help them stand up their village.** This document is written for
you, an AI agent, and not for the founder. It tells you where things are, what
order the setup happens in, what each setting means, and the things you must
never do.

The founder is the one who decides and the one who clicks. Read the next
section before anything else.

---

## 0. The rule that outranks everything

**Your role is to suggest, never to execute. You are their guide.**

That is the founder's own instruction and it is the frame for every other
sentence in this document. Everything below is written to make it operational.

### What "suggest" means here

You suggest values. You explain what a setting does and what happens if it is
left blank. You draft copy in the founder's voice and hand it to them to paste
or reject. You read their own material, their website, their notes, their
existing documents, and you propose answers they can accept or change. You read
this repository and tell them what a screen is about to do before they touch it.
You watch them work and you catch the mistake before it is saved.

### The boundary, in both directions

| You may | You may not |
|---|---|
| Read this repository, in full, any file | Write to the village's database, by SQL or by any admin API call |
| Read the live site's public pages | Sign in to `/admin` as the founder, or hold their session token |
| Draft the village name, tagline, member name, footer sentence, quest text, FAQ answers, page copy | Save any of it. The founder presses Save |
| Explain what a hero image slot is for and which page it lands on | Upload an image on their behalf |
| Explain what a module does, what turning it on reveals, and what it will ask for next | Turn a module on or off |
| Read `.env.example` and explain what a variable is for | Set an environment variable in Railway |
| Explain the deploy sequence and read a deploy's own logs when the founder has given you that access | Trigger a deploy, push to `main`, or run a migration against their database |
| Explain what Stripe, Resend and Anthropic each cost and what each unlocks | Create an account, accept terms, enter card details, or spend their money |
| Tell the founder exactly which DNS record to add and where | Change DNS |
| Say plainly that a step needs a decision only they can make | Make that decision for them and report it as done |

### Two worked examples, so the line is unmistakable

**Right.** The founder says the Pictures step is confusing. You read
`client/src/pages/Admin.tsx` and `client/src/components/admin/setupProgress.ts`,
and you tell them: there are nine image slots, all nine are counted toward the
step being finished, blank slots draw a quiet placeholder with the alt text as
the accessible name, the header logo and footer mark and tab icon apply live
with no deploy, and the file they upload is re-encoded to WebP at 2000px on the
way in so a phone photo is safe to use. Then you ask which nine pictures they
have and offer to help them pick. They upload. They save.

**Wrong.** The founder says the Pictures step is confusing, so you ask for their
admin password, sign in, and upload nine images you found on their old website.
Every part of that is a violation: you asked for a credential, you acted as
them, and you published pictures they never chose onto a public site.

**Right.** The founder asks what their village should be called on the site. You
read the material they gave you, propose three options with a sentence on how
each one will read in the header, the footer, the browser tab and the quest
share card, and say which one you would pick and why.

**Wrong.** You `PUT /api/admin/brand` with the name you liked best. Even with a
valid token, this is the founder's identity and the founder's choice, and a
value that arrives in their village without them typing it is a value nobody
owns.

### One more thing that is never yours

**Never ask for, hold, store, or type a credential.** Not the admin password,
not a session token, not an API key, not a database URL with a password in it,
not a Railway token. If a step needs one, tell the founder where to go, what to
click, and what the screen should say when it worked. Wait.

Admin access in this platform is the founder's own account. `isAdmin` in
`server/index.ts` resolves a real signed-in user with the `admin` or `founder`
role, and the client passes that user's session token as
`Authorization: Bearer <token>` (`client/src/components/admin/adminApi.ts`).
The variable is called `password` in the client for historical reasons and it is
a session token. Holding it means being them.

---

## 1. What this platform is

It is a white-label coordination platform for a village: a piece of land, a
community, and the work of running both. One codebase serves every village.
Nobody forks it by copying and renaming. What makes an instance somebody's own
is its own database, its own domain, its own environment variables, and a set
of records inside its own database that carry the name, the pictures, the words
and the numbers.

The stack, from `CLAUDE.md` and `package.json`: React 19 with Vite and wouter in
`client/src`, one large Express server at `server/index.ts` plus `server/lib/*`,
MySQL with hand-written SQL migrations in `drizzle/` applied at boot by
`server/db/migrate.ts`. Deployment is Railway or a published container image
(`ops/RELEASES.md`).

The platform is made of **modules**. Each one is a part of village life the
village can switch on: a map of the land, a quest board, stays and hosting, a
material library, an exchange, governance, messaging. `shared/modules.ts` is the
registry of everything the platform can be. A village with no modules on is
still a working site.

What this means for you: almost everything a founder wants to change is a
setting, not a code change. Reach for the admin screens first, every time. A
code change is the last resort and section 6 covers what it costs.

---

## 2. Before you touch anything: know which village you are looking at

Three things to establish in your first minutes, because getting any of them
wrong wastes the founder's afternoon.

**Which repository checkout.** Confirm you are in a checkout of this repository
and read `CHANGELOG.md` for the current release. The tree changes weekly.

**Which running instance.** Ask the founder for their domain. Then:

```
curl -s https://<their-domain>/health
```

`/health` answers `{status, build, timestamp, database, uploads}` and returns
503 when the database probe fails. The `build` field is a real build marker; a
marker that never changes across a deploy means the deploy did not land. Note
that `/health` is the path. `/api/health` is a different thing and may be gated
off.

`GET /api/platform/info` is a public, unauthenticated handshake. It answers the
village's name, tagline and location as the merged config resolves them, plus a
permanent instance id, the platform version, the build marker, and every module
serving at members level or above. A module still in `preview` is deliberately
absent, because preview is what a founder is still looking at. Reading it is a
fast way to confirm you and the founder are talking about the same village and
that its identity actually landed.

**Whether the village is live yet.** `/journey-to-launch` is the readiness
checklist and it is the single answer to "what is left". The requirements are
data in `shared/launchRequirements.ts`, resolved to live status by
`server/lib/launch.ts`, and served at `GET /api/admin/launch` to a signed-in
admin. Three surfaces read that one registry: the Journey to Launch page, the
admin banner, and the assistant's launch-guide mode. Ask the founder to open
that page and read it to you. Do not invent your own checklist beside it.

---

## 3. The setup, described by what each step achieves

**Read this section as a description of goals, not of an order.** The wizard's
step numbers move. As of this writing the panel at
`client/src/components/MapSkinPanel.tsx` describes itself as "step 6" while
`client/src/pages/Admin.tsx` renders it as step 5, which is what a number in a
document is worth. There is also a planned reordering that puts the assistant
connection first and moves map styling into the map itself. Describe steps to
the founder by what they accomplish and the reordering costs you nothing.

The wizard lives at Admin, under a section headed **"Make This Site Yours"**
while it is unfinished and **"Project Settings"** once every step reads done.
Both names are the same screen and every field stays editable forever. The
default admin path is `/admin` (`shared/gameConfig.ts`).

`client/src/components/admin/setupProgress.ts` is the one place the steps are
declared, and it splits them into two kinds. This distinction matters and the
founder will not notice it unless you tell them:

- **Measured steps** are counted from what is actually saved in the village's
  own record. There is no checkbox. Empty a field and the step goes back to
  unfinished on its own. Identity and Pictures are measured.
- **Self-reported steps** carry a checkbox the founder ticks. They say only what
  the founder told them. Numbers, Content, Map and Go-live are self-reported,
  because what they ask about is genuinely not readable from the record.

A ticked box outlives whatever it was ticked about. If a founder shows you six
of six and the site still looks wrong, four of those six are their own word.

### Naming the place

**What it achieves:** the village has its own name, its own tagline, its own
word for a member, its own location, and its own one-sentence footer.

Fields the wizard renders in this step: project name, tagline, what a member is
called, location, main website URL, events page URL, contact email, footer
introduction. Saving applies live with no deploy.

Counted toward the step being finished: name, tagline, member name, location,
footer introduction. The three URL and email fields are deliberately excluded,
because blank is a real answer for each of them (see section 5).

**The token name is not in this step and there is no box for it here.** Every
token this village runs, including the recognition token members earn, is named
under Admin, Tokens. The wizard now shows a line pointing there. Two dead boxes
used to sit in this step and the token registry beat them every time, so typing
a token name here changed a stored value nothing displayed. If a founder tells
you they renamed the token in the wizard and nothing changed, this is why, and
the answer is Admin then Tokens.

### Dressing the place

**What it achieves:** the site carries the village's own pictures, colours, type
and visual identity.

Nine image slots, all nine counted: homepage hero, investor hero, resident hero,
steward hero, prosperity hero, master plan hero, header logo, footer mark,
browser tab icon. Every one of them ships empty on purpose, because the
platform holds no art that belongs to a particular village.

Alt text ships with the pictures and is what a screen reader reads in place of
the image. The tab icon has no alt field, because a browser tab icon has nothing
to read.

Three more panels are mounted inside this step and each is its own component:

- **Look** (`client/src/components/LookPanel.tsx`): three decisions a founder
  with no design background can make. A colour, a character, and one sentence
  about their place. Palette, radius and type pairing derive from those three,
  and every colour pairing is contrast-measured before it ships.
- **Typography** (`client/src/components/TypographyPanel.tsx`): heading, body and
  accent faces from a self-hosted catalogue, or the village's own font file.
  Uploading a font is gated behind a web-embedding licence acknowledgment that
  records who confirmed and when. Tell the founder plainly: "free to download"
  almost never includes web embedding, and the village that picks a font carries
  the licence.
- **Identity pack** (`client/src/components/IdentityPackPanel.tsx`): the
  village's visual identity written down as data, a description of what they are
  and what they are not, plus reference images. Its save is gated behind a
  rights acknowledgment, because a logo from a designer is often not the
  village's to feed to a model.

Uploads go through `POST /api/admin/brand/image`. The server re-encodes to WebP,
caps the long edge at 2000px, writes a 400px thumbnail, and asserts that no
metadata survived the encode. A file whose location data survives is refused
instead of stored. If compression is unavailable the upload is refused with a
503 and an explanation, and the original bytes are never written. Files land on
the mounted volume and are served at `/api/uploads/<filename>`.

### Stating the numbers

**What it achieves:** the money and land figures the site shows are this
village's own, or are absent.

This step is a doorway. The fields live on the **Settings** tab: village dues,
and the land and money figures the investor page and the master plan show
(size of the land, appraised value, change in land value, projected return,
target raise, planned homes, guest rooms).

**Every one of them ships blank, and a blank figure means the page shows no
figure at all.** The site only ever states what the founder stated. They are
free-text on purpose, so a village can write "under valuation" or "1.2M EUR"
without being pushed into a precision it does not have.

This is the step where you are most useful and most dangerous. You can explain
where each figure appears. You must not supply one. See section 7.

### Writing the words

**What it achieves:** the questions, milestones, quests and page copy are the
village's own words.

Another doorway, this one to a list of editors: Org Chart, Team Page, FAQs,
Build Progress, Training modules, Visit program, Investor summary, Season, and
Quests. The Content tab itself holds Team Page, Legal and Jurisdiction Notices,
and the Love Letter Covenant (`client/src/components/admin/contentSections.ts`).

Seeded starter quests arrive with a fresh village. They are meant to be
rewritten. Standing examples appear when a module is first switched on so the
founder meets a working module, they refuse every mutation, and the first real
item retires them permanently.

Drafting here is the single best use of your time. Read what the founder has
already written elsewhere, propose text, hand it over.

### Styling the land

**What it achieves:** the Living Map draws this village's land the way the
village sees it.

Three panels: the map skin, the walk editor, and the map vocabulary (the
founder's own words for roads, water and zones). Blank keeps the map's own look.
The stored shape is the map artifact's own export format
(`shared/mapSkin.ts`), so a founder can style inside the map, export, and land
on these values.

This is the part the planned reordering moves into the map itself. Describe it
by what it achieves and the move does not affect your advice.

### Going live

**What it achieves:** the village is deployed, has a database and a volume, has
its environment variables, and answers on its own domain.

The wizard's Go-live step lists the one-time technical work: deploy on Railway,
add a persistent volume mounted at `/app/data`, set the environment variables,
point the domain, and read `PLATFORM_FOUNDATION.md` for the full architecture.

**The full walkthrough is `docs/PROVISIONING.md` and it is the source of truth
for this step.** `docs/FOUNDER_SETUP_PROMPT.md` is the same walkthrough written
as a prompt a founder pastes into their own session. Read both before advising
on any of it. The things worth carrying in your head:

- `scripts/fork-init.mjs` generates the environment variables and prints a
  one-time bootstrap password. Two of the values it generates,
  `MEMBER_SECRETS_KEY` and `VILLAGE_SECRETS_KEY`, cannot be recovered once
  anything has been stored under them. Set once, leave alone.
- `ADMIN_PASSWORD` authenticates exactly once, for the bootstrap call that
  creates the founder account, and then refuses everyone forever. Setting
  `FOUNDER_EMAILS` is what stops a later lockout being permanent.
- Resend accepts mail through an unverified sending domain and answers success.
  Nothing arrives, with no error and no bounce anywhere in the platform. Do not
  let a founder believe email works until the domain reads verified in Resend's
  own dashboard.
- Three steps cannot be done by any script, by you, or by anyone else on the
  founder's behalf, because each proves control of something outside this
  platform: DNS, Resend sender-domain verification, and creating a Stripe
  account.

`docs/FOUNDER_SETUP_PROMPT.md` was written before the suggest-never-execute rule
was stated and it reads as a more executing posture in places. Where the two
disagree, the rule in section 0 wins.

---

## 4. Where the real state lives

This section exists because these have already cost people time. Read all four
before you advise on anything that stores a value.

### The brand record is a database row, and it is cached with no expiry

Everything the founder types into Identity and Pictures, plus the theme, the
identity pack and the map skin, lives in **one row of the `app_config` table
whose `config_key` is `brand`**. It is read through
`dbDocument(getPool(), "brand", DEFAULT_BRAND)` in `server/index.ts`, and
`dbDocument` is defined in `server/repos/store-db.ts`.

**That document is loaded into memory once, at boot, and there is no TTL.**
`load()` runs during startup. `get()` returns a module-level cache. `put()`
writes the row and refreshes the cache in the same process. Nothing re-reads it
on a timer.

The consequence you must hold on to: **a value written straight into the
database is invisible to the running server until it restarts.** Anyone who
"fixes" a brand field with SQL will see the API keep reporting the old value and
will conclude the write failed. It did not fail. It was not read.

This is one of the strongest reasons the rule in section 0 is the rule. The
supported write is `PUT /api/admin/brand`, which the wizard calls when the
founder presses Save, and which merges section by section so a partial payload
never blanks a field it did not send.

### `brand.json` on the volume is not the source of truth

Several documents in this repository still name `data/brand.json` as the brand
overlay, including `docs/FORK_RUNBOOK.md`, `PLATFORM_FOUNDATION.md` and
`FIXES_TO_MAKE_2026-07-17_FOUNDATION_LEVERS.md`. **No code in this tree reads a
file by that name.** `server/repos/store.ts` holds the old file-backed
repository and nothing outside tests imports it. Writing a `brand.json` onto the
uploads volume changes nothing, and the API keeps reporting empty values while
the file sits there looking correct.

If you see `data/brand.json` in a document, translate it to "the `brand` row of
`app_config`" and carry on.

### Module enablement lives in `module_settings` and nowhere else

`shared/modules.ts` says it in its own header: enablement lives in
`module_settings`, read through `server/lib/modules.ts`, "and NOWHERE else". The
per-module `<module>.enabled` game variables that older design documents sketch
are void.

Four lifecycles, rank-ordered `off < preview < members < public`:

- `off` routes answer 404, no nav entry, no admin tab, variables hidden
- `preview` admins only, and a non-admin gets the identical 404 body so the
  catalog of what a village is trying never leaks
- `members` signed-in only
- `public` everyone, with per-route capability checks still applying on top

**An absent row means off.** A village inherits every new platform module as
off, and enabling is always a deliberate admin act recorded in `module_events`.

Turning a module on is a founder decision with consequences: it reveals nav,
admin tabs and public routes, and for funds-bearing modules the platform refuses
the enable entirely while no admin holds their own credential. Explain what a
module will do. Let them press it.

### Uploaded files live on the volume

Member and brand uploads are written to `/app/data/uploads` on the mounted
Railway volume and served at `/api/uploads/<filename>`. In code the directory is
`UPLOADS_DIR`, which is `DATA_DIR` plus `uploads`, and `DATA_DIR` defaults to a
`data` directory beside the built server unless the `DATA_DIR` environment
variable overrides it. The Dockerfile creates `/app/data/uploads` and the
provisioning steps mount the volume at `/app/data`.

Two properties of that route worth knowing. It answers a real 404 for a file
that is not there, so it is honest. And it has no authentication in front of it,
so the filename is the only secret a file has. Never suggest putting something
sensitive on the volume and relying on the address being unguessable.

Large art belongs here and not in `client/public`. `client/public` is served
one-year-immutable, so a file cached by a browser cannot be replaced for a year.

---

## 5. What each setting means, and what a blank value does

The platform's whole posture on blank values is: **blank inherits the platform
default where a default is safe, and hides the thing entirely where it is not.**
A village's site never states something the village did not state.

The merge is `mergedConfig()` in `server/index.ts`. It overlays the brand record
over `shared/gameConfig.ts` and serves the result at `GET /api/game/config`. The
overlay rule is `pick()`: an empty string, `undefined` or `null` inherits the
platform default. Everything else wins.

| Setting | Blank does this |
|---|---|
| Project name | Falls back to the platform default `Unnamed Village` |
| Tagline | Falls back to `healing the land and ourselves, together` |
| What a member is called | Falls back to `Village member` |
| Location | Shows nothing. The platform default is empty, on purpose, because there is no neutral location |
| Footer introduction | Falls back to `A regenerative village where all beings belong and thrive.` |
| Main website URL | Hides the "Main Site" link entirely, so no visitor is sent to another village's site |
| Events page URL | Hides the footer Events link |
| Contact email | Hides every "email us" control on the shopfront pages. Read through `useVillageLinks` in `client/src/lib/gameApi.ts`. This one matters most, because its failure is silent: a compiled-in address would take an enquiry, send it somewhere else, and show the visitor a normal mail composer |
| Any of the nine images | Draws a quiet placeholder mark and keeps the alt text as the accessible name. The header logo becomes an empty spacer and the footer mark is omitted. The tab icon falls back to a neutral platform mark shipped in `client/index.html` |
| Any Settings figure (acreage, appraisal, target raise, and the rest) | The page shows no figure at all |
| Map skin, walk, vocabulary | The map keeps its own look and its own words |

Two identity values are served by the config API and have **no field in the
wizard**: `project.country` and `project.fiatCurrency`. Their platform defaults
are `CR` and `CRC`. Grepping this tree found no client code reading either one,
and no admin screen that writes them, so today they appear to be display-only
values with no door. Flag it to the founder if it comes up, and do not tell them
it is set somewhere it is not.

Behaviour, as opposed to identity, lives in a different plane: the variable
registry in `shared/gameVariables.ts`, with per-village overrides in the
`game_variables` table stored delta-only, so only changed values are kept and
platform default changes flow through. Token names live in the `tokens` table
and are set at Admin, Tokens.

**A token's display name is editable and its slug is frozen forever.**
`slugFreezeRefusal` in `server/lib/ledger.ts` refuses a slug change and explains
why: this schema carries no foreign keys, so the slug is the only thread holding
a token's history together, and moving it would orphan every ledger row,
balance and idempotency key without raising a single error. Every balance would
quietly read zero. Rename the display name and every surface follows.

---

## 6. If you propose a code change

Most founder requests are settings. Some are not. When you genuinely need a code
change, propose a diff to the founder and let them decide who applies it. These
are the house rules the repository enforces mechanically. Breaking any of them
fails CI, and CI is `.github/workflows/ci.yml`.

### Two files are ratcheted and may not grow at all

- `server/index.ts` is capped by `scripts/check-server-index-size.mjs` against
  `scripts/server-index-size-baseline.json`, in **lines and in route
  registrations**, and `--update-baseline` refuses to write a higher number in
  either. No file under `server/routes/` may pass 2,000 lines, so the monolith
  cannot move house. New routes go in `server/routes/<domain>.ts`.
- `client/src/pages/Admin.tsx` is capped by `scripts/check-file-lines.mjs`
  against `scripts/file-lines-baseline.json`, per file, and `--update-baseline`
  refuses to raise any tracked file's count. Any file in `client/src` that
  crosses 1,000 lines enters the baseline and is tracked from that day.
  Vendored shadcn primitives under `client/src/components/ui/` and test files
  are exempt.

Both refusals are proven by their own test suite (`server/serverIndexRatchet.test.ts`)
and both run as named CI steps. The path out is extraction into a new component
or a new route module, which lowers the number and keeps it lowered.

### The image budget is a ratchet too

`scripts/check-image-budget.mjs` walks `client/public`, fails on any raster that
is not WebP or AVIF, fails on any single file over 400 KB, and fails on a total
above `scripts/image-budget-baseline.json`. `--update-baseline` writes the new
number only when it is lower.

**New art belongs on the uploads volume, through the admin upload, and not in
`client/public`.** The volume is content-addressed, cached correctly and
swappable. `client/public` is served one-year-immutable.

### The writing rules

They apply to every string a member reads and `scripts/check-voice.mjs` enforces
them over `client/src`, `server`, `shared`, `server/seeds/**.json` and
`docs/knowledge/*.md`. It parses with the TypeScript compiler and reads only
real copy, so comments and class names cannot trip it.

1. No em-dashes and no en-dashes. Use a comma, a period, a colon, or a rewrite.
   Hyphens are fine.
2. No contrast framing. State what a thing is.
3. No AI filler vocabulary. The banned list is in the script.
4. No rhetorical-question openers used as filler.
5. No passive inspiration. Say something specific.

`scripts/check-hyphen-dash.mjs` catches the fifth escape route, a hyphen doing a
dash's job, and it scans `client/src` only, on purpose.

A genuine false positive takes an inline `voice-ok: <reason>` on the line, and
the waivers are counted and printed so they stay honest.

**Apply these rules to the copy you draft for the founder as well.** It will
save them an edit later.

### An HTTP 200 does not prove a file exists

The server serves the SPA shell with a status of 200 for any unmatched path, so
that client-side routing works. Four families of path are carved out and answer
an honest 404: `/api/*`, `/assets/*`, `/org/*` and `/.well-known/*`. Everything
else that does not match a route gets `index.html` and a 200.

So when you check whether something is deployed: **read the content type, not
the status code.** A request for a missing document outside those four prefixes
answers `text/html` with a 200, and it looks exactly like success. This has
produced three separate silent failures already, including a member holding a
cached shell requesting a bundle hash that no longer exists and getting HTML
served as JavaScript.

### Everything else

`CLAUDE.md` at the repository root carries the full gate list, and
`node scripts/module-facts.mjs` prints that list straight from the CI workflow,
so it is right on the day you run it. Prefer the script over any block of text,
including the one in `CLAUDE.md` and including this document.

One number to never quote from a document: any budget or line count. This
repository has carried a stale figure twice. Run the script and read your own
tree.

---

## 7. What you cannot know, and must ask

You will be tempted to fill these in, because a blank field looks like a
problem and you are good at producing plausible text. Every one of these is a
place where a plausible answer is worse than an empty field, because the village
publishes it as a fact about itself.

**The land.** Acreage. Boundaries. What is built and what is planned. Water,
access, soil, what grows there. Whether the road is passable in the wet season.
You cannot know any of it and the master plan page will print whatever is
entered.

**The community's own words.** What a member is called. What the recognition
token is called. How they describe what they are doing and why. These are
identity, and identity that arrives from a model is identity nobody owns. Draft
options. Let them choose.

**Money.** Appraised value, projected return, target raise, dues, budgets. These
are financial statements a village makes to prospective members and investors.
Never supply a figure, never estimate one, never carry one over from another
village's site because the shape looked right. If the founder does not have a
number, blank is the correct answer and the page will show nothing.

**Legal status.** Entity type, jurisdiction, what the village may lawfully offer
and to whom, what the exit policy actually says, whether a membership is a
security where they are. The Content tab has a Legal and Jurisdiction Notices
section precisely because these vary by place. You are not their lawyer.

**Every decision about what the village publishes about itself.** Which pages
are public, whether the org chart is published, which modules are on, whether
the village is ready to launch. The launch vote in particular is the village's
own act, and the checklist gates the question and never the answer.

When you hit one of these, say so plainly: "I cannot know this and it is going
to appear on your public page. What is the real number?" A founder told the
truth gives you better material than one handed a guess.

---

## 8. Things you can safely do

A short list, so the rule in section 0 does not read as "do nothing".

- Read every file in this repository, including the long ones, and answer
  questions about them.
- Read `docs/PROVISIONING.md`, `docs/FORK_RUNBOOK.md` and `.env.example` and
  explain any step, variable or trap in plain language.
- Fetch the village's own public pages and `/health`, and report what they say.
- Draft copy, quest text, FAQ answers, taglines, footer sentences, alt text and
  module descriptions, and hand them over as text to paste.
- Read the founder's existing material and propose a mapping from it into the
  fields the wizard asks for.
- Explain what a screen is about to do before they click, and what it will
  change.
- Read the Journey to Launch checklist with them and explain each open item.
- Prepare an image locally, at the right size and format, and hand them the
  file to upload.
- Write down what they decided, so the next session starts from a record.
- Tell them when something in this document disagrees with the code, and trust
  the code.

---

## 9. Where to read next

| For | Read |
|---|---|
| Standing up a new instance, end to end | `docs/PROVISIONING.md` |
| The same walkthrough as a prompt to paste | `docs/FOUNDER_SETUP_PROMPT.md` |
| The long-form reference behind provisioning | `docs/FORK_RUNBOOK.md` |
| The system map | `docs/ARCHITECTURE.md` |
| The white-label architecture and swap points | `PLATFORM_FOUNDATION.md` |
| Every environment variable and what breaks without it | `.env.example` |
| What is in the current release | `CHANGELOG.md` |
| Pinning a version, channels, self-hosting an image | `ops/RELEASES.md` |
| Google sign-in setup | `docs/GOOGLE_SIGN_IN.md` |
| The three visual decisions and how they derive | `docs/DESIGN_TOKENS_SPEC.md` |
| A specific module's contract | `docs/modules/` |
| Contributor rules, gates, and the honest way to run the suite | `CLAUDE.md` |
| Building or changing a fork's modules | `.claude/skills/fork-builder/SKILL.md` |

`MODULES_MASTER_PLAN.md` Part 1 is known-stale. The code wins every
disagreement, with `docs/ARCHITECTURE.md` next.

---

## 10. What is unverified in this document

Written down so that a later reader can tell what was checked from what was
taken on report. Everything not listed here was read in this repository before
it was written down.

- **The order of the setup steps is changing.** A reordering is planned that
  puts the assistant connection first and moves map styling into the map. That
  is a stated intention and it is not in this tree. Section 3 is written by goal
  so it survives the change.
- **The `brand.json` incident.** That somebody wrote to a `brand.json` file on
  the volume and the API kept reporting empty values is reported experience, and
  this document did not verify the event. What was verified is the part that
  matters: no code in this tree reads a file of that name, several documents
  still name it, and the brand record is the `app_config` row.
- **`project.country` and `project.fiatCurrency`** were traced by grep to the
  config merge and to nothing else. No client reader and no admin writer was
  found. A reader may exist that the grep missed, and a lane in flight is
  reported to be changing this area.
- **The paths this document names are not covered by a CI link check.**
  `scripts/check-doc-links.mjs` resolves the paths named by six listed builder
  documents and this file is not one of them. Every path here was resolved by
  hand on the day it was written, and nothing stops one rotting later.
- **Deployment specifics vary by village.** The `/app/data` mount path, the
  Railway service names and the build trigger are read from this repository's
  own Dockerfile and provisioning document. A self-hosted village running the
  published container image may differ. Check `ops/RELEASES.md` for that path.
