import { useState, useEffect, useCallback } from "react";
import { Lock, Eye, EyeOff, Inbox, Users, Circle, TrendingUp, Home, Sparkles, Users2, Trash2, ChevronDown, ChevronUp, Save, RefreshCw, LogOut, Mail, FileText, GraduationCap, Upload, ExternalLink, HelpCircle, Activity, Calendar, BarChart3, ArrowUp, ArrowDown, Plus, Coins, Handshake } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";
const FORM_TYPES = ["work-with-us", "investor", "steward", "resident", "prosperity", "contact"] as const;

function authHeaders(password: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${password}`, ...extra };
}
const CONTENT_SECTIONS = [
  { key: "investor", label: "Investor Journey", icon: TrendingUp },
  { key: "steward", label: "Steward Journey", icon: Users },
  { key: "resident", label: "Resident Journey", icon: Home },
  { key: "prosperity", label: "Prosperity Journey", icon: Sparkles },
  { key: "circles", label: "Circles", icon: Circle },
  { key: "roles", label: "Roles", icon: Users2 },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Submission {
  id: string;
  type: string;
  data: Record<string, any>;
  submittedAt: string;
  status?: string;
  userId?: string;
  userName?: string;
  rewarded?: boolean;
}

const SUBMISSION_STATUSES = ["new", "reviewing", "in-conversation", "accepted", "declined"];
const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  reviewing: "bg-amber-100 text-amber-800",
  "in-conversation": "bg-violet-100 text-violet-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-stone-100 text-stone-500",
};
function prettyType(t: string) {
  return t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Password Gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // Validate against the server (which reads ADMIN_PASSWORD from the environment)
  // rather than a hardcoded value, so rotating the password never locks admin out.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (res.ok) {
        onAuth(pw);
      } else {
        setError("Wrong password. Try again.");
        setPw("");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-[#2D5A5A] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
        <div className="w-14 h-14 rounded-full bg-[#2D5A5A]/10 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-7 h-7 text-[#2D5A5A]" />
        </div>
        <h1 className="font-display text-2xl font-bold text-center text-gray-900 mb-2">
          Amora Admin
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Enter the admin password to continue
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(""); }}
              placeholder="Password"
              autoFocus
              className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={checking}
            className="w-full py-3 bg-[#2D5A5A] text-white rounded-lg font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-60 transition-colors"
          >
            {checking ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Submissions Tab ───────────────────────────────────────────────────────────

function SubmissionsTab({ password }: { password: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all"
        ? `${API_BASE}/admin/submissions`
        : `${API_BASE}/admin/submissions?type=${filter}`;
      const res = await fetch(url, { headers: authHeaders(password) });
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch {
      setSubmissions([]);
    }
    setLoading(false);
  }, [password, filter]);

  useEffect(() => { load(); }, [load]);

  const deleteSubmission = async (id: string) => {
    if (!confirm("Delete this submission?")) return;
    await fetch(`${API_BASE}/admin/submissions/${id}`, { method: "DELETE", headers: authHeaders(password) });
    load();
  };

  const setStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/submissions/${id}/status`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      if (data.rewarded) toast.success("Accepted — the member was welcomed into the game.");
      else toast.success("Status updated");
      load();
    } catch { toast.error("Could not update status"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Form Submissions</h2>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          >
            <option value="all">All types</option>
            {FORM_TYPES.map((t) => (
              <option key={t} value={t}>{prettyType(t)}</option>
            ))}
          </select>
          <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No submissions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2D5A5A]/10 text-[#2D5A5A]">
                    {prettyType(s.type)}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[s.status ?? "new"] ?? STATUS_STYLE.new}`}>
                    {prettyType(s.status ?? "new")}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {s.data.name || s.data.firstName || s.data.email || "Anonymous"}
                  </span>
                  {s.userId && <span className="text-xs text-emerald-600" title="Submitted while signed in">● member</span>}
                  <span className="text-xs text-gray-400">
                    {new Date(s.submittedAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSubmission(s.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expanded === s.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expanded === s.id && (
                <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <label className="text-xs font-medium text-gray-500">Status</label>
                    <select
                      value={s.status ?? "new"}
                      onChange={(e) => setStatus(s.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    >
                      {SUBMISSION_STATUSES.map((st) => (
                        <option key={st} value={st}>{prettyType(st)}</option>
                      ))}
                    </select>
                    {s.userId && (
                      <span className="text-xs text-emerald-600">
                        Signed-in member{s.userName ? ` · ${s.userName}` : ""}{s.rewarded ? " · welcomed into the game ✓" : ""}
                      </span>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(s.data)
                        .filter(([k]) => k !== "attachmentName")
                        .map(([k, v]) => (
                        <tr key={k} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-4 font-medium text-gray-600 capitalize w-1/4 align-top">
                            {k.replace(/([A-Z])/g, " $1").trim()}
                          </td>
                          <td className="py-1.5 text-gray-800 whitespace-pre-wrap">
                            {k === "attachment" && v ? (
                              <a href={`${API_BASE}/uploads/${v}`} target="_blank" rel="noopener noreferrer" className="text-[#2D5A5A] underline">
                                {s.data.attachmentName || String(v)}
                              </a>
                            ) : Array.isArray(v) ? (
                              v.join(", ")
                            ) : (
                              String(v ?? "")
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Content Editor Tab ────────────────────────────────────────────────────────

function ContentEditorTab({ password, sectionKey, sectionLabel }: {
  password: string;
  sectionKey: string;
  sectionLabel: string;
}) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/content/${sectionKey}`);
      const data = await res.json();
      setRaw(JSON.stringify(data, null, 2));
    } catch {
      setRaw("// Error loading content");
    }
    setLoading(false);
  }, [sectionKey]);

  useEffect(() => { load(); setSaved(false); }, [load]);

  const save = async () => {
    setParseError("");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e: any) {
      setParseError("Invalid JSON: " + e.message);
      return;
    }
    setSaving(true);
    try {
      await fetch(`${API_BASE}/admin/content/${sectionKey}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(parsed),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setParseError("Save failed. Check server connection.");
    }
    setSaving(false);
  };

  // Journey steps have a friendlier structured editor
  const isJourney = ["investor", "steward", "resident", "prosperity"].includes(sectionKey);
  const journeyData = isJourney && raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Edit: {sectionLabel}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Changes save to the server and go live immediately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Structured editor for journey steps */}
          {isJourney && journeyData?.journeySteps && (
            <div className="mb-6 space-y-4">
              <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Journey Steps</h3>
              {(journeyData.journeySteps as any[]).map((step: any, idx: number) => (
                <div key={step.id || idx} className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Step Title</label>
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) => {
                          const updated = { ...journeyData };
                          updated.journeySteps[idx].title = e.target.value;
                          setRaw(JSON.stringify(updated, null, 2));
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
                      />
                    </div>
                    {step.stage && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Stage Label</label>
                        <input
                          type="text"
                          value={step.stage}
                          onChange={(e) => {
                            const updated = { ...journeyData };
                            updated.journeySteps[idx].stage = e.target.value;
                            setRaw(JSON.stringify(updated, null, 2));
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
                        />
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-500 block mb-1">Description</label>
                    <textarea
                      value={step.description}
                      rows={2}
                      onChange={(e) => {
                        const updated = { ...journeyData };
                        updated.journeySteps[idx].description = e.target.value;
                        setRaw(JSON.stringify(updated, null, 2));
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Checklist Items (one per line)</label>
                    <textarea
                      value={(step.details || []).join("\n")}
                      rows={4}
                      onChange={(e) => {
                        const updated = { ...journeyData };
                        updated.journeySteps[idx].details = e.target.value.split("\n").filter(Boolean);
                        setRaw(JSON.stringify(updated, null, 2));
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 resize-none font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Raw JSON editor, always shown, acts as ground truth */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {isJourney ? "Raw JSON (advanced edits)" : "Edit JSON"}
              </label>
              {parseError && (
                <span className="text-xs text-red-500">{parseError}</span>
              )}
            </div>
            <textarea
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setParseError(""); }}
              rows={isJourney ? 12 : 28}
              spellCheck={false}
              className="w-full px-4 py-3 text-xs font-mono border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 bg-gray-900 text-green-300 resize-none"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Email Settings Tab ────────────────────────────────────────────────────────

interface EmailConfig {
  investor: string;
  steward: string;
  resident: string;
  prosperity: string;
  resend_api_key: string;
  assistant_api_key: string;
}

function EmailSettingsTab({ password }: { password: string }) {
  const [cfg, setCfg] = useState<EmailConfig>({
    investor: "", steward: "", resident: "", prosperity: "", resend_api_key: "", assistant_api_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [sources, setSources] = useState<{ resend_from_env?: boolean; assistant_from_env?: boolean }>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/email-config`, { headers: authHeaders(password) });
      const data = await res.json();
      setSources(data._sources ?? {});
      setCfg({
        investor: data.investor ?? "",
        steward: data.steward ?? "",
        resident: data.resident ?? "",
        prosperity: data.prosperity ?? "",
        resend_api_key: data.resend_api_key ?? "",
        assistant_api_key: data.assistant_api_key ?? "",
      });
    } catch {
      toast.error("Failed to load email settings");
    }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/email-config`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Email settings saved");
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const Field = ({ label, value, onChange, hint, type = "email" }: {
    label: string; value: string; onChange: (v: string) => void; hint: string; type?: string;
  }) => (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
        placeholder={hint}
      />
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Email Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Form submissions are routed to the matching inbox via Resend.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-5 max-w-xl">
          <Field
            label="Business Inquiries (Prosperity / Contact)"
            value={cfg.prosperity}
            onChange={(v) => setCfg({ ...cfg, prosperity: v })}
            hint="Receives business and contact form submissions."
          />
          <Field
            label="Investor"
            value={cfg.investor}
            onChange={(v) => setCfg({ ...cfg, investor: v })}
            hint="Receives investor enquiries and document requests."
          />
          <Field
            label="Core Team (Steward)"
            value={cfg.steward}
            onChange={(v) => setCfg({ ...cfg, steward: v })}
            hint="Receives Village Steward applications."
          />
          <Field
            label="Resident"
            value={cfg.resident}
            onChange={(v) => setCfg({ ...cfg, resident: v })}
            hint="Receives Resident applications and waitlist signups."
          />

          <div className="border-t border-gray-100 pt-5">
            <label className="text-sm font-medium text-gray-700 block mb-1">Resend API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={cfg.resend_api_key}
                onChange={(e) => setCfg({ ...cfg, resend_api_key: e.target.value })}
                className="w-full px-3 py-2 pr-12 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 font-mono"
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {sources.resend_from_env
                ? "✓ A Resend key is provided by the hosting environment — emails are already routing. Type one here only to override it for this project."
                : "Get a key at resend.com → API Keys. Once saved, emails will route automatically."}
            </p>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="text-sm font-medium text-gray-700 block mb-1">Work With Us — AI guide (Anthropic API key)</label>
            <div className="relative">
              <input
                type={showAiKey ? "text" : "password"}
                value={cfg.assistant_api_key}
                onChange={(e) => setCfg({ ...cfg, assistant_api_key: e.target.value })}
                className="w-full px-3 py-2 pr-12 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 font-mono"
                placeholder="sk-ant-xxxxxxxxxxxxxxxxxxxx"
              />
              <button
                type="button"
                onClick={() => setShowAiKey(!showAiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {sources.assistant_from_env
                ? "✓ An Anthropic key is provided by the hosting environment — the guide is live. Type one here only to override it for this project."
                : "Powers the guide on the Work With Us page. Blank = the page shows the plain form only (no AI, no cost). Get a key at console.anthropic.com."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Investor Vault Tab ────────────────────────────────────────────────────────

interface InvestorDoc {
  id: string;
  name: string;
  filename: string;
  pageLink: string | null;
  uploadedAt: string;
}

function InvestorVaultTab({ password }: { password: string }) {
  const [docs, setDocs] = useState<InvestorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [pageLink, setPageLink] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/investor-docs`, { headers: authHeaders(password) });
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setDocs([]);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Pick a file first");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("name", name);
    if (pageLink) fd.append("pageLink", pageLink);
    try {
      const res = await fetch(`${API_BASE}/admin/investor-docs/upload`, {
        method: "POST",
        headers: authHeaders(password),
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Document uploaded");
      setName(""); setPageLink(""); setFile(null);
      const fileInput = document.getElementById("vault-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      load();
    } catch {
      toast.error("Upload failed");
    }
    setUploading(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this document permanently?")) return;
    try {
      await fetch(`${API_BASE}/admin/investor-docs/${id}`, { method: "DELETE", headers: authHeaders(password) });
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Investor Vault</h2>
          <p className="text-sm text-gray-500 mt-1">
            Documents shared with investors after they request the packet.
          </p>
        </div>
      </div>

      <form onSubmit={upload} className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">File</label>
            <input
              id="vault-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Display Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Investor Memo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Site Page Link (optional)</label>
          <input
            type="text"
            value={pageLink}
            onChange={(e) => setPageLink(e.target.value)}
            placeholder="/master-plan"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          />
        </div>
        <button
          type="submit"
          disabled={uploading || !file}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-50 transition-colors"
        >
          <Upload className="w-4 h-4" /> {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No documents in the vault yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <a
                    href={`${API_BASE}/uploads/${d.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-gray-900 hover:text-[#2D5A5A]"
                  >
                    {d.name}
                  </a>
                  {d.pageLink && (
                    <a
                      href={d.pageLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-[#2D5A5A]/10 text-[#2D5A5A] px-2 py-0.5 rounded-full"
                    >
                      {d.pageLink} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">
                  {d.filename} · {new Date(d.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => remove(d.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Training Modules Tab ──────────────────────────────────────────────────────

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  type: string;
  url: string;
  order: number;
}

const TRAINING_TYPES = ["Video", "Article", "Practice", "Workshop", "Live Session"];

function TrainingModulesTab({ password }: { password: string }) {
  const [mods, setMods] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Partial<TrainingModule>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/training-modules`, { headers: authHeaders(password) });
      const data = await res.json();
      setMods(Array.isArray(data) ? data : []);
    } catch {
      setMods([]);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (m: TrainingModule) => {
    setEditingId(m.id);
    setDraft({ ...m });
  };

  const startNew = () => {
    setEditingId("new");
    setDraft({ title: "", description: "", type: "Video", url: "", order: mods.length + 1 });
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const save = async () => {
    if (!draft.title || !draft.type) {
      toast.error("Title and type are required");
      return;
    }
    try {
      if (editingId === "new") {
        const res = await fetch(`${API_BASE}/admin/training-modules`, {
          method: "POST",
          headers: authHeaders(password, { "Content-Type": "application/json" }),
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error();
      } else if (editingId) {
        const res = await fetch(`${API_BASE}/admin/training-modules/${editingId}`, {
          method: "PUT",
          headers: authHeaders(password, { "Content-Type": "application/json" }),
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error();
      }
      toast.success("Saved");
      cancelEdit();
      load();
    } catch {
      toast.error("Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this module?")) return;
    try {
      await fetch(`${API_BASE}/admin/training-modules/${id}`, { method: "DELETE", headers: authHeaders(password) });
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const renderForm = () => (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Title</label>
          <input
            type="text"
            value={draft.title ?? ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
          <select
            value={draft.type ?? "Video"}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          >
            {TRAINING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Description</label>
        <textarea
          value={draft.description ?? ""}
          rows={2}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">URL</label>
          <input
            type="text"
            value={draft.url ?? ""}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Order</label>
          <input
            type="number"
            value={draft.order ?? 0}
            onChange={(e) => setDraft({ ...draft, order: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 transition-colors"
        >
          <Save className="w-4 h-4" /> Save
        </button>
        <button
          onClick={cancelEdit}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Training Modules</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage what shows on the /training page.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startNew}
            className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 transition-colors"
          >
            Add Module
          </button>
        )}
      </div>

      {editingId === "new" && <div className="mb-6">{renderForm()}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {mods.map((m) => editingId === m.id ? (
            <div key={m.id}>{renderForm()}</div>
          ) : (
            <div key={m.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-6">#{m.order}</span>
                  <span className="font-medium text-gray-900 truncate">{m.title}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#2D5A5A]/10 text-[#2D5A5A]">
                    {m.type}
                  </span>
                </div>
                {m.url && <div className="text-xs text-gray-400 mt-0.5 truncate">{m.url}</div>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(m)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(m.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FAQ Admin Tab (NEW-1) ─────────────────────────────────────────────────────

interface FaqItem { id: string; question: string; answer: string }
const FAQ_PATHWAYS: { id: "investor" | "steward" | "resident" | "prosperity"; label: string }[] = [
  { id: "investor", label: "Investor" },
  { id: "steward", label: "Steward" },
  { id: "resident", label: "Resident" },
  { id: "prosperity", label: "Prosperity" },
];

function FaqAdminTab({ password }: { password: string }) {
  const [pathway, setPathway] = useState<"investor" | "steward" | "resident" | "prosperity">("investor");
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ question: string; answer: string }>({ question: "", answer: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/faqs/${pathway}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [pathway]);

  useEffect(() => { load(); }, [load]);

  const persist = async (next: FaqItem[]) => {
    setItems(next);
    try {
      await fetch(`${API_BASE}/admin/faqs/${pathway}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(next),
      });
    } catch { toast.error("Save failed"); }
  };

  const add = async () => {
    if (!newQ.trim()) { toast.error("Question required"); return; }
    try {
      const res = await fetch(`${API_BASE}/admin/faqs/${pathway}`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ question: newQ.trim(), answer: newA.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewQ(""); setNewA("");
      toast.success("Added");
      load();
    } catch { toast.error("Add failed"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await fetch(`${API_BASE}/admin/faqs/${pathway}/${id}`, { method: "DELETE", headers: authHeaders(password) });
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const next = items.map((it) => it.id === editingId ? { ...it, question: editDraft.question, answer: editDraft.answer } : it);
    persist(next);
    setEditingId(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">FAQs</h2>
        <p className="text-sm text-gray-500">Manage the Common Questions section shown on each journey page.</p>
      </div>

      <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
        {FAQ_PATHWAYS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPathway(p.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pathway === p.id
                ? "border-[#2D5A5A] text-[#2D5A5A]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
        <input
          type="text"
          value={newQ}
          onChange={(e) => setNewQ(e.target.value)}
          placeholder="Question"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
        />
        <textarea
          value={newA}
          onChange={(e) => setNewA(e.target.value)}
          placeholder="Answer"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 resize-y"
        />
        <button
          onClick={add}
          className="flex items-center gap-2 px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No questions yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="border border-gray-200 rounded-xl px-5 py-4">
              {editingId === item.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editDraft.question}
                    onChange={(e) => setEditDraft({ ...editDraft, question: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40"
                  />
                  <textarea
                    value={editDraft.answer}
                    onChange={(e) => setEditDraft({ ...editDraft, answer: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D5A5A]/40 resize-y"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button onClick={() => move(idx, -1)} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center" disabled={idx === 0}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => move(idx, 1)} className="text-gray-300 hover:text-gray-600 disabled:opacity-30 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center" disabled={idx === items.length - 1}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 mb-1">{item.question}</div>
                    <div className="text-sm text-gray-600 leading-relaxed">{item.answer}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(item.id); setEditDraft({ question: item.question, answer: item.answer }); }}
                      className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(item.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Milestones Admin Tab (NEW-3) ──────────────────────────────────────────────

interface Milestone {
  id: string;
  phase: string;
  title: string;
  description: string;
  status: "complete" | "in-progress" | "upcoming" | "future";
  completedDate: string | null;
  updateNote: string;
  order: number;
}

function MilestonesAdminTab({ password }: { password: string }) {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<Milestone>>({ phase: "Phase 1", title: "", description: "", status: "upcoming" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/milestones`, { headers: authHeaders(password) });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: Partial<Milestone>) => {
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
    try {
      await fetch(`${API_BASE}/admin/milestones/${id}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
    } catch { toast.error("Save failed"); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this milestone?")) return;
    try {
      await fetch(`${API_BASE}/admin/milestones/${id}`, { method: "DELETE", headers: authHeaders(password) });
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const add = async () => {
    if (!draft.title || !draft.phase) { toast.error("Title and phase required"); return; }
    try {
      const res = await fetch(`${API_BASE}/admin/milestones`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      toast.success("Added");
      setAdding(false);
      setDraft({ phase: "Phase 1", title: "", description: "", status: "upcoming" });
      load();
    } catch { toast.error("Add failed"); }
  };

  // Group by phase
  const grouped = items.reduce<Record<string, Milestone[]>>((acc, m) => {
    (acc[m.phase] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Milestones</h2>
          <p className="text-sm text-gray-500 mt-1">Edit the Build Progress tracker shown on the homepage.</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90">
            Add Milestone
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={draft.phase ?? ""}
              onChange={(e) => setDraft({ ...draft, phase: e.target.value })}
              placeholder="Phase (e.g. Phase 1)"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
            <input
              type="text"
              value={draft.title ?? ""}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Title"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <textarea
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y"
          />
          <select
            value={draft.status ?? "upcoming"}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as Milestone["status"] })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="complete">Complete</option>
            <option value="in-progress">In Progress</option>
            <option value="upcoming">Planned</option>
            <option value="future">Future</option>
          </select>
          <div className="flex gap-2">
            <button onClick={add} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm">Add</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([phase, mils]) => (
            <div key={phase}>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{phase}</h3>
              <div className="space-y-2">
                {mils.map((m) => (
                  <div key={m.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, title: e.target.value } : x))}
                          onBlur={(e) => update(m.id, { title: e.target.value })}
                          className="w-full font-semibold text-gray-900 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:border-[#2D5A5A]/40 focus:outline-none"
                        />
                        <textarea
                          value={m.description}
                          onChange={(e) => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, description: e.target.value } : x))}
                          onBlur={(e) => update(m.id, { description: e.target.value })}
                          rows={2}
                          className="w-full text-sm text-gray-600 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:border-[#2D5A5A]/40 focus:outline-none resize-y mt-1"
                        />
                      </div>
                      <button onClick={() => remove(m.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={m.status}
                        onChange={(e) => update(m.id, { status: e.target.value as Milestone["status"] })}
                        className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                      >
                        <option value="complete">Complete</option>
                        <option value="in-progress">In Progress</option>
                        <option value="upcoming">Planned</option>
                        <option value="future">Future</option>
                      </select>
                      <input
                        type="text"
                        value={m.completedDate ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, completedDate: e.target.value || null } : x))}
                        onBlur={(e) => update(m.id, { completedDate: e.target.value || null })}
                        placeholder="YYYY-MM (if complete)"
                        className="px-2 py-1 text-xs border border-gray-200 rounded"
                      />
                      <input
                        type="text"
                        value={m.phase}
                        onChange={(e) => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, phase: e.target.value } : x))}
                        onBlur={(e) => update(m.id, { phase: e.target.value })}
                        placeholder="Phase"
                        className="px-2 py-1 text-xs border border-gray-200 rounded"
                      />
                    </div>
                    <input
                      type="text"
                      value={m.updateNote}
                      onChange={(e) => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, updateNote: e.target.value } : x))}
                      onBlur={(e) => update(m.id, { updateNote: e.target.value })}
                      placeholder="Status note (optional, shown on homepage)"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Visit Program Admin Tab (NEW-5) ───────────────────────────────────────────

interface VisitType {
  id: string;
  title: string;
  duration: string;
  format: string;
  cost: string;
  description: string;
  cta_label: string;
  cta_url: string;
  order: number;
}

interface VisitConfig {
  hero_subtitle: string;
  visit_types: VisitType[];
  logistics: { getting_there: string; accommodation: string; what_to_bring: string; contact_note: string };
}

function VisitAdminTab({ password }: { password: string }) {
  const [cfg, setCfg] = useState<VisitConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/visit-config`, { headers: authHeaders(password) });
      setCfg(await res.json());
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/visit-config`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const updateVisitType = (idx: number, patch: Partial<VisitType>) => {
    if (!cfg) return;
    const next = { ...cfg, visit_types: cfg.visit_types.map((v, i) => i === idx ? { ...v, ...patch } : v) };
    setCfg(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Visit Program</h2>
          <p className="text-sm text-gray-500 mt-1">Controls the /visit page.</p>
        </div>
        <button onClick={save} disabled={saving || loading} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {loading || !cfg ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Hero Subtitle</label>
            <textarea
              value={cfg.hero_subtitle}
              onChange={(e) => setCfg({ ...cfg, hero_subtitle: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y"
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Visit Types</h3>
            <div className="space-y-3">
              {cfg.visit_types.map((v, idx) => (
                <div key={v.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={v.title} onChange={(e) => updateVisitType(idx, { title: e.target.value })} placeholder="Title" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    <input type="text" value={v.duration} onChange={(e) => updateVisitType(idx, { duration: e.target.value })} placeholder="Duration" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    <input type="text" value={v.format} onChange={(e) => updateVisitType(idx, { format: e.target.value })} placeholder="Format" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    <input type="text" value={v.cost} onChange={(e) => updateVisitType(idx, { cost: e.target.value })} placeholder="Cost" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                  <textarea value={v.description} onChange={(e) => updateVisitType(idx, { description: e.target.value })} placeholder="Description" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={v.cta_label} onChange={(e) => updateVisitType(idx, { cta_label: e.target.value })} placeholder="CTA Label" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                    <input type="text" value={v.cta_url} onChange={(e) => updateVisitType(idx, { cta_url: e.target.value })} placeholder="CTA URL (blank = contact form)" className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Logistics</h3>
            <div className="space-y-3">
              {(["getting_there", "accommodation", "what_to_bring", "contact_note"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{k.replace(/_/g, " ")}</label>
                  <textarea
                    value={cfg.logistics[k]}
                    onChange={(e) => setCfg({ ...cfg, logistics: { ...cfg.logistics, [k]: e.target.value } })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Investor Summary Admin Tab (NEW-6) ────────────────────────────────────────

interface SummaryDetail { id: string; label: string; value: string; note: string; icon: string }
interface SummaryConfig {
  headline: string;
  intro: string;
  details: SummaryDetail[];
  disclaimer: string;
  cta_label: string;
  cta_url: string;
}

function InvestorSummaryAdminTab({ password }: { password: string }) {
  const [cfg, setCfg] = useState<SummaryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/investor-summary`, { headers: authHeaders(password) });
      setCfg(await res.json());
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/investor-summary`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const updateDetail = (idx: number, patch: Partial<SummaryDetail>) => {
    if (!cfg) return;
    setCfg({ ...cfg, details: cfg.details.map((d, i) => i === idx ? { ...d, ...patch } : d) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Investor Financial Summary</h2>
          <p className="text-sm text-gray-500 mt-1">Plain-language summary shown on /investor.</p>
        </div>
        <button onClick={save} disabled={saving || loading} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium hover:bg-[#2D5A5A]/90 disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {loading || !cfg ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Headline</label>
            <input type="text" value={cfg.headline} onChange={(e) => setCfg({ ...cfg, headline: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Intro</label>
            <textarea value={cfg.intro} onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Details</h3>
            <div className="space-y-3">
              {cfg.details.map((d, idx) => (
                <div key={d.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="text-xs uppercase tracking-widest text-gray-400">{d.id}</div>
                  <input type="text" value={d.label} onChange={(e) => updateDetail(idx, { label: e.target.value })} placeholder="Label" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  <input type="text" value={d.value} onChange={(e) => updateDetail(idx, { value: e.target.value })} placeholder="Value (large text)" className="w-full px-3 py-2 text-sm font-semibold border border-gray-200 rounded-lg" />
                  <textarea value={d.note} onChange={(e) => updateDetail(idx, { note: e.target.value })} placeholder="Explanation note" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Disclaimer</label>
            <textarea value={cfg.disclaimer} onChange={(e) => setCfg({ ...cfg, disclaimer: e.target.value })} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">CTA Label</label>
              <input type="text" value={cfg.cta_label} onChange={(e) => setCfg({ ...cfg, cta_label: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">CTA URL</label>
              <input type="text" value={cfg.cta_url} onChange={(e) => setCfg({ ...cfg, cta_url: e.target.value })} placeholder="leave blank to hide" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Game Admin: Quest Claims consent queue ────────────────────────────────────

function QuestClaimsTab({ password }: { password: string }) {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/quest-claims`, { headers: authHeaders(password) });
      const data = await res.json();
      setClaims(Array.isArray(data) ? data : []);
    } catch { setClaims([]); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const consent = async (id: string, approve: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/admin/quest-claims/${id}/consent`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ approve, amount: amounts[id] ?? 50 }),
      });
      if (!res.ok) throw new Error();
      toast.success(approve ? "Consented and credited" : "Declined");
      load();
    } catch { toast.error("Action failed"); }
  };

  const pending = claims.filter((c) => c.status === "submitted");
  const active = claims.filter((c) => c.status === "claimed");
  const resolved = claims.filter((c) => c.status === "consented" || c.status === "declined");

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Quest Claims</h2>
        <p className="text-sm text-gray-500 mt-1">Consent releases the reward. Value only moves with a human yes.</p>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Awaiting consent ({pending.length})</h3>
            {pending.length === 0 && <p className="text-sm text-gray-400">Nothing waiting.</p>}
            <div className="space-y-2">
              {pending.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-medium text-gray-900">{c.userName}</span>
                    <span className="text-xs text-gray-400">{new Date(c.submittedAt ?? c.claimedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{c.questTitle}</p>
                  {c.note && <p className="text-sm text-gray-500 italic mb-1">"{c.note}"</p>}
                  {c.artifactUrl && (
                    <a href={c.artifactUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#2D5A5A] underline break-all">
                      {c.artifactUrl}
                    </a>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      type="number"
                      min={0}
                      value={amounts[c.id] ?? 50}
                      onChange={(e) => setAmounts({ ...amounts, [c.id]: parseInt(e.target.value) || 0 })}
                      className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                    />
                    <button onClick={() => consent(c.id, true)} className="px-3 py-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg">
                      Consent + credit
                    </button>
                    <button onClick={() => consent(c.id, false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">In progress ({active.length})</h3>
            {active.map((c) => (
              <p key={c.id} className="text-sm text-gray-600 py-1">{c.userName} · {c.questTitle}</p>
            ))}
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Resolved ({resolved.length})</h3>
            {resolved.slice(0, 10).map((c) => (
              <p key={c.id} className="text-sm text-gray-400 py-1">
                {c.userName} · {c.questTitle} · {c.status}{c.amount ? ` (+${c.amount})` : ""}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Game Admin: Players + stage grants ───────────────────────────────────────

function PlayersTab({ password }: { password: string }) {
  const [players, setPlayers] = useState<any[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/admin/players`, { headers: authHeaders(password) }),
        fetch(`${API_BASE}/game/config`),
      ]);
      const p = await pRes.json();
      const c = await cRes.json();
      setPlayers(Array.isArray(p) ? p : []);
      setStages(c?.stages ?? []);
    } catch { setPlayers([]); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const grant = async (id: string, stageId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/players/${id}/stage`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ stageId: stageId || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Stage updated");
      load();
    } catch { toast.error("Update failed"); }
  };

  const remove = async (id: string, email: string) => {
    if (!confirm(`Delete player ${email}? This removes their account. Historical quest claims and gratitude entries are kept.`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/players/${id}`, {
        method: "DELETE",
        headers: authHeaders(password),
      });
      if (!res.ok) throw new Error();
      toast.success("Player deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Players</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stages compute automatically from real acts; grant the ceremony-based stages here.
        </p>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : players.length === 0 ? (
        <p className="text-sm text-gray-400">No players yet.</p>
      ) : (
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="font-medium text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-400">{p.email} · joined {new Date(p.joinedAt).toLocaleDateString()}</div>
              </div>
              <span className="text-xs bg-[#2D5A5A]/10 text-[#2D5A5A] px-2 py-1 rounded-full font-medium">
                {stages.find((s) => s.id === p.stageComputed)?.name ?? p.stageComputed}
              </span>
              <span className="text-xs text-gray-500">{p.balance} earned</span>
              <select
                value={p.stageGranted ?? ""}
                onChange={(e) => grant(p.id, e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">No grant</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>Grant: {s.name}</option>
                ))}
              </select>
              <button
                onClick={() => remove(p.id, p.email)}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Game Admin: Season editor ─────────────────────────────────────────────────

function SeasonTab({ password }: { password: string }) {
  const [season, setSeason] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/season`).then((r) => r.json()).then(setSeason).catch(() => { /* silent */ });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/season`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(season),
      });
      if (!res.ok) throw new Error();
      toast.success("Season saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!season) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Current Season</h2>
          <p className="text-sm text-gray-500 mt-1">Shown as the banner on the homepage. Give each season a name, a theme, and a closing date.</p>
        </div>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="space-y-4 max-w-xl">
        {(["name", "theme", "focus"] as const).map((k) => (
          <div key={k}>
            <label className="text-sm font-medium text-gray-700 block mb-1 capitalize">{k}</label>
            <input
              type="text"
              value={season[k] ?? ""}
              onChange={(e) => setSeason({ ...season, [k]: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Starts (YYYY-MM-DD)</label>
            <input type="text" value={season.startsOn ?? ""} onChange={(e) => setSeason({ ...season, startsOn: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Ends (YYYY-MM-DD)</label>
            <input type="text" value={season.endsOn ?? ""} onChange={(e) => setSeason({ ...season, endsOn: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Setup Wizard: the white-label front door — make this site your project's ───

function SetupWizard({ password, onOpenTab }: { password: string; onOpenTab: (tab: string) => void }) {
  const [brand, setBrand] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/brand`, { headers: authHeaders(password) });
      const data = await res.json();
      setBrand(data.brand);
      setDefaults(data.defaults);
    } catch { toast.error("Failed to load setup"); }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const saveBrand = async (section: string, partial: any) => {
    setSavingSection(section);
    try {
      const res = await fetch(`${API_BASE}/admin/brand`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBrand(data.brand);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    setSavingSection(null);
  };

  const setField = (group: "project" | "currency" | "images", key: string, value: string) =>
    setBrand({ ...brand, [group]: { ...brand[group], [key]: value } });

  const toggleStep = (key: string) => {
    const next = { ...brand.setup, [key]: !brand.setup[key] };
    setBrand({ ...brand, setup: next });
    saveBrand("setup", { setup: next });
  };

  if (!brand || !defaults) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const steps = [
    { key: "identity", label: "Identity" },
    { key: "images", label: "Pictures" },
    { key: "numbers", label: "Numbers" },
    { key: "content", label: "Content" },
    { key: "technical", label: "Go live" },
  ];
  const doneCount = steps.filter((s) => brand.setup?.[s.key]).length;

  const brandField = (group: "project" | "currency", key: string, label: string, defaultVal: string) => (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        value={brand[group][key] ?? ""}
        onChange={(e) => setField(group, key, e.target.value)}
        placeholder={defaultVal}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
      />
      <p className="text-[11px] text-gray-400 mt-0.5">Amora's value: {defaultVal}</p>
    </div>
  );

  const imageField = (key: string, label: string) => (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <input
        type="url"
        value={brand.images[key] ?? ""}
        onChange={(e) => setField("images", key, e.target.value)}
        placeholder={defaults.images[key]}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
      />
      <div className="mt-1.5 h-16 w-28 rounded-md bg-gray-100 overflow-hidden border border-gray-200">
        <img src={brand.images[key] || defaults.images[key]} alt="" className="w-full h-full object-cover" />
      </div>
    </div>
  );

  const contentEditors = [
    { tab: "investor", label: "Journey page copy", hint: "Hero text, steps, sections for each of the 4 pathways (use the Content editors)." },
    { tab: "faqs", label: "FAQs", hint: "The Common Questions on each journey page." },
    { tab: "milestones", label: "Build Progress", hint: "Your real build milestones shown on the homepage." },
    { tab: "training-modules", label: "Training modules", hint: "Your community's onboarding/learning modules." },
    { tab: "visit-config", label: "Visit program", hint: "Visit types, logistics, and booking copy." },
    { tab: "investor-summary", label: "Investor summary", hint: "The plain-language money facts on the investor page." },
    { tab: "season", label: "Season", hint: "The current season banner (name, theme, dates)." },
    { tab: "quest-claims", label: "Quests", hint: "Your quest library is seeded; review and reward completions here." },
  ];

  const Section = ({ id, n, title, subtitle, children }: any) => (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-[#2D5A5A] text-white text-sm font-bold flex items-center justify-center">{n}</span>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600 shrink-0 cursor-pointer">
          <input type="checkbox" checked={!!brand.setup?.[id]} onChange={() => toggleStep(id)} className="h-4 w-4 accent-[#2D5A5A]" />
          Done
        </label>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Make This Site Yours</h2>
        <p className="text-sm text-gray-500 mt-1">
          Everything you need to turn this into your project's coordination game. Blank fields keep Amora's value as the suggestion.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-xs">
            <div className="h-2 bg-[#2D5A5A] rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <span className="text-sm text-gray-500">{doneCount} / {steps.length} steps</span>
        </div>
      </div>

      <Section id="identity" n={1} title="Identity" subtitle="What your project is called.">
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {brandField("project", "name", "Project name", defaults.project.name)}
          {brandField("project", "tagline", "Tagline", defaults.project.tagline)}
          {brandField("project", "memberName", "What a member is called", defaults.project.memberName)}
          {brandField("project", "location", "Location", defaults.project.location)}
          {brandField("currency", "name", "Recognition currency name", defaults.currency.name)}
          {brandField("currency", "nameLower", "Currency, lowercase (in a sentence)", defaults.currency.nameLower)}
        </div>
        <button onClick={() => saveBrand("identity", { project: brand.project, currency: brand.currency })} disabled={savingSection === "identity"} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {savingSection === "identity" ? "Saving..." : "Save identity"}
        </button>
        <p className="text-xs text-gray-400 mt-2">Instantly updates the game layer (profile, gratitude, season banner, pulse). Page marketing copy is edited under Content below.</p>
      </Section>

      <Section id="images" n={2} title="Pictures" subtitle="Hero images across the site. Paste an image URL; landscape works best.">
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          {imageField("hero", "Homepage hero")}
          {imageField("investorHero", "Investor hero")}
          {imageField("residentHero", "Resident hero")}
          {imageField("stewardHero", "Steward hero")}
          {imageField("prosperityHero", "Prosperity hero")}
          {imageField("masterPlanHero", "Master plan hero")}
        </div>
        <button onClick={() => saveBrand("images", { images: brand.images })} disabled={savingSection === "images"} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {savingSection === "images" ? "Saving..." : "Save pictures"}
        </button>
        <p className="text-xs text-gray-400 mt-2">The social-share image and browser favicon are set at build time in <code>client/index.html</code> (see Go live).</p>
      </Section>

      <Section id="numbers" n={3} title="Numbers" subtitle="The editable figures on your site.">
        <p className="text-sm text-gray-600 mb-3">Village dues and other numbers live in the Settings tab.</p>
        <button onClick={() => onOpenTab("settings")} className="px-4 py-2 bg-white border border-gray-200 text-[#2D5A5A] rounded-lg text-sm font-medium hover:bg-gray-50">
          Open Settings →
        </button>
      </Section>

      <Section id="content" n={4} title="Content" subtitle="Rewrite the words, questions, milestones, and quests for your project.">
        <div className="space-y-2">
          {contentEditors.map((c) => (
            <div key={c.tab} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{c.label}</div>
                <div className="text-xs text-gray-500 truncate">{c.hint}</div>
              </div>
              <button onClick={() => onOpenTab(c.tab)} className="shrink-0 px-3 py-1.5 text-xs font-medium text-[#2D5A5A] border border-gray-200 rounded-lg hover:bg-gray-50">
                Open →
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section id="technical" n={5} title="Go live" subtitle="One-time technical setup. Hand these to your developer or Claude Code.">
        <ol className="space-y-4 text-sm text-gray-700">
          <li>
            <p className="font-medium text-gray-900">1. Deploy on Railway</p>
            <p className="text-gray-500 mb-1">From the project folder, with the Railway CLI linked to your service:</p>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto">railway up --ci -m "Initial deploy"</pre>
          </li>
          <li>
            <p className="font-medium text-gray-900">2. Add a persistent data volume</p>
            <p className="text-gray-500 mb-1">All player and content data lives here. Without it, every deploy wipes it.</p>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto">railway volume add --mount-path /app/data</pre>
          </li>
          <li>
            <p className="font-medium text-gray-900">3. Set environment variables</p>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto">{`railway variables \\
  --set "ADMIN_PASSWORD=<pick-a-strong-one>" \\
  --set "JOURNEY_PASSWORD=<pick-a-strong-one>" \\
  --set "FRONTEND_URL=https://your-domain"`}</pre>
            <p className="text-gray-500 mt-1">The Resend email API key is set later inside admin, under Notifications.</p>
          </li>
          <li>
            <p className="font-medium text-gray-900">4. Point your domain</p>
            <p className="text-gray-500">Railway dashboard → your service → Settings → Networking → add your custom domain, then add the CNAME it gives you at your DNS host.</p>
          </li>
          <li>
            <p className="font-medium text-gray-900">5. Social image & favicon</p>
            <p className="text-gray-500">Edit <code>client/index.html</code>: the <code>og:image</code>, <code>twitter:image</code>, and favicon links (these are build-time, not in this wizard).</p>
          </li>
          <li>
            <p className="font-medium text-gray-900">6. Full reference</p>
            <p className="text-gray-500">See <code>PLATFORM_FOUNDATION.md</code> in the repo for the complete white-label architecture and swap points.</p>
          </li>
        </ol>
      </Section>
    </div>
  );
}

// ── Settings: editable project numbers (village dues, etc.) ───────────────────

function SettingsTab({ password }: { password: string }) {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/settings`, { headers: authHeaders(password) })
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Failed to load settings"));
  }, [password]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!settings) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const dues = settings.villageDues ?? {};
  const setDues = (patch: any) => setSettings({ ...settings, villageDues: { ...dues, ...patch } });
  const preview = dues.amount ? `${dues.currency || "$"}${dues.amount} / ${dues.period || "month"}` : "— not shown until you set an amount —";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">The plain numbers on the site you can change any time, no code needed.</p>
        </div>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl p-5 max-w-xl">
        <h3 className="font-semibold text-gray-900 mb-1">Village Dues</h3>
        <p className="text-sm text-gray-500 mb-4">
          Shown on the Resident page. Leave the amount blank while it's still to be confirmed and no figure appears on the site.
        </p>
        <div className="grid grid-cols-[1fr_90px_90px] gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Amount</label>
            <input
              type="number"
              min={0}
              value={dues.amount ?? ""}
              onChange={(e) => setDues({ amount: e.target.value })}
              placeholder="e.g. 250"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Currency</label>
            <input
              type="text"
              value={dues.currency ?? "$"}
              onChange={(e) => setDues({ currency: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Per</label>
            <input
              type="text"
              value={dues.period ?? "month"}
              onChange={(e) => setDues({ period: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Explanation note (shown under the figure)</label>
        <textarea
          value={dues.note ?? ""}
          onChange={(e) => setDues({ note: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y mb-3"
        />
        <div className="text-sm text-gray-500">
          Preview on site: <span className="font-semibold text-[#2D5A5A]">{preview}</span>
        </div>
      </div>
    </div>
  );
}

// ── Work With Us content tab (exchange types + Maia) ──────────────────────────

function WorkWithUsTab({ password }: { password: string }) {
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/work-with-us-config`, { headers: authHeaders(password) })
      .then((r) => r.json()).then(setCfg).catch(() => toast.error("Failed to load"));
  }, [password]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/work-with-us-config`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  if (!cfg) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const opts = cfg.reciprocityOptions ?? [];
  const setOpt = (i: number, patch: any) =>
    setCfg({ ...cfg, reciprocityOptions: opts.map((o: any, j: number) => (j === i ? { ...o, ...patch } : o)) });
  const addOpt = () => setCfg({ ...cfg, reciprocityOptions: [...opts, { value: "", title: "", desc: "" }] });
  const removeOpt = (i: number) => setCfg({ ...cfg, reciprocityOptions: opts.filter((_: any, j: number) => j !== i) });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Work With Us</h2>
          <p className="text-sm text-gray-500 mt-1">The intro, the reciprocity (exchange) options, and your AI guide's name and greeting.</p>
        </div>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="space-y-5 max-w-2xl">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Intro paragraph</label>
          <textarea value={cfg.intro ?? ""} onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">AI guide's name</label>
            <input type="text" value={cfg.assistantName ?? ""} onChange={(e) => setCfg({ ...cfg, assistantName: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Gratitude on accepted proposal</label>
            <input type="number" min={0} value={cfg.acceptGratitude ?? 0} onChange={(e) => setCfg({ ...cfg, acceptGratitude: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Guide's opening greeting</label>
          <textarea value={cfg.assistantGreeting ?? ""} onChange={(e) => setCfg({ ...cfg, assistantGreeting: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
          <p className="text-[11px] text-gray-400 mt-0.5">Use {"{name}"} where the guide's name should appear.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Reciprocity (exchange) options</label>
            <button onClick={addOpt} className="text-xs text-[#2D5A5A] font-medium hover:underline">+ Add option</button>
          </div>
          <div className="space-y-3">
            {opts.map((o: any, i: number) => (
              <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input type="text" value={o.title} onChange={(e) => setOpt(i, { title: e.target.value })} placeholder="Title (shown)" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  <input type="text" value={o.value} onChange={(e) => setOpt(i, { value: e.target.value })} placeholder="Value (stored)" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                  <button onClick={() => removeOpt(i)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea value={o.desc} onChange={(e) => setOpt(i, { desc: e.target.value })} rows={2} placeholder="Description" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function Admin() {
  const [password, setPassword] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("submissions");

  if (!password) {
    return <PasswordGate onAuth={setPassword} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#2D5A5A] text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight">Amora Admin</h1>
            <p className="text-xs text-white/60">game.amora.cr</p>
          </div>
        </div>
        <button
          onClick={() => setPassword(null)}
          className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </header>

      <div className="flex">
        <nav className="w-56 min-h-[calc(100vh-60px)] bg-white border-r border-gray-200 py-6 flex-shrink-0">
          <div className="px-4 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Start Here</p>
          </div>
          <button
            onClick={() => setActiveTab("setup")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === "setup"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-[#2D5A5A] hover:bg-gray-50"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Make This Yours
          </button>

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Submissions</p>
          </div>
          <button
            onClick={() => setActiveTab("submissions")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "submissions"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Inbox className="w-4 h-4" />
            All Forms
          </button>

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Content</p>
          </div>
          {CONTENT_SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Notifications</p>
          </div>
          <button
            onClick={() => setActiveTab("email-settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "email-settings"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Mail className="w-4 h-4" />
            Email Settings
          </button>

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Documents</p>
          </div>
          <button
            onClick={() => setActiveTab("investor-vault")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "investor-vault"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FileText className="w-4 h-4" />
            Investor Vault
          </button>

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Training</p>
          </div>
          <button
            onClick={() => setActiveTab("training-modules")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "training-modules"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Modules
          </button>

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">The Game</p>
          </div>
          {[
            { key: "quest-claims", label: "Quest Claims", icon: Sparkles },
            { key: "players", label: "Players", icon: Users },
            { key: "season", label: "Season", icon: Circle },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}

          <div className="px-4 mt-6 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Site Content</p>
          </div>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Coins className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => setActiveTab("work-with-us")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "work-with-us"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Handshake className="w-4 h-4" />
            Work With Us
          </button>
          <button
            onClick={() => setActiveTab("faqs")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "faqs"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            FAQs
          </button>
          <button
            onClick={() => setActiveTab("milestones")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "milestones"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Activity className="w-4 h-4" />
            Build Progress
          </button>
          <button
            onClick={() => setActiveTab("visit-config")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "visit-config"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Visit Program
          </button>
          <button
            onClick={() => setActiveTab("investor-summary")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "investor-summary"
                ? "bg-[#2D5A5A]/10 text-[#2D5A5A] border-r-2 border-[#2D5A5A]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Investor Summary
          </button>
        </nav>

        <main className="flex-1 p-8 max-w-4xl">
          {activeTab === "setup" && <SetupWizard password={password} onOpenTab={setActiveTab} />}
          {activeTab === "submissions" && <SubmissionsTab password={password} />}
          {CONTENT_SECTIONS.map(({ key, label }) =>
            activeTab === key ? (
              <ContentEditorTab key={key} password={password} sectionKey={key} sectionLabel={label} />
            ) : null
          )}
          {activeTab === "email-settings" && <EmailSettingsTab password={password} />}
          {activeTab === "investor-vault" && <InvestorVaultTab password={password} />}
          {activeTab === "training-modules" && <TrainingModulesTab password={password} />}
          {activeTab === "quest-claims" && <QuestClaimsTab password={password} />}
          {activeTab === "players" && <PlayersTab password={password} />}
          {activeTab === "season" && <SeasonTab password={password} />}
          {activeTab === "settings" && <SettingsTab password={password} />}
          {activeTab === "work-with-us" && <WorkWithUsTab password={password} />}
          {activeTab === "faqs" && <FaqAdminTab password={password} />}
          {activeTab === "milestones" && <MilestonesAdminTab password={password} />}
          {activeTab === "visit-config" && <VisitAdminTab password={password} />}
          {activeTab === "investor-summary" && <InvestorSummaryAdminTab password={password} />}
        </main>
      </div>
    </div>
  );
}