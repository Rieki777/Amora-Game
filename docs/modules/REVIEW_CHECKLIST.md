# Module review checklist

Provenance: platform

The human half of intake. Paste the checklist section into the pull request, tick what you verified,
and leave anything you did not verify unticked with a sentence saying why.

**Read this before you write a module.** It is published on purpose: most of the security section is
things you can simply avoid doing, and knowing that in advance is cheaper for everybody than finding
out at review.

## What the machine already did

Do not re-do these by hand. `scripts/validate-module.mjs` runs on every pull request that touches the
registry, and it fails the build on each of them:

| Checked automatically | How |
|---|---|
| Listing shape, tier, credential plane, managed cap | calls the same function the server asserts with at boot |
| A priced listing names a licence slot it owns | registry rule |
| A `member-pii` listing registers a member driver | scans `server/` for the registration |
| Contract doc exists, is on the shelf, declares provenance | reads the shelf allowlist and the file |
| A launch requirement applies to the listing | reads the launch registry |
| Pricing and pool eligibility are not both declared | contract clause 14 |
| Raw `fetch` outside `guardedFetchJson` | greps the diff |
| Raw SQL outside `server/repos` | greps the diff |
| `eval`, `new Function`, non-literal dynamic `import` | greps the diff |
| Writes to the ledger, the capability gate, module lifecycle | greps the diff |
| Credentials written into code | greps the diff |
| New dependencies | compares `package.json` across the diff |

A genuine exception carries `// module-review-ok: <reason>` on the line. Waivers are counted and
printed, so read them: **a waiver is a sentence somebody wrote to get past a gate, and it is exactly
the thing you are here to judge.**

The validator also prints a closing list of what it cannot check. That list and this document are the
same job.

---

## The checklist

### Stage 1 · Diligence

- [ ] **A name and a contact address** for the builder, and the contact resolves.
- [ ] If the listing **charges money** or its `dataClass` is **`member-pii`**: a **named human who
      signs personally**. An individual is a valid counterparty and a company is never required. What
      is required is somebody real who accepts the terms and can be reached.
- [ ] If neither applies, this is a free module touching no member data: **the name and contact are
      the whole requirement.** Do not ask for more.

### Stage 2 · Domain and write surface

- [ ] The listing claims **exactly one** domain. Two domains is two listings.
- [ ] The **write surface is enumerated**: which tables, which columns, under what trigger. "It syncs"
      is not a write surface.
- [ ] Nothing it writes belongs to a **core module** (quests, gratitude, progression, profiles).
- [ ] Nothing it writes belongs to **another domain's** platform-owned table.
- [ ] It **produces no capability answer** and **flips no module lifecycle**.

### Stage 3 · Data, agreement, deletion

- [ ] The declared `dataClass` is the **widest** thing the module's tables hold, never the average. A
      booking, an RSVP and a private message all identify a named person.
- [ ] For `member-pii`: a **signed processing agreement** exists, and the signer is the named human
      from stage 1.
- [ ] For `member-pii`: a **documented hard-delete endpoint**, a **retention period**, and a
      **deletion turnaround** that can be stated to a member in a sentence.
- [ ] Sub-processors are named.
- [ ] There is a written answer to **"what does export return for this domain"**.
- [ ] The `forgetMember` driver **confirms** by reading back and getting nothing. A 200 is not proof,
      and silence is not confirmation.

### Stage 4 · Evidence rule

- [ ] Every record this module can put in front of a **member** carries a **verbatim quote, a source
      anchor, and a timestamp**. Read the code path that renders it, and satisfy yourself the three
      travel together.
- [ ] Anything arriving without all three is **dropped**, and the drop is counted.
- [ ] Nothing it sends is written as **fact**, moves **value**, or decides a **permission**.

### Stage 8 · Setup a founder can complete alone

- [ ] Read the setup steps and ask: could **one founder, in a fresh fork, with the shipped interface
      and the runbook and no conversation**, finish this?
- [ ] Every step that needs a human logging into an outside product is **counted and named**. Each one
      is a permanent per-village cost.
- [ ] The failure path is legible: when the credential is missing, the module's own routes answer 503
      naming who to reach, and **nothing else in the village changes**.

### Clause 13 · Security review

This is the section that has no runtime backstop. The module runs inside every fork's server process,
with that server's database credentials and network access, in villages that never met the builder.
There is no sandbox. **This review is the boundary.**

The validator greps for the patterns below. Your job is the part a grep cannot do: read the diff and
decide whether it does what it appears to do.

- [ ] I **read the whole diff**, not only the registry entry.
- [ ] **Outbound network** goes through the guarded helper, and every host it reaches is one the
      listing **declared**. A declared vendor URL and an undeclared analytics endpoint are not the
      same thing, and only one of them is in the contract.
- [ ] **No raw SQL** outside `server/repos`. Where a repo was added, its queries are parameterised.
- [ ] **No new dependencies.** If there is one, it is justified in the pull request, and somebody
      checked `npm view <pkg> type` alongside `engines`, because CI runs Node 22 and the dev boxes here
      do not.
- [ ] **No writes** to the ledger, the capability gate, module lifecycle, or core-module tables.
- [ ] **No credentials in code.** They belong in the secrets store, write-only and rotatable.
- [ ] **No `eval`, no `new Function`, no dynamic import of a computed or remote specifier.**
- [ ] **No scheduled job** that does something the module's description does not mention.
- [ ] Every `module-review-ok:` **waiver in the diff is one I read and agree with.**
- [ ] Nothing in the diff **weakens an existing guard**: the brand ratchet baseline, the voice waivers,
      the auth-fetch guard, or this checklist itself.

### Stage 5 · Tier, price, and the pool

- [ ] The **credential plane matches the tier**. This is mechanical and the validator checks it; what
      you check is whether the tier is *honest* about who will actually answer the phone.
- [ ] If it declares `pricing`, it is **out of the builders' pool**, and the builder knows that.
- [ ] If it takes the **pool**, the builder has a ReGen Civics account with a linked Hypha and Base
      address. The pool pays an account and never an address pasted into a file.
- [ ] Withdrawal terms are written down **now**, while everyone is friendly.

### Before you approve

- [ ] The gates are green on the **current head** of the branch, not on an earlier push.
- [ ] The listing brief's **one sentence** still describes what the diff does.
- [ ] Anything I could not verify is **written in the review as unverified**, and not silently
      ticked.

---

## Refusing well

A refusal names the stage, says what would change the answer, and does it inside ten working days.
"Does not meet our standards" is not a review. The first response has to do the real work, because an
appeal is a poor substitute for a clear rejection.
