/**
 * THE FIRST STEP: what kind of decision is this?
 *
 * Ported from Hypha's `button-radio.vue` and `StepProposalType.vue` (harvest
 * section 1): icon, title, description in a selectable card, grouped under
 * headings. Their groups are "One-time contributions / Recurring assignments /
 * Organizational assets"; ours are the four in the config, and they are read
 * from the config rather than typed here so a new type joins a group by
 * declaring one.
 *
 * WHAT THE SERVER DECIDES, NOT THIS FILE: whether a type can be published. The
 * executors land lane by lane, and a card that walks a member through five
 * steps toward a route nobody mounted is worse than a card that says plainly
 * that this village cannot open that kind of decision yet. So a type outside
 * `conductable` renders greyed, is not clickable, and says why in a sentence.
 * It is still SHOWN, because hiding it would make the village's own governance
 * look smaller than it is.
 *
 * ACCESSIBILITY. The cards are toggle buttons in a named group, not a
 * radiogroup: a radiogroup promises roving focus, where Tab reaches the group
 * and arrows move within it, and every card here stays individually reachable
 * by Tab so a keyboard reader can read all five before choosing. aria-pressed
 * carries the choice, and the chosen card is marked with a ring AND a check,
 * never with colour alone. A type this village cannot conduct is disabled and
 * says why in words.
 */
import { Check, Lock } from "lucide-react";
import { TYPE_GROUPS, WIZARD_TYPE_CONFIGS, type WizardType } from "./wizardConfig";

export default function TypeCards({
  chosen,
  conductable,
  onChoose,
}: {
  chosen: WizardType | null;
  /** Subject types this deployment can actually take to a vote today. */
  conductable: string[];
  onChoose: (id: WizardType) => void;
}) {
  return (
    <div role="group" aria-label="What kind of decision" className="space-y-6">
      {TYPE_GROUPS.map((group) => {
        const types = WIZARD_TYPE_CONFIGS.filter((t) => t.group === group);
        if (types.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{group}</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {types.map((t) => {
                const Icon = t.icon;
                const available = conductable.includes(t.id);
                const isChosen = chosen === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={isChosen}
                    disabled={!available}
                    onClick={() => onChoose(t.id)}
                    className={`relative flex min-h-[44px] items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2 ${
                      !available
                        ? "cursor-not-allowed border-stone-200 bg-stone-50 opacity-70"
                        : isChosen
                          ? "border-teal-deep bg-teal-deep/5"
                          : "border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        available ? "bg-teal-deep/10 text-teal-deep" : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {available ? (
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <Lock className="w-4 h-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
                        {t.title}
                        {isChosen && <Check className="w-4 h-4 text-teal-deep" aria-hidden="true" />}
                      </span>
                      <span className="mt-0.5 block text-sm text-stone-600 leading-relaxed">{t.description}</span>
                      {!available && (
                        <span className="mt-1.5 block text-xs font-medium text-stone-500">
                          This village cannot open that kind of decision yet.
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
