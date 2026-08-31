/**
 * The Hypha Bridge module's founder surface.
 *
 * FOUR THINGS A FOUNDER COULD NOT SEE BEFORE, and each one is here because its
 * absence let somebody believe something untrue:
 *
 *  1. Who is watching Base for this village. The hub runs one listener for
 *     every fork, and a fork had no way to know it was leaning on it.
 *  2. What the token contracts actually call themselves. The names on screen
 *     came from a founder typing them into a variable; these come from the
 *     contract, read at the moment somebody confirmed it, with the date.
 *  3. What happens to decisions already running if the village changes how it
 *     decides. The rule was already right and nothing said it out loud.
 *  4. Outcomes that arrived and matched no proposal. They used to be answered
 *     and forgotten, so a village learned a decision went missing when
 *     somebody asked why nothing had applied.
 *
 * DISCOVERY PROPOSES AND THE FOUNDER CONFIRMS. The lookup below never picks.
 * It lists every token the founder's account holds, marks the ones whose name
 * matches, and waits. Confirming reads name() and symbol() off the contract
 * itself, which is the check a name match cannot do for itself, and only then
 * is anything stored.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, RefreshCw, Search } from "lucide-react";

const API_BASE = "/api";

function authHeaders(password: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${password}`, ...extra };
}

function refusalText(d: any, fallback: string): string {
  for (const value of [d?.message, d?.error]) {
    const text = value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return fallback;
}

const card = "border border-gray-200 rounded-xl px-4 py-4 bg-white";
const btn =
  "min-h-[44px] px-3 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-deep disabled:opacity-40";
const primary =
  "min-h-[44px] px-4 text-sm rounded-lg bg-teal-deep text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-deep disabled:opacity-40";
const input =
  "border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-teal-deep";

const LISTENER_TONE: Record<string, string> = {
  hub: "bg-emerald-50 border-emerald-200 text-emerald-900",
  self: "bg-sky-50 border-sky-200 text-sky-900",
  none: "bg-amber-50 border-amber-200 text-amber-900",
};

export default function HyphaModulePanel({ password }: { password: string }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState("");
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/status`, { headers: authHeaders(password) });
      // A 404 is the module answering that it is off. The panel says so
      // instead of showing an error, because off is a state and not a fault.
      if (res.status === 404) { setStatus({ moduleOff: true }); return; }
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Could not read the bridge"));
      setStatus(d);
    } catch (e: any) {
      toast.error(e?.message || "Could not read the bridge");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const lookup = async () => {
    setBusy("lookup");
    setCandidates(null);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/candidates`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ nameHint: hint.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "The lookup failed"));
      setCandidates(d.candidates ?? []);
      if ((d.candidates ?? []).length === 0) {
        toast.error("Nothing found on that account. Issue yourself some of the token on Hypha first");
      }
    } catch (e: any) {
      toast.error(e?.message || "The lookup failed");
    } finally {
      setBusy("");
    }
  };

  const confirmBinding = async (slug: string, contractAddress: string) => {
    setBusy(`bind:${contractAddress}:${slug}`);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/bind`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ tokenSlug: slug, contractAddress }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Nothing was stored"));
      toast.success(refusalText(d, "Confirmed"));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Nothing was stored");
    } finally {
      setBusy("");
    }
  };

  /** The pointer stays a separate, audited variable write. Two human acts. */
  const pointAt = async (variableKey: string, address: string) => {
    setBusy(`point:${variableKey}`);
    try {
      const res = await fetch(`${API_BASE}/admin/variables/${encodeURIComponent(variableKey)}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ value: address }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Could not save"));
      toast.success(`Saved as ${variableKey}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setBusy("");
    }
  };

  const unbind = async (slug: string) => {
    setBusy(`unbind:${slug}`);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/bindings/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: authHeaders(password),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Could not unbind"));
      toast.success(refusalText(d, "Unbound"));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not unbind");
    } finally {
      setBusy("");
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/refresh`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: "{}",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Could not read Base"));
      toast.success(refusalText(d, "Read"));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not read Base");
    } finally {
      setBusy("");
    }
  };

  const resolveOrphan = async (id: string) => {
    const note = window.prompt("What did this outcome turn out to be? An orphan closed with no words is one nobody can audit.");
    if (!note?.trim()) return;
    setBusy(`orphan:${id}`);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/outcomes/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ note: note.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(refusalText(d, "Could not answer that one"));
      toast.success(refusalText(d, "Answered"));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not answer that one");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading the bridge…</p>;
  if (!status) return null;
  if (status.moduleOff) {
    return (
      <div className={card}>
        <h3 className="font-semibold text-gray-900 text-sm">Hypha Bridge</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          This module is off, so nothing here is running. Your Hypha links and the
          proposal handoff work exactly as they always have. Turn the module on to
          read your DAO's numbers from Base and to keep a record of outcomes that
          arrive.
        </p>
      </div>
    );
  }

  const posture = status.listener ?? {};
  const slots: any[] = status.slots ?? [];
  const orphans: any[] = status.orphans ?? [];
  const sw = status.switchover ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Hypha Bridge</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          What this village reads from Base, who reads it, and where an outcome
          goes when it comes home. Everything here is read only. The platform
          displays what the chain says and links you out to Hypha to act.
        </p>
      </div>

      {/* 1. Who watches Base. Derived from the hosting relationship, never a toggle. */}
      <div className={`border rounded-xl px-4 py-3 text-sm ${LISTENER_TONE[posture.mode] ?? LISTENER_TONE.none}`}>
        <p className="font-medium">{posture.summary}</p>
        <p className="text-xs mt-1 opacity-90">{posture.cost}</p>
        {posture.todo && <p className="text-xs mt-1 opacity-90">{posture.todo}</p>}
        <p className="text-[11px] mt-2 opacity-75">
          This follows who hosts this village and is not a setting. A village the
          hub carries uses the hub's listener; a village hosting itself runs its own.
        </p>
      </div>

      {/* 2. The bindings: what the chain calls each contract, and who said yes. */}
      <div className={card}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-medium text-gray-900 text-sm">Token contracts</h4>
          <button type="button" onClick={refresh} disabled={busy === "refresh"} className={btn}>
            <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
            {busy === "refresh" ? "Reading Base…" : "Read Base again"}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {slots.map((s) => (
            <div key={s.slug} className="border border-gray-100 rounded-lg px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-medium text-gray-900">{s.slug}</span>
                {s.binding ? (
                  <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    confirmed {new Date(s.binding.confirmedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">nobody has confirmed a contract for this</span>
                )}
              </div>
              {s.binding ? (
                <p className="text-xs text-gray-600 mt-1">
                  The contract answers to{" "}
                  <span className="font-medium text-gray-900">{s.binding.chainName}</span> ({s.binding.chainSymbol}),
                  read from Base on {new Date(s.binding.readAt).toLocaleDateString()}. {s.binding.decimals} decimals.
                </p>
              ) : null}
              <p className="text-xs text-gray-500 mt-1">
                {s.pointerAddress ? (
                  <>Platform points at <code className="select-all">{s.pointerAddress}</code></>
                ) : (
                  <>The platform points at nothing yet, so nothing is read for this token.</>
                )}
              </p>
              {s.binding && !s.agrees && (
                <p className="text-xs text-red-700 mt-1 inline-flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  The confirmed contract and the address the platform reads are different. One of the two is stale.
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {s.binding && !s.agrees && (
                  <button
                    type="button"
                    onClick={() => pointAt(s.variableKey, s.binding.contractAddress)}
                    disabled={busy === `point:${s.variableKey}`}
                    className={btn}
                  >
                    Point {s.variableKey} at the confirmed contract
                  </button>
                )}
                {s.binding && (
                  <button type="button" onClick={() => unbind(s.slug)} disabled={busy === `unbind:${s.slug}`} className={btn}>
                    Unbind
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Discovery as a pick-list. It proposes; a human confirms. */}
      <div className={card}>
        <h4 className="font-medium text-gray-900 text-sm">Find your contracts on Base</h4>
        <ol className="text-xs text-gray-500 mt-1 space-y-0.5 list-decimal list-inside max-w-2xl">
          {(status.firstSteps ?? []).map((s: string) => <li key={s}>{s}</li>)}
        </ol>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Token name, if you remember it"
            className={`${input} min-w-[220px]`}
          />
          <button type="button" onClick={lookup} disabled={busy === "lookup"} className={primary}>
            <Search className="w-4 h-4 inline mr-1.5" />
            {busy === "lookup" ? "Looking…" : "List what this account holds"}
          </button>
        </div>
        {candidates && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 max-w-2xl">
              Every token the founder account holds. Airdropped tokens land in any
              account that has ever been used, and a token built to impersonate
              yours will carry your exact name, so read the address before you
              confirm one. Confirming reads the name and symbol off the contract
              itself.
            </p>
            <ul className="mt-2 space-y-1.5">
              {candidates.map((c) => (
                <li key={c.contractAddress} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span>
                      <span className="font-medium text-gray-900">{c.tokenName}</span>{" "}
                      <span className="text-gray-500">({c.tokenSymbol})</span>
                      {c.nameMatches && <span className="ml-2 text-xs text-emerald-700">name matches</span>}
                    </span>
                    <code className="text-xs text-gray-500 select-all">{c.contractAddress}</code>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {slots.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => confirmBinding(s.slug, c.contractAddress)}
                        disabled={busy === `bind:${c.contractAddress}:${s.slug}`}
                        className={btn}
                      >
                        Confirm as {s.slug}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 4. The switchover. The rule was already true; nothing said it out loud. */}
      <div className={card}>
        <h4 className="font-medium text-gray-900 text-sm">If this village changes how it decides</h4>
        <p className="text-xs text-gray-600 mt-1 max-w-2xl">{sw.rule}</p>
        <p className="text-xs text-gray-900 mt-2 max-w-2xl">{sw.effect}</p>
      </div>

      {/* 5. The orphans. Recorded instead of dropped. */}
      <div className={card}>
        <h4 className="font-medium text-gray-900 text-sm">Outcomes that landed nowhere</h4>
        {orphans.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">
            None waiting. An outcome arrives here when its agreement id and its
            title marker both match no proposal in this village.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {orphans.map((o) => (
              <li key={o.id} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-amber-900">
                    {o.verdict} · agreement {o.agreementId || "none given"} · marker {o.marker || "none given"}
                  </span>
                  <span className="text-xs text-amber-800">{new Date(o.receivedAt).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => resolveOrphan(o.id)}
                  disabled={busy === `orphan:${o.id}`}
                  className={`${btn} mt-2`}
                >
                  Say what this was
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
