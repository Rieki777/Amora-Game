/**
 * What the assistant may propose, and in exactly what shape (S75).
 *
 * She writes DRAFTS. A human opens a queue, edits, and accepts, and the accept
 * calls the same creation function the admin form calls, so every invariant and
 * every gate is inherited instead of reimplemented. There is no second write
 * path and she never touches a domain table.
 *
 * The kind is allowlisted server-side. The wire carries no open vocabulary
 * here, the same rule `SHARED_ITEM_TYPES` already follows: a free-string kind
 * is a renderer someone has to write defensively forever.
 *
 * Payloads are validated at draft time AND again at accept. A model's output is
 * untrusted input, and the gap between proposing and accepting is exactly long
 * enough for the platform's own rules to have changed underneath it.
 */
import { ALL_CAPABILITIES, type Capability } from "./capabilities";

export const DRAFT_KINDS = ["role", "circle"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface RolePayload {
  name: string;
  description: string;
  capabilities: Capability[];
  minStage?: string | null;
  sortOrder?: number;
}

export interface CirclePayload {
  name: string;
  purpose: string;
  parentCircleId?: string | null;
  status?: "active" | "forming" | "dormant";
}

export type DraftPayload = RolePayload | CirclePayload;

const ALLOWED_KEYS: Record<DraftKind, string[]> = {
  role: ["name", "description", "capabilities", "minStage", "sortOrder"],
  circle: ["name", "purpose", "parentCircleId", "status"],
};

function shapeErrors(kind: DraftKind, payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "payload must be an object";
  // Unknown keys are refused, so a model that invents a field gets told, and a
  // future column cannot be written by a payload that predates the review UI.
  const extra = Object.keys(payload as object).filter((k) => !ALLOWED_KEYS[kind].includes(k));
  if (extra.length > 0) return `unexpected field(s): ${extra.join(", ")}`;
  return null;
}

function text(value: unknown, field: string, min: number, max: number): string | null {
  if (typeof value !== "string" || value.trim().length < min) return `${field} must be at least ${min} characters`;
  if (value.length > max) return `${field} must be under ${max} characters`;
  return null;
}

/** Validate a payload for its kind. Returns a human sentence, or null. */
export function validateDraftPayload(kind: string, payload: unknown): string | null {
  if (!(DRAFT_KINDS as readonly string[]).includes(kind)) return `unknown draft kind: ${String(kind)}`;
  const k = kind as DraftKind;
  const shape = shapeErrors(k, payload);
  if (shape) return shape;
  const p = payload as Record<string, unknown>;

  if (k === "role") {
    const nameErr = text(p.name, "name", 2, 120);
    if (nameErr) return nameErr;
    const descErr = text(p.description, "description", 20, 2000);
    if (descErr) return descErr;
    if (!Array.isArray(p.capabilities)) return "capabilities must be a list, and may be empty";
    const unknown = (p.capabilities as unknown[]).filter((c) => !ALL_CAPABILITIES.includes(c as Capability));
    if (unknown.length > 0) return `unknown capabilit(y/ies): ${unknown.map(String).join(", ")}`;
    if (new Set(p.capabilities as string[]).size !== (p.capabilities as string[]).length) {
      return "capabilities must not repeat";
    }
    if (p.minStage !== undefined && p.minStage !== null && typeof p.minStage !== "string") {
      return "minStage must be a stage id or null";
    }
    if (p.sortOrder !== undefined && !Number.isInteger(p.sortOrder)) return "sortOrder must be a whole number";
    return null;
  }

  const nameErr = text(p.name, "name", 2, 120);
  if (nameErr) return nameErr;
  const purposeErr = text(p.purpose, "purpose", 20, 2000);
  if (purposeErr) return purposeErr;
  if (p.parentCircleId !== undefined && p.parentCircleId !== null && typeof p.parentCircleId !== "string") {
    return "parentCircleId must be a circle id or null";
  }
  if (p.status !== undefined && !["active", "forming", "dormant"].includes(String(p.status))) {
    return "status must be active, forming, or dormant";
  }
  return null;
}

/**
 * Plain sentences for what a capability lets a role do.
 *
 * These are read one at a time by an admin deciding whether to grant, so they
 * say the consequence and never the key. "exchange.manage" tells a founder
 * nothing; "post token prices and stock the treasury" tells them everything.
 */
export const CAPABILITY_CONSEQUENCE: Record<Capability, string> = {
  "quest.propose": "suggest new quests for the village",
  "quest.consent": "release recognition on someone else's finished work",
  "forum.post": "start threads in the forum",
  "forum.moderate": "hide posts and act on reports for the whole community",
  "proposal.open": "open a governance decision",
  "proposal.decide": "record the outcome of a governance decision and close it",
  "map.viewPeople": "see which named people hold which seats",
  "map.contact": "reach role holders through the contact relay",
  "feed.announce": "post announcements to the whole village feed",
  "stay.member_rate": "book accommodation at the member price",
  "exchange.buy": "buy listed tokens with money",
  "exchange.swap": "trade one village token for another",
  "exchange.manage": "list tokens, post prices, and stock the treasury",
  "health.record": "log the land's own measurements",
  "mechanics.propose": "propose changes to the game's own rules",
};
