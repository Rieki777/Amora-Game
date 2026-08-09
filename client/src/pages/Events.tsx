/**
 * The village calendar at `/events` (0059).
 *
 * Reads `GET /api/events`, which already applies the two window variables and
 * hides drafts in the query. This page does no filtering of its own: a client
 * that receives a draft and is trusted to hide it is one bug away from
 * showing it.
 *
 * The module ships off, so an absent module renders NotFound exactly as every
 * other module page does. Existence is hidden, not merely unlinked.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useCallback, useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { authToken } from "@/lib/gameApi";
import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import type { Gathering, RsvpStatus } from "@shared/gatherings";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** "Today", "Tomorrow", "in 4 days", "3 days ago". */
function whenLabel(g: Gathering): string {
  if (g.daysUntil === 0) return "Today";
  if (g.daysUntil === 1) return "Tomorrow";
  if (g.daysUntil > 1) return `in ${g.daysUntil} days`;
  if (g.daysUntil === -1) return "Yesterday";
  return `${Math.abs(g.daysUntil)} days ago`;
}

const dateLine = (g: Gathering): string => {
  const start = new Date(g.startsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long",
  });
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
};

export default function Events() {
  const modules = useModules();
  const eventsModule = useModule("events");
  const [events, setEvents] = useState<Gathering[] | null>(null);
  const [rsvpEnabled, setRsvpEnabled] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/events", { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { setEvents(d.events ?? []); setRsvpEnabled(d.rsvpEnabled !== false); })
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => { if (eventsModule) load(); }, [eventsModule?.id, load]);

  const answer = async (id: string, status: RsvpStatus) => {
    setBusy(id);
    setProblem(null);
    try {
      const res = await fetch(`/api/events/${id}/rsvp`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      // The server owns capacity, so its refusal is the truth. Showing the
      // reason beats a button that silently does nothing.
      if (!res.ok) setProblem(body?.error ?? "That did not work");
      else load();
    } catch { setProblem("That did not work"); }
    setBusy(null);
  };

  if (modules.loaded && !eventsModule) return <NotFound />;

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">What is on</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The village's gatherings: when they are, where they are, and who is coming.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-3xl">
          {problem && (
            <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {problem}
            </p>
          )}

          {events === null && <p className="text-center text-muted-foreground py-16">Loading...</p>}

          {events?.length === 0 && (
            <p className="text-center text-muted-foreground py-16">
              Nothing is on the calendar yet.
            </p>
          )}

          <ul className="space-y-4">
            {(events ?? []).map((g) => (
              <li key={g.id} className="border border-border rounded-xl p-5 bg-card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-lg text-foreground">
                      {g.title}
                      {g.status === "cancelled" && (
                        <span className="ml-2 text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 align-middle">
                          Cancelled
                        </span>
                      )}
                      {g.status === "postponed" && (
                        <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 align-middle">
                          Postponed
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{dateLine(g)}</span>
                      <span className="text-foreground/60">({whenLabel(g)})</span>
                    </p>
                    {g.locationText && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {g.locationText}
                      </p>
                    )}
                    {g.onlineUrl && g.attendanceMode !== "offline" && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <a href={g.onlineUrl} className="underline underline-offset-2 hover:text-foreground"
                          target="_blank" rel="noopener noreferrer">Join online</a>
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 justify-end">
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {/* The real number, always. A capacity of 0 is a real
                          answer and must not read as "no limit". */}
                      {g.capacity === null
                        ? `${g.goingCount} going`
                        : `${g.goingCount} of ${g.capacity} going`}
                    </p>
                    {g.spotsLeft === 0 && (
                      <p className="text-xs text-amber-700 mt-0.5">Full</p>
                    )}
                  </div>
                </div>

                {g.description && (
                  <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{g.description}</p>
                )}

                {rsvpEnabled && (g.status === "scheduled" || g.status === "postponed") && (
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {(["going", "maybe", "declined"] as RsvpStatus[]).map((s) => {
                      const mine = g.myRsvp === s;
                      // A full gathering still accepts maybe and declined:
                      // only a new "going" needs a seat.
                      const blocked = s === "going" && g.spotsLeft === 0 && !mine;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => answer(g.id, s)}
                          disabled={busy === g.id || blocked}
                          aria-pressed={mine}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 ${
                            mine
                              ? "bg-teal-deep text-white border-teal-deep"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {s === "going" ? "I'm coming" : s === "maybe" ? "Maybe" : "Can't make it"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Layout>
  );
}
