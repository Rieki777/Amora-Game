/**
 * THE DOOR: a way to ask the village for a module it does not run.
 *
 * A member reading a module's page could see everything the thing does and had
 * no way to say they wanted it. This is the sentence at the bottom of that
 * page that gives them one, and `askDoor.ts` holds the decision about which
 * sentence it is. Read that file first: it says what the door opens, what it
 * cannot do, and why the question is written rather than typed.
 *
 * ── WHAT IT PROMISES, WHICH IS THE ONLY PART THAT MATTERS ─────────────────
 *
 * That the village gets asked, and that the answer goes on the record. NOT
 * that the module comes on. Turning a module on is an admin writing
 * `PUT /api/admin/modules/:id/lifecycle`, and no vote in this repository
 * touches that route. So the copy below says the vote records an answer and a
 * person still acts, and it says it before the button rather than after it.
 *
 * ── WHY THIS IS NOT ON THE SHELF TILE ─────────────────────────────────────
 *
 * The library shelf renders `ModuleCard`, which is one `<Link>` from its outer
 * edge in: a second control inside it is a button nested in an anchor, and the
 * page's own note says so ("the cards themselves are single links"). Splitting
 * the tile to fit a button would trade the whole-card tap target for a control
 * on a page a reader has not read yet.
 *
 * R55 is the stronger reason. A village not running a module is not behind. A
 * shelf of twenty-three tiles where every one a village has not turned on
 * grows a call to action is a shelf that has started counting what the village
 * has not got. The module's own page is where a member has gone looking, has
 * read what the thing does, and can ask for it having meant to.
 *
 * ── THE THREE FETCHES, AND WHEN THEY DO NOT HAPPEN ────────────────────────
 *
 * The catalog is already in the caller's hands. This adds the viewer's own
 * standing (`/api/governance/wizard`) and the village's recent decisions
 * (`/api/governance/ballots`), and asks for neither unless the door could
 * exist: a signed-out reader, a core module, a module already on, a withdrawn
 * one, or a village with governance off all cost zero requests.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { MessageCircleQuestion } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useModule } from "@/modules/ModuleProvider";
import { fetchBallots, fetchWizardFacts } from "@/components/governance/governanceApi";
import type { BallotCard } from "@/components/governance/governanceApi";
import { askDoor, type AskDoor, type AskDoorBallot, type AskDoorModule } from "./askDoor";

/**
 * How far back the duplicate check reads.
 *
 * The route's own ceiling. An advisory vote closes inside the village's
 * `vote_days`, so an OPEN one sits near the top of a list ordered newest
 * first, and this asks for as much of that list as the route will give.
 */
const BALLOT_WINDOW = 200;

/**
 * The door's state for one module, with the reads it needs.
 *
 * Returns `quiet` for every case where nothing should be offered, including
 * the one where the answer is not known yet, so a caller can render on the
 * kind alone and never draws a door on an unloaded list.
 */
export function useAskDoor(m: AskDoorModule | null): AskDoor {
  const { user, loading } = useAuth();
  const governance = useModule("governance");
  const [mayOpen, setMayOpen] = useState<boolean | null>(null);
  const [ballots, setBallots] = useState<AskDoorBallot[] | null>(null);

  // Whether the door COULD exist, decided without either read. The hook order
  // is fixed; only the requests are conditional.
  const worthAsking =
    !!m && !m.core && !m.on && !m.withdrawn && !loading && !!user && !!governance;

  useEffect(() => {
    if (!worthAsking) return;
    let alive = true;
    void (async () => {
      const [facts, list] = await Promise.all([fetchWizardFacts(), fetchBallots({ limit: BALLOT_WINDOW })]);
      if (!alive) return;
      // A refused or dropped read leaves both answers NULL, and null is not
      // false. Setting `mayOpen` false here would have printed "this account
      // does not open votes" at a member whose request was simply dropped,
      // which is the surface inventing a fact about a person. Null keeps the
      // door quiet, which is the only honest thing to draw on a read that did
      // not answer.
      if (facts.ok) setMayOpen(facts.data.mayOpenBallot);
      if (list.ok) setBallots(list.data.map((b) => ({ id: b.id, subjectType: b.subjectType, title: b.title, status: b.status })));
    })();
    return () => {
      alive = false;
    };
    // `m?.id` is in the deps so a page that swaps modules under one mounted
    // component re-reads rather than answering about the module before it.
  }, [worthAsking, m?.id]);

  if (!m) return { kind: "quiet", why: "loading" };
  return askDoor({
    module: m,
    signedIn: !loading && !!user,
    governanceOn: !!governance,
    mayOpen,
    ballots,
  });
}

/** Where the fixed ask is written, so the module page and `/propose` agree. */
export const askHref = (moduleId: string) => `/propose?module=${encodeURIComponent(moduleId)}`;

const CARD = "mt-8 rounded-xl border border-teal-deep/30 bg-teal-deep/5 p-5";
const HEADING = "flex items-center gap-2 text-base font-bold text-stone-900";

/**
 * What the village decided last time, in the words the record uses.
 *
 * Keyed by the ballot status union so a typo cannot ship a line nobody sees,
 * and PARTIAL on purpose: `open` never reaches here (a running ask is its own
 * panel), and a status the server grows tomorrow falls to the sentence below,
 * which is true whatever the answer was.
 */
const PRIOR_LINE: Partial<Record<BallotCard["status"], string>> = {
  passed: "The village said yes to this before.",
  failed: "The village said no to this before.",
  no_quorum: "This was asked before and not enough of the roll voted.",
  withdrawn: "This was asked before and the ask was withdrawn.",
};

/**
 * Somebody asked already.
 *
 * Exported because the module page and the ask screen both reach this state
 * and must say the same thing: a second vote about one switch spends the
 * village's attention twice and splits the answer.
 */
/**
 * The line for one prior answer.
 *
 * The cast is at this ONE edge and the fallback is true whatever the status
 * turns out to be, so a status the record grows tomorrow reads as a fact
 * rather than as a blank.
 */
const priorLine = (status: string): string =>
  PRIOR_LINE[status as BallotCard["status"]] ?? "The village has been asked this before.";

export function AskAlreadyRunning({ ballotId }: { ballotId: string }) {
  return (
    <section className={CARD}>
      <h2 className={HEADING}>
        <MessageCircleQuestion className="w-5 h-5 text-teal-deep" aria-hidden="true" />
        Somebody already asked
      </h2>
      <p className="mt-2 text-sm text-stone-700 leading-relaxed">
        The village is deciding this one right now. Your voice counts for more in that vote than it would in a second
        one about the same question.
      </p>
      <Link
        href={`/decisions/${ballotId}`}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-teal-deep px-5 text-sm font-semibold text-white hover:bg-teal-deep-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
      >
        Go to the vote
      </Link>
    </section>
  );
}

/**
 * Signed in, and this account does not open votes.
 *
 * The whole point of this state: never draw the door for somebody the advisory
 * route will answer 403. Exported for the same reason as the panel above.
 */
export function AskCannotOpen() {
  const forum = useModule("forum");
  return (
    <section className={CARD}>
      <h2 className={HEADING}>
        <MessageCircleQuestion className="w-5 h-5 text-teal-deep" aria-hidden="true" />
        Want this one?
      </h2>
      <p className="mt-2 text-sm text-stone-700 leading-relaxed">
        {/* Said once, plainly, and then out of the way. Opening a vote rings
            every member on the roll, so this village holds that where it holds
            it. Nothing here measures the reader against it. */}
        Putting a question to the whole village opens a vote every member is rung about, and this account does not open
        those.
        {forum ? " The forum is open to you, and that is where most asks start." : ""}
      </p>
      {forum && (
        <Link
          href="/forum"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-teal-deep px-5 text-sm font-semibold text-teal-deep hover:bg-teal-deep/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
        >
          Say it in the forum
        </Link>
      )}
    </section>
  );
}

export default function ModuleAskDoor({ module: m }: { module: AskDoorModule }) {
  const door = useAskDoor(m);

  if (door.kind === "quiet") return null;
  if (door.kind === "running") return <AskAlreadyRunning ballotId={door.ballotId} />;
  if (door.kind === "cannotOpen") return <AskCannotOpen />;

  return (
    <section className={CARD}>
      <h2 className={HEADING}>
        <MessageCircleQuestion className="w-5 h-5 text-teal-deep" aria-hidden="true" />
        Ask the village for this
      </h2>
      <p className="mt-2 text-sm text-stone-700 leading-relaxed">
        {/* True in every state that reaches here, which the older wording was
            not: a module in PREVIEW has been turned on for admins, so "nobody
            has turned this on" would have been false on an admin's own screen
            while the pill beside it said Preview. */}
        Your village is not running this one. You can put it to the whole village as a question, on the real roll with
        the weights your village uses. Closing the vote records the answer. Turning a module on is still done by hand by
        somebody with admin, and this is how they hear that the village wants it.
      </p>
      {door.prior && (
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          {priorLine(door.prior.status)}{" "}
          <Link href={`/decisions/${door.prior.id}`} className="font-medium text-teal-deep underline">
            Read what happened
          </Link>
        </p>
      )}
      <Link
        href={askHref(m.id)}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-teal-deep px-5 text-sm font-semibold text-white hover:bg-teal-deep-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
      >
        Ask the village about {m.name}
      </Link>
    </section>
  );
}
