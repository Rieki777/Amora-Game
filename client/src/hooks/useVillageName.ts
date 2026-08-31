import { useGameConfig } from "@/lib/gameApi";

/**
 * The name this village calls itself, for prose.
 *
 * The sibling of `useVillageContent`: that hook carries a village's own
 * CLAIMS, this one carries its own NAME. The two answer different halves of
 * the same defect. A page that reads its legal wording from the content
 * document and still says "Amora" in the sentence above it has moved the
 * hard half and left the obvious half behind.
 *
 * Why a hook rather than 20 copies of `cfg?.project?.name ?? "..."`: the
 * fallback is the whole design, and a fallback repeated by hand in twenty
 * files is a fallback that will disagree with itself. `Quests.tsx` already
 * chose "the village" and `ModuleGate.tsx` chose "This village"; both are
 * right for their slot, and neither should be re-derived per page.
 *
 * THE FALLBACK IS FOR THE LOADING WINDOW, NOT FOR AN UNNAMED VILLAGE. Once
 * `/api/game/config` answers, `project.name` is never blank: the platform
 * default is the honest string "Unnamed Village" (shared/gameConfig.ts), so
 * a founder who has not named their village yet reads that rather than
 * inheriting the first tenant's name. This fallback covers only the paint
 * before the config lands, which is why it is a generic noun phrase and
 * never a village's name.
 *
 * Callers whose sentence needs a different article pass their own:
 * `useVillageName("this village")` reads correctly in "...decide if this
 * village is where you belong", where the default would not.
 */
export function useVillageName(fallback = "the village"): string {
  const cfg = useGameConfig();
  return String(cfg?.project?.name ?? "").trim() || fallback;
}

/**
 * Where this village is, for prose that names a place.
 *
 * The sibling defect to the name, and the one a name fix does NOT reach: a
 * page can interpolate its village's name perfectly into a sentence that
 * still says the village is in Costa Rica. `project.location` is set in the
 * Setup Wizard, in the same step as the name, so a founder who has named
 * their village has already answered this.
 *
 * KNOWN LIMIT, recorded rather than papered over: the platform default for
 * `project.location` in shared/gameConfig.ts is still one specific village's
 * town and country, so on an instance whose founder has NOT reached that
 * wizard step this returns that place rather than nothing. This hook cannot
 * fix that from here (the default is another lane's file) and it does not
 * pretend to. What it does fix is the case the founder can control: once the
 * location is set, every sentence built on this follows it.
 */
export function useVillageLocation(fallback = ""): string {
  const cfg = useGameConfig();
  return String(cfg?.project?.location ?? "").trim() || fallback;
}
