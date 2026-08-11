# QA prompts, everything live as of 2026-08-11

Supersedes the round C and round D addenda as the thing to WORK FROM. Those
stay as the record of what each round asserted; this is the list you actually
walk. Twenty five commits reached main on 2026-08-10, from three lanes, and
three of the groups below have never been in front of a person.

## 0. First, prove you are testing what shipped

The artifact is served content hashed and cached immutable, so a stale tab is
a real hazard and looks exactly like a bug that came back.

```
curl -s https://amora.regencivics.earth/health
curl -s https://amora.regencivics.earth/grounds/manifest.json
```

| what | expected right now |
|---|---|
| `/health` build | `2026-07-28-wave1-29d689b` |
| manifest bytes | `4751111` |
| manifest url | `/grounds/grounds-86408222b7bf.html` |
| map footer / `BUILD_VERSION` | `v0.8-roundE` |

If the bytes differ, someone shipped after this doc was written. Hard reload
before reporting anything.

---

## A. The map under a thumb. NEW TONIGHT, PHONE REQUIRED

Round E is the whole reason to pick up a phone. It has passed eight automated
gates and has never been touched by a human hand. Use a real phone, not a
desktop window resized narrow: the pocket profile keys off touch, and a
resized desktop window will not give you the layout members get.

1. **Names stay with their buildings.** Pan and zoom around the village at
   several distances. A building's name should sit on or beside ITS building.
   Previously a name in a crowd could ratchet upward off its roof and end up
   in the column at the top of the screen. Nothing should be floating at the
   top edge unattached.
2. **Names are budgeted, not silenced.** In a crowd you should see roughly
   seven names on a phone and more on a desktop, chosen nearest the middle of
   the screen. Not all of them, and not none of them.
3. **Marks keep room for a thumb.** Tap the badges around a busy building.
   Each tap should open the thing you aimed at. This is the one that had a
   real bug: two marks 13 px apart resolved perfectly at their exact centres
   and opened the wrong door under an actual fingertip.
4. **A tap does not reshape the ring.** Tapping a mark should not make its
   ring jump wider or rearrange its neighbours.
5. **Toasts do not cover the top band.** On a phone, messages should appear at
   the BOTTOM, at most three at a time, at a readable width. The top band
   belongs to the vitals bar, the plates and the open card.
6. **District names survive the far zoom.** Zoom all the way out. District
   labels are the only wayfinding left at that distance, so they should stay
   legible and should not disappear.
7. **Resizing a building logs one edit with a from and a to.** In build mode,
   drag a size slider. A no-op drag should log nothing.

**Known shortfall. Do not report this as a bug.** Between roughly zoom 1.0 and
1.45 there are two narrow bands where 3 to 4 doors out of 50 sit closer than
the thumb floor. This was measured, not missed: at the far zoom the screen
physically cannot hold 50 separated exclusion zones. From zoom 1.7 up it is
perfect. If you find a mis-tap, note the zoom level; inside those bands it is
the known trade, outside them it is new.

---

## B. A promise crossing to the village. NEW TONIGHT, AND NOTHING AUTOMATED COVERS IT

This is the highest value hour in this document. The map lane's suites drive
the artifact with no shell attached, and the site lane's tests set their own
auth header, so **a signed in member making a promise is tested by nobody.**
That is exactly where today's real bug lived: the shell used a plain `fetch`,
only one helper attaches the token, and every promise a signed in member made
came back `anonymous`. It is fixed. Nothing would catch it coming back.

Do this **signed in**, then again **signed out**, and compare.

1. RSVP to an event from the map. It should stick, and the count should move.
2. **Signed in, you must not be treated as a stranger.** If the map offers you
   a way in, a sign up prompt, or anything that reads as "who are you", that
   is the bug returning. Signed out, that offer is correct and expected.
3. Withdraw the RSVP. It should come back off, and the count should return.
4. Claim a quest, then release it. Same test.
5. **Refresh the page.** The promise should still be there. It is stored by
   the village now, not just by your browser.
6. Toggle one promise on and off quickly three times. It should land on the
   state you chose last, not on whichever answer arrived first.
7. Try it in a second browser or a private window signed in as someone else.
   Your promise should be yours, and theirs should be theirs.

---

## C. The village's own words

Shipped this morning, and the bridge that carries them was rebuilt twice.

1. In Village Settings, rename the road, water and zone words. The map should
   take all of them.
2. Rename a **flow type** and a **phase name**. These are the two that used to
   fall on the floor: the bridge took three of five vocabulary keys and the
   loss was invisible, because the three that landed looked like proof the
   wiring worked.
3. Add a medium this map has never heard of. It should arrive with its name
   AND its colour, and the colour should reach the drawing.
4. Export the scene, then import it again. Every word you changed should
   survive the round trip.

---

## D. The land's dress. STILL WAITING ON YOU, NOT A TEST

Three samples need a yes or a no before any of it ships. This is a decision,
not a QA pass.

- The flow glyph sheet
- The bamboo scaffold for buildings under construction
- Ribbon labels against golden tablet labels, and which one Amora ships

---

## E. Everything already covered

D1 camera and hands, D2 badges, badges P1 to P4, D4 founder's hands and D5
promises are all held by the suites and were walked in the round D addendum.
Re-walk them only if something in A or B looks wrong.

**One correction to that addendum, so you do not report a false bug.** Round E
deliberately replaced two of its assertions:

- "no two marks overlap anywhere" is no longer the intent. Marks of different
  buildings now keep a thumb sized floor instead, bought with a few degrees of
  ring rotation.
- "crowded rings collapse to a counted seal" is gone. A ring is now solved
  against one building, its own, and neighbours no longer collapse each other.

Testing against the old wording will produce failures that are the new design
working.

---

## F. The Guide's two new screens

A third lane shipped these today, under "The Guide" in admin. I have not
tested them and they are not mine; treat this as a pointer, not a pass.

1. The brief, all fourteen sections including the blank ones. **Type into
   three sections, save one, then check the other two survived.** That exact
   flow used to wipe them, unrecoverably.
2. The draft queue, where a proposed role's powers are granted one at a time.
   **This is the surface your amber approval round has been waiting for.**
3. On both tabs, let your session go stale and then save. You should see an
   error. Silence used to look exactly like success.

---

## What only a person can catch

Worth naming, because everything else here has a gate behind it:

- Whether a promise made while signed in is treated as coming from you (B2).
- Whether a mis-tap under a real fingertip is the known low zoom trade or new.
- Whether the pocket layout is usable, as opposed to correct.
- Whether the land reads as a place rather than as a diagram.

---

## Decisions waiting on you, no testing involved

| item | what is needed |
|---|---|
| The amber approval round on the Loom | oldest open item; the queue in F2 is now its surface |
| The three D3 samples | yes or no on each, plus which label style ships |
| Three em-dash quest titles on the live Quests page | rename table is in the site lane handoff |
| Blueprint look | ghost emblems, or ghosted painted sprites |
| Two QA leftovers on live | `painterly {0.5, 0.5}` and accent `#157f7d`, one PUT to `/api/admin/brand` |
| One synthetic walk row in production | |
| Dream mist tick, then re-read `GET /api/map/skin` | |
| `quest.how_to` | should a claimed quest on the SITE show the founder's first step, or stay map only |
| The MySQL service domain | remove `mysql-production-7798.up.railway.app` in the Railway dashboard; the CLI cannot |
| 42 degree rotation | the plates lane wants a word on rotation against slot learnability |
