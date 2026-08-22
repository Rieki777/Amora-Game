/**
 * One place's photographs: the gallery, the upload, and every control that
 * acts on a picture.
 *
 * Written as a component and not a page because it has two homes. It renders
 * at `/places/:key` today, and the Living Map's place panel mounts the same
 * component in its Photos tab, so the two can never drift into showing
 * different things about one place.
 *
 * Ordering, attribution and the wording of a report all live in
 * `shared/placePhotos.ts`, shared with the server. Read that file's header for
 * why a hero leads and everything under it is newest first.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flag, Pin, Trash2, Undo2, EyeOff, UserRound } from "lucide-react";
import { Image, uploadSrcSet } from "@/components/Image";
import InfoTip from "@/components/InfoTip";
import BreathingLoader from "@/components/natural/BreathingLoader";
import { authToken } from "@/lib/gameApi";
import { prepareImageForUpload } from "@/lib/imagePrep";
import {
  ALT_TEXT_MAX,
  CAPTION_MAX,
  CONCERN_ALREADY,
  CONCERN_FILED,
  REPORT_FAILED,
  SUBJECT_ALREADY,
  SUBJECT_FILED,
  attributionLine,
  capacityLine,
  type PlacePhoto,
} from "@shared/placePhotos";

/** Every control clears the 44px floor. */
const TAP = "min-h-[44px]";
const BTN =
  `${TAP} inline-flex items-center gap-1.5 px-3 rounded-lg border border-border text-sm font-medium ` +
  "hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-deep";

const jsonHeaders = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

/**
 * No Content-Type for the upload: the browser has to set the multipart
 * boundary itself, and a hand-written header kills the parse on the far side.
 */
const uploadHeaders = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export interface GalleryPayload {
  structureKey: string;
  photos: PlacePhoto[];
  canContribute: boolean;
  canCurate: boolean;
  viewerId: string | null;
  signedIn: boolean;
  perPlace: number;
  remaining: number;
  maxMb: number;
}

export default function PlaceGallery({ structureKey, placeName }: { structureKey: string; placeName?: string }) {
  const [data, setData] = useState<GalleryPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [say, setSay] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/places/${encodeURIComponent(structureKey)}/photos`, { headers: jsonHeaders() });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [structureKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        The photographs for this place did not load. Reload the page to try again.
      </p>
    );
  }
  if (!data) return <BreathingLoader label="Opening this place's photographs" />;

  const live = data.photos.filter((p) => !p.hiddenAt);
  const name = placeName || structureKey;

  return (
    <section aria-label={`Photographs of ${name}`} className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">{capacityLine(live.length, data.perPlace)}</p>
        <InfoTip
          label="What a photograph does here"
          tip="Every other number on this map is something a person could have typed from anywhere. A photograph is somebody standing on the land with a camera, so it carries their name and the month it was taken. Location data is removed from the file before it is stored."
        />
      </div>

      {data.canContribute && data.remaining > 0 && (
        <AddPhoto structureKey={structureKey} maxMb={data.maxMb} onAdded={() => { setSay(""); void load(); }} onSay={setSay} />
      )}
      {data.signedIn && !data.canContribute && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Adding a photograph opens at the member stage, or with a role or badge that grants it. The pictures below are yours to read meanwhile.
        </p>
      )}

      <p role="status" aria-live="polite" className="text-sm text-teal-deep min-h-[20px]">{say}</p>

      {data.photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          Nobody has photographed this place yet.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
          {data.photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              structureKey={structureKey}
              canCurate={data.canCurate}
              signedIn={data.signedIn}
              mine={!!data.viewerId && data.viewerId === photo.contributorId}
              onChanged={() => void load()}
              onSay={setSay}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The upload form.
 *
 * Alt text is a required field with a real label, and it is required because
 * the platform already carries nine alt-text boxes that store nowhere. This
 * one is a NOT NULL column the server refuses to write without, and it is what
 * the img tag renders, so a member who cannot see the picture is told what is
 * in it.
 */
function AddPhoto({
  structureKey,
  maxMb,
  onAdded,
  onSay,
}: {
  structureKey: string;
  maxMb: number;
  onAdded: () => void;
  onSay: (s: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [takenOn, setTakenOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setProblem("");
    try {
      // Shrunk in the browser first, the house pipeline. On a 50 KB/s link an
      // untouched phone photo is three minutes of upload that can fail at 95%.
      const prepared = await prepareImageForUpload(file, { maxEdge: 2000, quality: 82 });
      const body = new FormData();
      body.append("photo", prepared.file);
      body.append("altText", altText);
      if (caption.trim()) body.append("caption", caption.trim());
      if (takenOn) body.append("takenOn", takenOn);
      const res = await fetch(`/api/places/${encodeURIComponent(structureKey)}/photos`, {
        method: "POST",
        headers: uploadHeaders(),
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(payload?.error || "That did not save. Try again in a moment.");
        return;
      }
      setFile(null);
      setAltText("");
      setCaption("");
      setTakenOn("");
      if (input.current) input.current.value = "";
      onSay("Added. It is on this place now.");
      onAdded();
    } catch {
      setProblem("That did not save. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <Camera className="w-4 h-4" aria-hidden="true" />
        Add a photograph
      </div>
      <label className="block text-sm">
        <span className="block mb-1 font-medium">Picture</span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={`${TAP} block w-full text-sm`}
        />
        <span className="block mt-1 text-xs text-muted-foreground">
          Up to {maxMb} MB. Location data is removed before it is stored.
        </span>
      </label>
      <label className="block text-sm">
        <span className="block mb-1 font-medium">Describe it for someone who cannot see it</span>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          maxLength={ALT_TEXT_MAX}
          required
          placeholder="The north wall of the community kitchen, half built"
          className={`${TAP} w-full rounded-lg border border-border px-3`}
        />
      </label>
      <label className="block text-sm">
        <span className="block mb-1 font-medium">Say something about it, if you want to</span>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={CAPTION_MAX}
          className={`${TAP} w-full rounded-lg border border-border px-3`}
        />
      </label>
      <label className="block text-sm">
        <span className="block mb-1 font-medium">When was it taken?</span>
        <input
          type="date"
          value={takenOn}
          onChange={(e) => setTakenOn(e.target.value)}
          className={`${TAP} w-full rounded-lg border border-border px-3`}
        />
        <span className="block mt-1 text-xs text-muted-foreground">
          Left blank, the line under it says when it was added instead.
        </span>
      </label>
      {problem && <p role="alert" className="text-sm text-red-700">{problem}</p>}
      <button type="submit" disabled={busy || !file || !altText.trim()} className={`${BTN} bg-teal-deep text-white border-teal-deep disabled:opacity-50`}>
        {busy ? "Adding..." : "Add to the village record"}
      </button>
    </form>
  );
}

function PhotoCard({
  photo,
  structureKey,
  canCurate,
  signedIn,
  mine,
  onChanged,
  onSay,
}: {
  photo: PlacePhoto;
  structureKey: string;
  canCurate: boolean;
  signedIn: boolean;
  mine: boolean;
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
      onSay("Taken down. The file is gone from the volume.");
      onChanged();
    } catch {
      onSay("That did not come down. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border bg-card overflow-hidden">
      <Image
        src={photo.url}
        alt={photo.altText}
        srcSet={uploadSrcSet(photo.url, photo.thumbUrl)}
        sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92vw"
        ratio={4 / 3}
      />
      <div className="p-3 space-y-2">
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
            <SetHero structureKey={structureKey} photoId={photo.id} onChanged={onChanged} onSay={onSay} />
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
