/**
 * The curator's queue for photographs, in the browser.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────
 *
 * A member can flag a direct message on this platform and the report lands in
 * a table no client can read, so somebody reporting harassment gets a success
 * message into nothing. This panel is the promise that the same thing did not
 * happen to photographs: the flag reaches a queue, the queue has a surface, a
 * person who is not an admin can open it, and closing a card notifies the
 * member who raised it.
 *
 * It reads `/api/places/reports`, which is gated on `map.curatePhotos` and
 * sits OUTSIDE `/api/admin` on purpose (R54): whoever the village appointed to
 * curate its pictures can work this queue without being handed the operator's
 * keys.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, X } from "lucide-react";
import { Image } from "@/components/Image";
import BreathingLoader from "@/components/natural/BreathingLoader";
import { authToken } from "@/lib/gameApi";
import {
  canAct,
  emptyQueueLine,
  reportHeadline,
  type PlacePhotoReport,
  type ReportStatus,
} from "@shared/placePhotos";

const TAP = "min-h-[44px]";
const BTN =
  `${TAP} inline-flex items-center gap-1.5 px-3 rounded-lg border border-border text-sm font-medium ` +
  "hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-deep";

const jsonHeaders = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const TABS: { key: ReportStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Handled" },
  { key: "dismissed", label: "Dismissed" },
];

export default function PhotoReportsPanel() {
  const [status, setStatus] = useState<ReportStatus>("open");
  const [reports, setReports] = useState<PlacePhotoReport[] | null>(null);
  const [say, setSay] = useState("");

  const load = useCallback(async () => {
    setReports(null);
    try {
      const res = await fetch(`/api/places/reports?status=${status}`, { headers: jsonHeaders() });
      if (!res.ok) {
        setReports([]);
        return;
      }
      const payload = await res.json();
      setReports(Array.isArray(payload?.reports) ? payload.reports : []);
    } catch {
      setReports([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = async (id: string, next: "resolved" | "dismissed", said: string) => {
    try {
      const res = await fetch(`/api/places/reports/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setSay("That did not close. Try again in a moment.");
        return;
      }
      setSay(said);
      void load();
    } catch {
      setSay("That did not close. Try again in a moment.");
    }
  };

  return (
    <section aria-label="Reports about photographs" className="rounded-xl border border-border bg-card p-4 space-y-4">
      <h2 className="font-serif text-xl">Reports about photographs</h2>
      <p className="text-sm text-muted-foreground">
        Closing a card tells the member who raised it that somebody read it. Taking a photograph down closes every open
        report on it at once.
      </p>
      <div role="tablist" aria-label="Report status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`${BTN} ${status === t.key ? "bg-teal-deep text-white border-teal-deep" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-teal-deep min-h-[20px]">{say}</p>
      {reports === null ? (
        <BreathingLoader label="Reading the queue" />
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyQueueLine(status)}</p>
      ) : (
        <ul className="space-y-3 list-none p-0">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-3 flex gap-3">
              <div className="w-24 shrink-0">
                {r.photoUrl ? (
                  <Image src={r.photoUrl} alt={r.photoAltText ?? "The reported photograph"} ratio={1} className="rounded" />
                ) : (
                  <p className="text-xs text-muted-foreground">This photograph has been taken down. Its file is gone.</p>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-sm">{reportHeadline(r)}</p>
                {r.reason && <p className="text-sm">{r.reason}</p>}
                <p className="text-xs text-muted-foreground">
                  Raised by {r.reporter} on {new Date(r.at).toLocaleDateString()}
                  {r.photoHidden ? ". It is hidden right now." : ""}
                </p>
                {r.structureKey && (
                  <Link
                    href={`/places/${encodeURIComponent(r.structureKey)}`}
                    className="text-sm text-teal-deep underline inline-block py-1.5"
                  >
                    Open this place
                  </Link>
                )}
                {r.resolvedBy && (
                  <p className="text-xs text-muted-foreground">Closed by {r.resolvedBy}</p>
                )}
                {canAct(r) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => close(r.id, "resolved", "Marked handled.")} className={BTN}>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Handled
                    </button>
                    <button type="button" onClick={() => close(r.id, "dismissed", "Dismissed.")} className={BTN}>
                      <X className="w-3.5 h-3.5" aria-hidden="true" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
