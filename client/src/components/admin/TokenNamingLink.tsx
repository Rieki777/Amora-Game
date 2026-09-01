/**
 * A module screen's door to the one page where its token is named.
 *
 * THE RULE THIS ENFORCES: one name, one editor. A module that grew its own
 * "what do you call your credits" box would be the second surface for a field
 * that already has one, and the platform has just spent a release undoing
 * exactly that. The Setup Wizard carried a "Recognition currency name" box the
 * token registry overrode every time, so a founder could type a name into a
 * field that could never win and be told nothing.
 *
 * So a module screen gets a LINK, never an input. If you are about to add a
 * token-name field to a module panel, add an entry to
 * client/src/components/admin/tokenCatalog.ts and render this instead.
 *
 * `onOpenTab` rather than an anchor: the admin panel keeps its tab in the URL
 * and reads it into state once, so an ordinary link would change the address
 * and leave the screen where it was.
 */
export default function TokenNamingLink({
  what,
  onOpenTab,
}: {
  /** What this module's token is, in the founder's words ("stay credits"). */
  what: string;
  onOpenTab: (tab: string) => void;
}) {
  return (
    <p className="text-xs text-muted-foreground mt-2">
      {what} are named on the Tokens page, with every other token this village
      runs.{" "}
      <button type="button" onClick={() => onOpenTab("tokens")} className="font-medium text-teal-deep underline">
        Open Tokens →
      </button>
    </p>
  );
}
