/**
 * The Hypha handoff — game-amora's half of the bridge (bridge phase, 2026-07-31).
 *
 * THE ONE HOME for every URL that sends a member toward Hypha to ACT (the
 * read-only deep links stay in shared/hypha.ts). The rule is imported from
 * regen-civics' bridge, where it is written in blood: never construct a
 * Hypha URL outside this module — every scattered hand-rolled redirect is a
 * place the handoff contract silently breaks.
 *
 * What crosses today: a mechanics proposal, as a pre-filled create-agreement
 * link. Hypha's create pages are asked to read URL search params as form
 * defaults (the regen-civics prefill spec); until a given DHO's page does,
 * the params are inert and the member pastes the copied document — the
 * handoff endpoint always returns BOTH the URL and the markdown, and the
 * client always copies before it opens.
 *
 * What comes back: nothing, here. Verification arrives through the
 * governance hub's signed callback (the ReGen hub runs ONE Alchemy listener
 * on Base for every fork), matched by the `[gm:<id>]` marker this module
 * puts in the title. The marker IS the contract: lose it from the Hypha
 * proposal title and the outcome cannot find its way home.
 */

export interface MechanicsHandoff {
  /** False when the village has no Hypha configured — the surface hides. */
  configured: boolean;
  /** The pre-filled create-agreement URL, or null while unconfigured. */
  url: string | null;
  /** The exact title the Hypha proposal must carry (marker included). */
  title: string;
}

/**
 * Build the handoff for a mechanics proposal. `orgUrl` is the village's
 * hypha.org_url variable (blank = not configured); `proposalsUrl` is the
 * resolved proposals deep link from shared/hypha.ts, so link-override
 * deployments keep working.
 */
export function buildMechanicsHandoff(input: {
  orgUrl: string;
  proposalsUrl: string;
  proposalId: string;
  proposalTitle: string;
  markdown: string;
}): MechanicsHandoff {
  const title = `[gm:${input.proposalId}] ${input.proposalTitle}`.slice(0, 200);
  const base = String(input.proposalsUrl || "").trim().replace(/\/$/, "");
  if (!String(input.orgUrl || "").trim() || !base) {
    return { configured: false, url: null, title };
  }
  // The conventional create route under a DHO's agreements page. Params are
  // prefill hints (title, description) plus the marker on its own so a
  // param-aware form can carry it even if a member edits the title.
  const params = new URLSearchParams({
    title,
    description: input.markdown.slice(0, 4000),
    gmKey: input.proposalId,
  });
  return { configured: true, url: `${base}/create?${params.toString()}`, title };
}

/**
 * Extract the proposal id from a `[gm:<id>]` marker wherever it appears —
 * a title, a callback payload field, a pasted reference. Deliberately
 * liberal in position, strict in shape.
 */
export function extractMechanicsMarker(text: string): string | null {
  const m = /\[gm:([a-z0-9-]+)\]/i.exec(String(text ?? ""));
  return m ? m[1] : null;
}
