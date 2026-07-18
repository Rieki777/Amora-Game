import { gameFetch, QuestClaim } from "@/lib/gameApi";
import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Send, Sparkles } from "lucide-react";

/** Server quest ids are derived from titles; keep in sync with data/quests-seed.json generation. */
export function questIdFromTitle(title: string): string {
  return "q-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function QuestActions({
  questId,
  signedIn,
  claim,
  onChanged,
}: {
  questId: string;
  signedIn: boolean;
  claim: QuestClaim | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  if (!signedIn) {
    return (
      <div className="px-6 py-3 border-t border-border">
        <Link href="/register" className="text-sm font-semibold text-teal-deep hover:text-teal transition-colors">
          Sign in to claim this quest
        </Link>
      </div>
    );
  }

  const doClaim = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await gameFetch(`/api/game/quests/${questId}/claim`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not claim");
      } else {
        onChanged();
      }
    } catch {
      setError("Could not claim. Try again.");
    }
    setBusy(false);
  };

  const doSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await gameFetch(`/api/game/quests/${questId}/submit`, {
        method: "POST",
        body: JSON.stringify({ artifactUrl, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not submit");
      } else {
        setShowSubmit(false);
        onChanged();
      }
    } catch {
      setError("Could not submit. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="px-6 py-3 border-t border-border">
      {!claim || claim.status === "declined" ? (
        <button
          onClick={doClaim}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-teal-deep text-white px-4 py-2 rounded-lg hover:bg-teal disabled:opacity-50 transition-colors pointer-coarse:min-h-11"
        >
          <Sparkles className="w-4 h-4" /> {busy ? "Claiming..." : "Claim this quest"}
        </button>
      ) : claim.status === "claimed" ? (
        showSubmit ? (
          <form onSubmit={doSubmit} className="space-y-2">
            <input
              type="url"
              value={artifactUrl}
              onChange={(e) => setArtifactUrl(e.target.value)}
              placeholder="Link to your work (photo, doc...)"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-teal-deep"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A few words about what you did"
              rows={2}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:border-teal-deep resize-y"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-teal-deep text-white px-3 py-1.5 rounded-lg hover:bg-teal disabled:opacity-50 transition-colors pointer-coarse:min-h-11">
                <Send className="w-3.5 h-3.5" /> Submit
              </button>
              <button type="button" onClick={() => setShowSubmit(false)} className="text-sm text-muted-foreground px-2 pointer-coarse:min-h-11 pointer-coarse:px-3">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowSubmit(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-amber text-teal-deep px-4 py-2 rounded-lg hover:bg-amber/90 transition-colors pointer-coarse:min-h-11"
          >
            <Send className="w-4 h-4" /> Submit your work
          </button>
        )
      ) : claim.status === "submitted" ? (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-blue-700">
          <Send className="w-4 h-4" /> Submitted, awaiting circle consent
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> Completed{claim.amount ? ` · +${claim.amount}` : ""}
        </span>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
