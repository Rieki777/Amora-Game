/**
 * Wallet (S35): every token the member holds, the buy-only exchange, and a
 * READ-ONLY window to Hypha-governed holdings (a deep link — this platform
 * never moves what Hypha governs). Buying rides the same trio as stays.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useModule, useModules, useHypha } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Coins, CreditCard, ExternalLink, ReceiptText, Wallet as WalletIcon } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const usd = (minor: number) => `$${(Number(minor || 0) / 100).toFixed(2)}`;

export default function Wallet() {
  const modules = useModules();
  const exchangeModule = useModule("exchange");
  const hypha = useHypha();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    fetch("/api/exchange", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => {
    if (exchangeModule) load();
    const q = new URLSearchParams(window.location.search).get("purchase");
    if (q === "success") setNotice("Payment received — your tokens arrive as soon as Stripe confirms (usually seconds).");
    if (q === "cancelled") setNotice("Checkout cancelled — nothing was charged.");
  }, [exchangeModule?.id]);

  if (modules.loaded && !exchangeModule) return <NotFound />;

  const buy = (slug: string) => {
    setError("");
    fetch("/api/exchange/buy", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ tokenSlug: slug, quantity: qty[slug] ?? 1 }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not start checkout");
        window.location.href = d.url;
      })
      .catch((e) => setError(e.message));
  };

  const balances: Record<string, number> = data?.mine?.balances ?? {};

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Wallet</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            What you hold, and the village exchange. Recognition is earned, never
            bought — only the village's own credit tokens are ever listed here.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-2xl space-y-6">
          {notice && <p className="text-sm text-teal-deep bg-teal-deep/10 rounded-lg px-4 py-2.5">{notice}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {user && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <WalletIcon className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Your balances</p>
              </div>
              {Object.keys(balances).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet — contribution is where value starts.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(balances).map(([slug, bal]) => (
                    <div key={slug} className="border border-border rounded-lg px-3 py-2">
                      <p className={`text-lg font-bold ${Number(bal) < 0 ? "text-red-600" : "text-foreground"}`}>{bal}</p>
                      <p className="text-xs text-muted-foreground">{slug}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">The exchange</p>
            </div>
            {(data?.listings ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing is listed for purchase right now.</p>
            )}
            <div className="space-y-3">
              {(data?.listings ?? []).map((l: any) => (
                <div key={l.slug} className="flex items-center gap-3 border border-border rounded-lg px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.priceMinor != null ? `${usd(l.priceMinor)} each` : "price coming soon"}
                      {!l.inStock && <span className="text-amber-600"> · out of stock</span>}
                    </p>
                  </div>
                  {user && data?.mine?.canBuy && data?.stripeConfigured && l.priceMinor != null && l.inStock && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={1} value={qty[l.slug] ?? 1}
                        onChange={(e) => setQty({ ...qty, [l.slug]: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-16 text-sm border border-border rounded-lg px-2 py-1.5"
                      />
                      <button onClick={() => buy(l.slug)}
                        className="inline-flex items-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-3 py-2 font-medium">
                        <CreditCard className="w-3.5 h-3.5" /> Buy
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!user && (data?.listings ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">Sign in to buy.</p>
            )}
          </div>

          {user && (data?.mine?.orders ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <ReceiptText className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Receipts</p>
              </div>
              <div className="space-y-1.5">
                {data.mine.orders.map((o: any) => (
                  <p key={o.id} className="text-sm text-muted-foreground">
                    #{o.receipt_no} — {o.quantity} {o.token_slug} · {usd(o.amount_minor)} ·{" "}
                    <span className={["disputed", "reversed"].includes(o.status) ? "text-red-600" : o.status === "paid" ? "text-emerald-600" : ""}>
                      {o.status}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {hypha.configured && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="font-semibold text-foreground text-sm mb-1">Hypha holdings</p>
              <p className="text-xs text-muted-foreground mb-3">
                Governance and equity tokens live on your Hypha DHO. This platform
                shows the door, never moves what's behind it.
              </p>
              <a href={hypha.links?.treasury} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-teal-deep font-medium hover:underline">
                Open the Hypha treasury <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
