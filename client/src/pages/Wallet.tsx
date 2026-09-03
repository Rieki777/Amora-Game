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
import InfoTip from "@/components/InfoTip";
import { decimalsOf, formatTokenAmount } from "@/lib/tokenAmount";

/**
 * The plain mechanics behind a balance row, keyed on the token's slug. The
 * slugs are each village's own, so this matches on the platform families and
 * falls back to the one truth every token shares: the ledger.
 */
const tokenTip = (slug: string): string => {
  const s = slug.toLowerCase();
  if (s.includes("gratitude") || s.includes("heart")) {
    return "Thanks for work, never pay. Earned when someone appreciates a real contribution; it cannot be bought.";
  }
  if (s.includes("stay")) {
    return "Nights at the village, earned through work exchange and spent when you book a stay.";
  }
  if (s.includes("library")) {
    return "The Material Library's deposit token. Set aside while you borrow, returned when the item comes home.";
  }
  return "A village token. Every movement it makes is written on the shared ledger.";
};

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

  if (modules.loaded && !exchangeModule) return <ModuleGate moduleId="exchange" name="The Exchange" />;

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
  /*
   * The village's own word for each token, from the registry, read live on
   * every request. The slug is history's identity and never changes, so it is
   * the wrong thing to show a member: a village that renamed its currency saw
   * the old machine name here. Falls back to the slug for a token with no
   * registry row, which is a drift worth seeing.
   */
  const tokenNames: Record<string, string> = data?.mine?.tokenNames ?? {};
  /*
   * And the SCALE of each. `mine.balances` is `token_balances.balance`
   * verbatim, which is an INT of MINOR units: Village Voice carries decimals
   * 3, so a member who earned 10 arrives here as 10000. This page printed that
   * number while the Standing chip on their own profile, off the same ledger
   * through `loadStanding`, said 10. The wallet is the one they believe.
   *
   * Absent map means every token is whole, which is what every token was
   * before Voice. See client/src/lib/tokenAmount.ts for why this landed before
   * the move to 4 decimals rather than inside it.
   */
  const tokenDecimals: Record<string, number> = data?.mine?.tokenDecimals ?? {};

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">The Exchange</h1>
          {/* R46 enchant-first: the surface line carries the image, and the
              plain mechanics from the COPY-1 hero live on in the tooltips. */}
          <p className="text-muted-foreground max-w-xl mx-auto">
            One room, one ledger: every token the village lives by leaves its
            thread here, the way roots share water under a forest floor.{" "}
            <InfoTip tip="Gratitude is thanks for work, never pay. Earned when someone appreciates a real contribution; it cannot be bought.">Gratitude</InfoTip>,{" "}
            <InfoTip tip="Stay credits are nights at the village, earned through work exchange and spent when you book a stay.">stay credits</InfoTip> and{" "}
            <InfoTip tip="Library credits pay the Material Library's deposit: set aside while you borrow, back when the tool comes home.">library credits</InfoTip>{" "}
            each carry their own story. Your own balances also sit on{" "}
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
                      <p className={`text-lg font-bold ${Number(bal) < 0 ? "text-red-600" : "text-foreground"}`}>
                        {formatTokenAmount(Number(bal), decimalsOf(tokenDecimals, slug))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tokenNames[slug] ?? slug}
                        <InfoTip tip={tokenTip(slug)} label={`What ${tokenNames[slug] ?? slug} is`} />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">
                Buy tokens
                <InfoTip tip="Money flows in and never back out: the village sells its own credit tokens and never buys them back. Gratitude is never for sale." label="How buying works" />
              </p>
            </div>
            {status === "failed" ? (
              <p className="text-sm text-muted-foreground">Couldn't load the listings just now.</p>
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
                        className="inline-flex items-center gap-1.5 text-sm bg-teal-deep text-white rounded-lg px-3 py-2 font-medium">
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
              <p className="font-semibold text-foreground text-sm mb-1">
                Hypha holdings
                <InfoTip tip="Hypha is the outside network where governance and equity tokens live. This page is a door to it; nothing here moves those holdings." label="What Hypha holdings are" />
              </p>
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
