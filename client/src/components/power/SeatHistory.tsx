/**
 * THE SEAT'S OWN STORY: everyone who has held it, and when it passed between
 * them.
 *
 * `GET /api/org/roles/:id/history` has served this since 0049. It returns
 * every seating on a seat including the ended ones, it sits behind
 * `map.viewPeople`, which is a member capability and not an admin one, and
 * until now it had NO CALLER anywhere in the client. The one thing a village
 * most wants to know about a seat, which is who has carried it before, was
 * already computed, already tiered for members, and rendered by nobody.
 *
 * ── WHAT THIS IS ALLOWED TO SAY (R55) ────────────────────────────────────
 *
 * The handover is a journey to celebrate and never a scorecard to fail. So
 * there is no count of holders, no average length of a term, no gap between
 * one holding and the next, and no comparison with any other seat. A seat
 * nobody has held yet reads as a seat waiting for its first person, in the
 * same register `structuralLoad` already uses for a founding village: "One
 * person holds every seat. That is what a founding looks like, not a
 * finding."
 *
 * A seat with one holder and a seat with six get the same layout and the same
 * tone. The only thing that differs is how many names are in it.
 *
 * ── AND THE ONE THING IT CELEBRATES ──────────────────────────────────────
 *
 * A seating that ended, followed by another that began, IS the milestone: the
 * seat outlasted the person holding it. That is the fact worth naming, and it
 * is derived from rows that already exist, so nothing is stored to say it.
 * Per the celebration ration in docs/modules/natural-interface.md this is a
 * sentence and not a `moment`: a handover read off a two-year-old record is
 * not motion that answers the reader, it is decoration on a filing cabinet.
 *
 * ── AND THE ONE THING IT REFUSES TO GUESS ────────────────────────────────
 *
 * Every sentence below comes from a row. A holder whose name was taken off
 * the record (`releaseSeatingsForUser` clears `display_name` on every row,
 * live and ended) is skipped in the passing sentence rather than named as
 * "someone", because a handover the page cannot attribute is a handover it
 * should not describe.
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { gameFetch } from "@/lib/gameApi";

/** Exactly what `/api/org/roles/:id/history` answers with, per row. */
export interface SeatSeating {
  id: string;
  name: string | null;
  kind: "member" | "documented";
  focus: string | null;
  startedAt: string;
  endedAt: string | null;
  endedReason: string | null;
}

const day = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

const at = (iso: string | null): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * THE LATEST TIME THIS SEAT CHANGED HANDS.
 *
 * A seating with an `ended_at`, and another seating that began at or after
 * it under a different name. Both halves are required: a seat somebody left
 * empty has not been handed to anyone, and a person who left and came back
 * has not handed it to themselves. Walking the ended ones oldest first means
 * the last assignment wins, which is the most recent passing.
 */
export function lastHandover(rows: SeatSeating[]): { from: string; to: string; on: string } | null {
  const ended = rows.filter((r) => r.endedAt && r.name).sort((a, b) => at(a.endedAt) - at(b.endedAt));
  const started = rows.filter((r) => r.name).sort((a, b) => at(a.startedAt) - at(b.startedAt));
  let found: { from: string; to: string; on: string } | null = null;
  for (const left of ended) {
    const next = started.find(
      (s) => s.id !== left.id && at(s.startedAt) >= at(left.endedAt) && s.name !== left.name,
    );
    if (next) found = { from: left.name!, to: next.name!, on: next.startedAt };
  }
  return found;
}

/** Distinct holder names in the order they first took the seat. */
export function holderOrder(rows: SeatSeating[]): string[] {
  const seen: string[] = [];
  for (const r of rows.slice().sort((a, b) => at(a.startedAt) - at(b.startedAt))) {
    if (r.name && !seen.includes(r.name)) seen.push(r.name);
  }
  return seen;
}

/** "Ada, then Tomás, then Wren" */
function chain(names: string[]): string {
  return names.join(", then ");
}

export default function SeatHistory({
  roleId,
  /** False when this reader cannot see names at all. Renders nothing. */
  canSeePeople,
}: {
  roleId: string;
  canSeePeople: boolean;
}) {
  const [rows, setRows] = useState<SeatSeating[] | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!canSeePeople) return;
    let alive = true;
    setRows(null);
    setUnreadable(false);
    gameFetch(`/api/org/roles/${encodeURIComponent(roleId)}/history`)
      .then(async (r) => {
        if (!alive) return;
        // A refusal is not an empty seat. Saying nothing is the only honest
        // answer a page can give about a record it was not allowed to read.
        if (!r.ok) {
          setUnreadable(true);
          return;
        }
        const data = await r.json();
        if (alive) setRows(Array.isArray(data) ? (data as SeatSeating[]) : []);
      })
      .catch(() => {
        if (alive) setUnreadable(true);
      });
    return () => {
      alive = false;
    };
  }, [roleId, canSeePeople]);

  if (!canSeePeople || unreadable) return null;

  if (rows === null) {
    return <p className="text-xs text-muted-foreground">Reading who has held this seat…</p>;
  }

  const names = holderOrder(rows);
  const passed = lastHandover(rows);
  const newestFirst = rows.slice().sort((a, b) => at(b.startedAt) - at(a.startedAt));

  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        <History className="w-3.5 h-3.5" aria-hidden="true" />
        Who has held this seat
      </h4>

      {names.length === 0 ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Nobody has been recorded in this seat yet. That is what a seat looks like before somebody
          steps into it.
        </p>
      ) : names.length === 1 ? (
        <p className="text-sm text-foreground leading-relaxed">
          {names[0]} is the first person on this seat's record.
        </p>
      ) : (
        <p className="text-sm text-foreground leading-relaxed">This seat has been held by {chain(names)}.</p>
      )}

      {passed && (
        <p className="mt-1.5 text-sm text-foreground leading-relaxed">
          It passed from {passed.from} to {passed.to} on {day(passed.on)}. A seat that outlasts the
          person holding it is the reason a village writes its seats down.
        </p>
      )}

      {newestFirst.length > 0 && (
        <ul className="mt-2 space-y-1">
          {newestFirst.map((r) => (
            <li key={r.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">{r.name ?? "A name taken off the record"}</span>
              {r.focus && <span> · {r.focus}</span>}
              <span>
                {" · "}
                {r.endedAt ? `${day(r.startedAt)} to ${day(r.endedAt)}` : `holding since ${day(r.startedAt)}`}
              </span>
              {r.endedAt && r.endedReason && <span> · {r.endedReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
