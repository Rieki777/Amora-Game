/**
 * Where am I (0083, spec 2): Village › Circle › Sub-circle, from the focus
 * node's ancestor chain, every crumb tappable. On a phone this bar is the
 * one piece of chrome above the map and the primary way back out.
 */
import { ChevronRight } from "lucide-react";
import type { Filters, PowerCircle } from "./types";
import { anyFilterOn } from "./types";

export function ancestorChain(circles: PowerCircle[], focusId: string | null): PowerCircle[] {
  const byId = new Map(circles.map((c) => [c.id, c]));
  const chain: PowerCircle[] = [];
  let cur = focusId ? byId.get(focusId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentCircleId ? byId.get(cur.parentCircleId) : undefined;
  }
  return chain;
}

export default function Breadcrumb({
  villageName,
  circles,
  focusId,
  filters,
  onFocus,
  onClearFilters,
}: {
  villageName: string;
  circles: PowerCircle[];
  focusId: string | null;
  filters: Filters;
  onFocus: (id: string | null) => void;
  onClearFilters: () => void;
}) {
  const chain = ancestorChain(circles, focusId);
  const filterWords = [
    filters.open ? "open roles" : null,
    filters.mine ? "my roles" : null,
    filters.expiring ? "ending soon" : null,
    filters.person ? "one person" : null,
    filters.circle ? "one circle" : null,
  ].filter(Boolean);

  return (
    <nav aria-label="Where you are on the map" className="flex items-center gap-1 flex-wrap min-h-9 text-sm" data-power-crumb>
      <button
        type="button"
        onClick={() => onFocus(null)}
        aria-current={focusId === null ? "location" : undefined}
        className={`px-2 py-1 rounded-lg hover:bg-muted ${focusId === null ? "font-semibold text-foreground" : "text-teal-deep"}`}
      >
        {villageName}
      </button>
      {chain.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onFocus(c.id)}
            aria-current={i === chain.length - 1 ? "location" : undefined}
            className={`px-2 py-1 rounded-lg hover:bg-muted ${i === chain.length - 1 ? "font-semibold text-foreground" : "text-teal-deep"}`}
          >
            {c.name}
          </button>
        </span>
      ))}
      {anyFilterOn(filters) && (
        <button
          type="button"
          onClick={onClearFilters}
          className="ml-2 text-xs bg-amber/15 text-amber-700 px-2 py-1 rounded-full hover:bg-amber/25"
        >
          showing {filterWords.join(", ")} · clear
        </button>
      )}
    </nav>
  );
}
