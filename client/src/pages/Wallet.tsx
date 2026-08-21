/**
 * Tokens (S35): every token the member holds, the buy-only exchange, and a
 * READ-ONLY window to Hypha-governed holdings (a deep link — this platform
 * never moves what Hypha governs). Buying rides the same trio as stays.
 *
 * Named "Wallet" until the nav regroup. Two things carried that one word: this
 * page, and /api/wallet, which is the on-chain ADDRESS binding behind
 * OnchainCard. The page is the village's token economy, so it took the plainer
 * name; "Wallet" now means one member's own holdings and lives on the profile.
 * The component and the /wallet route keep their old names on purpose, because
 * Stripe return URLs and order notifications in server/index.ts point at them.
 */
import Layout from "@/components/Layout";
import ModuleGate from "@/components/modules/ModuleGate";
import SwapCard from "@/components/SwapCard";
import { useEffect, useState } from "react";
import { useModule, useModules, useHypha } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Coins, CreditCard, ExternalLink, ReceiptText, Wallet as WalletIcon } from "lucide-react";
import { ExamplesBanner } from "@/components/ExamplesBanner";
import { ExampleRefusal, readRefusal } from "@/components/ExampleRefusal";

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
  // The refusal, keyed to the listing. Declared with the other state, ABOVE
  // the early return below: a hook after a conditional return changes the
  // hook count between renders the moment the module catalogue loads.
  const [refusedSlug, setRefusedSlug] = useState<{ slug: string; message: string } | null>(null);

  // "Loading", "loaded and genuinely empty" and "the request failed" are
  // three different facts. Collapsing them made a 500 or a dropped connection
  // render as "Nothing yet" — telling a member who holds tokens that they
  // hold none, in the one place they come to check.
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  const load = () => {
    setStatus("loading");
    fetch("/api/exchange", { headers: headers() })
      .then((r) => {
        if (!r.ok) throw new Error(`exchange ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch(() => setStatus("failed"));
  };
  useEffect(() => {
    if (exchangeModule) load();
    const q = new URLSearchParams(window.location.search).get("purchase");
    if (q === "success") setNotice("Payment received. Your tokens arrive as soon as Stripe confirms (usually seconds).");
    if (q === "cancelled") setNotice("Checkout cancelled. Nothing was charged.");
  }, [exchangeModule?.id]);

  if (modules.loaded && !exchangeModule) return <ModuleGate moduleId="exchange" name="Exchange" />;

  const buy = (slug: string) => {
    setError(""); setRefusedSlug(null);
    fetch("/api/exchange/buy", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ tokenSlug: slug, quantity: qty[slug] ?? 1 }),
    })
      .then(async (r) => {
        const { ok, data: d, refusal } = await readRefusal(r);
        if (refusal) { setRefusedSlug({ slug, message: refusal }); return; }
        if (!ok) throw new Error(d?.error || "Could not start checkout");
        window.location.href = d.url;
      })
      .catch((e) => setError(e.message));
  };

  const balances: Record<string, number> = data?.mine?.balances ?? {};

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Tokens</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            What you hold, and the village exchange. Recognition is earned, never
            bought. Only the village's own credit tokens are ever listed here.
            Your own balances also sit on{" "}
            <a href="/profile#wallet" className="text-teal-deep font-medium hover:underline">your profile</a>.
          </p>
          <ExamplesBanner moduleId="exchange" noun="listing" />
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-2xl space-y-6">
          {notice && <p role="status" className="text-sm text-teal-deep bg-teal-deep/10 rounded-lg px-4 py-2.5">{notice}</p>}
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {user && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <WalletIcon className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Your balances</p>
              </div>
              {status === "loading" ? (
                <p className="text-sm text-muted-foreground">Loading your balances…</p>
              ) : status === "failed" ? (
                <p className="text-sm text-muted-foreground">
                  Couldn't load your balances.{" "}
                  <button type="button" onClick={load} className="text-teal-deep font-medium hover:underline">
                    Retry
                  </button>
                </p>
              ) : Object.keys(balances).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet. Contribution is where value starts.</p>
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
            {status === "failed" ? (
              <p className="text-sm text-muted-foreground">Couldn't load the exchange just now.</p>
            ) : status === "ready" && (data?.listings ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is listed for purchase right now.</p>
            ) : null}
            <div className="space-y-3">
              {(data?.listings ?? []).map((l: any) => (
                <div key={l.slug} className="border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.priceMinor != null ? `${usd(l.priceMinor)} each` : "price coming soon"}
                      {!l.inStock && <span className="text-amber-600"> · out of stock</span>}
                      {l.stockCount != null && l.stockCount > 0 && <span> · {l.stockCount} in stock</span>}
                    </p>
                  </div>
                  {/* An EXAMPLE listing offers Buy even where Stripe is not
                      connected. The refusal is the whole lesson, it fires
                      long before any payment code, and a demo market whose
                      only button is missing teaches nothing. */}
                  {user && data?.mine?.canBuy && (data?.stripeConfigured || l.isExample) && l.priceMinor != null && l.inStock && (
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
                  {/* A REAL listing with no card processor shows a price and
                      no way to act on it, which reads as broken. Say which
                      of the three reasons it is, to the person who can fix
                      it and to the person who cannot. */}
                  {user && !l.isExample && l.priceMinor != null && l.inStock && !data?.stripeConfigured && (
                    <span className="text-xs text-muted-foreground">Card payments aren't connected yet</span>
                  )}
                  {user && !l.isExample && l.priceMinor != null && l.inStock && data?.stripeConfigured && !data?.mine?.canBuy && (
                    <span className="text-xs text-muted-foreground">Buying opens at the member stage</span>
                  )}
                  </div>
                  {refusedSlug && refusedSlug.slug === l.slug && (
                    <ExampleRefusal message={refusedSlug.message} className="mt-2" />
                  )}
                </div>
              ))}
            </div>
            {!user && (data?.listings ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">Sign in to buy.</p>
            )}
          </div>

          {/* Swapping only appears when the village turned it on, the member
              can swap, and there is at least one pair they could actually
              execute — a greyed-out grid teaches nobody anything. */}
          {user && data?.swap?.enabled && (data.swap.myPairs ?? []).length > 0 && (
            <SwapCard pairs={data.swap.myPairs} onDone={load} />
          )}
          {/* Why a token you hold isn't in the swap card — in the same words
              the server refuses with, so the answer is never just absence. */}
          {user && data?.swap?.enabled && (data.swap.notSwappable ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="font-semibold text-foreground text-sm mb-2">Not everything trades</p>
              <ul className="space-y-1.5">
                {data.swap.notSwappable.map((n: any) => (
                  <li key={n.slug} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{n.name}</span>: {n.reason}.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {user && data?.swap?.enabled && (data.swap.halted ?? []).length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-4 py-2.5">
              Swapping is paused for{" "}
              {data.swap.halted.map((h: any) => h.slug).join(", ")}
              {data.swap.halted[0]?.reason ? `: ${data.swap.halted[0].reason}` : ""}.
            </p>
          )}

          {user && (data?.mine?.orders ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <ReceiptText className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Receipts</p>
              </div>
              <div className="space-y-1.5">
                {data.mine.orders.map((o: any) => (
                  <p key={o.id} className="text-sm text-muted-foreground">
                    {/* A swap has a fiat VALUATION, never a charge — printing a
                        dollar figure beside it would read as money taken. */}
                    #{o.receipt_no}:{" "}
                    {o.kind === "swap"
                      ? `${o.pay_quantity} ${o.pay_token_slug} → ${o.quantity} ${o.token_slug}`
                      : `${o.quantity} ${o.token_slug} · ${usd(o.amount_minor)}`}{" "}
                    ·{" "}
                    <span className={["disputed", "reversed"].includes(o.status) ? "text-red-600" : o.status === "paid" ? "text-emerald-600" : ""}>
                      {o.kind === "swap" && o.status === "paid" ? "swapped" : o.status}
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
