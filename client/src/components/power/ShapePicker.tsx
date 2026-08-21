/**
 * Declaring the village's shape (0083, card A design 1), for viewers whose
 * `mayDeclare` carries "village". Picking a shape morphs the whole map, so
 * the picker previews locally on tap and SAVES on the button: watching the
 * same people re-arrange before committing is the founder moment the
 * proposal names, and an accidental tap should not rewrite the village.
 *
 * `other` demands one line of the village's own words (R28), refused empty
 * here with the same sentence the server would use, because both call
 * shared/power.ts.
 */
import { useState } from "react";
import { authToken } from "@/lib/gameApi";
import { GLOSS_MAX, shapeProblem } from "@shared/power";
import type { PowerBlock } from "./types";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export default function ShapePicker({
  power,
  preview,
  onPreview,
  onSaved,
}: {
  power: PowerBlock;
  /** The shape currently previewed on the canvas (unsaved). */
  preview: string | null;
  onPreview: (shape: string | null) => void;
  onSaved: (power: { shape: string; shapeGloss?: string | null; decidesBy: string; decidesByGloss?: string | null }) => void;
}) {
  const saved = power.shape;
  const current = preview ?? saved ?? "circle";
  const [gloss, setGloss] = useState(power.shapeGloss ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty = preview !== null && preview !== saved;

  const save = () => {
    const problem = shapeProblem(current, gloss.trim() || undefined);
    if (problem) {
      setStatus(problem);
      return;
    }
    setBusy(true);
    setStatus("");
    const body = {
      shape: current,
      shapeGloss: gloss.trim() || undefined,
      decidesBy: power.decidesBy ?? "consent",
      decidesByGloss: power.decidesByGloss ?? undefined,
    };
    fetch("/api/org/village/power", {
      method: "PUT",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not save");
        setStatus("Declared. The map now draws it.");
        onSaved(d.power);
      })
      .catch((e) => setStatus(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div data-power-shape-picker className="bg-card border border-border rounded-xl p-3 text-left">
      <p className="text-xs font-semibold text-foreground mb-2">The village's shape</p>
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Pick a shape">
        {power.glossary.shapes.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={current === s.id}
            title={s.gloss}
            onClick={() => onPreview(s.id === saved ? null : s.id)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              current === s.id
                ? "bg-teal-deep text-white border-teal-deep"
                : "bg-background text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {current === "other" && (
        <input
          value={gloss}
          onChange={(e) => setGloss(e.target.value.slice(0, GLOSS_MAX))}
          aria-label="Say your shape in one line"
          placeholder="Say your shape in one line"
          className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background mb-2"
        />
      )}
      {dirty && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="text-xs bg-[#2D5A5A] text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-40"
          >
            {busy ? "…" : "Declare this shape"}
          </button>
          <button type="button" onClick={() => onPreview(null)} className="text-xs text-muted-foreground">
            Back to {saved ? "the declared shape" : "circles"}
          </button>
        </div>
      )}
      {status && <p className="text-[11px] text-muted-foreground mt-1.5">{status}</p>}
    </div>
  );
}
