/**
 * Stays (S30-S31): the member-facing page. Rooms post their prices in stay
 * credits (and optionally USD); one credit hosts one night. Credits are
 * bought with real money or EARNED through work-exchange quests — the same
 * consent gate as every other reward.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { BedDouble, CreditCard, Hammer, Moon, Send } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const usd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

export default function Stay() {
  const modules = useModules();
  const staysModule = useModule("stays");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requesting, setRequesting] = useState<string>("");
  const [arriveOn, setArriveOn] = useState("");
  const [notes, setNotes] = useState("");
  const [buyNights, setBuyNights] = useState(7);

  const load = () => {
    fetch("/api/stays", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => {
    if (staysModule) load();
    const q = new URLSearchParams(window.location.search).get("purchase");
    if (q === "success") setNotice("Payment received — your credits arrive as soon as Stripe confirms (usually seconds).");
    if (q === "cancelled") setNotice("Checkout cancelled — nothing was charged.");
  }, [staysModule?.id]);

  if (modules.loaded && !staysModule) return <NotFound />;

  const request = (accommodationId: string) => {
    setError("");
    fetch("/api/stays/request", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ accommodationId, arriveOn: arriveOn || undefined, notes }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not request");
        setRequesting("");
        setNotes("");
        setNotice("Request sent — the stewards will be in touch.");
        load();
      })
      .catch((e) => setError(e.message));
  };

  const checkout = (accommodationId: string) => {
    setError("");
    fetch("/api/stays/checkout", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ accommodationId, nights: buyNights }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not start checkout");
        window.location.href = d.url;
      })
      .catch((e) => setError(e.message));
  };

  const audience = data?.audience ?? "guest";

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Stay With Us</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            One stay credit hosts one night. Buy credits, or earn them through
            work-exchange quests — the village runs on contribution either way.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-3xl space-y-6">
          {notice && <p role="status" className="text-sm text-teal-deep bg-teal-deep/10 rounded-lg px-4 py-2.5">{notice}</p>}
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {user && data?.mine && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-teal-deep" />
                <p className="text-sm text-foreground">
                  Your balance: <span className="font-bold">{data.mine.balance}</span> stay credit(s)
                  {data.mine.balance < 0 && <span className="text-red-600"> — please settle up with the stewards</span>}
                </p>
              </div>
              {data.mine.stays.filter((s: any) => s.status === "requested" || s.status === "active").map((s: any) => (
                <div key={s.id} className="mt-3 text-sm text-muted-foreground border-t border-border pt-3">
                  {s.status === "requested" ? (
                    <>Your stay request is with the stewards.</>
                  ) : (
                    <>
                      Your stay is active at <b>{s.rateSnapshotCredits}</b> credit(s)/night
                      {s.nightsRemaining != null && <> — about <b>{Math.max(0, s.nightsRemaining)}</b> night(s) covered</>}.
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {(data?.accommodations ?? []).map((a: any) => {
              const credit = a.prices?.["stay-credit"]?.[audience] ?? a.prices?.["stay-credit"]?.guest;
              const money = a.prices?.usd?.[audience] ?? a.prices?.usd?.guest;
              return (
                <div key={a.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                  {a.photoUrl && <img src={a.photoUrl} alt="" className="h-40 w-full object-cover" />}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <BedDouble className="w-4 h-4 text-teal-deep" />
                      <p className="font-semibold text-foreground">{a.name}</p>
                    </div>
                    {a.description && <p className="text-sm text-muted-foreground mb-3">{a.description}</p>}
                    <div className="mt-auto space-y-2">
                      <p className="text-sm text-foreground">
                        {credit ? <><b>{credit}</b> credit(s)/night</> : <span className="text-muted-foreground">rate coming soon</span>}
                        {money ? <span className="text-muted-foreground"> · {usd(money)}/night</span> : null}
                        {audience === "member" && <span className="ml-1 text-[10px] bg-teal-deep/10 text-teal-deep px-1.5 py-0.5 rounded-full">member rate</span>}
                      </p>
                      {user ? (
                        requesting === a.id ? (
                          <div className="space-y-2">
                            <input type="date" value={arriveOn} onChange={(e) => setArriveOn(e.target.value)}
                              className="w-full text-sm border border-border rounded-lg px-3 py-2" />
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                              placeholder="Anything the stewards should know?"
                              className="w-full text-sm border border-border rounded-lg px-3 py-2" />
                            <div className="flex gap-2">
                              <button onClick={() => request(a.id)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-3 py-2 font-medium">
                                <Send className="w-3.5 h-3.5" /> Send request
                              </button>
                              <button onClick={() => setRequesting("")} className="text-sm text-muted-foreground px-2">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setRequesting(a.id)}
                              className="flex-1 text-sm bg-[#2D5A5A] text-white rounded-lg px-3 py-2 font-medium">
                              Request a stay
                            </button>
                            {data?.stripeConfigured && credit && money ? (
                              <div className="flex items-center gap-1">
                                {/* Clamp BOTH ends here: the max attribute
                                    only bounds the spinner, so typing 999
                                    used to fail after the click instead of
                                    before it. */}
                                <input type="number" min={1} max={data?.maxPurchaseNights ?? 60} value={buyNights}
                                  aria-label="Nights of credits to buy"
                                  onChange={(e) => setBuyNights(Math.min(data?.maxPurchaseNights ?? 60, Math.max(1, Number(e.target.value) || 1)))}
                                  className="w-14 text-sm border border-border rounded-lg px-2 py-2" title="Nights" />
                                <button onClick={() => checkout(a.id)} title={`Buy ${buyNights} night(s) of credits`}
                                  className="inline-flex items-center gap-1.5 text-sm border border-teal-deep text-teal-deep rounded-lg px-3 py-2 font-medium hover:bg-teal-deep/5">
                                  <CreditCard className="w-3.5 h-3.5" /> Buy
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground">Sign in to request a stay or buy credits.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {data && data.accommodations.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">No rooms posted yet — check back soon.</p>
          )}

          {(data?.earnQuests ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Hammer className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Earn your nights</p>
              </div>
              <div className="space-y-2">
                {data.earnQuests.map((q: any) => (
                  <Link key={q.id} href="/quests" className="block text-sm text-muted-foreground hover:text-foreground">
                    <span className="font-medium text-foreground">{q.title}</span>
                    {q.stayCreditReward > 0 && <> — {q.stayCreditReward} stay credit(s) on consent</>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
