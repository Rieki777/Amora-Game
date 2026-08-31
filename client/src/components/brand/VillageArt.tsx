import { useGameConfig } from "@/lib/gameApi";
import { cn } from "@/lib/utils";
import { buildVillageArt, type VillageArtSlot } from "@shared/villageArt";

/**
 * THE DEFAULT PICTURE FOR A VILLAGE THAT HAS NOT ADDED ONE.
 *
 * Drops into the `fallback` prop that `client/src/components/Image.tsx`
 * already offers, so adopting it is one prop at a call site and no change to
 * this platform's image plumbing:
 *
 *     <Image src={brand.hero} alt={...} priority className="w-full h-full"
 *            fallback={<VillageArt slot="hero" />} />
 *
 * WHY GENERATED AND NOT A PICTURE. shared/villageArt.ts carries the full
 * reasoning and the geometry. The short version: six hero slots ship empty
 * because they used to ship one village's photographs to every fork, and any
 * shared photograph repeats that mistake with a different picture. Artwork
 * computed from the village's own name gives thirteen founders thirteen
 * different faces from one piece of code and zero image files.
 *
 * THREE THINGS THIS FILE IS RESPONSIBLE FOR, none of which belong in the
 * geometry module.
 *
 * COLOUR, AND ONLY THROUGH THE TOKEN LAYER. Every fill is
 * `var(--tone-brand-soft, currentColor)`. A village that has set a seed
 * colour in Admin gets `--tone-brand-soft` from the server's theme stylesheet
 * (server/lib/themeCss.ts) and its artwork carries its own hue. A village
 * with no seed resolves to `currentColor`, which this element sets to
 * `text-muted-foreground`: the platform's shipped neutral greyscale. No hex
 * code appears here, so a founder's colour can always reach the picture.
 *
 * `--tone-brand-soft` specifically, rather than `--tone-brand`. Neither one
 * is redefined under `.dark`, so both are the same colour in both themes.
 * `--tone-brand` is the raw seed and can be near black or near white;
 * `--tone-brand-soft` is derived at a FIXED lightness of 0.66
 * (shared/brandTokens.ts), which is legible against the light theme's #f2f2f2
 * and against the dark theme's oklch(0.18) alike. That fixed lightness is the
 * only reason one variable can serve both themes here.
 *
 * WHETHER TO DRAW AT ALL. An unnamed village gets nothing, and `Image` then
 * shows its own quiet `bg-muted/40` field. Two reasons that is right rather
 * than lazy. There is no name to seed from, so any artwork would be the SAME
 * artwork for every village that has not filled in its name, which is the
 * one thing this component exists to prevent. And returning null while the
 * config is still in flight means the picture appears once, with the rest of
 * the page, instead of drawing an unseeded composition and swapping it for
 * the real one a moment later.
 *
 * THE ACCESSIBLE NAME, WHICH THIS COMPONENT DELIBERATELY DOES NOT CARRY.
 * `Image` already puts `role="img"` and `aria-label={alt}` on the wrapper
 * around this element, so the hero's description survives an empty slot. A
 * second name in here would make a screen reader announce the same hero
 * twice. `aria-hidden` on the svg is what keeps that from happening, and
 * VillageArt.test.tsx asserts the wrapper's name is still the only one.
 */
export interface VillageArtProps {
  /** Which of the six hero slots this is. Salts the seed, so one village gets
   *  six related pictures rather than the same one six times. */
  slot: VillageArtSlot;
  /** Pass it when the caller already holds the name. Left off, the component
   *  reads the live config itself, which is what makes it a one-prop drop-in
   *  at a call site that has no config in scope. */
  villageName?: string;
  /** Applied to the svg. The default already fills its positioned parent. */
  className?: string;
}

export function VillageArt({ slot, villageName, className }: VillageArtProps) {
  // Called unconditionally, ahead of every early return: the prop path must
  // not change the hook order on a re-render.
  const config = useGameConfig();

  const source = villageName ?? config?.project?.name;
  // undefined covers both "no prop and the config has not answered" and "the
  // config answered with no name". Both mean there is nothing to seed from.
  const name = typeof source === "string" ? source.trim() : "";
  if (!name) return null;

  const art = buildVillageArt(name, slot);
  const ink = "var(--tone-brand-soft, currentColor)";

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${art.width} ${art.height}`}
      /* `slice` is the SVG spelling of object-fit: cover. The artwork has no
         detail near its edges, so cropping it to any hero shape is safe. */
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full text-muted-foreground", className)}
    >
      {/* Drawn first so the bands cross in front of it, which is what makes
          the horizon read as a horizon rather than as a disc on a stack. */}
      <circle cx={art.disc.cx} cy={art.disc.cy} r={art.disc.r} fill={ink} opacity={art.disc.opacity} />
      {art.bands.map((band, i) => (
        // Index keys are correct here: the array is a fixed-length render of
        // one pure computation, never a reorderable list.
        <path key={i} d={band.d} fill={ink} opacity={band.opacity} />
      ))}
    </svg>
  );
}

export default VillageArt;
