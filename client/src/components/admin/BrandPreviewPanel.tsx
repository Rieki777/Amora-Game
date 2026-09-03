import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, authHeaders, refusal } from "./adminApi";
import {
  previewRows,
  summarise,
  type PreviewRow,
  type PreviewSummary,
} from "./brandPreview";
import type { BrandLike } from "./setupProgress";

/**
 * The Setup Wizard's preview: what the site will show, before anything is
 * committed.
 *
 * ── WHERE THIS IS MEANT TO GO ────────────────────────────────────────────
 *
 * Inside the Pictures step of `SetupWizard` (client/src/pages/Admin.tsx),
 * beside `LookPanel`, `TypographyPanel` and `IdentityPackPanel`:
 *
 *     <BrandPreviewPanel password={password} draft={brand} />
 *
 * `draft` is the wizard's own in-memory brand object, which is why the panel
 * can show a pending value before the Save button is pressed. Passing nothing
 * is supported and previews only what is saved.
 *
 * It is a separate file, and not a block inside Admin.tsx, for two reasons.
 * That file carries a CI ratchet that permits no growth
 * (scripts/check-file-lines.mjs), and a component declared inside another
 * component's body is a new type on every render, which remounts every input
 * under it (client/src/components/admin/SetupSection.tsx records what that
 * cost a founder on a phone). Every piece below sits at module scope.
 *
 * ── WHY IT FETCHES ITS OWN COPY OF THE SAVED SETTINGS ────────────────────
 *
 * The wizard already holds a brand object, from `GET /api/admin/brand`. That
 * route answers through `getBrand()`, which reads `brandRepo.get()`, which is
 * the boot-time cache. So the object the wizard holds says what the process
 * is SERVING and cannot say what the row holds. A preview built on it would
 * repeat whatever the cache got wrong.
 *
 * `GET /api/admin/brand/preview` runs its own SELECT every call. See
 * server/routes/brandPreview.ts for the production case that made this
 * necessary, and client/src/components/admin/brandPreview.ts for the rules
 * that keep "set", "blank" and "could not read" apart.
 */

interface PreviewAnswer {
  stored: { readable: boolean; present: boolean; document: BrandLike | null; error: string };
  serving: BrandLike | null;
  defaults: { project?: Record<string, unknown> | null; images?: Record<string, unknown> | null };
}

export interface BrandPreviewState {
  loading: boolean;
  /** Null until the first answer arrives. */
  rows: PreviewRow[] | null;
  summary: PreviewSummary | null;
  /** Set when the request itself failed, so no plane could be read. */
  error: string;
  /** The server's sentence for a saved plane it could not read. Empty otherwise. */
  savedError: string;
  reload: () => void;
  resync: () => Promise<void>;
  resyncing: boolean;
  /** What the last resync reported. Null before one has run. */
  resynced: "changed" | "already-current" | "failed" | null;
}

/**
 * Fetch the three planes, resolve them against the draft on every render.
 *
 * `draft` is DELIBERATELY absent from the fetch's dependencies. It changes on
 * every keystroke, and refetching per keystroke would put a database read
 * behind the space bar. The answer is fetched on mount and on request; the
 * rows are recomputed locally, which is fourteen fields of string comparison.
 */
export function useBrandPreview(password: string, draft?: BrandLike | null): BrandPreviewState {
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resyncing, setResyncing] = useState(false);
  const [resynced, setResynced] = useState<"changed" | "already-current" | "failed" | null>(null);

  const reload = useCallback(() => {
    let live = true;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/admin/brand/preview`, { headers: authHeaders(password) })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!live) return;
        if (!res.ok) {
          setError(refusal(body, "The preview could not be loaded."));
          setAnswer(null);
          return;
        }
        setAnswer(body as PreviewAnswer);
      })
      .catch(() => {
        if (live) {
          setError("The preview could not be loaded.");
          setAnswer(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [password]);

  useEffect(() => reload(), [reload]);

  const resync = useCallback(async () => {
    setResyncing(true);
    try {
      const res = await fetch(`${API_BASE}/admin/brand/resync`, {
        method: "POST",
        headers: authHeaders(password),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResynced("failed");
        setError(refusal(body, "The live settings could not be reloaded."));
        return;
      }
      setResynced(body?.changed ? "changed" : "already-current");
      reload();
    } catch {
      setResynced("failed");
      setError("The live settings could not be reloaded.");
    } finally {
      setResyncing(false);
    }
  }, [password, reload]);

  const rows = useMemo(() => {
    if (!answer) return null;
    return previewRows({
      draft: draft ?? null,
      stored: answer.stored,
      serving: answer.serving,
      defaults: answer.defaults ?? {},
    });
  }, [answer, draft]);

  return {
    loading,
    rows,
    summary: rows ? summarise(rows) : null,
    error,
    savedError: answer && !answer.stored.readable ? answer.stored.error : "",
    reload,
    resync,
    resyncing,
    resynced,
  };
}

const CHIP: Record<PreviewRow["read"], { label: string; className: string }> = {
  set: { label: "Set", className: "bg-teal-deep/10 text-teal-deep" },
  blank: { label: "Blank", className: "bg-muted text-muted-foreground" },
  unreadable: { label: "Could not read", className: "bg-destructive/10 text-destructive" },
};

/** One field's state, in one word. Module scope, so React can match its type. */
function StateChip({ read }: { read: PreviewRow["read"] }) {
  const chip = CHIP[read];
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${chip.className}`}>
      {chip.label}
    </span>
  );
}

/** The sentence under a field, saying where its value came from. */
function provenance(row: PreviewRow): string {
  if (row.read === "unreadable") return "We could not read what you have saved for this one.";
  if (row.from === "draft" && row.unsaved !== false) return "Typed here, saved once you press Save.";
  if (row.read === "blank" && row.from === "none") return "Never set. The platform value shows here.";
  if (row.read === "blank") return "Saved as blank. The platform value shows here.";
  if (row.inherited) return "The platform value shows here.";
  return "Your own value.";
}

function PreviewLine({ row }: { row: PreviewRow }) {
  const isImage = row.group === "images";
  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0">
      {isImage ? (
        <span className="w-14 h-10 shrink-0 rounded border border-border bg-muted overflow-hidden flex items-center justify-center">
          {row.effective ? (
            <img src={row.effective} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-muted-foreground px-1 text-center leading-tight">
              {row.read === "unreadable" ? "?" : "none"}
            </span>
          )}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{row.label}</span>
          <StateChip read={row.read} />
          {row.unsaved === true ? (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
              Unsaved
            </span>
          ) : null}
          {row.stale === true ? (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
              Live site is behind
            </span>
          ) : null}
        </span>
        {!isImage && row.effective ? (
          <span className="block text-sm text-foreground mt-0.5 break-words">{row.effective}</span>
        ) : null}
        <span className="block text-xs text-muted-foreground mt-0.5">{provenance(row)}</span>
        {row.stale === true ? (
          <span className="block text-xs text-amber-900 mt-0.5 break-words">
            The live site is showing {row.serving || "nothing"} for this.
          </span>
        ) : null}
      </span>
    </li>
  );
}

export default function BrandPreviewPanel({
  password,
  draft,
}: {
  password: string;
  /** The wizard's in-memory brand object. Omit to preview only what is saved. */
  draft?: BrandLike | null;
}) {
  const { loading, rows, summary, error, savedError, reload, resync, resyncing, resynced } =
    useBrandPreview(password, draft);

  return (
    <div className="mt-6 border border-border rounded-xl bg-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h4 className="font-semibold text-foreground">Check before you save</h4>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
            Read straight from your saved settings each time this runs, so it shows what the record
            holds and what your unsaved edits will change.
          </p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-teal-deep disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check again"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-destructive mb-3">{error}</p>
      ) : null}

      {savedError ? (
        <div className="border border-destructive/40 bg-destructive/5 rounded-lg p-3 mb-3">
          <p className="text-sm font-medium text-destructive">
            We could not read your saved settings.
          </p>
          <p className="text-xs text-destructive mt-1">{savedError}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Fields below marked "could not read" are exactly that. None of them is a blank field.
          </p>
        </div>
      ) : null}

      {summary && summary.stale > 0 ? (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-3">
          <p className="text-sm font-medium text-amber-900">
            Your saved settings and the live site disagree on {summary.stale}{" "}
            {summary.stale === 1 ? "field" : "fields"}.
          </p>
          <p className="text-xs text-amber-900 mt-1 max-w-prose">
            The site serves the settings it read when it last started, so a change written straight
            to the database does not reach it on its own. Reloading catches it up with no deploy.
          </p>
          <button
            onClick={resync}
            disabled={resyncing}
            className="mt-2 px-3 py-2 text-sm font-medium rounded-lg bg-teal-deep text-white disabled:opacity-50"
          >
            {resyncing ? "Reloading..." : "Reload the live settings"}
          </button>
        </div>
      ) : null}

      {resynced === "changed" ? (
        <p className="text-sm text-teal-deep mb-3">The live settings moved to match what is saved.</p>
      ) : null}
      {resynced === "already-current" ? (
        <p className="text-sm text-muted-foreground mb-3">
          The live settings already matched what is saved, so something else explains what you are
          seeing.
        </p>
      ) : null}

      {rows ? (
        <ul className="list-none p-0 m-0">
          {rows.map((row) => (
            <PreviewLine key={`${row.group}.${row.key}`} row={row} />
          ))}
        </ul>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Reading your saved settings...</p>
      ) : null}
    </div>
  );
}
