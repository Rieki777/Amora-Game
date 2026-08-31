/**
 * What a route module is handed, instead of a 27,000-line closure.
 *
 * THE PROBLEM THIS SOLVES. Every route in server/index.ts is registered inside
 * one `async function startServer()` and can therefore reach every binding in
 * it: roughly 25 repositories, the gate helpers, the caches, the config
 * readers, and several hundred local helpers besides. Nothing declares what any
 * given route actually uses, so nothing can be moved without reading the file
 * to find out, and a contributor changing one domain has no smaller unit to
 * hold in their head than all of it.
 *
 * A route module in server/routes/ takes what it needs as an argument and can
 * reach nothing else. That is the whole mechanism. The type below is the
 * vocabulary of things a route may be given.
 *
 * HOW TO USE IT. Do NOT take the whole `AppDeps` in a route module. Take the
 * slice you actually use, so the module's own signature says what it touches:
 *
 *     import type { AppDeps } from "../lib/appDeps";
 *     type Deps = Pick<AppDeps, "isAdmin" | "guardCapability" | "faqsRepo">;
 *     export function register(app: Express, deps: Deps): void { ... }
 *
 * A reviewer then reads three names instead of auditing a file for what it
 * closed over, and a widening of that slice is a visible line in a diff rather
 * than a new free variable nobody notices.
 *
 * WHY THE GATES ARE HERE AND NOT IMPORTED DIRECTLY. `isAdmin` and friends read
 * live village state through repositories and caches that server/index.ts owns
 * and boots. Passing them keeps a route module free of that boot order, and
 * keeps the DEFAULT-DENY contract intact: whichever function is passed here
 * must be one that calls `markAdminGate` (server/lib/adminGate.ts) on entry, or
 * the middleware under /api/admin will refuse the route's own success. Passing
 * a hand-rolled gate that skips the marker is the one way to get this wrong.
 *
 * THIS TYPE GROWS ONE ENTRY PER EXTRACTION. It deliberately does not try to
 * describe everything in startServer up front. An entry earns its place when a
 * route module needs it, which keeps the type a record of what has actually
 * been untangled rather than a wish list.
 */
import type express from "express";
import type { Capability } from "../../shared/capabilities";
import type { DbCollection, DbDocument, Row } from "../repos/store-db";

/**
 * The answer from the capability gate. Mirrors the interface in
 * server/index.ts, which remains the definition the gate itself is written
 * against; this is the shape a route module is allowed to see.
 */
export interface CapabilityVerdict {
  ok: boolean;
  reachedPast: boolean;
  villageHolds: boolean;
  /** The gate step that decided, for the caller's own audit line. */
  source: string;
  /** What to say to the person, when `ok` is false. */
  message: string;
  /** True for exactly one refusal: an admin, on a key the village holds, who did not break the glass. */
  needsOverride: boolean;
  /** Who holds it, as a bare name, when `needsOverride` is true. Null otherwise. */
  holderName: string | null;
}

/** The refusal a route already had, preserved through guardCapability. */
export interface CapabilityRefusal {
  status: number;
  body: Record<string, unknown>;
}

export interface AppDeps {
  // THE GATES
  // Each of these marks the request as gated on entry. See adminGate.ts.

  /** True when the request carries a valid member token whose role is admin or founder. */
  isAdmin(req: express.Request): Promise<boolean>;

  /** The member behind the request's bearer token, or null. */
  authedUser(req: express.Request): Promise<any | null>;

  /** Ask whether the actor may do a thing, without answering the request. */
  mayAct(req: express.Request, cap: Capability): Promise<CapabilityVerdict>;

  /**
   * Ask, and answer the request when the answer is no. Returns true only when
   * the caller should carry on. A false return means a response has already
   * been sent, so the handler must return immediately without touching `res`.
   */
  guardCapability(
    req: express.Request,
    res: express.Response,
    cap: Capability,
    refusal?: CapabilityRefusal,
  ): Promise<boolean>;

  /** The read-side gate: may this actor still SEE a thing they cannot change. */
  mayStillSee(req: express.Request, cap: Capability): Promise<boolean>;

  // REPOSITORIES
  // One entry per document or collection an extracted route module reads.

  /** The FAQ document, keyed by pathway. */
  faqsRepo: DbDocument<Row>;

  /** Training modules, ordered by their `order` field at read time. */
  trainingRepo: DbCollection<Row>;

  /** Roadmap milestones, ordered by their `order` field at read time. */
  milestonesRepo: DbCollection<Row>;
}
