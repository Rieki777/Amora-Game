# The bell as a place: what the field knows, and what this village chose

Research behind the notification work in round 5, lane NOTIFY. Every claim here carries its
source. Where the popular version of a claim turns out to be marketing or folklore, it is
marked and the honest version is given instead, because a design doc that launders a vendor
statistic into a rule is worse than a doc with a gap in it.

Part 1 is what the field knows. Part 2 is what this village built, and what it refused.

---

## Part 1: what the field knows

### 1. Deep linking: the object AND the state

**A notification click is a real navigation with real history.** Android's notification
navigation spec is the clearest primary statement of it and it ports straight to the web. It
splits destinations in two: a *regular* screen, which must synthesise the back stack so Back
walks up the normal hierarchy, and a *special* screen that exists only as an expansion of the
notification, which gets no back stack at all
(https://developer.android.com/develop/ui/views/notifications/navigation). The web reading: a
notice about a ballot lands on the ballot, and Back goes to the governance page, never to a
dead end and never out of the app.

**Landing scrolled-to is an accessibility requirement, not a nicety.** `scroll-margin-top` on
the target is the documented fix for a deep-linked element landing under a sticky header
(https://css-tricks.com/fixed-headers-and-jump-links-the-solution-is-scroll-margin-top/), and
WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum), Level AA, names sticky headers explicitly:
failure F110 is a sticky header completely hiding a focused element
(https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). After
scrolling, focus must move to the target (via `tabindex="-1"`), so a screen reader user
arrives where a sighted user arrives. A visual highlight alone is invisible to assistive
technology.

**Permission-scoped links: 404, never 403.** Slack's deep-linking documentation states that
for a private conversation the signed-in user must be a member, and if they are not, or if the
channel does not exist, they get an HTTP 404 (https://docs.slack.dev/interactivity/deep-linking/).
The conflation is deliberate: a 403 leaks the existence of a private object.

**The most important architectural finding in the whole sweep is GitHub's phantom
notification.** GitHub's community forums carry many reports of notifications from repositories
the reader was removed from or that were deleted, which then cannot be dismissed, because the
triage action tries to resolve the repository object and fails
(https://github.com/orgs/community/discussions/178323,
https://github.com/orgs/community/discussions/45020). The reported workaround, mark-all-read at
the top level, works because it processes rows without validating each against a live object.
The lesson: **a notification row must carry enough of its own text to render and be dismissed
without resolving its target.** GitHub's own documentation is silent on this
(https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/about-notifications).

Knock's model makes the same point positively: the notification stores an `action_url` resolved
at send time, so it is a snapshot by construction (https://docs.knock.app/integrations/in-app/knock).

**Deferred deep linking is a mobile install problem and does not apply to a web bell**
(https://en.wikipedia.org/wiki/Mobile_deep_linking). One thing does transfer: the documented
dominant failure is initialisation ordering, where routing runs before the payload arrives and
the intent is silently lost. The web equivalent is a notification link that requires sign-in.
If the sign-in redirect does not round-trip the full original path including query and hash,
the intent dies exactly the same way.

*Flagged:* on stale deep links (an object whose state changed since the notice was written) no
primary UX source was found. Everything is system-design blog posts. Treat the handling below
as a house judgment, not an industry rule.

### 2. Grouping, digesting, batching, and what "unread" means

**Android gives the one citable number: four.** `setGroup(groupKey)` assigns membership and
`setGroupSummary(true)` designates the header, which is required for grouping to engage. If an
app posts **four or more** notifications without specifying a group, Android 7.0 and later
groups them automatically with a system-generated summary. The summary is required to carry
snippets from the children (`InboxStyle.addLine()` per child), and `setGroupAlertBehavior()` is
the mechanism for "twenty events, one ping": let the summary alert and silence the children
(https://developer.android.com/develop/ui/views/notifications/group).

iOS does the same job with `threadIdentifier`, plus a `summaryArgumentCount` that lets one
notification contribute more than 1 to the group's displayed total, which is exactly what a
batched row needs. *Flagged:* developer.apple.com is JS-rendered and returned only page titles,
so everything on Apple here is secondary
(https://wwdcnotes.com/documentation/wwdc18-711-using-grouped-notifications/).

**GitHub's per-thread model is the one that fits a ballot or a quest.** The unit is the thread,
not the event: twenty comments on one issue is one inbox row that updates. Subscription is the
grouping key and is earned automatically by opening, commenting, being mentioned, being
assigned. Every notification carries a `reason` that is both displayed and filterable
(https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox).

**Two independent axes, and this is the key insight.** GitHub keeps read/unread (has your eye
been on it, reversible) separate from Done (have you dealt with it, removes the row, retained
five months). The documentation is explicit that "Mark as read" keeps the row in the inbox and
only Done removes it. Linear does the simpler version, with `U` to toggle read and `H` to
snooze, and says outright that it does not support archiving notifications
(https://linear.app/docs/inbox).

**Seen is not read, and that resolves the "read on open" argument.** Both major notification
vendors implement the same three states. Knock: **unseen** (not yet rendered, and this is what
drives the badge), **seen** (rendered because the panel opened, set automatically, clears the
badge), **read** (explicitly marked by the reader)
(https://docs.knock.app/integrations/in-app/knock). Novu says the same in one sentence: "A
notification is marked as seen when the user views the notification. A notification is marked
as read when the user confirms the notification"
(https://docs.novu.co/framework/typescript/steps/inApp).

So opening the bell should quiet the badge and must not erase which rows the reader has
actually dealt with. Read-on-open is only an antipattern where it collapses both states into
one. Optimizely's CMS 11.19.0 collapsed them deliberately, and the release notes' own rationale
is instructive: readers were seeing the badge return on reload and giving up on notifications
entirely (https://world.optimizely.com/blogs/ryan-bare/dates/2019/3/marking-notifications-as-read-automatically/).
Real problem, information-destroying fix.

On storage: a seen-up-to cursor is cheap but cannot represent a read row above an unread row,
so per-item state is required the moment "mark as unread" exists
(https://getstream.io/blog/build-activity-feed/).

**Intercom on the honesty of read state** is the best primary source on the social cost of
getting this wrong: show both states rather than only the positive one, do not let it be
disabled or everyone opts out and the signal dies, and delay the "Seen" marker until an agent
actually begins responding, so triage does not raise false expectations
(https://www.intercom.com/blog/product-principles-read-receipts/). A seat holder glancing at a
ballot notice is not the same as a seat holder engaging with the ballot, and conflating them
manufactures an obligation that is not real.

**"Mark all read" without it feeling like data loss.** No primary design-system source found.
The best-supported pattern is to replace confirmation with undo, and to size friction to damage
and irreversibility (https://blog.logrocket.com/ux-design/ux-reversible-actions-framework/).
The structural answer beats the UI answer: if read is a display state and not a deletion, the
action cannot lose anything.

**Batching is well evidenced; specific cadences are not.** Kushlev et al., a randomised field
experiment with 237 participants, found that batching notifications **three times a day** left
people more attentive, more productive, in a better mood and more in control, while **hourly
batching produced little change** against control. The finding that matters most for a village
app: participants who received **no** notifications at all reported **higher** anxiety and
fear of missing out than the batched group
(https://www.sciencedirect.com/science/article/abs/pii/S0747563219302596). There is a sweet
spot and both extremes are worse than it. Baseline volume from Pielot, Church and de Oliveira
(MobileHCI '14 best paper): participants handled 63.5 notifications a day, more notifications
correlated with more negative emotion, and more messages and social updates also made people
feel more connected, both effects in the same study
(https://pielot.org/pubs/Pielot2014-MobileHCI-Notifications.pdf).

*Flagged:* Slack's per-channel batching windows are described everywhere and authored nowhere.
The one genuine Slack Engineering piece found is about tracing, not batching, though it carries
a useful datum: notification tickets had the lowest NPS scores and the longest resolution times
of any category (https://slack.engineering/tracing-notifications/). Email digest cadence
numbers are vendor marketing throughout; no research found. Use Kushlev.

### 3. The blurb: one line carrying who did what, to what, and why it matters

**NN/g's four criteria are the closest thing to a formula from a primary research source:**
personally relevant, appropriately timed, non-repetitive, sufficiently informative
(https://www.nngroup.com/videos/smartwatch-notification-formula/).

**The load-bearing rule is self-sufficiency.** A notification must convey a fully formed idea
without the reader going elsewhere to understand it, and because it is not about what the
reader just did, it needs substantially more context than a validation message, where task
context can be assumed (https://www.nngroup.com/articles/indicators-validations-notifications/).
This is the whole argument for naming the object. "Your item was updated" assumes a context the
reader does not have. "Mira changed the closing date on the well repair ballot" carries its own.

**Shopify is the most specific on microcopy** (https://shopify.dev/docs/apps/design/user-experience/alerts):
toast messages three words or fewer; errors placed as close to the problem as possible; no
scary language, technical terms or jargon; no humour, idioms or phrases that will not
translate; never colour alone for warning or error, always pair with an icon; and error text
must tell the reader what happened and offer a path forward. Shopify also draws the *system
alert* against *task alert* line: a task alert is direct feedback on what you just did, a
system alert is app-initiated and out of context. A notification centre is almost entirely
system alerts, which is exactly why the copy has to work harder.

**Mailchimp** gives one hard checkable rule and a set of principles: never use exclamation
points in failure messages or alerts; write clear, useful, friendly and appropriate copy;
"avoid dramatic storytelling and grandiose claims"; and treat everything from homepage copy to
system alerts as warm and human (https://styleguide.mailchimp.com/writing-principles/,
https://styleguide.mailchimp.com/grammar-and-mechanics/).

**Atlassian names the moment the playful voice switches off.** Its voice is "bold, optimistic,
and practical, with a wink", and it documents "knowing when not to wink", naming error states
as the moment to drop it (https://atlassian.design/content/voice-and-tone-principles/). For a
village with an economy and a governance system, that list is concrete: a ballot you lost, a
claim that was declined, a balance that ran out, a seat you did not get.

**NN/g's error-message guidelines** transfer directly: human-readable with no codes, concise
and precise, constructive, positive and non-blaming, and **avoid humour, because it goes stale
on repeat encounters** (https://www.nngroup.com/articles/error-message-guidelines/). A
notification centre is the highest-repetition surface in any product. A joke read two hundred
times is not a joke.

*Flagged:* "front-load the line because it will be truncated" could not be sourced to any
primary design system. It is real practice and a derived consequence of the medium, so it is
stated here as a house rule rather than a citation. Same for numerals-always-in-UI. The
anti-log rule ("Status changed from A to B") has no primary source either; the closest support
is NN/g's self-sufficiency plus Atlassian's "what they need to know at that moment and nothing
more". The honest framing: a notification says what a neighbour would say out loud, and the
diff lives on the object's own page.

### 4. Game feel, and the failure modes stated honestly

**Variable-ratio reinforcement is the mechanism.** Variable ratio schedules produce the
highest, steadiest response rate and the slowest extinction, and anticipatory dopamine is
strongest when reward timing and magnitude are uncertain. Tristan Harris's framing names
notifications, pull-to-refresh and infinite scroll as the delivery vehicles
(https://medium.com/thrive-global/how-technology-hijacks-peoples-minds-from-a-magician-and-google-s-design-ethicist-56d62ef5edf3);
peer-reviewed treatment at
https://www.sciencedirect.com/science/article/pii/S0306460323000217.

The consequence for this product is unusually favourable and worth stating plainly. A village
already has a naturally variable reward schedule, because gratitude, quest consents and ballot
outcomes genuinely arrive unpredictably. **The variability is real, so none of it needs
manufacturing.** The line to hold: never synthesise uncertainty that is not there. No fake
"something is waiting", no delayed reveals, no randomised drip of things that already happened.

**Duolingo's bandit is the best-documented "keep the feed fresh" engineering**: each arm is a
notification template, and the core insight is novelty decay, so a repeated template yields
diminishing returns and recovers value as time passes since last use. Replication data: 200
million practice reminders over a 35-day period
(https://research.duolingo.com/papers/yancey.kdd20.pdf). Reported lifts of +0.5% DAU, +0.4%
lessons and +2% new-user retention come from a third-party summary
(https://eugeneyan.com/writing/push/), not the research index. **Note the magnitudes.** A
world-class machine-learning notification system moved daily actives by half a percent, which
is a useful sanity check against overclaiming for anything gamified.

**Volume optimisation beats volume.** Pinterest cut notification volume 6 to 24% while raising
click-through 11 to 31% and site engagement 1 to 3%, by shifting volume away from highly active
readers toward marginal ones, and modelled unsubscribe probability directly after finding that
high-volume pushes drove short-term engagement and long-term desensitisation. LinkedIn splits
notifications into **unfiltered** (person-to-person messages, invitations, always delivered)
and **filter-eligible** (everything else, subject to selection, volume and timing models)
(https://www.linkedin.com/blog/engineering/messaging-notifications/air-traffic-controller-member-first-notifications-at-linkedin).
That split is a clean architecture for a village: somebody named you in a ballot is unfiltered,
a quest you might like is filter-eligible.

**Badges reliably capture attention, and that is measured.** Bartoli and Benedetto, PLoS One
2022, a between-subjects first-click test with 1,095 participants: "The presence of the
notification badge systematically captures more clicks with respect to the condition in which
the badge is unavailable", explained through salience bias and urgency bias
(https://pmc.ncbi.nlm.nih.gov/articles/PMC9246170/).

*Flagged, and this is the important part:* that study used **numeric badges only** and did not
compare dots to numbers, and it did not measure pressure, annoyance or checking behaviour. **No
research comparing dot to numeral badges was found.** The claim that dots reduce anxiety
appears only in vendor content. Material 3's component model does at least document the two
shapes: a small badge is a dot conveying only "something new here", a large badge carries a
number with a max-count cap producing "999+" overflow (https://m3.material.io/components/badges,
API specifics via https://composables.com/material3/badgedbox).

**One myth to refuse outright.** The famous "23 minutes 15 seconds to recover from an
interruption" is not in any of Gloria Mark's papers. It came from a 2006 Gallup interview, and
careful debunkings found none of the five commonly cited papers contain it
(https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html). The most-cited paper, *The
Cost of Interrupted Work: More Speed and Stress* (CHI 2008), found close to the opposite of the
popular claim: interrupted people work **faster**, with measurably more stress, more
frustration, higher time pressure and more effort (https://ics.uci.edu/~gmark/chi08-mark.pdf).
Cite the stress, never the 23 minutes.

**Streak numbers are marketing.** Every streak-efficacy figure found (churn 47% to 28%,
retention 12% to 55%, "commitment up 60%", "3x more likely to reach intermediate proficiency")
traces to vendor blogs with no primary link. The mechanism, loss aversion on an accumulated
asset, is real and uncontroversial. The effect sizes are not evidence. The widely-repeated
"62% felt guilty, 34% felt anxious" Duolingo survey has no locatable underlying survey at all.

**Deceptive design has teeth now.** The FTC's *Bringing Dark Patterns to Light* staff report
(September 2022) enforces under Section 5 of the FTC Act and names countdown timers designed to
make consumers believe an offer is time-limited when it is not
(https://www.ftc.gov/reports/bringing-dark-patterns-light; *flagged*: ftc.gov returned 403 to
direct fetch, so this is from search summaries of ftc.gov pages). EU Digital Services Act
Article 25 prohibits interfaces that deceive, manipulate or materially distort a reader's
ability to decide freely, and names false urgency messages and countdown timers; enforcement is
live, with a first formal non-compliance decision fining X 120 million euros in December 2025
(https://www.osborneclarke.com/insights/digital-fairness-act-unpacked-dark-patterns). Brignull's
taxonomy names the four a gamified bell can drift into: **Nagging, Fake urgency, Fake scarcity,
Addictive Design**, plus **Confirmshaming**, which is precisely the "you have let Duo down"
register (https://www.deceptive.design/types).

**And the sharpest warning is aimed at exactly this product.** Deterding and Nicholson attack
"pointsification", using only the least interesting part of a game, its scoring system.
Nicholson's objection is motivational crowding-out: external reward displacing existing
internal motivation, and his meaningful-gamification framework argues for play, choice and
information over reward (https://scottnicholson.com/pubs/meaningfulframework.pdf). A village
where people already help each other has pre-existing intrinsic motivation, which is the exact
condition under which crowding-out is documented to bite. "Ana thanked you for fixing the pump"
reinforces a relationship. "+15 tokens, streak x3, rank 4th" replaces the relationship with a
scoreboard.

**Inbox zero pressure.** Even Merlin Mann, who coined the term, has said it was meant as a
coping mechanism and became a performance target. Days with higher email demands are associated
with increased job tension and greater work-family interference. *Flagged:* the underlying
journal work is real but was reached only through content-marketing summaries.

### 5. Accessibility and restraint

**Colour is never the only carrier.** WCAG SC 1.4.1 Use of Color, Level A: "Color is not used
as the only visual means of conveying information, indicating an action, prompting a response,
or distinguishing a visual element" (https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
This hits unread-as-a-blue-dot, severity-as-colour, and new-as-a-red-badge. GOV.UK says the
same, recommending a "Success" heading "so that you're not relying on colour alone"
(https://design-system.service.gov.uk/components/notification-banner/), and NN/g says never use
exclusively colour or animation to indicate notifications, citing roughly 350 million people
with colour-vision deficiency.

**Target size, with the exact numbers.** WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA:
"The size of the target for pointer inputs is at least 24 by 24 CSS pixels", with five
exceptions including a spacing exception (a 24 CSS px diameter circle centred on the bounding
box must not intersect another target's circle)
(https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). **24 is a floor.** SC
2.5.5 Target Size (Enhanced), Level AAA asks for 44 by 44; Apple's guidance is 44pt and
Material's is 48dp. The pattern most likely to fail is exactly a notification row's packed
icon buttons.

**Auto-dismiss: the sources genuinely disagree, so do not claim one criterion governs it.**
SC 2.2.1 Timing Adjustable (Level A) requires turn-off, adjust to at least ten times the
default, or extend with a warning and at least 20 seconds to act, but its Understanding
document says it does not apply when "the content is still available to the user because it has
controls for accessing it", and points at 2.2.2
(https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html). SC 2.2.2 Pause, Stop,
Hide (Level A) covers auto-updating information with no duration exception, and does not
explicitly address toasts (https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
The ARIA Authoring Practices take a third position: "It is important to avoid designing alerts
that disappear automatically", citing 2.2.3 No Timing (Level AAA)
(https://www.w3.org/WAI/ARIA/apg/patterns/alert/).

The three converge on one design, which is the useful part: **if the content persists somewhere
permanent, a transient toast is defensible; if the toast is the only place the information ever
appears, auto-dismiss is a failure.** That is an argument *for* having a bell. The bell is the
durable home that makes the transient surface conformant.

The APG's other two warnings are unambiguous: alerts must not move focus, and "frequent
interruptions inhibit usability for people with visual and cognitive disabilities."

**Announcing arrivals, and the unread count.** WCAG SC 4.1.3 Status Messages, Level AA
requires that status messages be programmatically determinable "without receiving focus"
(https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). **The unread count is
explicitly in scope**: the Understanding document's worked example is a cart count going from
"0 items" to "3 items", and it gives the precise implementation note: **mark up the whole
string, not just the number.** Announce "3 unread notifications", never "3".

Role selection, from https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role:
`role="status"` is implicitly polite and atomic, announced when the reader is idle;
`role="alert"` is assertive, interrupts, and may clear the queued polite messages;
`role="log"` is polite and non-atomic, for append-only streams. **For a bell, `role="status"`
is correct in essentially every case.** Overusing assertive is one of the most common
accessibility mistakes.

The mechanics that decide whether it works at all, from Sara Soueidan's series
(https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-2/):
the live region must exist in the DOM at page load, because inserting the region and its
content together fails consistently across screen readers; limit the page to one polite and one
assertive region; compose the full message and insert it in one DOM operation; and wait 350 to
500 ms before clearing between successive updates or you get duplicate announcements.

**When a live region is the wrong tool**, same source, and this is the part usually skipped:
rich content loses its semantics (headings, links and buttons inside a live region are read as
flat text, which rules out announcing the whole list); interactive elements inside one cannot
be navigated to; a live region is not a substitute for `aria-expanded` or `aria-pressed`;
constantly-changing UI becomes unbearable; and toasts containing actions violate WCAG because
the action cannot be reached before it vanishes.

**Reduced motion: replace the trigger, keep the moment.** `prefers-reduced-motion: reduce`
exists primarily for vestibular disorders, which are triggered by scaling, panning and large
positional movement, and MDN says explicitly that the answer is not to remove all animation:
its own worked example swaps a `transform: scale()` pulse for an opacity dissolve
(https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion). WCAG's own
definition of "motion animation" backs this, explicitly excluding "changes in color, blurring,
or opacity that do not alter perceived size, shape, or position"
(https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). SC 2.3.3
Animation from Interactions (AAA) requires interaction-triggered motion to be disableable
unless essential.

So a celebration under reduced motion keeps the colour shift, the still composition and the
words, and loses the movement. You lose the confetti, never the recognition.

**Focus management for the panel: the APG has no pattern for this hybrid, so compose it
deliberately.** A Disclosure (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) documents
no Escape behaviour and no focus management at all. A Menu button moves focus to the first item
and delegates Escape to the Menu pattern. A Modal dialog
(https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) traps Tab, closes on Escape, and on
close returns "focus to the element that invoked the dialog".

A notification panel is a non-modal disclosure containing a list. It is not a menu, because its
items are links and not commands, and it is not a modal, because it must not trap focus or
block the page. The defensible composite: a `<button>` trigger with `aria-expanded` and
`aria-controls`; focus moved into the panel on open, borrowed from the menu and dialog
patterns, because leaving focus on the trigger makes a keyboard reader tab through nothing;
**Escape closes and returns focus to the bell**, borrowed from dialog-modal and implemented
explicitly because Disclosure does not specify it; and no Tab trap.

And the seam worth noticing: if clicking a notification navigates away, that is a change of
context, so focus lands on the destination. Deep linking and accessibility turn out to be the
same problem.

---

## Part 2: what this village built, and what it refused

### The five rules the bell is held to

**1. The row renders and dismisses without its object.** Every notification carries its own
title, body and link as stored text. A ballot that was withdrawn, a quest that was deleted, a
library item that went home: the line still reads, and the reader can still clear it. This is
GitHub's phantom notification, answered before it happens.

**2. Seen is not read.** Opening the bell quiets the badge. It does not mark anything read.
Reading a line, by clicking through to the thing it is about, marks that line read. "Mark all
read" is an explicit button that says how many rows it touched, and read rows stay in the list,
visibly read, so the action can never delete anything.

The seen cursor is one timestamp per member, held in the prefs blob, so the third state cost no
column and no migration. Unseen is computed as a subset of unread (`is_read = 0 AND created_at >
seenAt`), which means something already dealt with can never come back as new. The bell used to
mark everything read the moment it opened, which is the Optimizely collapse: a member who
glanced at the panel lost the record of what they had actually handled.

**3. Celebration is rationed, and the ration is written down.** Four moments earn a
celebration: a stage crossed, a ballot carried, a cycle settled, a quest consented. Everything
else, including every gratitude, every badge, every library loan, gets a quiet line in the
list. The natural kit's own contract says the same thing in its own words
(`docs/modules/natural-interface.md`): celebration on every action becomes wallpaper, and then
the rare event has nothing left to say with.

**4. Nothing manufactures a reason to return.** No streak. No countdown. No "somebody is
waiting". No badge that counts something the reader cannot act on. The only deadline shown is a
real one that the village itself set, and it is shown once, not counted down. Article 25 of the
DSA and the FTC's Section 5 both name false urgency, and beyond the law it is the fastest way
to make a bell that nobody opens.

**5. Colour is never the whole signal, and the number is never bare.** Unread carries a dot AND
the word "New" AND a heavier weight. The badge is announced as "3 unread notifications", never
"3". Every group carries a name.

### Where the lines live, and what was added

All 39 kinds carry a blurb, a batched line, a group and a celebration flag, and they live in
one file: `shared/notificationKinds.ts`. `shared/notificationKinds.test.ts` reads the producers
straight out of `server/` and fails if a type is sent with no line written for it, or if a line
is written for a type nothing sends. So the table cannot drift the day somebody adds a producer.

Six kinds are new, and all six are economy or governance:

| Type | Fires when | Reaches |
| --- | --- | --- |
| `ballot_opened` | a vote opens | everyone on the frozen roll, minus the proposer and the opener |
| `ballot_closing` | 48 hours before the window shuts | only people on the roll who have not answered |
| `ballot_carried` | a vote closes having passed | the whole roll |
| `ballot_failed` | a vote closes without passing, or without quorum | the whole roll |
| `ballot_expired` | the window ran out and nobody closed it | whoever opened it |
| `cycle_settled` | a lunation closes | everyone who received recognition inside it, with their share named |

Before this, the governance engine froze an electorate at open and told nobody it existed. A
vote could open, run its whole window and close with the proposer as the only member who ever
saw it in their bell, which is a quorum rule and no way to meet it. A cycle close moved real
value into member wallets and said nothing at all: the activity line told the village that N
members were acknowledged, and the wallet quietly held more than it had.

### What was deliberately NOT built

**No streak, no daily counter, no "you have not opened this in N days".** The mechanism works
and the evidence for its size is marketing. More to the point, Nicholson's crowding-out warning
lands hardest exactly here: a village where people already help each other is the documented
worst case for replacing a relationship with a score.

**No village-wide ring on every event.** A seat filled, a quest claimed, a proposal supported:
these are Pulse material, and the Pulse already carries them. The bell rings for a member when
something happened **to them**, or when the village needs **their** answer. LinkedIn's
unfiltered against filter-eligible split is the same idea; this build simply has no
filter-eligible tier, because a village small enough to know each other does not need one.

**No sound.** A sound is an interruption with no volume control that the page can honour, and
the APG's warning about frequent interruptions applies with full force.

**No push notifications, no email escalation for the new governance types.** The spine already
carries a per-type email cadence and a daily cap, and the new types ride it at "daily" by
default. A ballot with a seven-day window does not need to reach anyone within the hour.

**No unread-count-driven anxiety devices.** The badge caps at "9+", it does not turn red at a
threshold, and it never appears for something the reader has no action on.

**No auto-dismissing toast that carries the only copy of anything.** The toast is a second
surface for four rare moments. The line is in the bell first, and stays there.

### Delivery: why polling, and why this poll

The bell polled every 120 seconds, on a fixed timer, from two mounted copies of the component
(desktop and mobile both render one). So a gratitude sent to somebody sitting on the page took
up to two minutes to appear, and the app made two identical requests to do it.

What shipped instead:

- **One shared poller** for however many bells are mounted. Two components, one request.
- **A cheap poll.** `GET /api/notifications?count=1` answers with the unread count and the
  newest timestamp from a single indexed query, skipping the list entirely. The full list is
  fetched when the panel opens, and when the cheap poll says something changed.
- **A cadence that follows attention.** 25 seconds while the tab is visible and the reader has
  touched the page in the last five minutes; 60 seconds when visible and idle; 150 seconds when
  the tab is hidden. An immediate poll on tab return and on window focus, so coming back to the
  tab is the fastest path of all, which is the moment people actually look.
- **Backoff on failure**, doubling to a five-minute ceiling, so a server having a bad afternoon
  is not hammered by every open tab.

**Why not a socket.** This is one Express process with no fanout layer. A socket per signed-in
member is a standing cost, a reconnect story, a proxy configuration and a second delivery path
to keep correct, bought to save at most twenty-five seconds on a bell. The honest minimum was
to make the existing path cheap enough to run four times as often, and to make returning to the
tab instant. If a realtime path is ever added it belongs behind a flag, degrading to this poll.
