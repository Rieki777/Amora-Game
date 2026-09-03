import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, PenLine } from "lucide-react";
import type { SetupRow, SetupStepKey } from "./setupProgress";

/**
 * One numbered step of the Setup Wizard: its header, its completion readout,
 * and whatever the step puts inside it.
 *
 * WHY THIS IS A FILE AND NOT A LOCAL IN Admin.tsx. It used to be
 * `const Section = ({...}) => ...` declared INSIDE `SetupWizard`'s function
 * body. That makes a new function value on every render, and a new function
 * value is a new component TYPE. React reconciles an element against the
 * previous tree by type identity; a type that never matches cannot be updated,
 * only replaced. So every render tore down all six steps and built six new
 * ones, including every `<input>` inside them.
 *
 * The founder of the live village found it on a phone: "every time I type a
 * single letter into the forms here it takes down my dialogue keyboard box".
 * One letter runs `setBrand`, the re-render replaces the focused input with a
 * different DOM node, focus belongs to a node, and a mobile keyboard is bound
 * to the focused element. Desktop hid it, because a lost caret looks like a
 * slip of the hand and a dropped keyboard does not.
 *
 * The keyboard was the loudest symptom, never the only one. A subtree that is
 * rebuilt on every keystroke also loses scroll position inside it, any
 * uncontrolled DOM state (a partly-scrolled select, an IME composition, a text
 * selection), every CSS transition mid-flight, and any component state held
 * below it: the six panels this step renders (look, typography, identity pack,
 * map skin, walk editor, map vocabulary) were remounting and re-fetching on
 * each letter typed into an unrelated field. None of that was ever reported,
 * because none of it is as loud as a keyboard disappearing.
 *
 * Module scope is the whole fix: the type is now created once, so React can
 * match it, and it updates the six steps in place instead of replacing them.
 *
 * The rule this file exists to keep: NEVER declare a component inside another
 * component's body. Hoist it and pass what it needs as props, which is all the
 * props below are. Pinned by client/src/pages/Admin.setupWizard.test.tsx.
 *
 * THREE READOUTS, NOT TWO, and the third is the point.
 *
 * A step this screen can count shows the count. A step nobody has looked at
 * says so, in those words, with no tick and no number: "0 of 9" and "we have
 * not read your record" are different facts and a screen that prints one for
 * the other is how a village with nine empty picture slots read as finished.
 * And a step a founder ticked says it was ticked, in its own colour, because a
 * tick outlives whatever it was ticked about and it is the founder's word
 * rather than this screen's reading. See setupProgress.ts for the full account
 * and for what was found on the live site on 2026-09-02.
 */
export default function SetupSection({
  id,
  n,
  title,
  subtitle,
  rows,
  setup,
  onToggleStep,
  children,
}: {
  id: SetupStepKey;
  /** The step number a founder reads, 1 through 6. */
  n: number;
  title: string;
  subtitle: string;
  /** Every step's row, as `measureSetup` returned it. This step finds its own. */
  rows: readonly SetupRow[];
  /** The founder's hand-ticked flags, for the steps nothing can measure. */
  setup: Record<string, unknown> | null | undefined;
  onToggleStep: (key: SetupStepKey) => void;
  children: ReactNode;
}) {
  const row = rows.find((r) => r.key === id);

  /* Counted, from data.
     THE CHECK IS THE READING'S OWN AND NOTHING ELSE MAY BORROW IT. A founder
     who carries a step the count calls unfinished gets the count as it stands
     and the amber note beside it, so the row reads "0 of 7 filled in" next to
     "You marked this done". Keying the check on `state` alone put a green tick
     against a zero, which is the whole failure in one line. */
  const measuredDone = row?.state === "done" && !row.declaredDone;
  const counted =
    row && row.filled !== null && row.total !== null ? (
      <span
        className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${measuredDone ? "text-emerald-600" : "text-muted-foreground"}`}
        title={
          row.blank.length
            ? `Counted from what you have saved. Still empty: ${row.blank.join(", ")}.`
            : row.detail ?? "Counted from what you have saved. Every field on this step has a value."
        }
      >
        {measuredDone && <CheckCircle2 className="w-4 h-4" />}
        {row.filled} of {row.total} filled in
      </span>
    ) : null;

  /* Nobody has looked. Not a zero, not a red, not a tick. Shown whenever this
     screen holds no reading, which includes a brand document that has not
     arrived and a step whose values live behind an endpoint nobody called. */
  const unread =
    row?.state === "unknown" ? (
      <span
        className="flex items-center gap-1.5 text-xs font-medium shrink-0 text-muted-foreground"
        title="Nothing here has been read back yet, so this screen says nothing about this step either way."
      >
        <CircleDashed className="w-3.5 h-3.5" />
        Not counted
      </span>
    ) : null;

  /* The founder's own note, and it stays a box so it can be taken back. Ticked,
     it says whose word it is, in amber with a pen, never the emerald check a
     counted row earns. */
  const box =
    row && row.source === "declared" ? (
      <label
        className={`flex items-center gap-2 text-xs font-medium shrink-0 cursor-pointer ${row.declaredDone ? "text-amber-700" : "text-muted-foreground"}`}
        title={
          row.declaredDone
            ? "You marked this step done. Nothing on this screen checked it, so it says whose word it is."
            : "Nothing on this step can be read back from your settings, so this box is your own note to yourself."
        }
      >
        <input
          type="checkbox"
          checked={!!setup?.[id]}
          onChange={() => onToggleStep(id)}
          className="h-4 w-4 accent-teal-deep"
        />
        {row.declaredDone ? <PenLine className="w-3.5 h-3.5" /> : null}
        {row.declaredDone ? "You marked this done" : "Done"}
      </label>
    ) : null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-teal-deep text-white text-sm font-bold flex items-center justify-center">{n}</span>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {counted}
          {unread}
          {box}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
