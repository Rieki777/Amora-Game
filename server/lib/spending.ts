/**
 * WHERE THE POOL TOKEN CAN GO.
 *
 * The gratitude cycle pays real value in whatever token `gratitude.pool_token`
 * names. Gratitude itself is a routing signal and is never spent, which is
 * correct and stays that way. The defect this module answers is one step down
 * from that: the token gratitude ROUTES had no sinks, so the loop ended at "you
 * received a number".
 *
 * Three sinks now exist and all three ask the same two questions, so the
 * answers live here once instead of drifting across three modules:
 *
 *   1. May a member SEND this token to another member?
 *   2. When a member spends this token, which account receives it?
 *
 * Nothing in this file posts. It decides, and the callers post through
 * `postTransfer` like everything else.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { MINT_FAUCET, TREASURY, allTokens, tokenDef, type TokenDef } from "./ledger";

/**
 * Seat fees rest here between the moment a place is taken and the moment the
 * gathering is over. Seeded by 0092. NOT a faucet: it can only ever pay out
 * what somebody paid in, which is what makes a refund provably funded.
 */
export const EVENT_ESCROW = "sys:event-escrow";

/**
 * Credits a module issues against its own service, which are claims and not
 * money. A stay credit buys a specific night from the village; a library
 * credit is a deposit against a specific shelf. Both modules re-assert
 * `transferable: false` on every boot, and `stay.credits_transferable` is
 * refused at the variables route with a written legal reason (e-money). The
 * peer-to-peer surface holds them out by name so none of that is overturned by
 * a kind sweep.
 *
 * SPELT OUT AS LITERALS, not imported from `./stays` and `./library`.
 * `stays.ts` imports `spendSinkFor` from this file, so importing STAY_CREDIT
 * back would close a module cycle and leave this Set holding `undefined`
 * whichever file loaded second, which is a firewall that silently opens.
 * `spending.token-policy.test.ts` asserts these two strings still equal the
 * modules' own constants, so the drift the import would have prevented is
 * caught by a red test instead of a boot-order coin flip.
 */
export const MODULE_VOUCHERS: ReadonlySet<string> = new Set(["stay-credit", "library-credit"]);

/**
 * Kinds a member may ever send by hand. ONE entry, and the one entry is the
 * whole policy.
 *
 * `recognition` is absent and must stay absent. Recognition records that
 * something happened between two people; handing it over by hand is the
 * forgery the signal/value separation exists to prevent. `equity` and `voice`
 * are absent because neither is this platform's to move (equity is governed on
 * Hypha, voice accrues here and settles there).
 *
 * Deliberately a set of KINDS and not a set of slugs: a fork names its own
 * tokens, and a slug allowlist would either refuse every village's credits or
 * be edited by whoever wanted their token in it.
 */
export const SENDABLE_KINDS: ReadonlySet<string> = new Set(["credit"]);

/**
 * Why this token cannot be sent between members, in words a member reads, or
 * null when it can.
 *
 * FOUR conditions, each one load-bearing, checked in the order that produces
 * the most useful sentence:
 *
 *   - registered at all, because an unregistered slug is a typo or a mint bug
 *   - platform-governed, because a Hypha mirror is read here and moved there
 *   - credit-kind, which is the recognition firewall
 *   - transferable in the registry, which is the village's own switch
 *
 * The kind test and the transferable test are BOTH required and neither is
 * redundant. Kind alone would send a token a village deliberately locked;
 * `transferable` alone would send recognition the moment a row said 1, and
 * `gratitude` shipped saying exactly that from 0006 until 0092 corrected it.
 */
export function sendRefusal(slug: string): string | null {
  const def = tokenDef(slug);
  if (!def) return `"${slug}" is not a token this village issues`;
  if (def.governance !== "platform") {
    return `${def.name} lives on Base and is only read here. Send it from your own wallet`;
  }
  if (!def.active) return `${def.name} is not in circulation right now`;
  if (def.isExample) return `${def.name} is a standing example. Create your own token first`;
  if (!SENDABLE_KINDS.has(def.kind)) {
    return def.kind === "recognition"
      ? `${def.name} is recognition, and recognition is a record of what happened. It is given, never handed over`
      : `${def.name} is not a token members send to each other`;
  }
  if (MODULE_VOUCHERS.has(def.slug)) {
    return `${def.name} buys one thing from the village and cannot be passed on`;
  }
  if (!def.transferable) {
    return `${def.name} is set to stay put. An admin can open sending in the token registry`;
  }
  return null;
}

/** Every token a member may send right now, in registry order. */
export function sendableTokens(): TokenDef[] {
  return allTokens().filter((t) => sendRefusal(t.slug) === null);
}

/**
 * May an admin flip `transferable` on this token at all? Same firewall as
 * above, minus the flag itself (the whole point of the call is to change it).
 * Returns a refusal sentence or null.
 */
export function mayToggleTransferable(def: TokenDef): string | null {
  if (def.governance !== "platform") {
    return `${def.name} is a read-only mirror of a token on Base. What it may do is decided there`;
  }
  if (!SENDABLE_KINDS.has(def.kind)) {
    return def.kind === "recognition"
      ? "Recognition is never sent between members. It records what happened, and a record that can be handed over is not a record"
      : `Only credit tokens can be sent between members. ${def.name} is a ${def.kind} token`;
  }
  if (MODULE_VOUCHERS.has(def.slug)) {
    return `${def.name} belongs to a module that issues it against its own service, so it stays where it was issued`;
  }
  return null;
}

/**
 * Where a spent token lands.
 *
 * Stay credits go back to the faucet that issued them, because the faucet's
 * negative balance IS the outstanding stay-credit supply and spending one
 * genuinely retires it. Every other token goes to the treasury, which is an
 * ordinary vault the village can spend from: the credits a member pays for a
 * night or a seat are value the village now holds, and burning them into the
 * cycle-pool faucet would quietly redefine that faucet's negative balance from
 * "released to date" into "outstanding", which several surfaces read.
 */
export function spendSinkFor(tokenType: string): string {
  return tokenType === "stay-credit" ? MINT_FAUCET : TREASURY;
}

/**
 * Tokens a room or a gathering may post a price in.
 *
 * Credit-kind platform tokens, plus stay credits (which are credit-kind
 * already). Recognition can never be a price: that is the same separation the
 * pool-token guard enforces at cycle close, restated at the two surfaces that
 * could otherwise re-introduce it by letting an admin type a slug.
 */
export function isPriceableToken(slug: string): boolean {
  const def = tokenDef(slug);
  return !!def && def.governance === "platform" && def.active && !def.isExample && def.kind === "credit";
}

/** The refusal for a price posted in something that cannot be a price. */
export function priceRefusal(slug: string): string | null {
  const def = tokenDef(slug);
  if (!def) return `"${slug}" is not a token this village issues`;
  if (def.governance !== "platform") return `${def.name} is issued on Base and cannot be charged here`;
  if (def.isExample) return `${def.name} is a standing example. Create your own token first`;
  if (!def.active) return `${def.name} is not in circulation right now`;
  if (def.kind !== "credit") {
    return def.kind === "recognition"
      ? `${def.name} is recognition and can never be a price. Recognition is the signal, credits are the value`
      : `A price is posted in a credit token. ${def.name} is a ${def.kind} token`;
  }
  return null;
}

// ── The launch guard ────────────────────────────────────────────────────────

export interface SpendSurface {
  key: string;
  detail: string;
}

/**
 * Every place this token can currently be spent, read from live data.
 *
 * This is the check that stops the dead end coming back. A fork can set the
 * pool to pay a token, distribute it every lunation, and ship with nowhere to
 * spend it, which is exactly the state this whole change was opened against.
 *
 * A SURFACE IS A ROW SOMEBODY POSTED, never a module being switched on. The
 * stays module being enabled proves nothing about whether a single room asks
 * for this token, and "the module is on" is precisely the reassurance that let
 * the original dead end read as healthy.
 *
 * Member sending is the exception and is deliberately counted: a token members
 * can pass between themselves has somewhere to go the moment two members want
 * it to, with no admin having to post anything.
 */
export async function spendSurfacesFor(pool: Pool, slug: string): Promise<SpendSurface[]> {
  const found: SpendSurface[] = [];

  const [rooms] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM accommodation_prices p JOIN accommodations a ON a.id = p.accommodation_id " +
      "WHERE p.token_type = ? AND p.active = 1 AND a.active = 1 AND a.is_example = 0",
    [slug],
  );
  const roomCount = Number(rooms[0]?.n ?? 0);
  if (roomCount > 0) {
    found.push({ key: "stays", detail: `${roomCount} room price(s)` });
  }

  const [seats] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM events WHERE seat_token = ? AND seat_price > 0 AND removed_at IS NULL AND is_example = 0",
    [slug],
  );
  const seatCount = Number(seats[0]?.n ?? 0);
  if (seatCount > 0) {
    found.push({ key: "events", detail: `${seatCount} gathering(s) asking a seat fee` });
  }

  if (sendRefusal(slug) === null) {
    found.push({ key: "send", detail: "members can send it to each other" });
  }

  return found;
}
