/**
 * A POWER CROSSING OVER, AS A CEREMONY (lane G-C).
 *
 * R54, the founder's ruling: "these villages are meant to be taken over by
 * the electorate to run the game and put the admins out of a full time job."
 * Lane G-B made a power able to move. This is what the village sees when it
 * asks for one, and what it reads five years later about the day it happened.
 *
 * ── EVERY SENTENCE HERE COMES FROM SOMETHING THAT HAPPENED ────────────────
 *
 * There is not one fallback in this file, and that is deliberate rather than
 * tidy. A guarded lookup that invents a value lies quietly forever: a
 * decision a village CARRIED once read "Did not carry" to every member,
 * because a map lookup fell through to a default that looked reasonable. On
 * this surface the equivalent lie is "the village holds this now" shown to a
 * village that does not hold it, which is worse, because a permission a
 * member believes in and does not have is discovered by being refused.
 *
 * So `crossedHere` is read off `capability_holding.moved_by_ballot_id`, the
 * row the crossing actually wrote, and never off the close response. The
 * close response carries `applied` only in the session that closed the
 * ballot; a member opening this page tomorrow would have had nothing to read
 * the crossing off, and a card that assumed would have been right on the day
 * and wrong ever after. Where the server sends null, this says so in words.
 *
 * ── THE ONE MOMENT ────────────────────────────────────────────────────────
 *
 * `docs/modules/natural-interface.md` rations `moment` intensity, and this
 * lane's one addition to that list is a power crossing to the village. It
 * fires here and NOT in `DecisionOutcome`, so exactly one celebration plays:
 * the crossing's own. Two moments side by side on one page is the wallpaper
 * case the ration exists to prevent.
 *
 * ── AND IT IS NEVER A SCORECARD ───────────────────────────────────────────
 *
 * No fraction, no total, no count of powers held, no phase label, no
 * comparison. A village holding one power and a village holding ten read the
 * identical layout here, because this card is about ONE power and the
 * question it was asked. A village two weeks old opening this sees an ask
 * that either landed or did not, which is the whole of what happened.
 */
import { Handshake } from "lucide-react";
import { Celebration } from "@/components/natural";
import type { Ballot } from "./governanceApi";

/**
 * The date a member reads, from the timestamp the server sent.
 *
 * Returns null for anything unparseable, so a bad timestamp costs the reader
 * the date and never the sentence around it.
 */
function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function TransferCeremony({
  ballot,
  /** True only in the session that just closed it, so the moment stays rare. */
  fresh = false,
}: {
  ballot: Ballot;
  fresh?: boolean;
}) {
  const t = ballot.transfer;
  // A handover ballot whose subject this build cannot read. The decision page
  // still renders the document, the roll and the outcome; this card is the
  // one thing that has nothing true to say, so it says nothing.
  if (!t) return null;

  const open = ballot.status === "open";
  const crossed = t.crossedHere !== null;
  const crossedOn = dayOf(t.crossedHere?.movedAt ?? null);
  const toWhom = t.toRoleName ?? t.toRoleId;

  return (
    <section
      className={`relative overflow-hidden rounded-xl border-2 p-5 ${
        crossed ? "border-sage bg-sage-light" : "border-stone-200 bg-cream"
      }`}
    >
      {/* The daybreak sits in the corner and the words keep out of its way.
          At 390 a 160-wide drawing pinned to the right edge lands across the
          power's name, and a celebration that makes the sentence underneath it
          harder to read has spent the moment on nothing. */}
      {fresh && crossed && (
        <div className="pointer-events-none absolute right-0 top-0 opacity-70">
          <Celebration
            kind="dawn"
            intensity="moment"
            size={120}
            message={`A power crossed to the village. ${toWhom} looks after it now.`}
          />
        </div>
      )}

      <div className="relative">
        {/* The chip and the power's name are the two lines the drawing would
            sit across, so they keep clear of it and nothing below is indented
            by a decoration. */}
        <div className={fresh && crossed ? "pr-28 sm:pr-32" : ""}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-900/5 px-3 py-1 text-xs font-bold uppercase tracking-wide text-stone-700">
            <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
            {crossed ? "It crossed over" : "The village asks to hold this"}
          </span>

          {/* THE POWER. The title and the sentence both come from the registry
              the gate itself reads, so what a member is told a holder could do
              is what a holder can actually do. */}
          <h2 className="mt-3 font-display text-xl font-bold leading-snug text-stone-900">
            {t.title ?? t.capability}
          </h2>
        </div>
        {t.consequence ? (
          <p className="mt-1 text-sm text-stone-800 leading-relaxed">
            Whoever holds this can {t.consequence}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-700 leading-relaxed">
            This build has no sentence for what {t.capability} opens. The vote and the record below are unaffected.
          </p>
        )}
        {t.surface && <p className="mt-1 text-sm text-stone-700 leading-relaxed">Where it is used: {t.surface}.</p>}

        <dl className="mt-4 space-y-3 border-t border-stone-900/10 pt-3 text-sm">
          {/* WHO HAS IT TODAY. Null means nobody has taken it on, and the
              scaffolding is carrying it. That is a plain fact about a young
              village and about an old one, and it reads the same for both. */}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-600">
              {crossed ? "Before this vote" : "Who looks after it today"}
            </dt>
            <dd className="mt-0.5 text-stone-900 leading-relaxed">
              {t.heldNow && !crossed ? (
                <>
                  {t.heldNow.roleName ?? t.heldNow.roleId} holds it,{" "}
                  {t.heldNow.byBallot ? "by a vote of the village" : "handed over from the admin panel"}
                  {dayOf(t.heldNow.movedAt) ? ` on ${dayOf(t.heldNow.movedAt)}` : ""}.
                </>
              ) : (
                <>The admin panel is carrying it.</>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-600">
              {crossed ? "Who looks after it now" : "Who the village is asked to give it to"}
            </dt>
            <dd className="mt-0.5 text-stone-900 leading-relaxed">
              {toWhom}
              {t.toRoleName === null && (
                <span className="text-stone-700">
                  {" "}
                  (this role has been retired since the vote opened, so nobody is seated to act on it)
                </span>
              )}
            </dd>
          </div>

          {/* WHAT CHANGES, said before the vote and kept afterwards. A member
              who voted is owed the same words on the day and on the
              anniversary, because those words are what they voted for. */}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-600">
              {crossed ? "What changed that day" : "What changes on the day it crosses"}
            </dt>
            <dd className="mt-0.5 text-stone-900 leading-relaxed">
              An administrator who is not seated in {toWhom} stops passing this gate by being an administrator. They
              can still act on it, and every time they do, the village is told and the act goes on the village's own
              record. Handing it back is the same kind of act, in the open.
            </dd>
          </div>
        </dl>

        {/* THE CROSSING ITSELF: a date, an author, a sentence, and a row. The
            four things the harm metric asks for, each read from something
            that was written down. */}
        {crossed && (
          <p className="mt-4 rounded-lg border border-sage/40 bg-white/60 px-4 py-3 text-sm text-stone-900 leading-relaxed">
            {toWhom} has looked after this since {crossedOn ?? "the day this vote closed"}, by a vote of the whole
            village{ballot.closedBy ? `, closed by ${ballot.closedBy}` : ""}.
            {ballot.outcomeNote ? ` The village's words on it: ${ballot.outcomeNote}` : ""}
          </p>
        )}

        {/* IT CARRIED AND THE POWER DID NOT MOVE. The one state a ceremony
            must never paper over: a village that decided something and did
            not get it is owed the reason, not a blank card. `held` is not
            reachable from this component, so the shape of the record is what
            says it: a carried ballot with no crossing row against its id. */}
        {!open && !crossed && ballot.status === "passed" && (
          <p className="mt-4 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 leading-relaxed">
            The village said yes, and this power has not moved. Nothing is lost: the ask stands on the record with
            every word and every vote, and it can be taken up again.
            {t.roleCarriesIt
              ? ""
              : ` ${toWhom} does not carry this power at the moment, so nobody in it could act the day it crossed. That is the usual reason, and giving the role the power is what clears it.`}
          </p>
        )}

        {/* A HANDOVER THE PLATFORM WOULD REFUSE, said on the page rather than
            discovered at the close. The route refuses this at open, so it can
            only be reached by a key that stopped being movable while a vote
            was running. */}
        {!t.movable && (
          <p className="mt-4 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 leading-relaxed">
            This platform does not move {t.capability}. A vote here records what the village wants, and the power
            stays where it is until the platform can carry it across.
          </p>
        )}
      </div>
    </section>
  );
}
