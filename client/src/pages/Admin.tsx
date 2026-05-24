import { useState, useEffect, useCallback } from "react";
import { Lock, Eye, EyeOff, Inbox, Users, Circle, TrendingUp, Home, Sparkles, Users2, Trash2, ChevronDown, ChevronUp, Save, RefreshCw, LogOut, Mail, FileText, GraduationCap, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";
const FORM_TYPES = ["investor", "steward", "resident", "prosperity", "contact"] as const;

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
  data: Record<string, string>;
  submittedAt: string;
}

// ── Password Gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "1love") {
      onAuth(pw);
    } else {
      setError("Wrong password. Try again.");
      setPw("");
    }
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
            className="w-full py-3 bg-[#2D5A5A] text-white rounded-lg font-medium hover:bg-[#2D5A5A]/90 transition-colors"
          >
            Enter
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
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
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
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2D5A5A]/10 text-[#2D5A5A] capitalize">
                    {s.type}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {s.data.name || s.data.firstName || s.data.email || "Anonymous"}
                  </span>
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
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(s.data).map(([k, v]) => (
                        <tr key={k} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-4 font-medium text-gray-600 capitalize w-1/4">
                            {k.replace(/([A-Z])/g, " $1").trim()}
                          </td>
                          <td className="py-1.5 text-gray-800 whitespace-pre-wrap">{v}</td>
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
}

function EmailSettingsTab({ password }: { password: string }) {
  const [cfg, setCfg] = useState<EmailConfig>({
    investor: "", steward: "", resident: "", prosperity: "", resend_api_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/email-config`, { headers: authHeaders(password) });
      const data = await res.json();
      setCfg({
        investor: data.investor ?? "",
        steward: data.steward ?? "",
        resident: data.resident ?? "",
        prosperity: data.prosperity ?? "",
        resend_api_key: data.resend_api_key ?? "",
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
              Get a key at resend.com → API Keys. Once saved, emails will route automatically.
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
        </nav>

        <main className="flex-1 p-8 max-w-4xl">
          {activeTab === "submissions" && <SubmissionsTab password={password} />}
          {CONTENT_SECTIONS.map(({ key, label }) =>
            activeTab === key ? (
              <ContentEditorTab key={key} password={password} sectionKey={key} sectionLabel={label} />
            ) : null
          )}
          {activeTab === "email-settings" && <EmailSettingsTab password={password} />}
          {activeTab === "investor-vault" && <InvestorVaultTab password={password} />}
          {activeTab === "training-modules" && <TrainingModulesTab password={password} />}
        </main>
      </div>
    </div>
  );
}