/**
 * A hidden photograph, shown to the one person who has to look at it.
 *
 * A hidden picture stops being served by `/api/uploads/:filename`, which is
 * the half of a takedown that a hidden database row does not give you. The
 * route makes one exception, for a caller holding `map.curatePhotos`, because
 * a report card that cannot show the photograph is a card nobody can decide.
 *
 * That exception needs a Bearer token and an `img` tag cannot send one, so the
 * bytes are fetched here and rendered from a blob. The object URL is revoked
 * on unmount and whenever the address changes: a curator paging a queue would
 * otherwise leak one image's worth of memory per card they scrolled past.
 *
 * Falls back to words, not to a broken frame. A curator who has lost the
 * capability mid-session, or a picture already taken down for good, gets a
 * sentence saying which of those happened as far as this component can tell.
 */
import { useEffect, useState } from "react";
import { authToken } from "@/lib/gameApi";

export default function CuratorImage({
  src,
  alt,
  ratio = 4 / 3,
  className = "",
}: {
  src: string;
  alt: string;
  ratio?: number;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let made = "";
    setObjectUrl(null);
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(src, { headers: { Authorization: `Bearer ${authToken() ?? ""}` } });
        if (!res.ok) {
          if (live) setFailed(true);
          return;
        }
        made = URL.createObjectURL(await res.blob());
        if (live) setObjectUrl(made);
        else URL.revokeObjectURL(made);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden bg-muted/40 ${className}`}
      style={{ aspectRatio: String(ratio) }}
    >
      {objectUrl ? (
        <img src={objectUrl} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <p
          role="img"
          aria-label={failed ? `${alt} (this photograph is no longer here)` : alt}
          className="absolute inset-0 flex items-center justify-center p-3 text-xs text-center text-muted-foreground"
        >
          {failed ? "This photograph is no longer here." : "Hidden. Opening it for review."}
        </p>
      )}
    </div>
  );
}
