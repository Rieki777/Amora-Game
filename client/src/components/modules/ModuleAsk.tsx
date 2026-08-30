/**
 * `/propose?module=<id>`: the ask, with the module already named.
 *
 * The door on a module's page sends a member here. This resolves the module,
 * checks the same things the door checked (because a member can arrive on a
 * shared link without passing the door at all), and hands the practice-vote
 * screen a fixed question.
 *
 * ── THE NAME COMES FROM THE CATALOG, NEVER FROM THE URL ───────────────────
 *
 * `?module=` carries an id and nothing else. The sentence the village votes on
 * is built from the name the server serves for that id, so a hand-typed link
 * cannot put words of its own into a ballot title in front of the whole roll,
 * and an id nothing answers for ends here rather than in a vote about nothing.
 *
 * ── WHAT PUBLISHING DOES, IN ONE SENTENCE ─────────────────────────────────
 *
 * It opens an advisory vote. The village answers, the answer goes on the
 * record, and somebody with admin still has to turn the module on. Nothing in
 * this repository lets a vote write `module_settings`, so any copy implying
 * the switch flips when the vote carries would be a promise the platform does
 * not keep.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { authToken } from "@/lib/gameApi";
import PracticeVote from "@/components/governance/PracticeVote";
import { askQuestion, type AskDoorModule } from "./askDoor";
import { AskAlreadyRunning, AskCannotOpen, useAskDoor } from "./ModuleAskDoor";

/** The one line each quiet reason says out loud on this page. */
const NOTHING_TO_ASK: Record<string, string> = {
  core: "This one is always on. Every village has it from the day it opens.",
  "already-on": "Your village already runs this one.",
  withdrawn: "This one is no longer offered, so there is nothing to ask for. A village already running it keeps it.",
  "no-governance": "This village has not turned on governance, so there is no vote to open yet.",
  "signed-out": "Asking the village carries your name, so this part opens for members.",
};

export default function ModuleAsk({ moduleId }: { moduleId: string }) {
  const [, navigate] = useLocation();
  const [m, setM] = useState<AskDoorModule | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    const tk = authToken();
    fetch("/api/modules/catalog", { headers: tk ? { Authorization: `Bearer ${tk}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        const found = (Array.isArray(d?.modules) ? d.modules : []).find((x: any) => x?.id === moduleId);
        // An id the catalog does not answer for is a dead link and says so.
        // It is never turned into an ask about a name the URL supplied.
        if (!found) setMissing(true);
        else setM({ id: found.id, name: found.name, core: !!found.core, on: !!found.on, withdrawn: found.withdrawn ?? null });
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [moduleId]);

  const door = useAskDoor(m);

  const back = (
    <Link
      href={m ? `/modules/${m.id}` : "/modules"}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      {m ? `Back to ${m.name}` : "Module Library"}
    </Link>
  );

  if (missing) {
    return (
      <div>
        {back}
        <p className="mt-4 text-sm text-stone-600 leading-relaxed">
          There is no module here by that name. The library has every one this platform offers.
        </p>
      </div>
    );
  }

  if (!m || (door.kind === "quiet" && door.why === "loading")) {
    return <p className="text-sm text-stone-600">Loading…</p>;
  }

  if (door.kind === "quiet") {
    return (
      <div>
        {back}
        <p className="mt-4 text-sm text-stone-700 leading-relaxed">{NOTHING_TO_ASK[door.why] ?? ""}</p>
      </div>
    );
  }

  if (door.kind === "running") {
    return (
      <div>
        {back}
        <div className="mt-2">
          <AskAlreadyRunning ballotId={door.ballotId} />
        </div>
      </div>
    );
  }

  if (door.kind === "cannotOpen") {
    return (
      <div>
        {back}
        <div className="mt-2">
          <AskCannotOpen />
        </div>
      </div>
    );
  }

  return (
    <div>
      {back}
      <div className="mt-4">
        <PracticeVote
          about={null}
          asking={{
            question: askQuestion(m.name),
            heading: `Ask the village for ${m.name}`,
            lead:
              "The whole village is asked this one line, on the real roll with the weights your village uses. " +
              "Closing the vote records the answer. Turning a module on is still done by hand by somebody with " +
              "admin, and this is how they hear that the village wants it.",
            detailLabel: "Why you are asking",
            detailHelp:
              "This is the part only you can write, and it is the part that persuades. It is frozen into the " +
              "document when the vote opens, so it cannot change while people are voting.",
            submitLabel: "Ask the village",
            cancelLabel: "Not now",
          }}
          onOpened={(ballotId) => navigate(`/decisions/${ballotId}`)}
          onCancel={() => navigate(`/modules/${m.id}`)}
        />
      </div>
    </div>
  );
}
