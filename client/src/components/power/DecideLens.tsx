/**
 * The "How we decide" lens (0083, P2, R29): circles washed in the colour of
 * their method, domain chips to ask "who decides about money?", and a mark
 * on any circle that carries per-domain overrides. Rendered INSIDE the map
 * SVG through PowerMap's `lenses` seam, over the discs and under nothing.
 *
 * Resolution order is the lens's whole answer: a circle's domain override,
 * else the circle's own method, else the village default. Colour never
 * stands alone: the accordion chips and the key row say the words.
 */
import type { NestedLayout } from "@shared/mapLayout";
import type { PowerBlock, PowerCircle } from "./types";

/** One colour per method, from an Okabe-Ito-derived set: distinguishable
 *  under the common colour blindnesses, which a governance lens owes its
 *  readers. `other` is grey on purpose: its meaning is the village's gloss. */
export const METHOD_COLOURS: Record<string, string> = {
  consent: "#009E73",
  consensus: "#56B4E9",
  majority: "#0072B2",
  lead_decides: "#E69F00",
  elders_decide: "#D55E00",
  founder_decides: "#CC79A7",
  do_ocracy: "#F0E442",
  delegated: "#8B7DD8",
  hypha: "#33BBC5",
  other: "#8A8A8A",
};

export function methodFor(
  circle: PowerCircle | undefined,
  domain: string | null,
  power: PowerBlock,
): string | null {
  if (!circle) return power.decidesBy;
  if (domain) {
    const override = circle.decidesByDomains?.[domain]?.method;
    if (override) return override;
  }
  return circle.decidesBy ?? power.decidesBy;
}

export default function DecideLens({
  layout,
  circles,
  power,
  domain,
}: {
  layout: NestedLayout;
  circles: PowerCircle[];
  power: PowerBlock;
  /** One of the four domain ids, or null for the overall method. */
  domain: string | null;
}) {
  const byId = new Map(circles.map((c) => [c.id, c]));
  return (
    <g data-power-decide-lens aria-hidden="true" pointerEvents="none">
      {layout.circles.map((pos) => {
        const c = byId.get(pos.id);
        const method = methodFor(c, domain, power);
        if (!method) return null;
        const colour = METHOD_COLOURS[method] ?? METHOD_COLOURS.other;
        const overrides = Object.keys(c?.decidesByDomains ?? {});
        return (
          <g key={pos.id}>
            <circle cx={pos.x} cy={pos.y} r={Math.max(4, pos.r - 3)} fill={colour} opacity={0.22} />
            <circle cx={pos.x} cy={pos.y} r={Math.max(4, pos.r - 3)} fill="none" stroke={colour} strokeWidth={2} opacity={0.7} />
            {/* A small mark per domain override, riding the lower rim: the
                sign that this circle answers differently by subject. */}
            {overrides.map((d, i) => {
              const a = Math.PI / 2 + (i - (overrides.length - 1) / 2) * 0.4;
              const mx = pos.x + (pos.r - 10) * Math.cos(a);
              const my = pos.y + (pos.r - 10) * Math.sin(a);
              const oColour = METHOD_COLOURS[c?.decidesByDomains?.[d]?.method ?? "other"] ?? METHOD_COLOURS.other;
              return <rect key={d} x={mx - 3.5} y={my - 3.5} width={7} height={7} rx={1.5} fill={oColour} stroke="white" strokeWidth={1} />;
            })}
          </g>
        );
      })}
    </g>
  );
}

/** The words beside the colours: which methods this map is showing now. */
export function DecideKey({
  circles,
  power,
  domain,
}: {
  circles: PowerCircle[];
  power: PowerBlock;
  domain: string | null;
}) {
  const present = new Map<string, number>();
  for (const c of circles) {
    const m = methodFor(c, domain, power);
    if (m) present.set(m, (present.get(m) ?? 0) + 1);
  }
  const entries = Array.from(present.entries()).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return <p className="text-xs text-muted-foreground">No circle has declared a way of deciding yet.</p>;
  }
  return (
    <div className="flex items-center gap-2.5 flex-wrap" data-power-decide-key>
      {entries.map(([m, n]) => {
        const def = power.glossary.decidesBy.find((d) => d.id === m);
        return (
          <span key={m} className="inline-flex items-center gap-1.5 text-xs text-foreground" title={def?.gloss}>
            <span className="w-3 h-3 rounded-full inline-block border border-black/10" style={{ background: METHOD_COLOURS[m] ?? METHOD_COLOURS.other }} />
            {def?.label ?? m}
            <span className="text-muted-foreground tabular-nums">{n}</span>
          </span>
        );
      })}
    </div>
  );
}
