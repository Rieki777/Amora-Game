/**
 * WHO RUNS THE BASE LISTENER, and how this village finds out.
 *
 * The founder's ruling (R58a) is a commercial one before it is a technical one:
 * "our business model is if they're paying us to host we run the Base listener,
 * if they're not then they do". So the listener's location follows the HOSTING
 * RELATIONSHIP. It is deliberately NOT a switch a village flips, because a
 * village that flipped it would either be asking the hub to do unpaid work or
 * turning off a listener nobody replaced, and both of those are silent.
 *
 * WHAT MAKES IT DERIVABLE. The hub issues a shared governance secret to the
 * villages it carries, and that secret is what signs the hub's callbacks in and
 * this village's link registrations out. A village that is not hosted does not
 * hold it. So the credential IS the relationship, which is the same plane the
 * module library already uses to make a tier mechanical instead of decorative,
 * and it cannot be forged by editing a field in a forked repository.
 *
 * WHY IT MATTERS TODAY. The bridge's own header records that the hub runs ONE
 * Alchemy listener on Base for every fork. That single listener is a single
 * point of failure for every fork's governance outcomes, and a fork has no way
 * to know it is exposed to it. Naming the posture is what turns that from a
 * hidden dependency into a fact on a page.
 *
 * This module READS the posture and reports it. Standing up a self-hosted
 * listener process is the village's own operational work, and the honest thing
 * this code can do is say so plainly and say what it costs.
 */

export type ListenerMode = "hub" | "self" | "none";

export interface ListenerPosture {
  mode: ListenerMode;
  /** One sentence naming who listens. Shipped copy. */
  summary: string;
  /** Who pays for the chain access this posture needs. Shipped copy. */
  cost: string;
  /** What the village has to do next, empty when nothing is outstanding. */
  todo: string;
}

/**
 * The public Base endpoint every fork inherits as a default. Good enough for
 * the occasional balance read this platform does; not a listener endpoint. A
 * listener holds a subscription open and reads logs continuously, and a shared
 * public node rate-limits exactly that. Treating the default as evidence of a
 * self-hosted listener would let a fork read "you are covered" off a setting
 * nobody chose.
 */
const PUBLIC_DEFAULT_RPC = "https://mainnet.base.org";

export function isDedicatedRpc(rpcUrl: string): boolean {
  const url = String(rpcUrl ?? "").trim().replace(/\/+$/, "");
  if (!url) return false;
  return url.toLowerCase() !== PUBLIC_DEFAULT_RPC;
}

/**
 * Which of the two paths this village is on, from what it holds.
 *
 * `hubSecretConfigured` is the hosting relationship. `rpcUrl` is the village's
 * own chain access. Both are read by the caller so this function stays pure and
 * a test can hand it any combination.
 */
export function listenerPosture(input: {
  hubUrl: string;
  hubSecretConfigured: boolean;
  rpcUrl: string;
}): ListenerPosture {
  const hubUrl = String(input.hubUrl ?? "").trim();

  if (hubUrl && input.hubSecretConfigured) {
    return {
      mode: "hub",
      summary:
        "The ReGen hub watches Base for this village and sends verified outcomes back here, signed with the shared governance secret.",
      cost:
        "The hub pays for the chain access this uses. It is part of what hosting covers, so this village needs no Base key of its own for governance outcomes.",
      todo: "",
    };
  }

  if (isDedicatedRpc(input.rpcUrl)) {
    return {
      mode: "self",
      summary:
        "This village is self hosting, so it watches Base itself. Outcomes arrive through this village's own listener against its own Base endpoint.",
      cost:
        "This village pays for its own Base endpoint. A listener holds a subscription open, so it needs a dedicated key with a paid plan behind it, not a shared public node.",
      todo:
        "Point your listener at this village's governance callback and keep the Base endpoint funded. Nothing here starts a listener for you.",
    };
  }

  return {
    mode: "none",
    summary:
      "Nobody is watching Base for this village yet. Proposals still cross to Hypha and members still vote there; the result comes home when a steward records it.",
    cost:
      "Nothing, and that is the trade. Verified outcomes are a human step until one of the two paths is set up.",
    todo:
      "Either connect this village to the ReGen hub, which watches Base as part of hosting, or set a dedicated Base endpoint and run the listener yourself.",
  };
}

/**
 * A one-line answer for the module listing, so an unconfigured fork reads an
 * honest sentence instead of a promise. Upgrade 8's whole content: the listing
 * says which of the two paths applies and that somebody pays for the key.
 */
export function listenerHeadline(p: ListenerPosture): string {
  if (p.mode === "hub") return "Outcomes come back through the ReGen hub, which watches Base as part of hosting.";
  if (p.mode === "self") return "This village watches Base itself, on a Base endpoint it pays for.";
  return "Nobody watches Base for this village yet, so a steward records outcomes by hand.";
}
