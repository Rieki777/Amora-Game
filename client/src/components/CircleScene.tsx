import { Image } from "@/components/Image";
import { sceneForCircle, type SceneMotif } from "@shared/circleScenes";

/**
 * THE FOUNDATION SCENE SET — eleven hand-drawn SVG banners, one per motif,
 * drawn once and inherited by every village (shared/circleScenes.ts decides
 * which one a circle wears).
 *
 * They are TOKEN-DRIVEN: every fill is a --tone-* variable with the platform
 * default as fallback, so the same drawing renders in each village's own
 * palette the moment they pick a seed colour in Admin → Look. One set of
 * art, endlessly re-coloured — the design system doing the work that would
 * otherwise take two hundred generated images. And they are SVG: a whole
 * scene costs less than a favicon, scales to any width, and never trips the
 * per-image CI budget.
 *
 * A village that uploads its own scene art (scene = /api/uploads/…) gets it
 * rendered through <Image> with the same reserved-space discipline.
 */

const T = {
  brand: "var(--tone-brand, #157f7d)",
  mid: "var(--tone-brand-mid, #3a9896)",
  soft: "var(--tone-brand-soft, #7fb8ac)",
  mist: "var(--tone-mist, #83a7ad)",
  mistLight: "var(--tone-mist-light, #c6dde0)",
  cream: "var(--tone-cream, #efe8d7)",
  sun: "var(--tone-sun, #ecb163)",
};

/** Shared ground: sky wash, low hills, a sun/moon disc. Scenes draw over it. */
function Ground({ children, moon = false }: { children: React.ReactNode; moon?: boolean }) {
  return (
    <>
      <rect width="400" height="100" fill={T.mistLight} opacity="0.55" />
      <circle cx={moon ? 348 : 340} cy="26" r={moon ? 11 : 14} fill={moon ? T.mistLight : T.sun} opacity={moon ? 1 : 0.9} />
      {moon && <circle cx="344" cy="23" r="9" fill={T.mist} opacity="0.5" />}
      <path d="M0 78 Q 90 58 190 74 T 400 70 L 400 100 L 0 100 Z" fill={T.soft} opacity="0.5" />
      <path d="M0 88 Q 120 72 240 86 T 400 84 L 400 100 L 0 100 Z" fill={T.brand} opacity="0.35" />
      {children}
    </>
  );
}

const leaf = (x: number, y: number, s: number, fill: string, o = 1) => (
  <path d={`M${x} ${y} q ${4 * s} ${-7 * s} 0 ${-14 * s} q ${-4 * s} ${7 * s} 0 ${14 * s} Z`} fill={fill} opacity={o} />
);

const SCENES: Record<SceneMotif, React.ReactNode> = {
  coordination: (
    <Ground>
      {/* circles in council: seats around a shared centre */}
      <circle cx="200" cy="66" r="17" fill="none" stroke={T.brand} strokeWidth="2.5" opacity="0.9" />
      <circle cx="200" cy="66" r="4.5" fill={T.sun} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={200 + 26 * Math.cos((a * Math.PI) / 180)} cy={66 + 15 * Math.sin((a * Math.PI) / 180)} r="4" fill={T.brand} opacity="0.85" />
      ))}
      <circle cx="120" cy="70" r="3" fill={T.mist} />
      <circle cx="284" cy="72" r="3" fill={T.mist} />
      <path d="M124 70 Q 160 56 183 64" stroke={T.mist} strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M280 72 Q 248 56 219 63" stroke={T.mist} strokeWidth="1.5" fill="none" opacity="0.7" />
    </Ground>
  ),
  outreach: (
    <Ground>
      {/* a path outward, an open gate, birds toward the horizon */}
      <path d="M188 100 Q 196 76 232 62 Q 260 52 316 48" stroke={T.cream} strokeWidth="7" fill="none" opacity="0.95" />
      <path d="M188 100 Q 196 76 232 62 Q 260 52 316 48" stroke={T.sun} strokeWidth="2" fill="none" strokeDasharray="1 7" />
      <path d="M96 74 l0 -20 M112 74 l0 -20 M94 56 q 10 -8 20 0" stroke={T.brand} strokeWidth="3" fill="none" strokeLinecap="round" />
      {[[318, 30], [334, 24], [348, 32]].map(([x, y]) => (
        <path key={x} d={`M${x - 5} ${y} q 5 -5 10 0`} stroke={T.brand} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.8" />
      ))}
    </Ground>
  ),
  community: (
    <Ground>
      {/* the long shared table, bowls, two lanterns */}
      <rect x="130" y="62" width="140" height="5" rx="2.5" fill={T.brand} />
      <path d="M140 67 l-6 26 M260 67 l6 26" stroke={T.brand} strokeWidth="3.5" strokeLinecap="round" />
      {[158, 186, 214, 242].map((x) => (
        <path key={x} d={`M${x - 7} 60 q 7 6 14 0 Z`} fill={T.sun} opacity="0.95" />
      ))}
      <circle cx="122" cy="46" r="5" fill={T.sun} opacity="0.9" />
      <circle cx="278" cy="46" r="5" fill={T.sun} opacity="0.9" />
      <path d="M122 51 l0 11 M278 51 l0 11" stroke={T.mist} strokeWidth="1.6" />
    </Ground>
  ),
  building: (
    <Ground>
      {/* timber frame going up, ladder, roofline against the hills */}
      <path d="M150 92 L 200 48 L 250 92" stroke={T.brand} strokeWidth="4" fill="none" strokeLinejoin="round" />
      <path d="M163 92 L 163 70 M 237 92 L 237 70 M 150 92 L 250 92" stroke={T.brand} strokeWidth="3" />
      <path d="M200 48 L 200 92" stroke={T.mid} strokeWidth="2.5" opacity="0.8" />
      <path d="M262 92 L 276 58 M 268 92 L 282 58 M 262 84 l 16 0 M 265 74 l 16 0 M 269 64 l 15 0" stroke={T.sun} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="141" cy="88" r="4" fill={T.mist} />
    </Ground>
  ),
  finance: (
    <Ground>
      {/* stewardship: balanced scales, a seedling in one pan */}
      <path d="M200 38 L 200 84 M 172 46 L 228 46" stroke={T.brand} strokeWidth="3" strokeLinecap="round" />
      <path d="M172 46 l -10 18 q 10 8 20 0 Z M 228 46 l -10 18 q 10 8 20 0 Z" fill={T.mist} opacity="0.85" />
      <path d="M228 58 l 0 -8" stroke={T.brand} strokeWidth="1.6" />
      {leaf(228, 56, 0.7, T.sun)}
      <path d="M186 92 q 14 -7 28 0" stroke={T.brand} strokeWidth="3" fill="none" strokeLinecap="round" />
    </Ground>
  ),
  land: (
    <Ground>
      {/* planted rows curving with the hill, one grown tree */}
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${40 + i * 18} 100 Q ${150 + i * 14} ${70 + i * 6} ${330 + i * 12} ${86 + i * 3}`} stroke={T.brand} strokeWidth="2" fill="none" opacity={0.55 - i * 0.08} />
      ))}
      {[100, 150, 200, 250].map((x, i) => leaf(x, 84 - i * 2, 0.8, T.mid, 0.9))}
      <path d="M310 84 L 310 56" stroke={T.brand} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="310" cy="48" r="13" fill={T.soft} />
      <circle cx="303" cy="52" r="8" fill={T.mid} opacity="0.8" />
    </Ground>
  ),
  learning: (
    <Ground>
      {/* an open book, a sprout rising from the spine */}
      <path d="M150 74 Q 175 64 200 72 Q 225 64 250 74 L 250 84 Q 225 74 200 82 Q 175 74 150 84 Z" fill={T.cream} stroke={T.brand} strokeWidth="2" strokeLinejoin="round" />
      <path d="M200 72 L 200 82" stroke={T.brand} strokeWidth="1.6" />
      <path d="M200 70 Q 200 56 200 52" stroke={T.mid} strokeWidth="2" fill="none" />
      {leaf(200, 54, 0.9, T.mid)}
      {leaf(206, 60, 0.7, T.sun)}
      <circle cx="136" cy="80" r="2.5" fill={T.sun} />
      <circle cx="264" cy="80" r="2.5" fill={T.sun} />
    </Ground>
  ),
  arts: (
    <Ground>
      {/* a drum, a thread of melody, loose stitches of colour */}
      <ellipse cx="168" cy="72" rx="17" ry="7" fill={T.sun} opacity="0.95" />
      <path d="M151 72 l 0 14 q 17 8 34 0 l 0 -14" fill={T.brand} opacity="0.85" />
      <path d="M196 66 q 20 -18 40 -6 q 20 12 40 -8" stroke={T.mid} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {[212, 240, 268].map((x, i) => (
        <circle key={x} cx={x} cy={60 - i * 2} r="2.6" fill={i === 1 ? T.sun : T.brand} />
      ))}
    </Ground>
  ),
  healing: (
    <Ground>
      {/* spring water rising in rings, leaves resting on it */}
      <circle cx="200" cy="74" r="20" fill="none" stroke={T.mid} strokeWidth="2" opacity="0.7" />
      <circle cx="200" cy="74" r="11" fill="none" stroke={T.mid} strokeWidth="2" opacity="0.85" />
      <circle cx="200" cy="74" r="3.5" fill={T.brand} />
      {leaf(178, 66, 0.8, T.soft, 0.9)}
      {leaf(224, 70, 0.8, T.soft, 0.9)}
      {leaf(200, 48, 0.9, T.sun)}
    </Ground>
  ),
  wisdom: (
    <Ground moon>
      {/* the old tree: crown and roots the same size, as they are */}
      <path d="M170 92 Q 168 66 196 60 M 230 92 Q 232 66 204 60" stroke={T.brand} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="200" cy="46" r="17" fill={T.soft} />
      <circle cx="188" cy="52" r="10" fill={T.mid} opacity="0.85" />
      <circle cx="212" cy="52" r="10" fill={T.mid} opacity="0.85" />
      <path d="M186 92 q 14 8 28 0 M 178 96 q 22 10 44 0" stroke={T.brand} strokeWidth="2" fill="none" opacity="0.6" />
    </Ground>
  ),
  gathering: (
    <Ground moon>
      {/* the hearth under stars: what every village is before it is anything */}
      <path d="M196 84 q 4 -12 -4 -18 q 12 2 12 14 q 6 -4 4 -10 q 8 8 2 18 q -7 7 -14 -4 Z" fill={T.sun} />
      <path d="M182 90 l 36 0" stroke={T.brand} strokeWidth="3" strokeLinecap="round" />
      {[[140, 30], [162, 20], [252, 24], [274, 34]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="1.6" fill={T.sun} opacity="0.9" />
      ))}
    </Ground>
  ),
};

export function CircleScene({
  circle,
  className,
}: {
  circle: { id?: string; name?: string; scene?: string };
  className?: string;
}) {
  const resolved = sceneForCircle(circle);
  if (resolved.kind === "upload") {
    return <Image src={resolved.url} alt="" ratio={4} className={className} />;
  }
  return (
    // Decorative: the circle's NAME carries the meaning; the scene is warmth.
    <svg viewBox="0 0 400 100" aria-hidden="true" className={className} style={{ display: "block", width: "100%" }}>
      {SCENES[resolved.motif]}
    </svg>
  );
}

export default CircleScene;
