/**
 * Launch requirements (S62): everything a village must configure or do
 * before its deployment is genuinely ready for members — as DATA, not prose.
 *
 * Before this file, "what's left before launch?" had four different wrong
 * answers: a hand-maintained tracker frozen in Amora's build schedule, a
 * runbook only the platform team reads, a setup wizard with hardcoded text,
 * and env vars whose absence surfaces as a 503 three weeks after the moment
 * someone could have fixed them. This registry is the ONE answer. Three
 * consumers render it and none of them may invent an item of their own:
 *
 *   - the Journey to Launch page (live status, grouped, deep-linked),
 *   - the admin banner that persists until the journey is complete,
 *   - Maia's launch-guide mode (she reads the same JSON the page does).
 *
 * The shape parallels shared/modules.ts on purpose — an id, founder-facing
 * copy with NO village brand in it, and declarative wiring the server
 * resolves into live status. Requirements carry `appliesWhen` so modules
 * contribute their own needs: enabling Stays surfaces the Stripe rows,
 * disabling it withdraws them. A requirement nobody can act on is noise.
 *
 * THE CHECKS LIVE SERVER-SIDE (server/lib/launch.ts), keyed by `checkKey`.
 * This file stays isomorphic — the client imports it for copy and grouping
 * without dragging in mysql2. Adding a requirement means: one entry here,
 * one check function there, and every consumer updates itself.
 */

export type LaunchGroup =
  | "identity" // who runs this village: admins, handles, the shared-password exit
  | "brand" // name, tagline, copy — the overlay that de-Amoras a fork
  | "integrations" // third-party keys: Stripe, Resend, Anthropic
  | "modules" // which parts of the platform this village runs
  | "reach"; // domain, DNS, email deliverability — being findable

export type LaunchSeverity =
  /** Launch is dishonest without it (e.g. per-admin identities). */
  | "blocking"
  /** The platform works, but a member will hit a wall (e.g. no email). */
  | "recommended"
  /** Worth doing, nobody is harmed while it waits. */
  | "optional";

export interface LaunchRequirement {
  id: string;
  group: LaunchGroup;
  /** Founder-facing title. Platform copy — never a village brand literal. */
  title: string;
  /** WHY this matters, in one or two plain sentences. Maia reads this aloud. */
  why: string;
  severity: LaunchSeverity;
  /**
   * Server-side check key, resolved in server/lib/launch.ts. A requirement
   * whose state the server cannot observe (a real-world act like "point DNS")
   * has checkKey "manual:<id>" and is confirmed by an admin instead.
   */
  checkKey: string;
  /** Where to fix it: an app route, "/admin?tab=x", or an external URL. */
  fixAt: string;
  /** Label for the fix link ("Open Integrations", "Railway dashboard"). */
  fixLabel: string;
  /**
   * Only require this while at least ONE of the named modules is non-off.
   * Absent = always required.
   *
   * A list, not a single id, because several modules can depend on the same
   * piece of setup: stays, exchange and commerce all settle through the one
   * Stripe spine, and gating the Stripe requirements on `stays` alone told a
   * commerce-only village it was 100% launch-ready while no payment it took
   * could ever settle.
   */
  appliesWhenModule?: string | string[];
  /** Docs anchor in FORK_RUNBOOK.md for the long-form instructions. */
  runbookAnchor?: string;
}

export const LAUNCH_REQUIREMENTS: LaunchRequirement[] = [
  // ── Identity: the shared-password exit is the platform's oldest debt ──────
  {
    id: "admin-identities",
    group: "identity",
    title: "Give every admin their own login",
    why: "A shared password means nobody can ever be removed and no action can ever be attributed. Funds-bearing modules refuse to open while this is the posture.",
    severity: "blocking",
    checkKey: "admin-identities",
    fixAt: "/admin?tab=players",
    fixLabel: "Open Admin accounts",
    runbookAnchor: "admin-identities",
  },
  {
    id: "founder-appointed",
    group: "identity",
    title: "Appoint at least one founder",
    why: "Marking the village launched and opening trading need a named founder, not just any admin.",
    severity: "blocking",
    checkKey: "founder-appointed",
    fixAt: "/admin?tab=players",
    fixLabel: "Open Admin accounts",
  },

  // ── Brand: the overlay that makes a fork its own village ─────────────────
  {
    id: "brand-basics",
    group: "brand",
    title: "Name your village",
    why: "The project name, tagline and location flow into every page, email and the network handshake. Until they are set, your village introduces itself as a template.",
    severity: "blocking",
    checkKey: "brand-basics",
    fixAt: "/admin?tab=setup",
    fixLabel: "Open Project Settings",
  },
  {
    id: "brand-token-names",
    group: "brand",
    title: "Name your recognition currency",
    why: "Members earn this every day; it should carry your village's own word, not the default.",
    severity: "recommended",
    checkKey: "brand-token-names",
    fixAt: "/admin?tab=setup",
    fixLabel: "Open Project Settings",
  },

  // ── Integrations: keys, each honest about what stops without it ──────────
  {
    id: "resend-key",
    group: "integrations",
    title: "Connect email (Resend)",
    why: "Without it nobody receives a welcome, a receipt, or a notification digest. The village goes quiet exactly when someone new arrives.",
    severity: "recommended",
    checkKey: "resend-key",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Open Integrations",
    runbookAnchor: "resend",
  },
  {
    id: "email-domain",
    group: "reach",
    title: "Verify your sending domain",
    why: "Mail from an unverified domain lands in spam. Verification is DNS records at your registrar; the Integrations tab shows exactly which ones.",
    severity: "recommended",
    checkKey: "manual:email-domain",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Open Integrations",
    runbookAnchor: "resend-domain",
  },
  {
    id: "stripe-keys",
    group: "integrations",
    title: "Connect card payments (Stripe)",
    why: "Stays and the exchange sell for real money through your own Stripe account. The platform never pools funds. Without keys, card checkout answers an honest 503 and manual payment still works.",
    severity: "recommended",
    checkKey: "stripe-keys",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Open Integrations",
    appliesWhenModule: ["stays", "exchange", "commerce"],
    runbookAnchor: "stripe",
  },
  {
    id: "stripe-webhook",
    group: "integrations",
    title: "Point the Stripe webhook here",
    why: "Payments settle through a signed webhook. Cards charge but credits never arrive until Stripe knows where to call back.",
    severity: "blocking",
    checkKey: "stripe-webhook",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Open Integrations",
    appliesWhenModule: ["stays", "exchange", "commerce"],
    runbookAnchor: "stripe-webhook",
  },
  {
    id: "assistant-key",
    group: "integrations",
    title: "Connect the AI guide (Anthropic)",
    why: "Maia welcomes proposals and guides this launch journey. Without a key she is simply absent. Every form still works by hand.",
    severity: "optional",
    checkKey: "assistant-key",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Open Integrations",
  },

  // ── Modules: an explicit decision, not a default ──────────────────────────
  {
    id: "modules-decided",
    group: "modules",
    title: "Choose which modules your village runs",
    why: "Everything ships off. A launch with zero modules beyond the core game is a valid choice. It should be a choice someone made, not a page nobody visited.",
    severity: "blocking",
    checkKey: "modules-decided",
    fixAt: "/admin?tab=modules",
    fixLabel: "Open Modules",
  },
  {
    id: "season-seeded",
    group: "modules",
    title: "Start your first season",
    why: "Cycles, quests and settlement all hang off the season calendar. The seed creates one; confirm its dates are yours and not the template's.",
    severity: "recommended",
    checkKey: "season-seeded",
    fixAt: "/admin?tab=season",
    fixLabel: "Open Seasons",
  },

  // ── Reach: the real-world acts only a human can do ───────────────────────
  {
    id: "custom-domain",
    group: "reach",
    title: "Serve from your own domain",
    why: "Members should arrive at your village's address, not a hosting subdomain. Point DNS at the deployment and confirm here once it resolves.",
    severity: "recommended",
    checkKey: "manual:custom-domain",
    fixAt: "https://docs.railway.com/guides/public-networking#custom-domains",
    fixLabel: "Railway custom domains",
    runbookAnchor: "domain",
  },
  {
    id: "session-secret",
    group: "reach",
    title: "Set a stable session secret",
    why:
      "Without AUTH_TOKEN_SECRET the server invents a new signing key every time it starts. " +
      "Nothing looks broken until a deploy silently signs everyone out, or a second copy of the " +
      "service starts and members are logged out at random depending on which one answers. It fails " +
      "safe, so no forged login is possible; it just quietly makes sessions unreliable.",
    severity: "blocking",
    checkKey: "session-secret",
    fixAt: "/admin?tab=integrations",
    fixLabel: "Set it in the environment",
    runbookAnchor: "env",
  },
  {
    id: "exit-policy-terms",
    group: "reach",
    title: "Write your exit policy's actual terms",
    why:
      "Every village ships with a placeholder that says the terms are still to be decided by the " +
      "community. Honest on day one, a broken promise once people have contributed real value and " +
      "money. Someone leaving needs to know how their contribution is honoured BEFORE they need to know.",
    severity: "blocking",
    checkKey: "exit-policy-terms",
    fixAt: "/admin?tab=settings",
    fixLabel: "Write the terms",
    runbookAnchor: "exit-policy",
  },
  {
    id: "backups-drilled",
    group: "reach",
    title: "Take one backup and restore it once",
    why: "A backup nobody has restored is a hope, not a backup. Do the drill before there is anything you cannot afford to lose.",
    severity: "blocking",
    checkKey: "manual:backups-drilled",
    fixAt: "/admin?tab=settings",
    fixLabel: "Open Data & backups",
    runbookAnchor: "backups",
  },
];

/** Ids of requirements that gate "Mark launched" (severity: blocking). */
export function blockingIds(): string[] {
  return LAUNCH_REQUIREMENTS.filter((r) => r.severity === "blocking").map((r) => r.id);
}
