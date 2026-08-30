/**
 * One photograph, with every control a person can act on it with.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────
 *
 * It has three homes now: `/places/:key`, the Living Map's place panel, and
 * `/photographs`, the one page carrying every picture in the village. Flag and
 * "this is a photograph of me" have to mean the same thing in all three. A
 * second copy of this card written for the index would be a second vocabulary,
 * and a button that means one thing on a place page and something slightly
 * different on the index is two products wearing one name.
 *
 * So there is one card, and the index passes `showPlace` to add the line
 * saying which place the picture is filed under. That is the only difference
 * between the two surfaces.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Flag, Pin, Trash2, Undo2, EyeOff, UserRound } from "lucide-react";
import { Image, uploadSrcSet } from "@/components/Image";
import CuratorImage from "@/components/places/CuratorImage";
import { authToken } from "@/lib/gameApi";
import {
  CONCERN_ALREADY,
  CONCERN_FILED,
  REPORT_FAILED,
  SUBJECT_ALREADY,
  SUBJECT_FILED,
  attributionLine,
  type PlacePhoto,
} from "@shared/placePhotos";

/** Every control clears the 44px floor. */
export const TAP = "min-h-[44px]";
export const BTN =
  `${TAP} inline-flex items-center gap-1.5 px-3 rounded-lg border border-border text-sm font-medium ` +
  "hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-deep";

export const jsonHeaders = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

export default function PhotoCard({
  photo,
  canCurate,
  signedIn,
  mine,
  showPlace = false,
  onChanged,
  onSay,
}: {
  photo: PlacePhoto;
  canCurate: boolean;
  signedIn: boolean;
  mine: boolean;
  /** The index sets this. A place gallery already says which place it is. */
  showPlace?: boolean;
  onChanged: () => void;
  onSay: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  /**
   * One press, one sentence back. `already` is a SUCCESS and not an error: a
   * second press is what a worried person does, the server stores one report
   * either way, and telling them it failed would read as the report having
   * been lost.
   */
  const post = async (path: string, ok: string, already: string, body?: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: jsonHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        onSay(payload?.error || REPORT_FAILED);
        return;
      }
      onSay(payload?.fresh === false ? already : ok);
      onChanged();
    } catch {
      onSay(REPORT_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/places/photo/${encodeURIComponent(photo.id)}`, {
        method: "DELETE",
        headers: jsonHeaders(),
      });
      if (!res.ok) {
        onSay("That did not come down. Try again in a moment.");
        return;
      }
      onSay("Taken down. The file is gone from the volume, and so is the description.");
      onChanged();
    } catch {
      onSay("That did not come down. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border bg-card overflow-hidden">
      {/* A hidden photograph's address stops answering an img tag, which is
          the point. A curator still has to see it to decide, so those come
          through an authenticated fetch instead. */}
      {photo.hiddenAt ? (
        <CuratorImage src={photo.url} alt={photo.altText} />
      ) : (
        <Image
          src={photo.url}
          alt={photo.altText}
          srcSet={uploadSrcSet(photo.url, photo.thumbUrl)}
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
          ratio={4 / 3}
        />
      )}
      <div className="p-3 space-y-2">
        {showPlace && (
          <p className="text-xs">
            <Link
              href={`/places/${encodeURIComponent(photo.structureKey)}`}
              className="text-teal-deep underline"
              aria-label={`Every photograph of ${photo.structureKey}`}
            >
              {photo.structureKey}
            </Link>
          </p>
        )}
        {photo.heroAt && (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-teal-deep">
            <Pin className="w-3 h-3" aria-hidden="true" /> This place leads with this one
          </p>
        )}
        {photo.hiddenAt && (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <EyeOff className="w-3 h-3" aria-hidden="true" /> Hidden{photo.hiddenReason ? `: ${photo.hiddenReason}` : ""}
          </p>
        )}
        {photo.caption && <p className="text-sm">{photo.caption}</p>}
        <p className="text-xs text-muted-foreground">{attributionLine(photo)}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {signedIn && (
            <button
              type="button"
              onClick={() => post(`/api/places/photo/${encodeURIComponent(photo.id)}/report`, CONCERN_FILED, CONCERN_ALREADY, { reason: "" })}
              disabled={busy}
              className={BTN}
              aria-label={`Flag the photograph described as ${photo.altText}`}
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" /> Flag this
            </button>
          )}
          {signedIn && (
            <button
              type="button"
              onClick={() => post(`/api/places/photo/${encodeURIComponent(photo.id)}/subject-request`, SUBJECT_FILED, SUBJECT_ALREADY, { reason: "" })}
              disabled={busy}
              className={BTN}
              aria-label={`Ask for the photograph described as ${photo.altText} to come down because it is of you`}
            >
              <UserRound className="w-3.5 h-3.5" aria-hidden="true" /> This is a photograph of me
            </button>
          )}
          {canCurate && !photo.hiddenAt && (
            <button
              type="button"
              onClick={() => post(`/api/places/photo/${encodeURIComponent(photo.id)}/hide`, "Hidden. The file stopped answering too.", "Already hidden.", { reason: "" })}
              disabled={busy}
              className={BTN}
            >
              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> Hide
            </button>
          )}
          {canCurate && photo.hiddenAt && (
            <button
              type="button"
              onClick={() => post(`/api/places/photo/${encodeURIComponent(photo.id)}/restore`, "Back on the place.", "Already showing.", {})}
              disabled={busy}
              className={BTN}
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Put back
            </button>
          )}
          {canCurate && !photo.hiddenAt && !photo.heroAt && (
            <SetHero structureKey={photo.structureKey} photoId={photo.id} onChanged={onChanged} onSay={onSay} />
          )}
          {(canCurate || mine) && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className={`${BTN} text-red-700 border-red-200`}
              aria-label={mine ? "Take down my photograph for good" : `Take down the photograph described as ${photo.altText} for good`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {mine && !canCurate ? "Take mine down" : "Take down"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function SetHero({
  structureKey,
  photoId,
  onChanged,
  onSay,
}: {
  structureKey: string;
  photoId: string;
  onChanged: () => void;
  onSay: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/places/${encodeURIComponent(structureKey)}/hero`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) {
        onSay("That pin did not stick. Try again in a moment.");
        return;
      }
      onSay("This place leads with that one now.");
      onChanged();
    } catch {
      onSay("That pin did not stick. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={pin} disabled={busy} className={BTN}>
      <Pin className="w-3.5 h-3.5" aria-hidden="true" /> Make this the lead
    </button>
  );
}
