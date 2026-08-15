import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Image } from "@/components/Image";
import { prepareImageForUpload } from "@/lib/imagePrep";

/**
 * Admin → Make This Yours → Identity pack: the village's visual identity as
 * DATA — a description of what they are and aren't, plus reference images —
 * so that when the design agency lands, generation has something to be
 * consistent WITH beyond the three Look decisions.
 *
 * The rights acknowledgment gates the SAVE, not just the UI, by the same
 * reasoning as the font licence: a logo from a designer often isn't the
 * village's to feed a model (Rye, 2026-08-01: villages hold rights to their
 * images, and regenerate base art only with their own API key). Recording
 * who confirmed, and when, is what makes that policy real later.
 */
export default function IdentityPackPanel({ password }: { password: string }) {
  const [pack, setPack] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rights, setRights] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/brand", { headers: { Authorization: `Bearer ${password}` } });
      const data = await res.json();
      setPack(data.brand?.identityPack ?? { description: "", never: "", references: [] });
    } catch { toast.error("Could not load the identity pack"); }
  }, [password]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if ((pack.references?.length ?? 0) > 0 && !pack.rightsAck && !rights) {
      return toast.error("Please confirm your project holds rights to the reference images first");
    }
    setSaving(true);
    try {
      const next = {
        ...pack,
        // Stamped once, kept thereafter — the record outlives the checkbox.
        rightsAck: pack.rightsAck ?? (rights ? { at: new Date().toISOString() } : undefined),
      };
      const res = await fetch("/api/admin/brand", {
        method: "PUT",
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
        body: JSON.stringify({ identityPack: next }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPack(data.brand?.identityPack ?? next);
      toast.success("Identity pack saved");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose an image first");
    setUploading(true);
    try {
      // Shrink before the wire, not after. The server re-encodes to WebP at
      // 2000px anyway, so matching that here costs nothing in quality and
      // turns an 8 MB phone photo into a few hundred KB of upload. On a
      // 50 KB/s link that is minutes. When the browser cannot encode WebP the
      // helper hands the original straight back, so the upload still happens.
      const prepared = await prepareImageForUpload(file, { maxEdge: 2000, quality: 82 });
      const form = new FormData();
      form.append("file", prepared.file);
      const res = await fetch("/api/admin/brand/image", {
        method: "POST",
        headers: { Authorization: `Bearer ${password}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Upload failed");
      setPack({ ...pack, references: [...(pack.references ?? []), { url: data.url, thumbUrl: data.thumbUrl }] });
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Reference added. Remember to save");
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    setUploading(false);
  };

  if (!pack) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 mt-6">
      <h3 className="font-semibold text-gray-900 mb-1">Identity pack</h3>
      <p className="text-xs text-gray-500 mb-4">
        What your village looks and feels like, for the design agency to stay true to. Base art is
        generated once by the foundation; you regenerate it only with your own image API key.
      </p>
      <label className="block text-sm font-medium text-gray-900 mb-1">Who you are, visually</label>
      <textarea value={pack.description ?? ""} onChange={(e) => setPack({ ...pack, description: e.target.value.slice(0, 2000) })}
        rows={3} placeholder="e.g. hand-built timber and lime plaster, tropical understory, morning mist…"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3" />
      <label className="block text-sm font-medium text-gray-900 mb-1">What you are NOT (never show)</label>
      <textarea value={pack.never ?? ""} onChange={(e) => setPack({ ...pack, never: e.target.value.slice(0, 1000) })}
        rows={2} placeholder="e.g. no glass towers, no manicured lawns, no stock-photo smiles…"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4" />

      <label className="block text-sm font-medium text-gray-900 mb-1.5">Reference images</label>
      {(pack.references?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
          {pack.references.map((r: any, i: number) => (
            <div key={r.url} className="relative">
              <Image src={r.thumbUrl || r.url} alt="" ratio={1} className="rounded-lg" />
              <button type="button" aria-label="Remove reference"
                onClick={() => setPack({ ...pack, references: pack.references.filter((_: any, j: number) => j !== i) })}
                className="absolute top-1 right-1 bg-white/90 rounded-full w-5 h-5 text-xs leading-5 text-gray-600">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <input ref={fileRef} type="file" accept="image/*" className="text-xs text-gray-600" />
        <button onClick={upload} disabled={uploading}
          className="px-3 py-1.5 bg-white border border-gray-200 text-[#2D5A5A] rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
          {uploading ? "Uploading…" : "Add reference"}
        </button>
      </div>
      {!pack.rightsAck && (
        <label className="flex items-start gap-2 text-xs text-gray-600 mb-3">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" />
          <span>Our project holds the rights to these reference images (a designer's logo or a
          photographer's photo is often not yours to reuse, so check before you feed it forward).</span>
        </label>
      )}
      {pack.rightsAck?.at && (
        <p className="text-xs text-gray-400 mb-3">Rights confirmed {String(pack.rightsAck.at).slice(0, 10)}.</p>
      )}
      <button onClick={save} disabled={saving}
        className="px-4 py-2 bg-[#2D5A5A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
        {saving ? "Saving…" : "Save identity pack"}
      </button>
    </div>
  );
}
