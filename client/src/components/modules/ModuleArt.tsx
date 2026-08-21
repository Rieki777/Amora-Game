/**
 * A module card's picture, with the designed fallback (L1).
 *
 * Resolution order: the village's own upload (`imageUrl` in the module's
 * config), then the bundled platform art (`/images/modules/<id>.webp`, L1a),
 * then the drawn fallback: a gradient from the module's catalog hue plus its
 * lucide emblem. The fallback costs zero image budget, so a fork with no art,
 * or a village that removed one, still looks finished.
 *
 * The emblem map is explicit instead of a dynamic lucide lookup so the lazy
 * chunk carries only the icons the catalog actually names; a name the map
 * does not know falls back to a neutral mark rather than a crash.
 */
import { useState } from "react";
import {
  Activity, Award, BedDouble, CalendarDays, Circle, Coins, Globe, Hammer,
  Handshake, Heart, Landmark, MessageCircle, MessagesSquare, Mic, Newspaper,
  Sparkles, TrendingUp, Users, Wrench, type LucideIcon,
} from "lucide-react";

const EMBLEMS: Record<string, LucideIcon> = {
  Activity, Award, BedDouble, CalendarDays, Coins, Globe, Hammer, Handshake,
  Heart, Landmark, MessageCircle, MessagesSquare, Mic, Newspaper, Sparkles,
  TrendingUp, Users, Wrench,
};

export function FallbackArt({ hue, emblem, className = "" }: { hue: number; emblem: string; className?: string }) {
  const Emblem = EMBLEMS[emblem] ?? Circle;
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 42% 28%), hsl(${(hue + 40) % 360} 55% 52%))`,
      }}
    >
      <Emblem className="w-10 h-10 text-white/80" strokeWidth={1.5} />
    </div>
  );
}

export default function ModuleArt({
  id, hue, emblem, imageUrl, className = "",
}: {
  id: string;
  hue: number;
  emblem: string;
  /** The village's own upload, from module_settings.config. */
  imageUrl?: string | null;
  className?: string;
}) {
  // Walk the source list forward on error; past the end, draw the fallback.
  const sources = [
    ...(imageUrl ? [imageUrl] : []),
    `/images/modules/${id}.webp`,
  ];
  const [at, setAt] = useState(0);
  if (at >= sources.length) return <FallbackArt hue={hue} emblem={emblem} className={className} />;
  return (
    <img
      src={sources[at]}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setAt((n) => n + 1)}
      className={`object-cover ${className}`}
    />
  );
}
