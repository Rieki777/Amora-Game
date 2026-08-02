# Making the modules illustrative: ideas from the 2026-08-02 build

Collected while building the events card, the timestamps, the stocked example
market, the empowered badges, the circle map and the doughnut. Ordered by how
much teaching each buys per unit of work. Nothing here is started; each is a
decision first.

## The one idea that multiplies the rest

**A guided first walk.** The examples now demonstrate every module, but they
still wait to be found. A "meet your village" checklist for the founder's
first session (visit the forum's example decision, tap Buy on an example
listing and read the refusal, open the steward badge, find the open seat on
the map) would turn the examples from scenery into a course. The pieces all
exist; the walk is a page and a progress row.

## Per module

**Forum.** The examples teach discussion, decision and event well now. The
missing kind is an ANNOUNCEMENT (role-gated posting is invisible until one
exists), and no example is pinned, so the pin affordance and pinned-first
ordering go undemonstrated. One announcement in "projects", pinned, closes
both gaps and fills a category that currently sits empty under the banner.

**Feed.** Reply nesting is seeded and stored, and renders flat; the one
seeded fact about threading is invisible. Either indent by parentReplyId
(small render change) or stop seeding the nesting. Tags are seeded and the
feed has a tag filter; the example tags (garden, water, repair, logistics)
never show as chips on the cards, so the filter looks like it filters
nothing.

**Exchange.** The market now shows two stocked, priced listings that refuse
purchase with the standing-example message. The remaining gap is the SWAP
card: it renders only when a member holds a swappable balance, so the whole
swap mechanic is invisible until real trading opens. A display-only example
swap pair (Example Credits to Example Workshop Passes, both sides refusing)
would need care with the swap firewall; worth a design pass before building.

**Badges.** Now demonstrates granted, earned-with-stacking, self, warning,
capabilities and holders. The last invisible piece is EXPIRY: a badge award
with an expires_at some weeks out would show the "expires" chip and teach
that trust can be lent for a season.

**Stays.** Capacity is seeded and read into the row type and never rendered
on the card. Either show "sleeps N" or drop the field. The "Earn your
nights" card and the member-rate distinction would both benefit from one
example accommodation carrying a member price AND a visitor price, so the
two-tier pricing is visible.

**Library.** All three example items sit at status "available", so the
borrowed and overdue states never show. One item seeded as out-on-loan to an
example identity (display state only, no real escrow) would teach what the
shelf looks like mid-use. Needs the same care as badges: the loan row must
be example-flagged and excluded from open-state checks.

**Health.** The doughnut now draws the foundation and the land's ledger.
Two follow-ups: (1) the capitals wheel from the Hypha screenshot (Deep,
Clear, Wide, High impact across the forms of capital) has NO data source in
the platform yet; deciding what feeds it is a design conversation, and
building it before that would be decoration. (2) Per-village floor overrides
already work through the health module's config JSON (doughnutFloors); an
admin editor for them is a small Admin panel addition when wanted.

**Map.** The circle map now nests and shows seats. The Peerdom look would
finish with: circle icons rendered inside their circles (the icon field is
seeded and unused on the canvas), member avatars or initials on filled
seats for viewers with map.viewPeople, and a "focus mode" that zooms one
circle to fill the canvas on double-click.

**Automation.** The example transcript is seeded and invisible: the
recordings admin shows title and status, never the transcript or the
synthesis body. Rendering the synthesis (chapters, decisions, tasks) for
the example recording is the module's whole story; today it reads as a list
of filenames.

**Network.** The peer version is written and never rendered; show it or
drop it. The "Sync now" button on an example-only network silently no-ops;
it should say the peer is an example and nothing will be fetched.

**Commerce.** Every example product is provider stripe and audience public,
so the members-only visibility branch and the "no provider configured"
state never demonstrate. One members-only example product would show the
audience gate to a signed-out founder the moment they log in.

## Cross-cutting

- **Example refusals render in the success style on some pages** (noted in
  the forum during the walk: teal text, below the fold). A shared
  `<RefusalNotice>` that renders `example_immutable` responses amber, next
  to the control that was pressed, would make every refusal teach.
- **The banner could name the trigger.** "These are standing examples.
  Publish your own to replace them" is true everywhere; per module it could
  say WHAT publishes: "your first real tool replaces these". The trigger
  strings already live in the seed as `_trigger`.
- **A "clear examples" preview.** The admin button removes a module's
  examples permanently; showing what the page will look like after (the
  honest empty state) before confirming would prevent regret clicks.
