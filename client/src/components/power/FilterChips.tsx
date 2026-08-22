/**
 * Filters as chips (0083, spec 7): open seats, my seats, expiring soon, one
 * circle, one person. A filter DIMS the rest of the map to 20% instead of
 * hiding it, and the crumb bar names what is on. Tapping any avatar applies
 * the person filter; the person chip here is how it reads and clears.
 */
import type { Filters, PowerCircle } from "./types";

function Chip({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        on
          ? "bg-teal-deep text-white border-teal-deep"
          : "bg-card text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

export default function FilterChips({
  filters,
  onChange,
  circles,
  signedIn,
  personName,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  circles: PowerCircle[];
  signedIn: boolean;
  /** The display name behind the person filter, for the chip's words. */
  personName?: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-power-filters role="group" aria-label="Filters">
      <Chip on={filters.open} label="Open roles" onToggle={() => onChange({ ...filters, open: !filters.open })} />
      {signedIn && <Chip on={filters.mine} label="My roles" onToggle={() => onChange({ ...filters, mine: !filters.mine })} />}
      <Chip on={filters.expiring} label="Ending soon" onToggle={() => onChange({ ...filters, expiring: !filters.expiring })} />
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        <span className="sr-only">One circle</span>
        <select
          value={filters.circle ?? ""}
          onChange={(e) => onChange({ ...filters, circle: e.target.value || null })}
          className={`text-xs border rounded-full px-2 py-1 bg-card max-w-40 ${filters.circle ? "border-teal-deep text-teal-deep font-medium" : "border-border text-muted-foreground"}`}
        >
          <option value="">Any circle</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {filters.person && (
        <Chip
          on
          label={`Held by ${personName ?? "one person"} ×`}
          onToggle={() => onChange({ ...filters, person: null })}
        />
      )}
    </div>
  );
}
