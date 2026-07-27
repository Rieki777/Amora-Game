/**
 * The economics section (S47): on-chain Amora/Voice holdings on the member's
 * own profile. Read-only by constitution — the platform never mints, moves
 * or prices what Hypha governs; governance actions deep-link out.
 *
 * Renders NOTHING unless the village turned the section on
 * (tokens.show_economics_section). Balances render only against a VERIFIED
 * wallet binding; a failed chain read shows the last known value with when
 * it was true — never a zero the chain didn't say.
 */
import { useEffect, useState } from "react";
import { authToken } from "@/lib/gameApi";
import { ExternalLink, Link2, ShieldCheck } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const TOKEN_LABEL: Record<string, string> = { amora: "Amora (equity)", voice: "Voice (governance)" };

export default function OnchainCard() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/wallet", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(load, []);

  if (!data?.economicsEnabled) return null;

  const verify = async () => {
    setError("");
    const eth = (window as any).ethereum;
    if (!eth) {
      setError("No wallet extension found — install one (e.g. Coinbase Wallet or MetaMask), then try again.");
      return;
    }
    setBusy(true);
    try {
      const [address] = await eth.request({ method: "eth_requestAccounts" });
      const ch = await fetch("/api/wallet/challenge", { method: "POST", headers: headers(), body: "{}" }).then((r) => r.json());
      if (!ch.message) throw new Error(ch.error || "Could not create a challenge");
      const signature = await eth.request({ method: "personal_sign", params: [ch.message, address] });
      const v = await fetch("/api/wallet/verify", {
        method: "POST", headers: headers(), body: JSON.stringify({ address, signature }),
      }).then(async (r) => ({ ok: r.ok, body: await r.json() }));
      if (!v.ok) throw new Error(v.body.error || "Verification failed");
      load();
    } catch (e: any) {
      setError(e?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const verified = !!data?.wallet?.verifiedAt;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-display font-bold text-teal-deep">On-chain holdings</h2>
        {verified ? (
          <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            {String(data.wallet.address).slice(0, 6)}…{String(data.wallet.address).slice(-4)} verified
          </span>
        ) : (
          <button onClick={verify} disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50">
            <Link2 className="w-4 h-4" /> {busy ? "Waiting for your wallet…" : "Verify my wallet"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {!verified ? (
        <p className="text-sm text-gray-500">
          Equity and governance tokens live on Base and are shown here only
          against a wallet you have PROVEN you control — one free signature,
          no transaction, no cost.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {["amora", "voice"].map((slug) => {
            const b = data?.onchain?.[slug];
            return (
              <div key={slug} className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">{TOKEN_LABEL[slug]}</p>
                {b ? (
                  <>
                    <p className="text-2xl font-bold text-teal-deep">{b.formatted}</p>
                    {b.stale && (
                      <p className="text-xs text-amber-600 mt-1">
                        as of {new Date(b.fetchedAt).toLocaleString()} — the chain
                        didn't answer just now, so this is the last true value
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    {slug === "amora" || slug === "voice" ? "not readable right now — nothing is shown rather than a wrong number" : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data?.hypha?.configured && (
        <a href={data.hypha.links?.treasury} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-teal-deep font-medium hover:underline mt-4">
          Govern and move these on Hypha <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
