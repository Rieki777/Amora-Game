# i18n: the cheap half, specified but not built

**Status: specification only. Nothing in this document is wired up yet.**
Written 2026-08-31 by the UI lane of the Season 2 fleet programme, on Rye's
ruling R4: "Not at launch, but soon after. Land the cheap half now (message
keys so new prose stops freezing into English-only history); full extraction
after." This is that landing, as a spec a future lane can build from without
re-running the investigation, not as code. Full extraction (below) is
explicitly NOT started here; it is a months-scale project and out of scope
for the wave that produced this document.

## 1. What this is answering, and what it is not

Two DIFFERENT things in this codebase already carry the word "language," and
conflating them is the fastest way to design the wrong system:

1. **Founder-authored content translation.** `WalkEditorPanel.tsx` already
   stores the Welcome Walk per language, `{ en: [...], es: [...] }` in
   `MapWalk` (`shared/mapAddress.ts`), because a village hosting in two
   languages should not have to pick which newcomers get a guided arrival.
   This pattern is real, shipped, and correct for what it does: a FOUNDER
   writing THEIR OWN words in more than one language, stored as data.
2. **Platform UI chrome.** Every button label, heading, error message and
   `aria-label` this codebase's own React components render is a hardcoded
   English string literal baked into JSX. Nobody wrote it twice in two
   languages; it exists in exactly one language because nothing asked for
   another. This is what R4 and this document are about.

The two need different mechanisms and this spec only addresses the second.
A future lane extending founder content translation to more surfaces (module
descriptions, event listings, forum categories) is doing (1)'s job with (1)'s
existing shape, not this one.

Also explicitly out of scope, for the same reason: **server-emitted and
database-stored text.** API error messages, email templates, and anything a
member or founder typed into a form (forum posts, quest descriptions, module
config) are not translated by a UI chrome system and never will be by this
one. A full i18n programme would eventually need its own answer for
server-emitted strings (email templates, validation error text returned as
JSON), but that is a separate catalog with a separate risk profile
(interpolating untrusted data into a translated template is where injection
bugs live) and is not specified here.

## 2. Current state, measured

- **Zero i18n dependency.** No `react-i18next`, `react-intl`/FormatJS,
  `lingui`, or anything else with "intl" or "i18n" in the name appears
  anywhere in `package.json`. Checked directly, not assumed.
- **Zero `.tsx` files reference a translation function.** There is no `t()`,
  no `useTranslation()`, no locale context, nothing to build on top of.
- **Scale of the existing English-only surface**, measured 2026-08-31 across
  `client/src` (249 `.tsx` files, roughly 74,000 lines):
  - At least **1,040** JSX text nodes matching a simple "starts with a
    capital letter, several characters long" heuristic (a deliberate
    undercount; this misses anything assembled with a template literal or
    a ternary, which is common in this codebase, see section 5).
  - At least **402** more string literals in `placeholder=`, `aria-label=`,
    `title=`, or `label=` attributes.
  - That is **at least 1,442 discrete candidate strings, already an
    undercount** of the real number, before touching a single `.ts` file
    (server-side copy like `gateCopy.ts`'s `GATE_LINES`, toast messages, or
    validation errors are not `.tsx` and are not in this count at all).
  - This confirms the founder's own characterization: full extraction is a
    months-scale project, not a wave-sized one, and no attempt was made here
    to shrink that scope by starting on it.

## 3. The cheap half, specified

The goal is narrow and deliberately so: **stop the bleeding, not fix the
wound.** New prose written from today forward should go through a keyed
lookup instead of freezing into another hardcoded literal, so a future
extraction pass has a shrinking target instead of a growing one. Nothing
about how the app looks or behaves changes: with only an `en` catalog
populated, `t("auth.login.heading")` renders the exact string a plain string
literal would have rendered anyway. This is infrastructure, not a feature.

### 3.1 There is already a working precedent in this exact codebase

`client/src/components/modules/gateCopy.ts`'s `GATE_LINES` is, structurally,
already a message catalog: a flat `Record<string, string>` keyed by a stable
id (a module id, in that file's case), looked up through one function
(`gateLine()`), with its own regression test (`gateCopy.test.ts`, referenced
in that file's own header comment) that "walks every `<ModuleGate>` in the
client and fails if a caller has neither an entry here nor a `behind` of its
own," a ratchet against a NEW caller silently going back to hardcoding. The
cheap half generalizes this exact shape from one file's narrow purpose (one
line per module, for signed-out visitors) to the whole UI chrome surface. It
is not a foreign pattern being imported; it is the pattern this codebase
already reached for once, widened.

### 3.2 The catalog

One new file, `client/src/i18n/en.ts`, a nested `const` object (not a
`.json` file: a `.ts` const gets full TypeScript key-checking and
autocomplete for free, `.json` does not without a build step to generate
types from it):

```ts
// client/src/i18n/en.ts
export const en = {
  auth: {
    login: {
      heading: "Sign in",
      subhead: "Members sign in here. If you do not have an account yet, there is a link to create one below.",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Sign In",
      submitting: "Signing in...",
      forgotPassword: "Forgot your password?",
      noAccount: "Don't have an account?",
      createAccount: "Create Account",
    },
  },
  modules: {
    // gateCopy.ts's GATE_LINES could migrate here verbatim once this
    // exists, collapsing two catalogs into one. Not required by the cheap
    // half, worth doing when convenient.
    offNotice: "{project} hasn't enabled this module. Only the team running the village can turn it on, so ask them if you would like it open.",
  },
} as const;
```

Namespaced by FEATURE AREA (`auth`, `modules`, `notifications`, and so on),
not by component file name: a key survives a component being renamed or
split, which happens often in this codebase (see `SignInDoors` being
extracted out of `Messages.tsx` into `ModuleGate.tsx`, per that file's own
comment).

### 3.3 The lookup function

A single small file, `client/src/i18n/t.ts`. No library, because a library
buys pluralization engines, ICU message format, and a loader/bundler plugin
this project does not need yet, and "least ceremony" was the explicit
instruction for the other piece of infrastructure this wave built (the test
harness); the same standard applies here:

```ts
// client/src/i18n/t.ts
import { en } from "./en";

type Leaves<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : { [K in keyof T & string]: Leaves<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K}`> }[keyof T & string];

/** Every valid key, computed from the catalog itself. A typo is a compile
 *  error, not a blank string in production. */
export type MessageKey = Leaves<typeof en>;

function resolve(key: string): string {
  const parts = key.split(".");
  let node: unknown = en;
  for (const p of parts) node = (node as Record<string, unknown>)?.[p];
  return typeof node === "string" ? node : key;
  // A missing key renders ITSELF, loudly, in place of a blank space a QA
  // pass could miss. The same "never silently ok" instinct this wave's
  // other guards follow.
}

/** `{name}`-style interpolation, the shape gateCopy.ts and ModuleOff's own
 *  inline template literal already use today, so migrating an existing
 *  string costs nothing conceptually. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = resolve(key);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
```

Usage, replacing the hardcoded string directly:

```tsx
// before
<h1 className="text-4xl font-display font-bold text-teal-deep mb-2">Sign in</h1>

// after
<h1 className="text-4xl font-display font-bold text-teal-deep mb-2">{t("auth.login.heading")}</h1>
```

And the interpolated case, `ModuleOff` (`ModuleGate.tsx`):

```tsx
// before
<p className="text-muted-foreground mb-6 max-w-md mx-auto">
  {project} hasn't enabled this module. Only the team running the village can
  turn it on, so ask them if you would like it open.
</p>

// after
<p className="text-muted-foreground mb-6 max-w-md mx-auto">
  {t("modules.offNotice", { project })}
</p>
```

No hook is needed for a static, build-time-known locale: `t` is a plain
function, importable anywhere, server components included if this codebase
ever grows any. A `useT()` hook only earns its keep once a second locale
exists and a component needs to re-render when the viewer switches it; that
is explicitly full-extraction territory (section 5), not the cheap half.

### 3.4 The convention going forward

The only behavior change this wave is asking of anyone: **new user-facing
copy gets a key in `client/src/i18n/en.ts` and a `t(...)` call, not a string
literal.** Existing copy is untouched; converting it is the full extraction
project, and touching roughly 1,500 strings now for zero user-visible
benefit (only `en` exists) is exactly the kind of unscoped bite this wave's
own brief warned against making.

## 4. What the cheap half deliberately does NOT do

- **Does not convert any existing string.** Every one of the roughly 1,442
  counted in section 2 stays exactly as it is until a dedicated extraction
  project runs.
- **Does not add a locale switcher, a second locale file, or any UI for
  picking a language.** There is nothing to switch to yet.
- **Does not solve pluralization.** `NotificationBell.tsx`'s
  `` `Marked ${marked} ${marked === 1 ? "notice" : "notices"} read` `` stays
  hand-written exactly as it is. English's singular/plural split does not
  generalize; Slavic languages have three or four plural forms keyed off the
  number itself, not just "is it 1", and solving that properly needs an
  ICU-plural-aware catalog format, which is real scope, not a naming
  convention. Flagged here so a future lane does not discover it mid-build.
- **Does not solve list-conjunction grammar.** `gateCopy.ts`'s `nameList()`
  hardcodes the English "A, B and C" shape (no serial comma, "and" as the
  final joiner). Other languages join lists differently. Same answer as
  pluralization: real scope, explicitly deferred, not solved by a key
  rename.
- **Does not address RTL layout, date/number formatting, or font coverage**
  for a language whose script this platform's current font stack (Raleway,
  Montserrat, Kalam, per `client/src/index.css`) does not cover.
- **Does not touch server-emitted or database-stored strings** (section 1).
- **Does not add a lint/CI ratchet against new hardcoded strings.** This
  wave's brief explicitly asked for a specification, not a build, and a
  ratchet without the infrastructure to route violations to is a guard with
  nothing to enforce. Once section 3 lands, a `check-i18n-strings.mjs` in
  the same family as this wave's `check-theme-literals.mjs` and
  `check-tailwind-gray.mjs` (same per-file baseline, same refusal to raise
  it) is the natural next guard, and is recommended explicitly as the
  follow-up after section 3 ships, not part of it.

## 5. Sizing the full extraction, for whoever picks this up next

Not started, and not estimated lightly. The measurement in section 2 is a
floor, not a real count, because it excludes:

- Template-literal and ternary-composed copy (`` `${x} unread` `` style
  strings, common in `NotificationBell.tsx` and elsewhere), which a
  substring/regex sweep like section 2's cannot safely enumerate. Some of
  those interpolations are DATA (a person's name, a number), not copy to
  translate, and telling the two apart needs a human or a much smarter tool
  than a grep pass.
- Every `.ts` file's copy (`gateCopy.ts`'s 18 module lines are real UI copy
  and are not `.tsx`, so section 2's count misses them entirely; there will
  be more like it).
- `toast.error(...)` / `toast.success(...)` calls and `setError(...)`
  strings, both extremely common in this codebase's form-handling pattern
  (Login.tsx and Register.tsx alone carry several).
- Copy assembled server-side and merely rendered client-side (server error
  responses surfaced via `err.message`, in the exact pattern Login.tsx's own
  `catch (err) { setError(err instanceof Error ? err.message : "Login
  failed") }` shows). The server's error strings are a THIRD catalog this
  spec does not size.

A realistic scoping pass for whoever picks this up: budget for closer to
2,000 discrete strings once template literals and `.ts` files are counted
properly, plus the pluralization and list-grammar work in section 4, plus a
real QA pass (a translated string that overflows its container, or breaks a
`min-h-[44px]` tap target, is a defect this project's own `scripts/qa/`
sweep tooling does not check for today). This is why R4 called it "months,"
and nothing found while writing this spec argues that estimate is wrong.

## 6. Recommended first step, when this is picked up

1. Land section 3 verbatim (the catalog file, the `t()` function, no other
   changes), a near-zero-risk PR, since with only `en` populated the
   rendered output is byte-identical to today.
2. Convert ONE small, low-traffic page fully (a good candidate:
   `ResidentRights.tsx` or `WhyCostaRica.tsx`, per this programme's own
   tokens-lane notes: "ResidentRights.tsx has 1 [colour literal],
   WhyCostaRica.tsx and ProjectHistory.tsx have none," small, self-
   contained, low blast radius) as a worked example other contributors can
   copy the shape from, and to prove the `t()` mechanism against a real
   page rather than only the two snippets in section 3.3.
3. Only then decide whether a `check-i18n-strings.mjs` ratchet (section 4)
   is worth building, and whether the full extraction is scheduled as its
   own dedicated project or folded gradually into normal feature work
   touching each page anyway.

Nothing above requires reversing a decision made elsewhere in this codebase;
it is additive infrastructure sitting beside roughly 1,442 untouched strings
until someone deliberately migrates them.
