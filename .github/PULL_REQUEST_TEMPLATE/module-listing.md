# Module listing

Use this template for a pull request that adds or changes a module listing. If you are only fixing a
bug in an existing module, use an ordinary pull request instead.

New here? Read `docs/modules/START_HERE.md` first, then run `node scripts/module-facts.mjs`.

**Fill this in honestly.** An unticked box with a sentence saying why is a good answer and costs you
nothing. A ticked box that turns out to be untrue is the fastest way to lose a reviewer's trust, and it
is the one thing that will send a listing back to the start.

---

## What it is

**One sentence naming the capability, without marketing words:**

<!-- This is stage 0. It gets reused in the catalog and in the review. -->

| | |
|---|---|
| Module id | |
| Tier | `included` / `connected` / `managed` |
| Data class | `none` / `village-content` / `member-pii` |
| Domain it claims (`provides`) | |
| Does it charge money? | yes / no |
| Pool eligible? | **no if it charges, yes if it does not** |

## Who built it

| | |
|---|---|
| Builder name | |
| Contact address | |

**Anyone can build a module.** For a free module that touches no member personal data, the two rows
above are the whole requirement. No company, no jurisdiction, no terms URL.

### Only if it charges money, or its data class is `member-pii`

A processing agreement cannot be signed by nobody and a price cannot be owed to nobody, so these
listings need a counterparty who signs.

| | |
|---|---|
| Named human who signs personally | |
| Terms URL | |
| Status page URL | |
| Exact product URL | |

**An individual is a valid counterparty.** A company is welcome and is never required. What is
required is that somebody real accepts the terms, is named, and can be reached.

### Only if it takes the builders' pool

Free modules are paid from a recurring $ReGen distribution, proportional to how many known villages
run the module. Declaring a price takes a listing out of the pool by construction; see contract
clause 14.

- [ ] I have a **ReGen Civics account**, and a **Hypha account with a linked Base address**, set up
      through profile setup.

The pool pays an account, never an address written into a registry file. Do not put a payout address
in this pull request.

### Only if the data class is `member-pii`

| | |
|---|---|
| Processing agreement signed by | |
| Hard-delete endpoint | |
| Retention period | |
| Deletion turnaround we can state to a member | |
| Sub-processors | |
| What export returns for this domain | |

---

## The stages

Tick what is true. Stages 6 through 10 are ours and the builder leaves them alone.

- [ ] **0 · Intake.** The sentence above names one capability and one domain.
- [ ] **1 · Diligence.** The counterparty rows above are filled in to the depth this listing needs.
- [ ] **2 · Domain.** One domain. The **write surface is enumerated** below, table by table.
- [ ] **3 · Data and legal.** Classification is the widest thing the module holds. For `member-pii`,
      the rows above are complete.
- [ ] **4 · Technical proving.** Where this reaches an outside service: a sandbox tenant, and **one
      real captured payload per operation**. Documentation is not evidence.
- [ ] **5 · Tier and commercials.** The credential plane matches the tier. Withdrawal terms are
      written down.

**Enumerated write surface** (which tables, which columns, under what trigger):

<!-- "It syncs" is not a write surface. -->

## The contract

- [ ] I have read `docs/MODULE_LIBRARY_CONTRACT.md`, including the appendix saying which clauses are
      machinery and which rest on a human.
- [ ] **Clause 13.** I understand this code runs inside every fork's server process with that server's
      database credentials and network access, that there is no sandbox, and that a human security
      review is required before merge.
- [ ] **Clause 2.** Where this reaches an outside service, `exportMember` and `forgetMember` are
      implemented, and `forgetMember` confirms by reading back and getting nothing.
- [ ] **Clause 3.** Anything a member will read carries a verbatim quote, a source anchor and a
      timestamp.
- [ ] **Clause 4.** When the service is unavailable, this reports unavailable and the rest of the
      village keeps working.
- [ ] I accept that a lapse may stop my own paid operations and **may not** disable a village surface,
      lock an admin screen, or alter village data.

## Security

The listing lint greps the diff for these and will fail the build. Confirming them here means you
looked, and the reviewer reads the diff regardless.

- [ ] No raw `fetch` outside `guardedFetchJson`.
- [ ] No raw SQL outside `server/repos`.
- [ ] No new dependencies. (If there is one, justify it here and say what `npm view <pkg> type`
      returned; CI runs Node 22 and dev boxes often do not.)
- [ ] No writes to the ledger, the capability gate, module lifecycle, or core-module tables.
- [ ] No credentials in code.
- [ ] No `eval`, no `new Function`, no dynamic import of a computed or remote specifier.
- [ ] Every host this reaches is declared on the listing.
- [ ] Any `// module-review-ok:` waiver in this diff is explained below.

**Waivers in this diff, and why:**

## Gates

Run them cold, in the order `node scripts/module-facts.mjs` prints.

- [ ] All gates green on the current head of this branch.
- [ ] `node scripts/validate-module.mjs <module-id>` is clean.
- [ ] `node scripts/validate-module.mjs <module-id> --diff` is clean.
- [ ] I read the validator's closing list of what it **cannot** check, and nothing on it is a problem
      I am hiding.

---

## What happens next

Within minutes an automated check comments naming the first stage that is blocking. Within ten working
days a human answers the parts that need judgement, with specifics. A refusal names what would change
the answer.
