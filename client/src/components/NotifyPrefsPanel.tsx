/**
 * Notification preferences + data rights (S16/S18): cadence choices per
 * event family, the global email switch, and the two Law-8968 surfaces —
 * export everything, or leave and be anonymized.
 */
import { useEffect, useState } from "react";
import { Bell, Download, ShieldOff } from "lucide-react";
import { authToken } from "@/lib/gameApi";

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
};

const LABELS: Record<string, string> = {
  questsEmail: "Quest decisions",
  rolesEmail: "Role appointments",
  gratitudeEmail: "Appreciation received",
};

export default function NotifyPrefsPanel({ onDeleted }: { onDeleted?: () => void }) {
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const headers = () => ({ Authorization: `Bearer ${authToken()}`, "Content-Type": "application/json" });

  useEffect(() => {
    fetch("/api/profile/prefs", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPrefs(d?.notify ?? null))
      .catch(() => {});
  }, []);

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
        localStorage.removeItem("token");
        onDeleted?.();
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

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <a
          href="/api/profile/export"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-deep hover:text-teal"
          onClick={(e) => {
            // Anchor downloads can't carry the auth header; fetch + blob it.
            e.preventDefault();
            fetch("/api/profile/export", { headers: headers() })
              .then((r) => r.blob())
              .then((b) => {
                const url = URL.createObjectURL(b);
                const a = document.createElement("a");
                a.href = url;
                a.download = "my-data.json";
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => {});
          }}
        >
          <Download className="w-4 h-4" />
          Download everything the village holds about me
        </a>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
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
