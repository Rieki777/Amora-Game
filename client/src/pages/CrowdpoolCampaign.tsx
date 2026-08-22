/**
 * The crowdpool bridge page at /campaign/:slug (lane CP, R44/R45): the hub's
 * campaign data, told in the living map's language. The gold ring is the
 * pledged pool, the quieter green arc inside it is what has been delivered,
 * the star-lantern burns brighter as the close comes near, needs sit on a
 * parchment shelf with the capital as a tint, and the Pool Ledger narrates
 * arrivals. Every claim links OUT to the hub's own campaign page; nothing on
 * this page moves money or records a pledge.
 *
 * Data comes from the game server's proxy (/api/crowdpool/campaign), which
 * caches with a 90s TTL and serves its last snapshot with `stale: true` when
 * the hub stops answering. The page refetches every minute; new ledger
 * events (diffed by id) play a ripple on the ring and an arrival line.
 */
import Layout from "@/components/Layout";
import ModuleGate from "@/components/modules/ModuleGate";
import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { authToken } from "@/lib/gameApi";
import { ArrowLeft, ExternalLink, HandHeart, Package, Sparkles, Users } from "lucide-react";
import {
  CrowdpoolStyles, GoldRing, GrowthStrip, KIND_LABELS, SlotMeter, StarLantern,
  capitalTint, kindGlyph, money, phaseLabel, timeAgo,
} from "@/components/crowdpool/PoolPieces";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface Need {
  id: string; name: string; kind: string; capitalType: string; description: string | null;
  estimatedValue: number; quantityWanted: number; quantityClaimed: number; quantityDelivered: number;
  needDeadline: string | null; priorityPinned: boolean; groupClaimable: boolean;
}
interface PoolEvent { id: string; type: string; who: string; item: string | null; at: string | null }
interface Partner {
  partner: string; label: string; url: string; raised: number;
  contributorCount: number; percent: number; cachedAt: string | null;
}
interface Campaign {
  id: number; slug: string; title: string; projectName: string | null; location: string | null;
  description: string | null; status: string; currency: string;
  totalValue: number; pledgedTotal: number; financialTarget: number;
  percentPledged: number; percentDelivered: number;
  startedAt: string | null; endsAt: string | null; daysRemaining: number | null;
  contributorsCount: number; imageUrl: string | null; hubUrl: string; isDemo: boolean;
  needs: Need[]; partners: Partner[]; events: PoolEvent[];
}

/** One arrival, in the register Maia uses on the map. */
function narrate(e: PoolEvent): string {
  if (e.type === "delivered") {
    return e.item ? `${e.item} arrived; the walls grew.` : "Something promised arrived; the walls grew.";
  }
  if (e.type === "thanked") return `Gratitude went back down the thread to ${e.who}.`;
  if (e.item) return `${e.who} spoke for ${e.item}.`;
  return `${e.who} laid a promise on the ring.`;
}

export default function CrowdpoolCampaign() {
  const modules = useModules();
  const crowdpool = useModule("crowdpool");
  const [, params] = useRoute("/campaign/:slug");
  const slug = params?.slug ?? "";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stale, setStale] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [missing, setMissing] = useState(false);
  const [ripple, setRipple] = useState(0);
  const [arrivals, setArrivals] = useState<Set<string>>(new Set());
  const knownEvents = useRef<Set<string> | null>(null);

  const load = () => {
    fetch(`/api/crowdpool/campaign?slug=${encodeURIComponent(slug)}`, { headers: headers() })
      .then(async (r) => {
        if (r.status === 404) { setMissing(true); return null; }
        if (!r.ok) { setUnreachable(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d?.campaign) return;
        setUnreachable(false);
        setCampaign(d.campaign);
        setStale(Boolean(d.stale));
        setLastSyncAt(d.lastSyncAt ?? null);
        const ids = new Set<string>((d.campaign.events ?? []).map((e: PoolEvent) => e.id));
        if (knownEvents.current) {
          const fresh = (d.campaign.events ?? []).filter((e: PoolEvent) => !knownEvents.current!.has(e.id));
          if (fresh.length) {
            setArrivals(new Set(fresh.map((e: PoolEvent) => e.id)));
            setRipple((n) => n + 1);
          }
        }
        knownEvents.current = ids;
      })
      .catch(() => setUnreachable(true));
  };

  useEffect(() => {
    if (!crowdpool || !slug) return;
    knownEvents.current = null;
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [crowdpool?.id, slug]);

  if (modules.loaded && !crowdpool) return <ModuleGate moduleId="crowdpool" name="Crowdpool" />;
  if (missing) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-display text-3xl font-bold mb-3">Crowdpool</h1>
          <p className="text-muted-foreground mb-6">No campaign is linked under that name.</p>
          <Link href="/campaigns" className="underline">See the linked campaigns</Link>
        </div>
      </Layout>
    );
  }

  const c = campaign;
  const openNeeds = (c?.needs ?? []).filter((n) => n.quantityDelivered < n.quantityWanted);
  const metNeeds = (c?.needs ?? []).filter((n) => n.quantityDelivered >= n.quantityWanted);

  return (
    <Layout>
      <CrowdpoolStyles />
      <section className="py-6 md:py-10 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container max-w-5xl">
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> All raisings
          </Link>

          {!c && !unreachable && (
            <div className="cp-board p-8 text-center" role="status" aria-live="polite">
              <p className="cp-smallcaps text-sm">Reading the ledger</p>
            </div>
          )}

          {!c && unreachable && (
            <div className="cp-board p-8 text-center">
              <p className="cp-smallcaps text-sm mb-2">The ledger sleeps</p>
              <p className="text-sm" style={{ color: "#e4d3ae" }}>
                The hub is out of reach and nothing has been kept to show yet. Come back in a little while.
              </p>
            </div>
          )}

          {c && (
            <div className="cp-board">
              {/* ── The header board: name, ring, lantern ── */}
              <div className="p-6 md:p-8">
                {stale && (
                  <div className="cp-stale mb-5" role="status">
                    The ledger sleeps. The hub last answered {timeAgo(lastSyncAt)}; these numbers are kept from then.
                  </div>
                )}
                <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
                  <div>
                    <div className="cp-smallcaps text-xs mb-1">A raising on the hub</div>
                    <h1 className="font-display text-3xl md:text-4xl font-bold" style={{ color: "#f3e6c8" }}>{c.title}</h1>
                    {(c.projectName || c.location) && (
                      <p className="text-sm mt-1" style={{ color: "#c9a25e" }}>
                        {[c.projectName, c.location].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {c.description && (
                      <p className="text-sm mt-3 leading-relaxed max-w-xl" style={{ color: "#e4d3ae" }}>{c.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm" style={{ color: "#e4d3ae" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <HandHeart className="w-4 h-4" style={{ color: "#c9a25e" }} />
                        {money(c.pledgedTotal, c.currency)} of {money(c.totalValue, c.currency)} pooled
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-4 h-4" style={{ color: "#c9a25e" }} />
                        {c.contributorsCount === 1 ? "1 backer so far" : `${c.contributorsCount} backers so far`}
                      </span>
                    </div>
                    <div className="mt-5">
                      <StarLantern daysRemaining={c.daysRemaining} endsAt={c.endsAt} />
                    </div>
                  </div>
                  <div>
                    <GoldRing
                      percentPledged={c.percentPledged}
                      percentDelivered={c.percentDelivered}
                      label={phaseLabel(c.status, c.percentPledged)}
                      ripple={ripple}
                    />
                  </div>
                </div>
              </div>

              {/* ── What this pool is, plainly ── */}
              <div className="px-6 md:px-8 pb-6">
                <div className="cp-plaque p-4 text-sm leading-relaxed">
                  <span className="cp-smallcaps-ink text-xs block mb-1">What this pool is</span>
                  This is our village's raising on the hub, where a build gathers what it needs: goods, tools,
                  hands, know-how and funds. No money moves through this page. Crypto pledges are tracked on the
                  hub, and gifts or loans of ordinary money go through the partner funders below. Claim a need
                  here and you finish the claim on the hub's own page.
                </div>
              </div>

              {/* ── The growth strip ── */}
              <div className="px-6 md:px-8 pb-6">
                <h2 className="cp-smallcaps text-sm mb-3">From blueprint to walls</h2>
                <GrowthStrip percentDelivered={c.percentDelivered} percentPledged={c.percentPledged} />
              </div>
            </div>
          )}
        </div>
      </section>

      {c && (
        <section className="py-8 bg-background">
          <div className="container max-w-5xl space-y-8">
            {/* ── The needs shelf ── */}
            <div>
              <h2 className="font-display text-2xl font-bold mb-1">The needs shelf</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Each open need is a quest waiting to be written. The solid bar is what arrived; the faint bar is
                what someone has spoken for.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {openNeeds.map((n) => {
                  const tint = capitalTint(n.capitalType);
                  const Glyph = kindGlyph(n.kind);
                  return (
                    <div key={n.id} className="cp-plaque cp-need" style={{ borderLeftColor: tint }}>
                      {n.priorityPinned && <span className="cp-pin">first needed</span>}
                      <div className="flex items-start gap-3">
                        <span
                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                          style={{ background: `${tint}22`, color: tint }}
                        >
                          <Glyph className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm leading-snug" style={{ color: "#241a10" }}>{n.name}</h3>
                          <p className="text-[11px] mt-0.5" style={{ color: tint }}>
                            {KIND_LABELS[n.kind] ?? n.kind}, {n.capitalType} capital
                            {n.groupClaimable ? ", many hands welcome" : ""}
                          </p>
                          {n.description && (
                            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "#4a3a26" }}>{n.description}</p>
                          )}
                          <div className="mt-2.5">
                            <SlotMeter wanted={n.quantityWanted} claimed={n.quantityClaimed} delivered={n.quantityDelivered} tint={tint} />
                          </div>
                          {n.needDeadline && (
                            <p className="text-[11px] mt-1.5" style={{ color: "#8a6a33" }}>
                              Needed by {new Date(n.needDeadline).toLocaleDateString()}
                            </p>
                          )}
                          <a
                            href={c.hubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold rounded-lg px-3 py-1.5"
                            style={{ background: "#241a10", color: "#ecd08a" }}
                          >
                            Claim this on the hub <ExternalLink className="w-3 h-3" />
                          </a>
                          <p className="text-[10.5px] mt-1" style={{ color: "#8a6a33" }}>
                            You finish the claim on the hub's page.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {openNeeds.length === 0 && (
                  <div className="cp-plaque p-5 text-sm md:col-span-2" style={{ color: "#4a3a26" }}>
                    Every need on the shelf has been met. The pool did its work.
                  </div>
                )}
              </div>
              {metNeeds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  {metNeeds.length === 1 ? "1 need already fully delivered" : `${metNeeds.length} needs already fully delivered`}
                </p>
              )}
            </div>

            {/* ── Partner funders ── */}
            {c.partners.length > 0 && (
              <div>
                <h2 className="font-display text-2xl font-bold mb-1">Partner funders</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Ordinary money travels through partners, never through this page. Their own tallies, as the hub
                  last cached them.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {c.partners.map((p) => (
                    <div key={p.partner} className="cp-plaque p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-sm" style={{ color: "#241a10" }}>{p.label}</h3>
                        <span className="text-xs font-bold" style={{ color: "#8a6a33" }}>{p.percent}%</span>
                      </div>
                      <div className="cp-slots-track mt-2">
                        <div className="cp-slots-delivered" style={{ width: `${p.percent}%`, background: "#a8862c" }} />
                      </div>
                      <p className="text-xs mt-2" style={{ color: "#4a3a26" }}>
                        {money(p.raised, c.currency)} raised with {p.contributorCount === 1 ? "1 contributor" : `${p.contributorCount} contributors`}
                      </p>
                      {p.cachedAt && (
                        <p className="text-[10.5px] mt-0.5" style={{ color: "#8a6a33" }}>
                          Their numbers, kept {timeAgo(p.cachedAt)}
                        </p>
                      )}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold underline"
                        style={{ color: "#241a10" }}
                      >
                        Open {p.label} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── The Pool Ledger ── */}
            <div>
              <h2 className="font-display text-2xl font-bold mb-1">The Pool Ledger</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Arrivals, as the hub's public feed tells them. Counts and names only; amounts stay in the pool.
              </p>
              <div className="cp-board p-5">
                {c.events.length === 0 && (
                  <p className="text-sm inline-flex items-center gap-2" style={{ color: "#e4d3ae" }}>
                    <Sparkles className="w-4 h-4" style={{ color: "#c9a25e" }} />
                    The ledger waits for its first arrival.
                  </p>
                )}
                <ul className="space-y-2.5">
                  {c.events.map((e) => (
                    <li
                      key={e.id}
                      className={`cp-ledger-line rounded-md px-2 py-1 text-sm flex items-baseline gap-3 ${arrivals.has(e.id) ? "arrival" : ""}`}
                      style={{ color: "#f3e6c8" }}
                    >
                      <span className="cp-smallcaps text-[11px] shrink-0 w-20">{e.type}</span>
                      <span className="flex-1">{narrate(e)}</span>
                      {e.at && <span className="text-[11px] shrink-0" style={{ color: "#c9a25e" }}>{timeAgo(e.at)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── The one door out ── */}
            <div className="text-center pb-4">
              <a
                href={c.hubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-sm"
                style={{ background: "#241a10", color: "#ecd08a", border: "1px solid #c9a25e" }}
              >
                Open this raising on the hub <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}
