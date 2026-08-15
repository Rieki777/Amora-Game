# Assisted diligence: turning a vendor package into a stage 1 to 3 artifact table

Provenance: platform

For the maintainer, not the builder. When somebody proposes a listing and hands over a pile of
documentation, this is how you turn that pile into the three artifact tables the process asks for,
without reading four hundred pages yourself and without the assistant filling the gaps in with
plausible sentences.

It produces a **draft**. Stage 1 to 3 exit gates are human decisions and stay that way. What this
removes is the transcription work, which is most of the hours and none of the judgement.

## What good output looks like

The shape is a table per stage, one row per required artifact, each row marked `confirmed`, `partial`
or `missing`, and each non-missing row citing where the fact came from.

The worked example is the diligence pass that was run on the first real vendor. Those documents live
in the integration hub repository, not in this one:

```
docs/integration-program/lane-s/STAGE0_DATA_AUDIT_AND_ACCESS_REQUEST.md
docs/integration-program/lane-s/STAGE1_DILIGENCE_REQUEST_LETTER.md
docs/integration-program/lane-s/STAGE2_DOMAIN_ASSIGNMENT_SIGNALS.md
docs/integration-program/lane-s/STAGE3_DATA_AND_LEGAL_CHECKLIST.md
docs/integration-program/vendor-saberra-package/
```

Read the stage 1 file before you run this. It is the standard: eight artifact rows, seven of them
marked missing, and a plain sentence saying that being a live tenant and knowing the people is not
diligence. **That is a successful diligence pass.** A table full of `confirmed` on a first run usually
means the assistant inferred rather than read.

## The prompt

Start a session in a directory holding the vendor's package. Paste everything between the lines.

---

You are helping with vendor diligence for a module library. I will point you at a vendor's
documentation package. Your job is to produce three artifact tables, for stages 1, 2 and 3, and
nothing else.

**The rules, and they matter more than the output.**

1. **Every cell is `confirmed`, `partial` or `missing`.** Nothing else.
2. **`confirmed` requires a citation**: the file and the line or heading where you read it. If you
   cannot cite it, it is not confirmed.
3. **Never infer.** If the package implies a company exists but never names the legal entity, the
   legal entity is `missing`. If an email address appears but nobody is named as the counterparty,
   that row is `partial` and you say exactly what is thin about it.
4. **A marketing claim is not evidence.** "Enterprise-grade security" is `missing` for every row it
   might have covered. A named sub-processor list is evidence.
5. **Documentation is not evidence of behaviour.** Anything about what an API returns is at best
   `partial` until a live call has returned it. Say so in the row.
6. **You may not fill a gap with a reasonable assumption.** A gap is the output. The gaps are what the
   maintainer sends the vendor.
7. If you are unsure whether something counts, mark it `partial` and explain the doubt in the cell.

**Stage 1, diligence.** Rows: builder name; contact address that resolves; whether the listing charges
money; whether its data class is member personal data; and, only if either of those last two is yes, a
named human who will sign personally, plus terms URL, status page, exact product URL. Note that a legal
entity is NOT required: an individual signing personally is a valid counterparty. Do not mark a row
missing because there is no company.

**Stage 2, domain assignment.** Rows: the single domain this listing claims; the current holder if
any; what the platform owns versus what the driver caches; and the enumerated write surface, table by
table. If the package does not enumerate the write surface, that row is `missing`, however much it
describes syncing.

**Stage 3, data and legal.** Rows: data classification; processing agreement; named sub-processors;
retention period; hard-delete endpoint; deletion turnaround; and what export returns for this domain.

**After the three tables**, add two short sections:

- **Blocking**: the rows that stop the listing today, in priority order, each phrased as the specific
  question to ask the vendor.
- **What I could not read**: anything in the package you could not open, could not parse, or ran out of
  context on. Name the file. An unread file is not an empty one.

Do not write a recommendation. Do not summarise the vendor's product. Do not write anything
persuasive. The tables and those two sections are the whole deliverable.

---

## After it runs

- **Check the citations.** Open two or three `confirmed` rows and verify the cited line says what the
  table claims. This is the step that catches a session that started inferring, and it takes a minute.
- **Send the blocking list.** It is already the letter, near enough, and the stage 1 file linked above
  is the tone: administrative, specific, and clear about which items block.
- **Keep the table.** It becomes the stage 1 to 3 record, and at stage 9 you re-run it against the
  same vendor and diff the two.

## What this does not do

It does not do stage 4. Technical proving needs a sandbox tenant and one real captured payload per
operation, and no reading of documentation substitutes for a live call returning real JSON.

It does not do clause 13. The security review reads a diff of code somebody wrote for this platform,
which is a different job from reading a vendor's documentation, and it is on
`docs/modules/REVIEW_CHECKLIST.md`.
