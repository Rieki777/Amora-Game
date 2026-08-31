# Founder setup prompt

Copy everything below the line into a fresh Claude Code session (or Claude
with terminal and file access) and send it. You do not need to know how to
code or use a terminal; Claude will run every command. Read each step's
result before saying "go ahead" to the next one, and stop and ask a human
(ReGen Civics, or whoever set you up with this link) if anything Claude
reports does not match what you expected.

---

I am a community founder setting up my own instance of a village
coordination platform (the repository is `game-amora`). I have never used a
terminal and I am not a developer. You are going to do the technical work; I
am going to make the decisions and hand you the account access you hold
yourself (Railway login, domain DNS, Resend, Stripe). Do not ask me to paste
a password or an API key into this chat. Instead, tell me exactly where to
go and what to click, wait for me to say it is done, and where possible use
your own terminal or browser access once I have logged you into an account.

Start by reading `docs/PROVISIONING.md` in this repository in full. That
document is the source of truth; treat this prompt as your task list and
that document as the manual you follow to complete each item. If the two
ever disagree, `docs/PROVISIONING.md` wins and tell me so.

Work through this list in order. After each numbered step, tell me plainly
what you did, what I need to do myself (if anything), and wait for my
confirmation before moving on. Do not skip ahead.

## First, ask me these questions

Before doing anything else, ask me:

1. **My village's name.** The real name, exactly as I want it to appear.
2. **My own email address**, the one I will use to run this village.
3. **Which path I am on**: am I self-hosting (I hold my own Railway
   account), or is ReGen Civics hosting this for me?
4. **Do I have a domain already**, and if so, what is it? If not, tell me
   that is fine and we will add it later.
5. **Will I be selling anything with a card** (stays, memberships, anything
   paid) at launch, or is that a later decision? If it is later, we skip the
   Stripe steps for now and I can ask you to come back to them any time.

Do not proceed past this point until you have my answers to all five.

## Then, work through docs/PROVISIONING.md in order

1. **Confirm Railway access.** If I am self-hosting, walk me through
   creating a Railway account if I do not have one, and tell me exactly
   what to ask ReGen Civics for (repository access) so your Railway project
   can build from it. If ReGen Civics is hosting, confirm with me that they
   have told me the project exists, and ask me for anything you need from
   me to proceed (usually nothing until step 7).

2. **MySQL and the uploads volume.** Guide me through adding a MySQL service
   and a volume mounted at `/app/data` in the Railway project, or confirm
   ReGen Civics has already done this for a hosted instance.

3. **Generate environment variables.** Run
   `node scripts/fork-init.mjs --village-name "..." --admin-email "..." --domain "..."`
   with my answers from above (omit `--domain` if I do not have one yet).
   Show me its full output. Save the one-time bootstrap password it prints
   somewhere I can find again; I will need it in step 6. Then tell me,
   plainly, which variables it could not fill in and why, and help me get
   each one where required (Stripe and Resend need their own accounts,
   which come later in this list; skip those for now).

4. **Copy the generated values into Railway.** Walk me through Railway's
   Variables tab for my service (or do it yourself if you have Railway CLI
   access I have logged you into), pasting in what `fork-init.mjs` printed.

5. **Email setup.** Walk me through creating a Resend account and verifying
   my sending domain. This needs me to add DNS records; tell me exactly
   what they are and where to paste them if I tell you who manages my
   domain. Remind me clearly: an unverified domain looks like it works
   (Resend answers success) but delivers nothing, silently. Do not let me
   move on thinking email works until I have confirmed the domain shows
   verified in Resend's own dashboard.

6. **Deploy, migrate, and bootstrap.** Confirm the first deploy is live at
   `/health`, run the database migrations, then run the bootstrap `curl`
   command from `docs/PROVISIONING.md` step 6 using my email and the
   one-time password from step 3. Give me the link it returns (or confirm
   the email arrived) so I can set my real password.

7. **Make it mine.** Once I am logged in, tell me to go to Admin, Make This
   Yours, and walk me through the wizard steps at a pace I am comfortable
   with: name and tagline, pictures, dues and budgets, page copy, map
   styling. This is where my village actually starts looking like mine, and
   you cannot do this part for me since it is choices, not typing.

8. **Payments**, only if I said yes above. Walk me through creating my own
   Stripe account, and setting the webhook up exactly as
   `docs/PROVISIONING.md` step 8 describes. Tell me clearly which of the
   five webhook events matter and why, in plain language, not the technical
   reasoning.

9. **Smoke test.** Run `scripts/smoke-all-modules.mjs` against my live
   domain and tell me, in one or two sentences, whether it passed. If
   anything failed, tell me what and whether it is something you can fix or
   something that needs a human step from me.

10. **Wrap up.** Give me a short plain-language summary: what is live, what
    I still need to do myself (a domain, a Stripe account, anything else
    that only I can do), and where to find `docs/PROVISIONING.md` and
    `docs/FORK_RUNBOOK.md` if I want to read the reasoning behind any of
    this later.

Throughout: if a step in `docs/PROVISIONING.md` names something as a
human-only step (DNS, Resend domain verification, creating a Stripe
account), do not try to do it yourself or work around it. Tell me exactly
what to do and wait.
