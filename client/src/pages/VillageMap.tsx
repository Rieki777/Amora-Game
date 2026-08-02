/**
 * The Village Map (S19-S23, S70): the living org chart as nested circles in
 * the sociocracy style. The village encloses its circles, sub-circles nest
 * inside their parents, and roles sit as seats on each circle's inner ring.
 * Desktop pairs the canvas with a standing detail panel; mobile gets an
 * accordion of the same data with the same actions. The concierge bar routes
 * "I want to help with X" to the right node.
 *
 * Layout is shared/mapLayout.layoutNestedMap: pure, deterministic, tested.
 * A member's spatial memory of where a circle lives survives every visit.
 */
import Layout from "@/components/Layout";
import MicButton from "@/components/MicButton";
import NotFound from "@/pages/NotFound";
import { useEffect, useMemo, useRef, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { layoutNestedMap, type NestedInput } from "@shared/mapLayout";
import { authToken } from "@/lib/gameApi";
import { getPreference, rememberMapAvailable, setPreference } from "@/lib/landing";
import { ChevronDown, Compass, Hand, Mail, Minus, Plus, Search, X } from "lucide-react";
import { ExamplesBanner } from "@/components/ExamplesBanner";

interface MapRole {
  id: string;
  name: string;
  description: string;
  circleId: string | null;
  seats: number;
  minStage: string | null;
  holderCount: number;
  vacant: boolean;
  holders: Array<{ userId: string; name: string }>;
}
interface MapData {
  circles: any[];
  roles: MapRole[];
  quests: Array<{ id: string; title: string; circleId: string | null }>;
  viewer: { viewPeople: boolean };
  vacantHighlight: boolean;
  conciergeEnabled: boolean;
}
type Selection = { kind: "circle" | "role"; id: string } | null;

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** Tone tokens a circle row may carry, resolved to the theme's variables so
 *  the map draws in the village's own palette. Unknown tokens read as teal. */
const TONE: Record<string, string> = {
  sage: "var(--color-sage)",
  amber: "var(--color-amber)",
  coral: "var(--color-coral)",
  teal: "var(--color-teal)",
};
const toneOf = (c: any): string => TONE[String(c?.color ?? "")] ?? "var(--color-teal-deep)";

export default function VillageMap() {
  const modules = useModules();
  const mapModule = useModule("map");
  const [data, setData] = useState<MapData | null>(null);
  const [denied, setDenied] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);

  useEffect(() => {
    if (!mapModule) return;
    fetch("/api/map", { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch((status) => { if (status === 401) setDenied(true); });
  }, [mapModule?.id]);

  // Cache visibility for the landing decision on the NEXT visit (landing.ts).
  // Recorded from the viewer's own catalogue, so "available" means available
  // to this person, not merely enabled — a member's map does not leak into a
  // signed-out visitor's landing.
  useEffect(() => {
    if (modules.loaded) rememberMapAvailable(Boolean(mapModule));
  }, [modules.loaded, mapModule?.id]);

  if (modules.loaded && !mapModule) return <NotFound />;

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">The Village Map</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Circles of care, the roles that hold them, and the seats waiting for
            someone like you.
          </p>
          <ExamplesBanner moduleId="map" noun="circle" />
          <LandingToggle />
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-7xl">
          {denied && (
            <p className="text-center text-muted-foreground py-16">
              Sign in to see the village map.
            </p>
          )}
          {data && (
            <>
              {data.conciergeEnabled && <ConciergeBar onPick={(k, id) => setSelected({ kind: k as any, id })} />}
              <div className="hidden md:flex gap-6 items-start">
                <div className="flex-1 min-w-0">
                  <MapCanvas data={data} selected={selected} onSelect={setSelected} />
                </div>
                <SidePanel data={data} selected={selected} onSelect={setSelected} onClose={() => setSelected(null)} />
              </div>
              <div className="md:hidden">
                <CircleAccordion data={data} onSelect={setSelected} />
              </div>
              {selected && (
                <div className="md:hidden">
                  <NodeCard data={data} selected={selected} onClose={() => setSelected(null)} />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}

// ── Desktop: nested circles, the sociocracy picture ──────────────────────────

function MapCanvas({ data, selected, onSelect }: {
  data: MapData; selected: Selection; onSelect: (s: Selection) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => {
    const inputs: NestedInput[] = data.circles.map((c: any) => ({
      id: c.id,
      parentId: c.parentCircleId ?? null,
      order: c.order ?? 0,
      memberCount: data.roles.filter((r) => r.circleId === c.id).reduce((n, r) => n + r.holderCount, 0),
      roles: data.roles.filter((r) => r.circleId === c.id).map((r) => ({ id: r.id, vacant: r.vacant })),
      questCount: data.quests.filter((q) => q.circleId === c.id).length,
    }));
    // Roles with no circle are the village's own seats: they sit on the
    // boundary ring rather than vanishing off the picture.
    const villageRoles = data.roles
      .filter((r) => !r.circleId)
      .map((r) => ({ id: r.id, vacant: r.vacant }));
    return layoutNestedMap(inputs, villageRoles);
  }, [data]);

  const circleById = (id: string) => data.circles.find((c: any) => c.id === id);
  const roleById = (id: string) => data.roles.find((r) => r.id === id);

  // Zoom re-centres on the village; the viewBox is the whole camera.
  const vw = layout.width / zoom;
  const view = `${layout.village.x - vw / 2} ${layout.village.y - vw / 2} ${vw} ${vw}`;

  return (
    <div className="relative">
      {/* group, NOT img: role="img" has ARIA's presentational-children
          characteristic, so every circle and role-seat button inside this SVG
          was pruned from the accessibility tree — the whole desktop map
          announced as a single unlabelled graphic with nothing operable. */}
      <svg viewBox={view} className="w-full max-h-[80vh]" role="group" aria-label="Village map">
        {/* The village boundary: one ring holding everything, the way the
            sociocracy diagrams draw the whole organization. */}
        <circle
          cx={layout.village.x} cy={layout.village.y} r={layout.village.r}
          fill="none" stroke="var(--color-sage)" strokeWidth={10} opacity={0.5}
        />
        <circle
          cx={layout.village.x} cy={layout.village.y} r={layout.village.r - 8}
          style={{ fill: "var(--color-sage)", fillOpacity: 0.05 }} stroke="none"
        />
        {layout.village.roles.map((rp) => {
          const role = roleById(rp.id);
          return (
            <g
              key={rp.id}
              className="cursor-pointer focus:outline-none"
              role="button"
              tabIndex={0}
              aria-label={`${role?.name ?? rp.id}, a village-wide seat${rp.vacant ? ". Nobody holds this yet, open call" : ""}`}
              onClick={() => onSelect({ kind: "role", id: rp.id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect({ kind: "role", id: rp.id });
                }
              }}
            >
              <circle
                cx={rp.x} cy={rp.y} r={12}
                className={rp.vacant ? "fill-white stroke-muted-foreground" : "fill-teal-deep stroke-white"}
                strokeWidth={2.5}
                strokeDasharray={rp.vacant ? "3 3" : undefined}
              >
                {rp.vacant && data.vacantHighlight && (
                  <animate attributeName="r" values="12;14;12" dur="2.4s" repeatCount="indefinite" />
                )}
              </circle>
              <title>{role ? `${role.name}${rp.vacant ? ", open call" : ""}` : rp.id}</title>
            </g>
          );
        })}

        {layout.circles.map((pos) => {
          const c = circleById(pos.id);
          const forming = c?.status === "forming";
          const tone = toneOf(c);
          const isSelected = selected?.kind === "circle" && selected.id === pos.id;
          const hasChildren = layout.circles.some((o) => circleById(o.id)?.parentCircleId === pos.id);
          return (
            <g key={pos.id} opacity={forming ? 0.5 : 1}>
              {/* An SVG shape with an onClick is a mouse-only control: role +
                  tabIndex put it in the tab order, Enter and Space select, and
                  the label says what the shape is. Hard-won; keep it. */}
              <circle
                cx={pos.x} cy={pos.y} r={pos.r}
                style={{ fill: tone, fillOpacity: isSelected ? 0.22 : 0.1 }}
                stroke={tone} strokeOpacity={isSelected ? 0.9 : 0.45}
                strokeWidth={isSelected ? 3 : 2}
                className="cursor-pointer transition-all focus:outline-none"
                role="button"
                tabIndex={0}
                aria-label={`${c?.name ?? pos.id}${forming ? ", still forming" : ""}. Open this circle`}
                onClick={() => onSelect({ kind: "circle", id: pos.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect({ kind: "circle", id: pos.id });
                  }
                }}
              />
              {/* A parent's name hugs its top edge so the children keep the
                  middle; a leaf's name sits at its center. */}
              <text
                x={pos.x}
                y={hasChildren ? pos.y - pos.r + 26 : pos.y + (forming ? -6 : 0)}
                textAnchor="middle"
                className="fill-foreground font-semibold pointer-events-none"
                style={{ fontSize: pos.depth === 0 ? 17 : 13 }}
              >
                {c?.name ?? pos.id}
              </text>
              {forming && (
                <text x={pos.x} y={pos.y + (hasChildren ? -pos.r + 42 : 12)} textAnchor="middle"
                  className="fill-muted-foreground pointer-events-none" style={{ fontSize: 11 }}>
                  forming
                </text>
              )}
              {pos.roles.map((rp) => {
                const role = roleById(rp.id);
                const dotR = pos.depth === 0 ? 11 : 9;
                return (
                  <g
                    key={rp.id}
                    className="cursor-pointer focus:outline-none"
                    role="button"
                    tabIndex={0}
                    aria-label={`${role?.name ?? rp.id}${rp.vacant ? ". Nobody holds this yet, open call" : ""}`}
                    onClick={(e) => { e.stopPropagation(); onSelect({ kind: "role", id: rp.id }); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect({ kind: "role", id: rp.id });
                      }
                    }}
                  >
                    <circle
                      cx={rp.x} cy={rp.y} r={dotR}
                      className={rp.vacant ? "fill-white stroke-muted-foreground" : "fill-teal-deep stroke-white"}
                      strokeWidth={2}
                      strokeDasharray={rp.vacant ? "3 3" : undefined}
                    >
                      {rp.vacant && data.vacantHighlight && (
                        <animate attributeName="r" values={`${dotR};${dotR + 2};${dotR}`} dur="2.4s" repeatCount="indefinite" />
                      )}
                    </circle>
                    <title>{role ? `${role.name}${rp.vacant ? ", open call" : ""}` : rp.id}</title>
                  </g>
                );
              })}
              {pos.questDots.map((q, i) => (
                <circle key={i} cx={q.x} cy={q.y} r={4} className="fill-amber/70" />
              ))}
              {pos.questOverflow > 0 && (
                <text x={pos.x} y={pos.y + pos.r - 10} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                  +{pos.questOverflow} more quests
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(2.4, z * 1.3))}
          aria-label="Zoom in"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(1, z / 1.3))}
          aria-label="Zoom out"
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Desktop: the standing detail panel ───────────────────────────────────────

function SidePanel({ data, selected, onSelect, onClose }: {
  data: MapData; selected: Selection; onSelect: (s: Selection) => void; onClose: () => void;
}) {
  const filled = data.roles.reduce((n, r) => n + r.holderCount, 0);
  const seats = data.roles.reduce((n, r) => n + r.seats, 0);
  const open = data.roles.filter((r) => r.vacant).length;
  return (
    <aside className="w-80 shrink-0 bg-card border border-border rounded-2xl p-5 sticky top-24 max-h-[80vh] overflow-y-auto">
      {!selected && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-1">The whole village</h2>
          <p className="text-xs text-muted-foreground mb-4">
            {data.circles.length} circle{data.circles.length === 1 ? "" : "s"} · {data.roles.length} role{data.roles.length === 1 ? "" : "s"} · {filled} of {seats} seats filled
          </p>
          {open > 0 && (
            <p className="text-xs text-amber-700 bg-amber/10 rounded-lg px-3 py-2 mb-4">
              {open} open call{open === 1 ? "" : "s"}: the dashed seats are waiting for someone.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Click a circle to meet it, or a seat to see who holds it and how to
            reach them.
          </p>
        </div>
      )}
      {selected && (
        <div>
          <div className="flex items-start justify-between mb-2">
            <NodeTitle data={data} selected={selected} />
            <button onClick={onClose} aria-label="Back to the village overview" className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <NodeDetail data={data} selected={selected} onSelect={onSelect} />
        </div>
      )}
    </aside>
  );
}

function NodeTitle({ data, selected }: { data: MapData; selected: { kind: string; id: string } }) {
  const role = selected.kind === "role" ? data.roles.find((r) => r.id === selected.id) : null;
  const circle = selected.kind === "circle"
    ? data.circles.find((c: any) => c.id === selected.id)
    : role?.circleId
      ? data.circles.find((c: any) => c.id === role.circleId)
      : null;
  return (
    <div>
      <h3 className="font-display text-lg font-bold text-foreground">{role?.name ?? circle?.name}</h3>
      {role && circle && <p className="text-xs text-teal-deep">{circle.name}</p>}
    </div>
  );
}

// ── The shared detail body: circle or role + actions ─────────────────────────

function NodeDetail({ data, selected, onSelect }: {
  data: MapData; selected: { kind: string; id: string }; onSelect?: (s: Selection) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [raising, setRaising] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  const role = selected.kind === "role" ? data.roles.find((r) => r.id === selected.id) : null;
  const circle = selected.kind === "circle"
    ? data.circles.find((c: any) => c.id === selected.id)
    : role?.circleId
      ? data.circles.find((c: any) => c.id === role.circleId)
      : null;

  // Selection changed: clear the in-flight composer state so a half-written
  // note to one person never lands under another name.
  useEffect(() => {
    setComposing(false); setRaising(false); setMessage(""); setNote(""); setStatus("");
  }, [selected.kind, selected.id]);

  const contact = (toUserId: string) => {
    setStatus("");
    fetch("/api/map/contact", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, roleId: role?.id, circleId: circle?.id, message }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not send");
        setStatus("Sent. They'll get an email they can reply to directly.");
        setComposing(false);
        setMessage("");
      })
      .catch((e) => setStatus(e.message));
  };

  const raiseHand = () => {
    setStatus("");
    fetch(`/api/map/roles/${role!.id}/raise-hand`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not raise your hand");
        setStatus("Hand raised. The founding team will be in touch.");
        setRaising(false);
        setNote("");
      })
      .catch((e) => setStatus(e.message));
  };

  const circleRoles = circle && !role ? data.roles.filter((r) => r.circleId === circle.id) : [];
  const circleQuests = circle && !role ? data.quests.filter((q) => q.circleId === circle.id) : [];
  const subCircles = circle && !role ? data.circles.filter((c: any) => c.parentCircleId === circle.id) : [];

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{role?.description || circle?.purpose || ""}</p>

      {role && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {role.holderCount} of {role.seats} seat{role.seats === 1 ? "" : "s"} filled
            {role.minStage && <span className="ml-2 bg-amber/10 text-amber-700 px-1.5 py-0.5 rounded-full">requires {role.minStage}</span>}
          </div>
          {data.viewer.viewPeople && role.holders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.holders.map((h) => (
                <span key={h.userId} className="text-xs bg-muted text-foreground px-2 py-1 rounded-full">{h.name}</span>
              ))}
            </div>
          )}

          {role.vacant ? (
            raising ? (
              <div className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="Why this seat calls to you (optional)"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" />
                <div className="flex gap-2">
                  <button onClick={raiseHand} className="text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium">Raise my hand</button>
                  <button onClick={() => setRaising(false)} className="text-sm text-muted-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setRaising(true)}
                className="inline-flex items-center gap-2 text-sm bg-amber/90 text-teal-deep rounded-lg px-4 py-2 font-semibold">
                <Hand className="w-4 h-4" /> This seat is open, raise your hand
              </button>
            )
          ) : role.holders.length > 0 && data.viewer.viewPeople ? (
            composing ? (
              <div className="space-y-2">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                  placeholder={`A few words for ${role.holders[0].name}…`}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" />
                <p className="text-[11px] text-muted-foreground">
                  They'll receive this by email, with YOUR email address as the
                  reply-to, so replying reaches you directly.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => contact(role.holders[0].userId)} disabled={!message.trim()}
                    className="text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-40">Send</button>
                  <button onClick={() => setComposing(false)} className="text-sm text-muted-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setComposing(true)}
                className="inline-flex items-center gap-2 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium">
                <Mail className="w-4 h-4" /> Contact {role.holders[0].name}
              </button>
            )
          ) : null}
        </div>
      )}

      {!role && circle && (
        <div className="space-y-3">
          {circle.status === "forming" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Still forming: the shape is drawn, the people are gathering.
            </p>
          )}
          {subCircles.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Circles within</p>
              <div className="space-y-1">
                {subCircles.map((sc: any) => (
                  <button key={sc.id} onClick={() => onSelect?.({ kind: "circle", id: sc.id })}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted">
                    {sc.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {circleRoles.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Roles</p>
              <div className="space-y-1">
                {circleRoles.map((r) => (
                  <button key={r.id} onClick={() => onSelect?.({ kind: "role", id: r.id })}
                    className="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted">
                    <span>{r.name}</span>
                    {r.vacant ? (
                      <span className="text-[10px] bg-amber/20 text-amber-700 px-1.5 py-0.5 rounded-full">open call</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{r.holderCount}/{r.seats}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {circleRoles.length === 0 && subCircles.length === 0 && (
            <p className="text-xs text-muted-foreground">No roles attached yet.</p>
          )}
          {circleQuests.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              {circleQuests.length} open Quest{circleQuests.length === 1 ? "" : "s"}, see the{" "}
              <a href="/quests" className="text-teal-deep font-medium">Quest board</a>
            </p>
          )}
        </div>
      )}

      {status && <p className="text-xs text-teal-deep mt-3">{status}</p>}
    </div>
  );
}

// ── Mobile: the same data as an accordion ────────────────────────────────────

function CircleAccordion({ data, onSelect }: { data: MapData; onSelect: (s: any) => void }) {
  const [open, setOpen] = useState<string>("");
  return (
    <div className="space-y-3">
      {data.circles.map((c: any) => {
        const roles = data.roles.filter((r) => r.circleId === c.id);
        const quests = data.quests.filter((q) => q.circleId === c.id);
        const isOpen = open === c.id;
        return (
          <div key={c.id} className={`bg-card border border-border rounded-xl ${c.status === "forming" ? "opacity-60" : ""}`}>
            <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => setOpen(isOpen ? "" : c.id)}>
              <span className="font-semibold text-foreground text-sm">
                {c.name}
                {c.status === "forming" && <span className="ml-2 text-xs text-muted-foreground">(forming)</span>}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2">
                {c.purpose && <p className="text-xs text-muted-foreground">{c.purpose}</p>}
                {roles.map((r) => (
                  <button key={r.id} onClick={() => onSelect({ kind: "role", id: r.id })}
                    className="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted">
                    <span>{r.name}</span>
                    {r.vacant ? (
                      <span className="text-[10px] bg-amber/20 text-amber-700 px-1.5 py-0.5 rounded-full">open call</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{r.holderCount}/{r.seats}</span>
                    )}
                  </button>
                ))}
                {quests.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {quests.length} open Quest{quests.length === 1 ? "" : "s"}, see the <a href="/quests" className="text-teal-deep font-medium">Quest board</a>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Mobile: the node card, a bottom sheet over the accordion ─────────────────

function NodeCard({ data, selected, onClose }: { data: MapData; selected: { kind: string; id: string }; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `node-card-title-${selected.kind}-${selected.id}`;

  // Move focus INTO the card on open and put it back where it came from on
  // close. Both entry points (an accordion row, the concierge's match button)
  // are covered by capturing whatever had focus at mount. Without this the
  // card opens with focus still on the page behind it: Escape does nothing,
  // and a keyboard user has to tab through the whole map to reach close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    // z-[70] puts the sheet above the mobile tab bar and the FAB (see the
    // layering ladder in MobileFab.tsx) — at z-50 the bar sat ON TOP of the
    // sheet's primary actions. The bottom padding clears the bar band plus
    // the home indicator so no control lands underneath it.
    // Escape only fires while focus is inside the overlay, which is why the
    // focus-move-on-open above is load-bearing rather than a nicety.
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white w-full rounded-t-2xl p-6 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] max-h-[80vh] overflow-y-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <span id={titleId}><NodeTitle data={data} selected={selected} /></span>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <NodeDetail data={data} selected={selected} />
      </div>
    </div>
  );
}

// ── The concierge bar ────────────────────────────────────────────────────────

function ConciergeBar({ onPick }: { onPick: (kind: string, id: string) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const ask = () => {
    if (query.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    fetch("/api/assistant/coordinate", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not ask");
        setResult(d);
      })
      .catch((e) => setResult({ error: e.message }))
      .finally(() => setBusy(false));
  };

  return (
    <div className="max-w-2xl mx-auto mb-8">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="What do you want to help with?"
            className="w-full text-sm border border-border rounded-xl pl-9 pr-3 py-2.5 bg-card"
          />
        </div>
        <MicButton onText={(t) => setQuery((v) => (v ? v.replace(/\s*$/, " ") : "") + t)} disabled={busy} />
        <button onClick={ask} disabled={busy || query.trim().length < 3}
          className="text-sm bg-[#2D5A5A] text-white rounded-xl px-4 font-medium disabled:opacity-40">
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {result && (
        <div className="mt-3 bg-card border border-border rounded-xl p-4 text-sm">
          {result.error && <p className="text-red-600 text-xs">{result.error}</p>}
          {result.match && (
            <>
              <p className="text-foreground">
                That sounds like{" "}
                <button className="font-semibold text-teal-deep" onClick={() => result.match.kind !== "quest" && onPick(result.match.kind, result.match.id)}>
                  {result.match.name}
                </button>
                {result.vacant && <span className="text-amber-700">, and nobody holds this yet. Raise your hand!</span>}
                {result.contact && <span>, talk to {result.contact.name}.</span>}
              </p>
              {result.match.kind === "quest" && (
                <a href="/quests" className="text-xs text-teal-deep font-medium">Open the Quest board →</a>
              )}
            </>
          )}
          {result.match === null && !result.error && (
            <p className="text-muted-foreground flex items-start gap-2">
              <Compass className="w-4 h-4 mt-0.5 shrink-0" />
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The consent line for "the map is now your home page".
 *
 * The automatic switch (landing.ts) happens on the third visit without
 * asking — which is only acceptable if the way back is visible AT the place
 * you were brought to, at the moment it first happens. A setting buried in a
 * profile page would make the switch feel like a hijack; a single sentence
 * right under the title makes it feel like a door someone left open.
 *
 * Both choices write an explicit preference, which outranks the visit count
 * forever — including "map", so choosing to stay stops being implicit.
 */
function LandingToggle() {
  const [pref, setPref] = useState(() => getPreference());
  if (pref === "home") return null; // they chose the welcome page; honour it quietly
  return (
    <p className="mt-4 text-xs text-muted-foreground">
      {pref === "map" ? (
        <>The map is your home page.{" "}</>
      ) : (
        <>Returning visitors land here.{" "}</>
      )}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => { setPreference("home"); setPref("home"); }}
      >
        Show me the welcome page instead
      </button>
    </p>
  );
}
