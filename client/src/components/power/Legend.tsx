/**
 * The legend (0083, spec 10): the five glyphs WITH COUNTS, the shape
 * spectrum with the village's marker on it, and the village's way of
 * deciding as a chip whose gloss opens on tap. Persistent bottom-left on
 * desktop, collapsible on mobile; the footer slot is where the currency
 * picker lives in v1.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { PowerBlock, PowerSeat } from "./types";

function GlyphSample({ kind }: { kind: "open" | "partial" | "filled" | "forming" | "expired" }) {
  const r = 7;
  const c = 9;
  return (
    <svg viewBox="0 0 18 18" className="w-4.5 h-4.5 w-[18px] h-[18px] shrink-0" aria-hidden="true">
      {kind === "open" && (
        <>
          <circle cx={c} cy={c} r={r} fill="white" stroke="#6b7280" strokeWidth={1.6} strokeDasharray="2.5 2.5" />
          <path d={`M ${c - 3} ${c} H ${c + 3} M ${c} ${c - 3} V ${c + 3}`} stroke="#6b7280" strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
      {kind === "partial" && (
        <>
          <circle cx={c} cy={c} r={r} fill="white" stroke="var(--color-teal-deep)" strokeWidth={1.6} />
          <path d={`M ${c} ${c} L ${c} ${c - r + 2} A ${r - 2} ${r - 2} 0 0 1 ${c + r - 2} ${c} Z`} fill="var(--color-teal-deep)" />
          <line x1={c} y1={c + r - 2} x2={c} y2={c + r + 1.5} stroke="var(--color-teal-deep)" strokeWidth={1.2} />
        </>
      )}
      {kind === "filled" && <circle cx={c} cy={c} r={r} fill="var(--color-teal-deep)" stroke="white" strokeWidth={1.6} />}
      {kind === "forming" && (
        <g opacity={0.55}>
          <circle cx={c} cy={c} r={r} fill="white" stroke="var(--color-teal-deep)" strokeWidth={1.6} strokeDasharray="1.2 2.4" />
          <path d={`M ${c - 2.6} ${c - 3.2} H ${c + 2.6} L ${c - 2.6} ${c + 3.2} H ${c + 2.6} Z`} fill="none" stroke="var(--color-teal-deep)" strokeWidth={1.1} />
        </g>
      )}
      {kind === "expired" && (
        <>
          <circle cx={c} cy={c} r={r} fill="var(--color-teal-deep)" stroke="#6b7280" strokeWidth={1.6} opacity={0.55} />
          <circle cx={c + 4.5} cy={c - 4.5} r={3.4} fill="white" stroke="var(--color-teal-deep)" strokeWidth={1} />
          <line x1={c + 4.5} y1={c - 4.5} x2={c + 4.5} y2={c - 6.6} stroke="var(--color-teal-deep)" strokeWidth={0.9} />
        </>
      )}
    </svg>
  );
}

export default function Legend({
  seats,
  power,
  footer,
}: {
  seats: PowerSeat[];
  power: PowerBlock;
  /** The currency picker mounts here in v1; the site header is a follow-up. */
  footer?: ReactNode;
}) {
  const [openOnMobile, setOpenOnMobile] = useState(false);
  const [glossOpen, setGlossOpen] = useState(false);

  const real = seats.filter((s) => !s.isExample);
  const counted = real.length ? real : seats;
  const counts: Record<string, number> = { open: 0, partial: 0, filled: 0, forming: 0, expired: 0 };
  for (const s of counted) counts[s.state ?? (s.holderCount > 0 ? "filled" : "open")] += 1;

  const rows: Array<{ kind: "open" | "partial" | "filled" | "forming" | "expired"; word: string }> = [
    { kind: "open", word: "open call" },
    { kind: "partial", word: "partly held" },
    { kind: "filled", word: "held" },
    { kind: "forming", word: "forming" },
    { kind: "expired", word: "term ran out" },
  ];

  const shape = power.glossary.shapes.find((s) => s.id === power.shape) ?? null;
  const decides = power.glossary.decidesBy.find((d) => d.id === power.decidesBy) ?? null;
  const decideGloss = power.decidesByGloss || decides?.gloss || null;

  const body = (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {rows.map((rw) => (
          <li key={rw.kind} className="flex items-center gap-2 text-xs text-foreground">
            <GlyphSample kind={rw.kind} />
            <span>{rw.word}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">{counts[rw.kind]}</span>
          </li>
        ))}
      </ul>

      {/* The spectrum (card A design 5): one strip from "one holds it" to
          "all hold it", the village's marker on it. Drawn once for the whole
          village; that is the line from pyramid to circle made honest. */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>one holds it</span>
          <span>all hold it</span>
        </div>
        <div className="relative h-2 rounded-full bg-gradient-to-r from-amber/60 via-sage/50 to-teal-deep/60">
          {shape && typeof shape.spectrum === "number" && (
            <div
              className="absolute -top-1 w-4 h-4 rounded-full bg-card border-2 border-teal-deep shadow"
              style={{ left: `calc(${shape.spectrum * 100}% - 8px)` }}
              title={shape.label}
            />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {shape ? (
            <>
              <span className="font-semibold text-foreground">{shape.label}.</span>{" "}
              {power.shape === "other" && power.shapeGloss ? power.shapeGloss : shape.gloss}
            </>
          ) : (
            "This village has not declared its shape yet."
          )}
        </p>
      </div>

      {decides && (
        <div>
          <button
            type="button"
            onClick={() => setGlossOpen((v) => !v)}
            aria-expanded={glossOpen}
            className="text-xs bg-teal-deep/10 text-teal-deep px-2.5 py-1 rounded-full font-medium hover:bg-teal-deep/20"
          >
            Decides by {decides.label.toLowerCase()}
          </button>
          {glossOpen && decideGloss && <p className="text-[11px] text-muted-foreground mt-1.5">{decideGloss}</p>}
        </div>
      )}

      {footer && <div className="pt-2 border-t border-border">{footer}</div>}
    </div>
  );

  return (
    <div data-power-legend className="bg-card border border-border rounded-xl p-3 w-56 max-w-full text-left shadow-sm">
      <button
        type="button"
        className="md:hidden w-full flex items-center justify-between text-xs font-semibold text-foreground"
        onClick={() => setOpenOnMobile((v) => !v)}
        aria-expanded={openOnMobile}
      >
        Legend
        <ChevronDown className={`w-4 h-4 transition-transform ${openOnMobile ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className={`${openOnMobile ? "mt-2" : "hidden"} md:block`}>{body}</div>
    </div>
  );
}
