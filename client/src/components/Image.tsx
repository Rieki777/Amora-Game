import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { hasFailedToDecode, isInitiallyVisible } from "@/lib/imageState";

/**
 * THE ONE WAY TO PUT A PICTURE ON A PAGE.
 *
 * This platform is about to become image-heavy: circle scenes, role portraits,
 * quest art, village identity packs. Before this component the whole client
 * had thirteen bare `<img>` tags, exactly one of them lazy, and not a single
 * width/height anywhere — so every image that arrived late shoved the page
 * around under someone's thumb. Multiply that by art on every card and the two
 * most-visited pages become layout-shift generators.
 *
 * Four things it guarantees, none of which a bare <img> gives you:
 *
 *   1. SPACE IS RESERVED. The wrapper holds the aspect ratio from first paint,
 *      so the image lands in a box that was already the right size. No shift.
 *   2. OFF-SCREEN IMAGES COST NOTHING until scrolled to. `priority` opts out
 *      for the one or two images actually above the fold — using it everywhere
 *      defeats the point.
 *   3. A BROKEN IMAGE LOOKS DELIBERATE. Village art lives in an uploads volume
 *      that a fork may not have populated yet; a torn-page icon reads as "this
 *      site is broken" when the truth is "this village has not added art yet".
 *   4. ALT TEXT IS NOT OPTIONAL. It is a required prop. Decorative images pass
 *      alt="" explicitly, which is a decision rather than an oversight — the
 *      audit already found 117 unlabelled controls and images must not become
 *      the next hundred.
 *
 * On `sizes` and `srcSet`: pass them when a stored variant genuinely exists.
 * The upload pipeline writes a `.thumb.webp` beside every new image, but files
 * uploaded before that do not have one, and a srcSet entry that 404s does NOT
 * fall back — the browser just shows nothing. So variants are opt-in per
 * caller, never guessed from the URL.
 */
export interface ImageProps {
  src: string | null | undefined;
  /** Required. Decorative images pass "" deliberately. */
  alt: string;
  /** Aspect ratio of the reserved box, e.g. 16 / 9, 1, 4 / 3. Default 16/9. */
  ratio?: number;
  /** Above-the-fold images only: loads eagerly and skips the fade-in. */
  priority?: boolean;
  /** How the image fills its box. Default "cover". */
  fit?: "cover" | "contain";
  /** Applied to the wrapper, so callers control rounding, border, size. */
  className?: string;
  /** Applied to the <img> itself, for the rare case that needs it. */
  imgClassName?: string;
  /** Only when a real variant exists at these URLs. See note above. */
  srcSet?: string;
  sizes?: string;
  /** Shown in place of the image when src is empty or the load fails. */
  fallback?: React.ReactNode;
}

export function Image({
  src,
  alt,
  ratio = 16 / 9,
  priority = false,
  fit = "cover",
  className,
  imgClassName,
  srcSet,
  sizes,
  fallback,
}: ImageProps) {
  const [failed, setFailed] = useState(false);
  // Eager images are usually already in cache or arriving immediately; fading
  // them in just adds a flicker to the thing the visitor came to see.
  const [loaded, setLoaded] = useState(priority);

  /**
   * A CACHED IMAGE CAN FINISH LOADING BEFORE REACT ATTACHES `onLoad`.
   *
   * When that happens the event never fires, `loaded` stays false, and the
   * image sits at opacity 0 — present, correct, and invisible. This is not an
   * edge case here: uploads are now served `immutable` for a year, so for
   * every returning member the cache hit is the NORMAL path. The bug would
   * have shown up as "the pictures vanish on the second visit".
   *
   * The ref callback runs after the element exists, so it can ask the image
   * directly whether it already finished instead of waiting for an event that
   * has been and gone. The decision itself lives in `@/lib/imageState` under
   * test — `complete` is true for FAILURE too, and getting that wrong fades in
   * an empty box instead of showing the placeholder.
   */
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (isInitiallyVisible(node)) setLoaded(true);
    // A cached 404 also completes before React attaches onError, so the same
    // early-arrival problem applies to the failure path.
    else if (hasFailedToDecode(node)) setFailed(true);
  }, []);

  const empty = !src || failed;

  return (
    <div
      className={cn("relative overflow-hidden bg-muted/40", className)}
      style={{ aspectRatio: String(ratio) }}
    >
      {empty ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
          {fallback ?? (
            // A quiet mark, not an error. Reads as "nothing here yet".
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              className="h-8 w-8"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-5-5-5.5 5.5" />
            </svg>
          )}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          srcSet={srcSet}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          // `fetchPriority` tells the browser which single image matters for
          // Largest Contentful Paint. Without it a hero competes with every
          // lazy thumbnail below it for the same connection.
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-300",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
    </div>
  );
}

/**
 * Build a srcSet for an upload that the server generated variants for.
 *
 * The upload response reports `thumbUrl` when a variant was written. Pass that
 * through rather than deriving it from the full URL: deriving would produce a
 * URL for every historical upload, and the ones without a thumb would resolve
 * to a 404 that srcSet renders as nothing at all.
 */
export function uploadSrcSet(fullUrl: string, thumbUrl: string | null | undefined, thumbWidth = 400, fullWidth = 2000) {
  if (!thumbUrl) return undefined;
  return `${thumbUrl} ${thumbWidth}w, ${fullUrl} ${fullWidth}w`;
}

export default Image;
