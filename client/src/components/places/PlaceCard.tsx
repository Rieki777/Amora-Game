/**
 * One place on the shelf of places that have been photographed.
 *
 * A card and not a row: the picture IS the content here, and a list of place
 * names with a count beside each one would say nothing a person wants to know.
 * The cover is whatever the place leads with, decided by the same rule the
 * gallery uses and computed on the server, so the shelf and the place never
 * open with different pictures.
 */
import { Link } from "wouter";
import { Image, uploadSrcSet } from "@/components/Image";

export interface PlaceCardData {
  structureKey: string;
  photoCount: number;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverAltText: string | null;
  latestAt: string;
}

export default function PlaceCard({ place }: { place: PlaceCardData }) {
  const count = place.photoCount === 1 ? "1 photograph" : `${place.photoCount} photographs`;
  return (
    <li className="rounded-xl border border-border bg-card overflow-hidden">
      <Link
        href={`/places/${encodeURIComponent(place.structureKey)}`}
        className="block min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-deep"
      >
        {place.coverUrl && (
          <Image
            src={place.coverUrl}
            alt={place.coverAltText ?? `A photograph of ${place.structureKey}`}
            srcSet={uploadSrcSet(place.coverUrl, place.coverThumbUrl)}
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
            ratio={4 / 3}
          />
        )}
        <div className="p-3">
          <p className="font-semibold">{place.structureKey}</p>
          <p className="text-sm text-muted-foreground">{count}</p>
        </div>
      </Link>
    </li>
  );
}
