/**
 * The content sections a founder can edit, moved out of
 * client/src/pages/Admin.tsx unchanged.
 *
 * It sits in its own file because TWO things read it and they now live apart:
 * the admin nav builds its Content group from it, and the content editor tab
 * renders a picker from it. Leaving it in Admin.tsx would have forced the nav
 * to stay there too.
 */
import { FileText, Users } from "lucide-react";

/*
 * ONE SECTION LEFT, and the six that went are why this comment exists.
 *
 * Investor, Steward, Resident and Prosperity saved into
 * `app_config['content'].<pathway>` and the four journey pages each hold their
 * own `journeySteps` constant and never fetched it, so every save was a green
 * toast over nothing. Circles and Roles had carried an amber banner since 0049
 * saying the public pages no longer read them, which is an editor admitting it
 * lies and staying on the rail anyway. /circles and /roles read `/api/org`;
 * their editor is Admin, Org Chart.
 *
 * Team stays because Team.tsx really does fetch `/api/content/team`: the cards
 * carry the portrait and the bio a seat row has no place for, and a card for
 * somebody who holds no seat is the only way they reach the page at all.
 */
export const CONTENT_SECTIONS = [
  { key: "team", label: "Team Page", icon: Users },
  // Added for the brochure lane's legal-content extraction (fe3f3e1): 22
  // jurisdiction-specific claims moved out of compiled JSX into this section,
  // read through the same generic content routes. Without a registry entry
  // here a founder has no door to write their own jurisdiction's notices.
  { key: "legal", label: "Legal & Jurisdiction Notices", icon: FileText },
  // S3 pages lane: the two paragraphs of the Love Letter covenant that
  // describe this village's own land and its own plan for forming a
  // governance council. They shipped compiled in, so every founder's members
  // were asked to SIGN a description of Amora's jungle and Amora's lot count.
  // LoveLetter.tsx reads `covenant.opening` and `covenant.governance`; with
  // nothing saved it falls back to the same sentences minus the geography and
  // the number. Amora's own wording is in server/seeds/pages-covenant-seed.json.
  { key: "covenant", label: "Love Letter Covenant", icon: FileText },
] as const;
