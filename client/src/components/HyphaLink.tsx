/**
 * The one way any surface links to Hypha (S13). Renders NOTHING when the
 * DHO address is unconfigured — a dead governance button is impossible by
 * construction. All governance/voting/equity CTAs go through this.
 */
import { ExternalLink } from "lucide-react";
import { useHypha } from "@/modules/ModuleProvider";

export default function HyphaLink({
  name,
  children,
  className,
}: {
  /** governance | proposals | treasury | members */
  name: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const hypha = useHypha();
  const href = hypha.configured ? hypha.links[name] : "";
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep hover:text-teal transition-colors"
      }
    >
      {children ?? "Decisions happen on Hypha"}
      <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}
