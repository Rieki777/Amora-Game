/**
 * The village that publishes itself.
 *
 * Three documents at predictable URLs, unauthenticated, cacheable:
 *
 *   /.well-known/village.json   discovery: who this is, what it supports, where
 *   /api/public/org.json        the org chart as data
 *   /org/**.md                  the same chart as linked Markdown
 *
 * Peerdom's OKF export is the idea, and the reason it is worth building before
 * any second village exists is that it pays off with one: a founder points an
 * agent at a URL and gets the whole organisation with no integration, and a
 * funder or a partner reads the same thing. `server/lib/network.ts` already
 * made the right bet once ("the same posture as RSS") and then hardcoded
 * discovery to `/api/platform/info` and refused any platform string that was
 * not `custom-game-foundation`, so only forks of this exact repo could ever
 * federate. Links here are data, so a Peerdom organisation, a bioregional
 * council or a hand-written static file can participate.
 *
 * ── THE PRIVACY RULE, WHICH HAS NO EXCEPTIONS ────────────────────────────
 *
 * NO NAMES. Not full ones, not first ones, not documented holders' names, not
 * user ids, not focus strings or holder notes. `/api/org` tiers those behind
 * `map.viewPeople` because it has a session to check. These documents have no
 * session by construction, and once a document is fetched it can be cached,
 * relayed, indexed and handed to an agent forever. So the export publishes the
 * ANONYMOUS tier and nothing else: circle names, seat names, aims, domains,
 * accountabilities, seat counts, and how many of them are filled.
 *
 * Vacancy is the point rather than a leak. "2 of 3 seats filled, 1 open call"
 * is what makes the chart useful to a partner and a recruit, and it names
 * nobody.
 *
 * ── WHAT IS DELIBERATELY EXCLUDED ────────────────────────────────────────
 *
 * Standing examples are dropped, not flagged. `/api/org` carries `isExample`
 * so a signed-in member's UI can badge them, which works because that UI knows
 * what the flag means. A crawler does not, and a demo seat presented as real
 * governance is worse than no export.
 *
 * Retired seats (`active = 0`) are dropped. Dormant and forming circles are
 * KEPT with their status, because "we ran this and paused it" is real
 * information about how a village works, and hiding it would make the chart
 * read as though the village had never tried.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify } from "crypto";
import type { Pool } from "mysql2/promise";
import { seatState, type OrgAssignment, type OrgRole } from "./orgChart";

export const EXPORT_PROTOCOL = "village/1";

/**
 * Ids double as URL slugs. `createOrgRole` slugifies a name into the id, so
 * they already look like `visionary-lead`, but an id can also arrive from a
 * seed file or a direct write, and these ids build filesystem-shaped paths.
 * Anything that is not a plain slug is refused rather than escaped: there is
 * no legitimate seat called `../../etc/passwd`, so there is nothing to save.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isSlug(v: unknown): boolean {
  return typeof v === "string" && SLUG.test(v);
}

// ── Signing ─────────────────────────────────────────────────────────────────
//
// Minted at first boot with the same INSERT IGNORE read-or-mint that already
// mints `instanceId` (server/lib/identity.ts), so concurrent boots settle on
// one key instead of racing to overwrite each other.
//
// Built before anybody consumes these documents ON PURPOSE. It is the one
// piece that is genuinely painful to retrofit: once other villages have
// learned to trust unsigned payloads, adding signatures either breaks them or
// gets ignored forever. Without it every downstream capability is
// authenticated only by TLS to the origin, which evaporates the moment a
// document is cached, relayed or handed to an agent.

export interface SigningKey {
  kid: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAt: string;
}

let cachedKey: SigningKey | null = null;

/** Raw 32-byte ed25519 public key, base64url. */
function rawPublicKeyB64(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  // SPKI for ed25519 is a fixed 12-byte header followed by the 32-byte key.
  return Buffer.from(der.subarray(der.length - 32)).toString("base64url");
}

export async function ensureSigningKey(pool: Pool): Promise<SigningKey> {
  if (cachedKey) return cachedKey;
  // Look before minting. `identity.ts` generates its candidate unconditionally
  // because a UUID is free; a keypair is not, and every boot after the first
  // would generate one only to throw it away. The INSERT IGNORE below still
  // does the real work of settling concurrent first boots on one key, so this
  // is a fast path and not the correctness mechanism.
  const [existing] = await pool.query<any[]>(
    "SELECT value FROM app_config WHERE config_key = 'village-signing-key'",
  );
  if (!existing.length) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const fresh = JSON.stringify({
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      createdAt: new Date().toISOString(),
    });
    await pool.query(
      "INSERT IGNORE INTO app_config (config_key, value) VALUES ('village-signing-key', ?)",
      [fresh],
    );
  }
  const [[row]] = await pool.query<any[]>(
    "SELECT value FROM app_config WHERE config_key = 'village-signing-key'",
  );
  const doc = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  if (!doc?.publicKeyPem || !doc?.privateKeyPem) {
    throw new Error("village-signing-key document exists but carries no keypair, refusing to guess");
  }
  const pub = String(doc.publicKeyPem);
  cachedKey = {
    kid: createHash("sha256").update(rawPublicKeyB64(pub)).digest("hex").slice(0, 16),
    publicKeyPem: pub,
    privateKeyPem: String(doc.privateKeyPem),
    createdAt: String(doc.createdAt ?? ""),
  };
  return cachedKey;
}

/** Synchronous read for hot paths; boot must have called `ensureSigningKey`. */
export function signingKey(): SigningKey {
  if (!cachedKey) throw new Error("signing key read before boot established it");
  return cachedKey;
}

/** What the discovery doc publishes about the key. */
export function publicKeyBlock(k: SigningKey) {
  return {
    alg: "ed25519",
    kid: k.kid,
    // base64url of the raw 32 bytes, plus the PEM. Deliberately NOT multibase:
    // base58btc would have to be hand-rolled here, and a hand-rolled base58
    // that is subtly wrong publishes a key nobody can use, which is worse than
    // publishing a boring encoding everyone already has a decoder for.
    publicKeyBase64url: rawPublicKeyB64(k.publicKeyPem),
    publicKeyPem: k.publicKeyPem,
  };
}

/**
 * Deterministic JSON. Signing is worthless if the bytes a verifier
 * reconstructs differ from the bytes that were signed, and object key order in
 * JS follows insertion order, which follows whatever the code happened to do
 * that day. Keys are sorted recursively; arrays keep their order because their
 * order is meaning.
 */
export function canonicalJson(value: unknown): string {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export interface Proof {
  alg: "ed25519";
  kid: string;
  signedAt: string;
  /** Signature over `canonicalJson(document-without-proof)`, base64url. */
  signature: string;
}

/** Sign a document and return it with a `proof` block attached. */
export function signDocument<T extends Record<string, any>>(doc: T, k: SigningKey, signedAt: string): T & { proof: Proof } {
  const body = canonicalJson({ ...doc, signedAt });
  const signature = edSign(null, Buffer.from(body, "utf8"), createPrivateKey(k.privateKeyPem));
  return { ...doc, proof: { alg: "ed25519", kid: k.kid, signedAt, signature: signature.toString("base64url") } };
}

/**
 * Verify a document that carries a proof block. Exported so the round trip is
 * testable and so a peer implementation has a reference: a signature nobody
 * can check is ceremony.
 */
export function verifyDocument(signed: Record<string, any>, publicKeyPem: string): boolean {
  const { proof, ...doc } = signed;
  if (!proof?.signature || !proof?.signedAt) return false;
  const body = canonicalJson({ ...doc, signedAt: proof.signedAt });
  try {
    return edVerify(
      null,
      Buffer.from(body, "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(String(proof.signature), "base64url"),
    );
  } catch {
    return false;
  }
}

// ── The org export ──────────────────────────────────────────────────────────

export interface ExportCircle {
  id: string;
  name: string;
  purpose: string | null;
  status: string;
  parentCircleId: string | null;
  /** The fractal: this circle grew out of a seat that outgrew itself. */
  grownFromOrgRoleId: string | null;
}

export interface ExportSeat {
  id: string;
  circleId: string | null;
  name: string;
  aim: string | null;
  domain: string | null;
  accountabilities: string[];
  whyItMatters: string | null;
  seats: number;
  filled: number;
  /** open | filled | partial | forming | expired. Derived, never stored. */
  state: string;
  /**
   * Where `state` came from, because the two sources can disagree and a
   * document that disagrees with itself is worse than one that admits it.
   *
   * `records` means the state was worked out from the seatings in this
   * document, so `filled` and `seats` explain it. `declared` means a village
   * set a time-boxed `statusOverride` and it is still in force, so the state
   * is the village's own claim and the counts are what is written down. On the
   * live Amora chart that is not hypothetical: `land-steward` carries a 60-day
   * override of "filled" with no holder recorded, which published as
   * `{ seats: 1, filled: 0, state: "filled" }` and read as "Held. 0 of 1 held."
   */
  stateSource: "records" | "declared";
  criticality: string;
  recruiting: boolean;
}

export interface OrgExport {
  protocol: string;
  instanceId: string;
  name: string;
  updatedAt: string;
  circles: ExportCircle[];
  seats: ExportSeat[];
  /** Says out loud what this document does not carry, so nobody infers. */
  omits: string[];
}

export interface OrgExportInput {
  instanceId: string;
  villageName: string;
  roles: OrgRole[];
  assignments: OrgAssignment[];
  circles: any[];
  updatedAt: string;
}

export function buildOrgExport(input: OrgExportInput): OrgExport {
  const held = new Map<string, OrgAssignment[]>();
  for (const a of input.assignments) {
    if (a.endedAt) continue;
    // An example seating must not count toward a real seat's holders. These
    // are seeded by the `progression` module, which is CORE, so a brand-new
    // fork has them before a human enables anything, and `claimSeating` does
    // not filter examples, so a real member can end up on one.
    if (a.isExample) continue;
    held.set(a.orgRoleId, [...(held.get(a.orgRoleId) ?? []), a]);
  }

  const circles: ExportCircle[] = input.circles
    .filter((c: any) => !c.isExample && isSlug(c.id))
    .sort((a: any, b: any) => Number(a.order ?? a.sortOrder ?? 0) - Number(b.order ?? b.sortOrder ?? 0))
    .map((c: any) => ({
      id: String(c.id),
      name: String(c.name),
      purpose: c.purpose ?? null,
      status: String(c.status ?? "active"),
      parentCircleId: c.parentCircleId ?? null,
      grownFromOrgRoleId: c.grownFromOrgRoleId ?? null,
    }));

  // Cross-references are resolved AFTER both lists are known, so nothing
  // published points at something that was not. `parentCircleId` can name a
  // dropped example circle and `grownFromOrgRoleId` can name a seat that has
  // since been retired; either one sends an agent that follows links to a 404.
  const circleIds = new Set(circles.map((c) => c.id));

  const publishable = input.roles.filter((r) => r.active && !r.isExample && isSlug(r.id));
  const publishedSeatIds = new Set(publishable.map((r) => r.id));

  const seats: ExportSeat[] = publishable
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((r) => {
      const holders = held.get(r.id) ?? [];
      const override =
        r.statusOverride &&
        (!r.statusOverrideExpiresAt || r.statusOverrideExpiresAt.getTime() > Date.now());
      return {
        id: r.id,
        // A seat whose circle was dropped (example, or a bad id) must not
        // publish a dangling link an agent would then try to follow.
        circleId: r.circleId && circleIds.has(r.circleId) ? r.circleId : null,
        name: r.name,
        aim: r.aim,
        domain: r.domain,
        accountabilities: r.accountabilities ?? [],
        whyItMatters: r.whyItMatters,
        seats: r.seats,
        filled: holders.length,
        state: seatState(r, holders),
        stateSource: override ? "declared" : "records",
        criticality: r.criticality,
        recruiting: r.recruiting,
      };
    });

  for (const c of circles) {
    if (c.parentCircleId && !circleIds.has(c.parentCircleId)) c.parentCircleId = null;
    if (c.grownFromOrgRoleId && !publishedSeatIds.has(c.grownFromOrgRoleId)) c.grownFromOrgRoleId = null;
  }

  return {
    protocol: EXPORT_PROTOCOL,
    instanceId: input.instanceId,
    name: input.villageName,
    updatedAt: input.updatedAt,
    circles,
    seats,
    omits: [
      "Who holds a seat. This document is unauthenticated, so it carries counts and never people.",
      "Standing example rows. They are demo data, so this document drops them instead of flagging them.",
      "Retired seats.",
    ],
  };
}

// ── The Markdown mirror ─────────────────────────────────────────────────────
//
// Frontmatter carries a stable id, type and updatedAt; the body carries
// relative links, so the folder is walkable by a human, a crawler and an agent
// without any of them knowing the API exists.

/** YAML scalars, quoted so a colon or a `#` in a village's own words cannot break the block. */
function yaml(v: string | number | boolean | null): string {
  if (v === null) return "null";
  if (typeof v !== "string") return String(v);
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

/**
 * Link text. A village that names a seat "Water (springs)" or "Steward [land]"
 * would otherwise break every link that mentions it, because `[` and `]` close
 * the label and `(` opens the target. These documents are built to be handed
 * to agents, so a malformed link is not cosmetic.
 */
function linkText(v: string): string {
  return String(v).replace(/([[\]()])/g, "\\$1").replace(/\s+/g, " ").trim();
}

/**
 * Free text in a document body.
 *
 * A village's own words go here verbatim by design, and that is right: this is
 * their aim and their domain, in their voice. What is NOT right is a line of
 * it starting with `#` or `---` and silently becoming a heading or a
 * frontmatter fence in somebody else's parser, so leading structural markers
 * are escaped and the words are untouched.
 */
function prose(v: string): string {
  return String(v)
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/^(\s*)(#{1,6}\s|-{3,}\s*$|={3,}\s*$|>\s)/, "$1\\$2"))
    .join("\n");
}

function frontmatter(fields: Record<string, string | number | boolean | null>): string {
  return ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${yaml(v)}`), "---"].join("\n");
}

const STATE_WORD: Record<string, string> = {
  open: "Nobody holds this yet",
  filled: "Held",
  partial: "Partly held",
  forming: "Forming",
  expired: "Held, and the term has run out",
};

/**
 * One sentence about a seat that stays true when the two sources disagree.
 *
 * A time-boxed `statusOverride` is the village saying it knows better than the
 * count, usually because somebody is holding a seat the records have not
 * caught up with. Printing the village's word and the count in one breath
 * produced "Held. 0 of 1 seat(s) held.", which is a document arguing with
 * itself. So when the state is declared and the count does not back it up, say
 * both as the separate facts they are.
 */
function seatSentence(s: ExportSeat): string {
  const word = STATE_WORD[s.state] ?? s.state;
  const counted = `${s.filled} of ${s.seats} seat(s) held`;
  const backed = s.state === "open" ? s.filled === 0 : s.filled > 0;
  if (s.stateSource === "declared" && !backed) {
    return `The village records this seat as: ${word.toLowerCase()}. No holder for it is written down here (${counted}).`;
  }
  return `${word}. ${counted}.`;
}

export function orgIndexMarkdown(doc: OrgExport): string {
  const byCircle = new Map<string, ExportSeat[]>();
  for (const s of doc.seats) byCircle.set(s.circleId ?? "", [...(byCircle.get(s.circleId ?? "") ?? []), s]);

  const lines: string[] = [
    frontmatter({ id: "index", type: "organization", name: doc.name, instanceId: doc.instanceId, updatedAt: doc.updatedAt }),
    "",
    `# ${doc.name}`,
    "",
    "The circles this village organises itself into and the seats inside them.",
    "This document carries no names: it says how many hold each seat, never who.",
    "",
  ];

  for (const c of doc.circles) {
    lines.push(`## [${linkText(c.name)}](circles/${c.id}.md)`);
    if (c.status !== "active") lines.push("", `Status: ${c.status}.`);
    if (c.purpose) lines.push("", prose(c.purpose));
    const seats = byCircle.get(c.id) ?? [];
    if (seats.length) {
      lines.push("");
      for (const s of seats) lines.push(`- [${linkText(s.name)}](roles/${s.id}.md): ${s.filled} of ${s.seats} held`);
    }
    lines.push("");
  }

  const loose = byCircle.get("") ?? [];
  if (loose.length) {
    lines.push("## Seats outside any circle", "");
    for (const s of loose) lines.push(`- [${linkText(s.name)}](roles/${s.id}.md): ${s.filled} of ${s.seats} held`);
    lines.push("");
  }

  lines.push("## What this leaves out", "");
  for (const o of doc.omits) lines.push(`- ${o}`);
  return lines.join("\n") + "\n";
}

export function circleMarkdown(doc: OrgExport, circle: ExportCircle): string {
  const seats = doc.seats.filter((s) => s.circleId === circle.id);
  const parent = circle.parentCircleId ? doc.circles.find((c) => c.id === circle.parentCircleId) : null;
  const grown = circle.grownFromOrgRoleId ? doc.seats.find((s) => s.id === circle.grownFromOrgRoleId) : null;

  const lines: string[] = [
    frontmatter({ id: circle.id, type: "circle", name: circle.name, status: circle.status, updatedAt: doc.updatedAt }),
    "",
    `# ${circle.name}`,
    "",
    `Part of [${linkText(doc.name)}](../index.md).`,
  ];
  if (parent) lines.push("", `Inside [${linkText(parent.name)}](${parent.id}.md).`);
  if (grown) lines.push("", `Grew out of the [${linkText(grown.name)}](../roles/${grown.id}.md) seat as it outgrew one person.`);
  if (circle.status !== "active") lines.push("", `Status: ${circle.status}.`);
  if (circle.purpose) lines.push("", "## Purpose", "", prose(circle.purpose));

  if (seats.length) {
    lines.push("", "## Seats", "");
    for (const s of seats) {
      lines.push(`- [${linkText(s.name)}](../roles/${s.id}.md): ${seatSentence(s)}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function seatMarkdown(doc: OrgExport, seat: ExportSeat): string {
  const circle = seat.circleId ? doc.circles.find((c) => c.id === seat.circleId) : null;
  const lines: string[] = [
    frontmatter({
      id: seat.id, type: "role", name: seat.name, circle: circle ? circle.id : null,
      seats: seat.seats, filled: seat.filled, state: seat.state,
      recruiting: seat.recruiting, updatedAt: doc.updatedAt,
    }),
    "",
    `# ${seat.name}`,
    "",
    circle ? `A seat in [${linkText(circle.name)}](../circles/${circle.id}.md).` : `A seat in [${linkText(doc.name)}](../index.md).`,
    "",
    seatSentence(seat),
  ];
  if (seat.recruiting) lines.push("", "This seat is open to anyone who wants to take it up.");
  if (seat.aim) lines.push("", "## Aim", "", prose(seat.aim));
  if (seat.domain) lines.push("", "## Domain", "", prose(seat.domain));
  if (seat.accountabilities.length) {
    lines.push("", "## Accountabilities", "");
    // One accountability is one bullet, so a newline inside it would split the
    // list rather than wrap the line.
    for (const a of seat.accountabilities) lines.push(`- ${prose(a).replace(/\s+/g, " ").trim()}`);
  }
  if (seat.whyItMatters) lines.push("", "## Why it matters", "", prose(seat.whyItMatters));
  return lines.join("\n") + "\n";
}
