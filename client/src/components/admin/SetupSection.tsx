import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
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
  /* A measured step shows what the record holds and has no box to tick. A
     self-reported step keeps its box and says that is what it is. */
  const row = rows.find((r) => r.key === id);
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
        {row?.measured ? (
          <span className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${row.done ? "text-emerald-600" : "text-muted-foreground"}`} title={row.blank.length ? `Counted from what you have saved. Still empty: ${row.blank.join(", ")}.` : "Counted from what you have saved. Every field on this step has a value."}>
            {row.done && <CheckCircle2 className="w-4 h-4" />}
            {row.filled} of {row.total} filled in
          </span>
        ) : (
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 shrink-0 cursor-pointer" title="Nothing on this step can be read back from your settings, so this box is your own note to yourself.">
            <input type="checkbox" checked={!!setup?.[id]} onChange={() => onToggleStep(id)} className="h-4 w-4 accent-teal-deep" />
            Done, my word
          </label>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
