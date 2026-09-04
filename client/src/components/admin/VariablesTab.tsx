/**
 * Admin then Game Mechanics: the dial editor, and the Integrate DAO panel
 * that sits above it.
 *
 * MOVED OUT OF client/src/pages/Admin.tsx. The monolith ratchet
 * (scripts/check-file-lines.mjs) says that page may only ever get smaller,
 * and Wave A's thresholds lane had just added the stalemate warning to this
 * tab, which pushed the page fourteen lines over its baseline and turned the
 * gate red for every lane after it.
 *
 * NOTHING IN THE BODY CHANGED. The two functions below are the bytes that
 * stood in the page, moved by script so a diff can check the claim. Three
 * things and only these three are different:
 *
 *   - the imports at the top of this file, which the page used to hold for
 *     both of these functions
 *   - `export default` on VariablesTab, so the page can reach it
 *   - the page's two-line section marker, folded into these words
 *
 * IntegrateDaoPanel travels with the tab because the tab is its only caller.
 * Leaving it behind would have meant exporting it from the page and importing
 * it back, which is more coupling than either file had before.
 *
 * Both functions stay at the top level of this module. A component declared
 * inside another component is a new component type on every render of the
 * parent, so React unmounts and remounts the subtree and every piece of state
 * in it is lost. The SetupWizard cost a session to that shape once already.
 *
 * The import in Admin.tsx is static rather than lazy on purpose. Admin is
 * itself a React.lazy route (docs/ARCHITECTURE.md section 3.19 rule 1), so
 * these bytes already sit outside the first-paint bundle, and a second lazy
 * boundary inside a lazy page buys a chunk request for nothing.
 *
 * THE SIXTEEN `text-gray-*` CLASSES CAME ACROSS UNCHANGED, and
 * scripts/tailwind-gray-baseline.json records the move: 16 off Admin.tsx and
 * 16 onto this file, with the guard's total held where it was. Converting them
 * to semantic tokens would have been a visible change to a screen this move
 * promised not to change, and it would have left one tab reading in a
 * different neutral from the twenty around it while the cards they sit in stay
 * gray-bordered. That conversion is a design call for whoever owns the admin
 * palette, taken across the whole page at once. The ratchet still only turns
 * down, so this file cannot grow a seventeenth.
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { stalemateWarningFor } from "@shared/ballotSubjects";
import { API_BASE, authHeaders, refusal } from "@/components/admin/adminApi";
import HyphaModulePanel from "@/components/admin/HyphaModulePanel";

/**
 * Integrate DAO: the step-2 flow after a founder creates their DAO on Hypha.
 * They set their org URL, space id and Base account address (all normal
 * variables below), issue themselves even a tiny amount of each token on
 * Hypha (issuance is what makes the DAO create the contract on-chain), then
 * look each contract up here by the token's EXACT on-chain name and assign
 * it — the assignment goes through the same audited variables route as any
 * hand edit.
 */
function IntegrateDaoPanel({ password, onAssigned }: { password: string; onAssigned: () => void }) {
  const [tokenName, setTokenName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const find = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/hypha/find-token`, {
        method: "POST",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ tokenName: tokenName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(refusal(data, "Lookup failed"));
      setResult(data);
      if (data.found) toast.success(`Found ${data.token.tokenName} (${data.token.tokenSymbol})`);
      else toast.error(refusal(data, "Not found"));
    } catch (e: any) {
      toast.error(e?.message || "Lookup failed");
    }
    setBusy(false);
  };

  const assign = async (variableKey: string, address: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/variables/${encodeURIComponent(variableKey)}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ value: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(refusal(data, "Assign failed"));
      toast.success(`Saved as ${variableKey}`);
      onAssigned();
    } catch (e: any) {
      toast.error(e?.message || "Assign failed");
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl px-4 py-4 mb-6 bg-gray-50/60">
      <h3 className="font-semibold text-gray-900 text-sm">Integrate DAO: find a token's contract on Base</h3>
      <p className="text-xs text-gray-500 mt-1 max-w-2xl">
        After creating a token on Hypha, issue yourself some (any amount, issuance is what
        puts the contract on-chain), set your founder Base account address under Hypha below,
        then enter the token's exact on-chain name. The contract address is found from your
        account's transfer history and saved through the normal audited variable route.
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
          placeholder="Exact on-chain token name"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white min-w-[220px]"
        />
        <button
          type="button"
          onClick={find}
          disabled={busy || !tokenName.trim()}
          className="text-sm bg-teal-deep text-white rounded-lg px-4 py-1.5 font-medium disabled:opacity-40"
        >
          {busy ? "Searching…" : "Find on chain"}
        </button>
      </div>
      {result?.found && (
        <div className="mt-3 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 space-y-1.5">
          <div>
            <span className="font-medium">{result.token.tokenName}</span> ({result.token.tokenSymbol}) ·{" "}
            <code className="select-all">{result.token.contractAddress}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => assign("tokens.equity_address", result.token.contractAddress)} className="text-teal-deep font-medium hover:underline">
              Use as equity token
            </button>
            <button type="button" onClick={() => assign("tokens.voice_address", result.token.contractAddress)} className="text-teal-deep font-medium hover:underline">
              Use as voice token
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(result.token.contractAddress).then(() => toast.success("Address copied"))}
              className="text-gray-500 hover:underline"
            >
              Copy address
            </button>
          </div>
        </div>
      )}
      {result && !result.found && Array.isArray(result.matches) && result.matches.length > 1 && (
        <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Several contracts share that name. Copy the right one by hand:
          <ul className="mt-1 space-y-0.5">
            {result.matches.map((m: any) => (
              <li key={m.contractAddress}>
                {m.tokenName} ({m.tokenSymbol}) · <code className="select-all">{m.contractAddress}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function VariablesTab({ password }: { password: string }) {
  const [vars, setVars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/variables`, { headers: authHeaders(password) });
      const data = await res.json();
      // Server shape: { categories: [{ name, variables: [...] }], … }
      const flat = Array.isArray(data)
        ? data
        : (data.categories ?? []).flatMap((c: any) => c.variables ?? []);
      setVars(flat);
    } catch { setVars([]); }
    setLoading(false);
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string, value: string) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_BASE}/admin/variables/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: authHeaders(password, { "Content-Type": "application/json" }),
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(refusal(data, "Invalid value"));
      toast.success("Saved. The rule is live");
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
      load();
    } catch (e: any) {
      // Fail-loud by design: the server names exactly what's wrong (bounds,
      // type, unknown key). Show it verbatim.
      toast.error(e?.message || "Save failed");
    }
    setSaving(null);
  };

  // Search across everything a founder might remember a dial by: its label,
  // key, description, category, unit — even a choice's wording. Every
  // space-separated term must match somewhere, so "gratitude cap" narrows
  // rather than widens.
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (v: any): boolean => {
    if (terms.length === 0) return true;
    const hay = [
      v.label, v.key, v.description, v.category, v.unit ?? "", v.value ?? "",
      ...(Array.isArray(v.choices) ? v.choices.map((c: any) => `${c.label} ${c.hint ?? ""}`) : []),
    ].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  const filtered = vars.filter(matches);
  const byCategory: Record<string, any[]> = {};
  for (const v of filtered) (byCategory[v.category] ??= []).push(v);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Game Mechanics</h2>
        <p className="text-sm text-gray-500 mt-1">
          The rules of your village's game, live-editable. Only changed values are
          stored, so platform defaults keep flowing to you as the foundation
          evolves. Every value is validated against its bounds before it lands.
        </p>
      </div>
      <IntegrateDaoPanel password={password} onAssigned={load} />
      <div className="mb-6"><HyphaModulePanel password={password} /></div>
      <div className="mb-6">
        <div className="relative max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dials: a word from the name, key or description"
            aria-label="Search game variables"
            className="w-full border border-gray-200 rounded-xl pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-deep/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm px-1"
            >
              ✕
            </button>
          )}
        </div>
        {search && !loading && (
          <p className="text-xs text-gray-500 mt-1.5" role="status">
            {filtered.length === 0
              // village-ok: "gratitude" and "quest" are variable KEY prefixes here
              // (gratitude.pool_per_cycle, quest.consent_cap_mode), not the name a
              // village gives its recognition token. A village that renames the token
              // keeps its keys, so useTokenName() would print a word that matches
              // nothing in this search box.
              ? `Nothing matches "${search}". Try one word, or part of a key like "gratitude" or "quest".`
              : `${filtered.length} of ${vars.length} dial${filtered.length === 1 ? "" : "s"} match`}
          </p>
        )}
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{cat}</h3>
              <div className="space-y-3">
                {list.map((v) => {
                  const draft = drafts[v.key] ?? v.value;
                  const dirty = draft !== v.value;
                  /*
                   * The founder's ruling of 2026-09-02 (Q11): a village may
                   * set a bar above 97 and the Game warns it, in words, that
                   * the closer to 100 it goes the likelier a stalemate is.
                   * It is read off the value being TYPED, not the value
                   * saved, so the warning arrives before the Save.
                   */
                  const ceiling = stalemateWarningFor(v.key, draft);
                  return (
                    <div key={v.key} className="border border-gray-200 rounded-xl px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[220px]">
                          <div className="font-medium text-gray-900 text-sm">
                            {v.label}
                            {v.isDefault && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">platform default</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">{v.description}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                            {v.key}
                            {v.min !== undefined && v.max !== undefined && ` · ${v.min}-${v.max}`}
                            {v.unit ? ` ${v.unit}` : ""}
                          </p>
                        </div>
                        {v.type === "boolean" ? (
                          <select
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [v.key]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                          >
                            <option value="true">on</option>
                            <option value="false">off</option>
                          </select>
                        ) : v.type === "choice" ? (
                          <select
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [v.key]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-[220px]"
                          >
                            {(v.choices ?? []).map((c: any) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={v.type === "text" ? "text" : "number"}
                            value={draft}
                            step={v.type === "decimal" || v.type === "percentage" ? "0.01" : "1"}
                            onChange={(e) => setDrafts((d) => ({ ...d, [v.key]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40"
                          />
                        )}
                        <button
                          onClick={() => save(v.key, draft)}
                          disabled={!dirty || saving === v.key}
                          className="text-xs bg-teal-deep text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-40"
                        >
                          {saving === v.key ? "Saving…" : "Save"}
                        </button>
                        {!v.isDefault && (
                          <button
                            onClick={() => save(v.key, v.default)}
                            title={`Back to the platform default (${v.default})`}
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {ceiling && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3" role="status">
                          {ceiling}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
