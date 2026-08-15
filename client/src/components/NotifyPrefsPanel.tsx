/**
 * Notification preferences + data rights (S16/S18): cadence choices per
 * event family, the global email switch, and the two Law-8968 surfaces —
 * export everything, or leave and be anonymized.
 */
import { useEffect, useState } from "react";
import { Bell, Download, ShieldOff } from "lucide-react";
import { authToken, clearAuthToken } from "@/lib/gameApi";

const CADENCES: Record<string, Array<{ v: string; label: string }>> = {
  questsEmail: [
    { v: "immediate", label: "Right away" },
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
  rolesEmail: [
    { v: "immediate", label: "Right away" },
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
  gratitudeEmail: [
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
  mentionsEmail: [
    { v: "immediate", label: "Right away" },
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
  repliesEmail: [
    { v: "immediate", label: "Right away" },
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
  messagesEmail: [
    { v: "immediate", label: "Right away" },
    { v: "daily", label: "Daily digest" },
    { v: "off", label: "In-app only" },
  ],
};

const LABELS: Record<string, string> = {
  questsEmail: "Quest decisions",
  rolesEmail: "Role appointments",
  gratitudeEmail: "Appreciation received",
  mentionsEmail: "Someone mentions you",
  repliesEmail: "Replies to your threads",
  messagesEmail: "New messages",
};

export default function NotifyPrefsPanel({ onDeleted }: { onDeleted?: () => void }) {
  const [prefs, setPrefs] = useState<any>(null);
  const [contactable, setContactable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  /** Set only when an outside store did not confirm. Holds the redirect open. */
  const [farewell, setFarewell] = useState("");

  const headers = () => ({ Authorization: `Bearer ${authToken()}`, "Content-Type": "application/json" });

  useEffect(() => {
    fetch("/api/profile/prefs", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPrefs(d?.notify ?? null))
      .catch(() => {});
    fetch("/api/profile", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setContactable(d.contactable !== false); })
      .catch(() => {});
  }, []);

  const saveContactable = (next: boolean) => {
    setContactable(next);
    fetch("/api/game/preferences", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ contactable: next }),
    }).catch(() => {});
  };

  const save = (patch: Record<string, any>) => {
    setSaving(true);
    fetch("/api/profile/prefs", { method: "PUT", headers: headers(), body: JSON.stringify({ notify: patch }) })
      .then((r) => r.json())
      .then((d) => setPrefs(d?.notify ?? prefs))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const deleteAccount = () => {
    setError("");
    fetch("/api/profile/delete-account", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ password }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not delete");
        clearAuthToken();
        onDeleted?.();
        /*
         * A member is never told "deleted" about a store that did not answer.
         *
         * Where a connected service has not confirmed, the redirect waits and
         * the sentence is shown, because a page that vanishes the instant the
         * local scrub finishes would have told this person the whole job was
         * done. Where everything confirmed, nothing changes.
         */
        if (d?.external?.unconfirmed?.length) {
          setFarewell(d.message || "Some connected services have not confirmed yet.");
          return;
        }
        window.location.href = "/";
      })
      .catch((e) => setError(e.message));
  };

  if (!prefs) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-teal-deep" />
        <h2 className="font-display text-xl font-bold text-gray-900">Notifications &amp; your data</h2>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
        <input
          type="checkbox"
          checked={!prefs.emailsOff}
          disabled={saving}
          onChange={(e) => save({ emailsOff: !e.target.checked })}
        />
        Email me about village activity
      </label>

      {!prefs.emailsOff && (
        <div className="space-y-2.5 mb-6">
          {Object.keys(LABELS).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">{LABELS[key]}</span>
              <select
                value={prefs[key]}
                disabled={saving}
                onChange={(e) => save({ [key]: e.target.value })}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              >
                {CADENCES[key].map((c) => (
                  <option key={c.v} value={c.v}>{c.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {contactable !== null && (
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
          <input type="checkbox" checked={contactable} onChange={(e) => saveContactable(e.target.checked)} />
          Contactable through the Village Map
          <span className="text-xs text-gray-600">(role holders only; senders see a relay, never your email)</span>
        </label>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <a
          href="/api/profile/export"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-deep hover:text-teal"
          onClick={(e) => {
            // Anchor downloads can't carry the auth header; fetch + blob it.
            e.preventDefault();
            setError("");
            fetch("/api/profile/export", { headers: headers() })
              .then((r) => {
                // fetch resolves for 4xx too, so without this check an
                // expired session downloaded a 24-byte {"error":...} file
                // NAMED my-data.json — a member could believe they held
                // their whole record and be holding an error message.
                if (!r.ok) throw new Error("export failed");
                return r.blob();
              })
              .then((b) => {
                const url = URL.createObjectURL(b);
                const a = document.createElement("a");
                a.href = url;
                a.download = "my-data.json";
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => setError("Could not build your export. Please sign in again and retry."));
          }}
        >
          <Download className="w-4 h-4" />
          Download everything the village holds about me
        </a>
        {/* Rendered OUTSIDE the delete-confirmation branch: `error` is shared
            with that flow, and its only renderer used to live in there, so an
            export failure was written to state nothing displayed. */}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        {farewell ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-900">{farewell}</p>
            <button
              onClick={() => { window.location.href = "/"; }}
              className="text-sm text-amber-900 underline mt-2"
            >
              I have read this
            </button>
          </div>
        ) : !confirming ? (
          <button
            // Clear a stale export error on the way in, so it cannot appear
            // to be about the deletion the member is now considering.
            onClick={() => { setError(""); setConfirming(true); }}
            className="inline-flex items-center gap-2 text-sm text-red-500 hover:text-red-600"
          >
            <ShieldOff className="w-4 h-4" />
            Delete my account
          </button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-800 mb-2">
              This anonymizes you permanently: your name, contact details and profile are
              scrubbed everywhere. The village's shared history (settlements, quest
              records) keeps its numbers, without your name on them. This cannot be undone.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm your password"
                className="text-sm border border-red-200 rounded-lg px-3 py-1.5"
              />
              <button onClick={deleteAccount} disabled={!password}
                className="text-sm bg-red-600 text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-40">
                Delete forever
              </button>
              <button onClick={() => { setConfirming(false); setPassword(""); setError(""); }}
                className="text-sm text-gray-500">
                Cancel
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
