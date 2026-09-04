/**
 * The form a steward fills in to open an involuntary exit.
 *
 * WHAT IT REPLACES. `window.prompt("Involuntary exits follow the published
 * process. Note for the record:")`. A browser prompt, with the site's domain
 * printed above it, for the heaviest act this software supports. It asked one
 * unlabelled question, it could not explain itself, it could not be styled or
 * translated, and a steward who pressed Enter by reflex opened a departure
 * against a real person with an empty note.
 *
 * WHY THE QUESTIONS COME FROM THE POLICY. The grounds a village recognises
 * for asking somebody to leave are a community decision, and they live in
 * `involuntary.grounds` on the published exit policy where a founder can edit
 * them. This component renders whatever that list holds. See
 * server/lib/exitPolicy.ts for why they are not compiled in.
 *
 * WHY THREE ANSWERS AND NOT A CHECKBOX. A checkbox cannot tell "no" apart
 * from "not answered", and on this form that difference is the whole record.
 * "Has a non-violent dispute resolution process been attempted?" left blank
 * reads as an accusation nobody made; answered "no" it is a fact a steward
 * put their name to. Every question therefore starts UNANSWERED and has to be
 * chosen.
 *
 * WHY IT USES THE SHARED DIALOG. `@/components/ui/dialog` wraps Radix, which
 * traps Tab inside the dialog, closes on Escape, hides the rest of the page
 * from assistive technology and returns focus to whatever opened it. Five
 * overlays in this client are hand-rolled `fixed inset-0` divs instead, and
 * most of them do none of that; this is not going to be a sixth.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Unanswered is a real state and stays distinct from "no" all the way to the record. */
export type GroundAnswer = "yes" | "no" | "n/a" | "";

const ANSWERS: Array<{ value: Exclude<GroundAnswer, "">; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "n/a", label: "Does not apply" },
];

/**
 * The note that goes on the exit record, built from the answers.
 *
 * ONE FREE TEXT COLUMN IS ALL THERE IS, and that is deliberate rather than a
 * shortcut. Migrations here are numbered across every worktree and branch in
 * the programme, they apply at boot on thirteen live instances, and a bad one
 * is a village that cannot start. Composing into the existing `note` needs no
 * schema change, and the note is what the Departure record and the member's
 * own notification already show, so the answers land where somebody will
 * actually read them.
 *
 * Exported so the test can assert the exact record a given set of answers
 * produces, rather than asserting that a request was sent.
 */
export function composeExitNote(reason: string, grounds: string[], answers: GroundAnswer[]): string {
  const lines: string[] = [String(reason ?? "").trim()];
  const answered = grounds
    .map((q, i) => ({ q, a: answers[i] ?? "" }))
    .filter((x) => x.a !== "");
  if (answered.length) {
    lines.push("");
    for (const { q, a } of answered) {
      const said = a === "yes" ? "Yes" : a === "no" ? "No" : "Does not apply";
      lines.push(`${q} ${said}`);
    }
  }
  return lines.join("\n").trim();
}

export default function InvoluntaryExitDialog({
  open,
  memberName,
  grounds,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  memberName: string;
  /** `involuntary.grounds` from the published policy. May be empty. */
  grounds: string[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<GroundAnswer[]>([]);

  const answerFor = (i: number): GroundAnswer => answers[i] ?? "";
  const setAnswer = (i: number, v: GroundAnswer) =>
    setAnswers((prev) => {
      const next = [...prev];
      while (next.length < grounds.length) next.push("");
      next[i] = v;
      return next;
    });

  const reasonGiven = reason.trim().length > 0;

  const reset = () => { setReason(""); setAnswers([]); };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) { reset(); onCancel(); } }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ask {memberName || "this member"} to leave</DialogTitle>
          <DialogDescription>
            This opens a departure against a person and notifies them. It follows the
            exit process your village has published, and everything recorded here goes
            on the record for whoever reviews it later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label htmlFor="involuntary-exit-reason" className="text-sm font-medium text-foreground block mb-1">
              What is the reason for requesting the removal of this member?
            </label>
            <textarea
              id="involuntary-exit-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="In your own words, for the record."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg resize-y bg-background"
            />
            {!reasonGiven && (
              <p className="text-xs text-muted-foreground mt-1">
                A reason is required. The person being asked to leave is entitled to one.
              </p>
            )}
          </div>

          {grounds.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">
                About this departure
              </p>
              <div className="space-y-3">
                {grounds.map((q, i) => (
                  <div key={q} className="flex flex-wrap items-center justify-between gap-2">
                    <span id={`ground-${i}`} className="text-sm text-muted-foreground flex-1 min-w-[14rem]">{q}</span>
                    <div role="radiogroup" aria-labelledby={`ground-${i}`} className="flex gap-1.5">
                      {ANSWERS.map((a) => {
                        const chosen = answerFor(i) === a.value;
                        return (
                          <button
                            key={a.value}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            onClick={() => setAnswer(i, chosen ? "" : a.value)}
                            className={
                              "text-xs rounded-full px-3 py-1 border transition-colors " +
                              (chosen
                                ? "bg-teal-deep text-white border-teal-deep"
                                : "bg-background text-muted-foreground border-border hover:border-teal-deep")
                            }
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Leave a question unanswered and it stays off the record. An answer of no is
                a different thing from a question nobody answered, so neither is assumed.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => { reset(); onCancel(); }}
            className="text-sm rounded-lg px-4 py-2 border border-border text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reasonGiven || busy}
            onClick={() => {
              const note = composeExitNote(reason, grounds, answers);
              reset();
              onConfirm(note);
            }}
            className="text-sm rounded-lg px-4 py-2 font-medium bg-red-600 text-white disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open involuntary exit"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
