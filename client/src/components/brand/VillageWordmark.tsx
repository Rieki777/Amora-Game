import { useGameConfig } from "@/lib/gameApi";
import { cn } from "@/lib/utils";

/**
 * THE DEFAULT MARK: THE VILLAGE'S NAME, SET IN THE VILLAGE'S OWN TYPE.
 *
 * WHY THE LOGO SLOTS GET NO GENERATED ARTWORK. `logo` and `heartLogo` ship
 * empty for the same reason the six heroes do, and the header currently
 * renders a 64px spacer in their place: a brand new village has no visible
 * identity in its own navigation bar at all. A generated glyph would fill
 * that hole and cause a worse problem than the one it solved. A hero that
 * looks like abstract pattern reads as pattern. A glyph in the logo position
 * reads as A LOGO, which is a claim about identity that nobody in the village
 * made, and thirteen founders would each have to notice it was not theirs and
 * go and remove it. An over-designed default that every village then deletes
 * is worse than a quiet one.
 *
 * The village's name is a fact the founder typed. Setting it in the display
 * face is the strongest identity available without inventing one, it costs no
 * bytes, and a village that later uploads a real mark replaces it with no
 * leftovers.
 *
 * REAL TEXT, NEVER AN IMAGE OF TEXT. It selects, it translates, it scales
 * with a reader's own font size, and it stays legible at any zoom. Layout's
 * header link already carries its own `aria-label`, which overrides inner
 * text for the accessible name, so this adds no second announcement there;
 * in the footer, where the mark has no label today, it adds a real one.
 *
 * SIZE AND COLOUR BELONG TO THE CALLER. The header sits on a coloured bar at
 * 64px and the footer at 90px, so this component sets weight and family and
 * nothing else. Both call sites already reserve their box, so nothing shifts.
 */
export interface VillageWordmarkProps {
  /** Pass it when the caller already holds the name, the same contract as
   *  VillageArt. Left off, the component reads the live config itself. */
  villageName?: string;
  className?: string;
}

export function VillageWordmark({ villageName, className }: VillageWordmarkProps) {
  // Unconditional, ahead of the early return, so the hook order is stable
  // whichever way the name arrives.
  const config = useGameConfig();

  const source = villageName ?? config?.project?.name;
  const name = typeof source === "string" ? source.trim() : "";
  // Nothing to say. The caller's reserved box holds the space, which is what
  // it already did before this component existed.
  if (!name) return null;

  return (
    <span
      className={cn(
        "font-display font-semibold leading-none tracking-tight",
        // `break-words` because a village name is founder input with no length
        // cap, and a long one must wrap inside the reserved box rather than
        // push the navigation off the side of the page.
        "break-words",
        className,
      )}
    >
      {name}
    </span>
  );
}

export default VillageWordmark;
