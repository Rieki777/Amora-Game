/**
 * "Already have a site? Paste the address." The FETCH half, and only that.
 *
 * A founder who has run a project for five years already has photographs,
 * colours, a face and a sentence that says what the place is. Asking them to
 * retype all of it into twelve empty fields is the reason a setup wizard gets
 * abandoned on screen two. This module goes and gets the page so the wizard
 * can arrive pre-filled.
 *
 * ── WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT ───────────────────
 *
 * It fetches. It does not parse. Turning a document into brand tokens is the
 * extractor's work and lives in its own module, so the seam between them is
 * `PulledDocument`: a decoded string, the address that actually answered, and
 * the facts about how it was obtained. Keeping the parser out of here means
 * the security argument below is about one page of code with no HTML in it.
 *
 * ── THE THREAT, STATED PLAINLY ───────────────────────────────────────────
 *
 * This is a server making an HTTP request to an address a stranger chose.
 * That is server-side request forgery, and it is the most dangerous shape in
 * the whole setup flow, because the server sits inside a network the stranger
 * cannot otherwise reach. On Railway, on AWS, on any cloud, the interesting
 * targets are one hop away and need no credentials:
 *
 *     http://169.254.169.254/latest/meta-data/    cloud instance credentials
 *     http://10.x / 172.16-31.x / 192.168.x       the private network
 *     http://127.0.0.1:3306                       this deployment's database
 *
 * "Admin only" is not the defence. An admin account is one phished password,
 * and a founder pasting a link somebody sent them is the ordinary case, not
 * the exotic one. The defence is the address check, and it runs on every
 * connection this module opens.
 *
 * ── SIX LAYERS, EACH ONE TESTED ──────────────────────────────────────────
 *
 *  1. SCHEME. https, and nothing else. A bare host gets https:// put on the
 *     front, because "paste your address" produces `village.example` far more
 *     often than it produces a URL. http is REFUSED rather than upgraded: a
 *     plaintext harvest lets anyone on the path choose which photographs and
 *     which colours a village adopts, and refusing it also closes the
 *     downgrade a redirect chain would otherwise offer. file:, ftp:, data:
 *     and gopher: fall out of the same rule with nothing special written for
 *     them.
 *
 *  2. ADDRESS RANGE, AFTER RESOLUTION, NEVER ON THE HOSTNAME STRING. The
 *     hostname is worthless as evidence: `metadata.example.com` is a public
 *     name whose A record can be 169.254.169.254, and a name that resolves
 *     that way is exactly the attack. So DNS is resolved here, every answer
 *     is range checked, and ANY private answer disqualifies the host. One
 *     public and one private answer is not a mixed result, it is a round
 *     robin built to be raced.
 *
 *  3. DNS REBINDING. Resolving and then connecting is two lookups, and a
 *     hostile resolver answers the second one differently. The vetted address
 *     is PINNED into the connection: Node is handed a `lookup` that ignores
 *     the hostname and returns the one address that passed. Between the check
 *     and the packet there is no second resolution to poison. SNI and the
 *     Host header keep the original name so certificate validation still
 *     means something.
 *
 *  4. EVERY REDIRECT HOP, NOT JUST THE FIRST. A public host answering 302 to
 *     an internal address defeats a one-time check completely. Redirects are
 *     followed by hand and each hop re-enters the guard before it is dialled.
 *     The chain is capped, and the cap is low.
 *
 *  5. BYTES AND TIME, BOTH COUNTED HERE. Content-Length is a claim by the
 *     other end and it lies, so the ceiling is applied to bytes actually read
 *     off the socket and the read stops at the ceiling. There are two clocks:
 *     a socket timeout, which a slow loris resets by dribbling one byte, and
 *     a total deadline for the whole call including every redirect, which it
 *     cannot.
 *
 *  6. SUB-RESOURCES ARE CAPPED AND SEQUENTIAL. One pasted address that turned
 *     into a hundred image fetches would be an amplifier pointed at somebody
 *     else's server, with this deployment's address on it. Eight per call,
 *     one at a time, under a shared budget.
 *
 * ── WHY NOT server/lib/toolcheck.ts ──────────────────────────────────────
 *
 * That module has the same pinned dialer and it is the right thing for what
 * it does. It returns text or JSON, and this feature needs image bytes, a
 * byte ceiling the CALLER owns, and a sub-resource count. Widening
 * `guardedFetchText` to carry all of that would put a binary path and a
 * founder-facing feature inside the module the calendar poller and the peer
 * registry depend on. The address rules here are a superset of that file's:
 * NAT64, 6to4, the IPv4 compatible form, multicast and the reserved /4 are
 * added, and each one is a way to write 127.0.0.1 or 169.254.169.254 that a
 * v4-only check reads as public.
 *
 * ── THE GUARD IS IN THE CALLER, NOT IN THE TRANSPORT ─────────────────────
 *
 * `PullIo` is the seam the tests replace, and it holds the resolver and the
 * socket. The guard does NOT live in it. Every refusal in this file is
 * decided in `fetchGuarded` before `io.open` is called, so a test that
 * substitutes a fake transport still runs the real refusals, and no future
 * transport can be written that skips them.
 */
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import type { LookupAddress } from "node:dns";
import { sniffKind } from "./uploads";

/**
 * The ceilings. Every one of them is enforced in this file and asserted in
 * server/lib/sitePull.test.ts, so a number changed here changes a test.
 */
export const SITE_PULL = {
  /** A marketing homepage is tens of kilobytes. This is generous already. */
  MAX_DOCUMENT_BYTES: 2 * 1024 * 1024,
  /** One hero photograph, uncompressed, off a decent camera. */
  MAX_ASSET_BYTES: 8 * 1024 * 1024,
  /** How many sub-resources one call may follow. The amplification ceiling. */
  MAX_ASSETS_PER_PULL: 8,
  /** Redirect hops. Four covers www, https and a trailing slash with room over. */
  MAX_REDIRECTS: 4,
  /** Silence on the socket before the connection is dropped. */
  SOCKET_TIMEOUT_MS: 8_000,
  /** The whole document call, redirects included. A slow loris cannot reset it. */
  DOCUMENT_DEADLINE_MS: 20_000,
  /** One asset, redirects included. */
  ASSET_DEADLINE_MS: 12_000,
  /** Every asset in one call, together. Sequential fetches share it. */
  ASSET_BUDGET_MS: 45_000,
  /**
   * The only port this fetcher will dial.
   *
   * A founder's site is on 443. An odd port on a public address is the shape
   * of an internal service that happens to be routable, and allowing the
   * whole range buys the feature nothing. A deployment that genuinely needs
   * another port adds it here, in a diff somebody reads.
   */
  ALLOWED_PORTS: new Set([443]),
} as const;

/** Why a pull was refused. The route maps these to copy; tests assert on them. */
export type PullRefusal =
  | "not-a-url"
  | "scheme"
  | "port"
  | "credentials-in-url"
  | "private-address"
  | "dns-failed"
  | "too-many-redirects"
  | "too-large"
  | "timeout"
  | "upstream-status"
  | "not-a-document"
  | "not-an-image"
  | "unreachable";

/** A refusal a person should be able to read, carrying the code a test asserts. */
export class PullRefused extends Error {
  readonly reason: PullRefusal;

  constructor(reason: PullRefusal, message: string) {
    super(message);
    this.name = "PullRefused";
    this.reason = reason;
  }
}

// ── Address ranges ─────────────────────────────────────────────────────────

/**
 * The reserved IPv4 blocks, each returning the name of the block it matched
 * so a refusal can say which one and a reviewer can check the list against
 * the RFCs without reading the call site.
 */
function reservedIpv4(ip: string): string | null {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return "an address this platform could not read";
  }
  const [a, b, c] = p;
  if (a === 0) return "the 0.0.0.0/8 block, which includes the unspecified address";
  if (a === 10) return "the private 10.0.0.0/8 block";
  if (a === 127) return "the loopback 127.0.0.0/8 block";
  if (a === 169 && b === 254) return "the link local 169.254.0.0/16 block, where cloud metadata answers";
  if (a === 172 && b >= 16 && b <= 31) return "the private 172.16.0.0/12 block";
  if (a === 192 && b === 168) return "the private 192.168.0.0/16 block";
  if (a === 192 && b === 0 && c === 0) return "the reserved 192.0.0.0/24 block";
  if (a === 192 && b === 0 && c === 2) return "the documentation 192.0.2.0/24 block";
  if (a === 100 && b >= 64 && b <= 127) return "the carrier grade NAT 100.64.0.0/10 block";
  if (a === 198 && (b === 18 || b === 19)) return "the benchmarking 198.18.0.0/15 block";
  if (a === 198 && b === 51 && c === 100) return "the documentation 198.51.100.0/24 block";
  if (a === 203 && b === 0 && c === 113) return "the documentation 203.0.113.0/24 block";
  if (a >= 224 && a <= 239) return "the multicast 224.0.0.0/4 block";
  if (a >= 240) return "the reserved 240.0.0.0/4 block";
  return null;
}

/**
 * An IPv6 address as eight 16-bit groups, or null when it is not one.
 *
 * Written out instead of pattern matched on the text because every bypass in
 * this area is a second spelling of the same address. `::ffff:127.0.0.1` and
 * `::ffff:7f00:1` are one address written two ways, and a check that reads
 * the string sees two different things. Expanding first means the range rules
 * below compare numbers and cannot be spelled around.
 */
export function ipv6Groups(raw: string): number[] | null {
  let ip = raw.trim().toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);

  // A trailing dotted quad, as in ::ffff:127.0.0.1, is two groups in disguise.
  const dotted = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && dotted.index !== undefined) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((parts[0] << 8) | parts[1]) >>> 0;
    const lo = ((parts[2] << 8) | parts[3]) >>> 0;
    ip = `${ip.slice(0, dotted.index)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 && fill < 0) return null;
  const groups = [...head, ...(halves.length === 2 ? new Array(fill).fill("0") : []), ...tail];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
  if (out.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return out;
}

/**
 * The one predicate. Returns the name of the reserved range an address sits
 * in, or null when it is an ordinary public address this platform may dial.
 *
 * Named ranges rather than a boolean on purpose: a refusal that says which
 * block it matched is a refusal a founder can act on, and a reviewer checking
 * this guard reads the list instead of trusting the word "private".
 */
export function reservedAddress(ip: string): string | null {
  if (net.isIPv4(ip)) return reservedIpv4(ip);

  const g = ipv6Groups(ip);
  if (!g) return "an address this platform could not read";

  if (g.every((n) => n === 0)) return "the unspecified address ::";
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return "the IPv6 loopback ::1";

  // The v4 mapped form is legitimate and is checked against the v4 rules.
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    const why = reservedIpv4(v4);
    return why ? `${why}, written in the IPv4 mapped form` : null;
  }
  // The IPv4 compatible form is deprecated, so nothing legitimate uses it,
  // and ::7f00:1 is one more way to write loopback. Refused whole.
  if (g.slice(0, 6).every((n) => n === 0)) {
    return "the deprecated IPv4 compatible ::/96 form, which is another way to write an IPv4 address";
  }
  // NAT64 and 6to4 both carry an IPv4 address inside them and both reach it
  // through a translator on the local network. Refused whole, for that reason
  // and not for the address they carry.
  if (g[0] === 0x0064 && g[1] === 0xff9b) return "the NAT64 prefix 64:ff9b::/96, which reaches IPv4 through a local gateway";
  if (g[0] === 0x2002) return "the 6to4 prefix 2002::/16, which carries an IPv4 address inside it";

  if ((g[0] & 0xfe00) === 0xfc00) return "the unique local fc00::/7 block";
  if ((g[0] & 0xffc0) === 0xfe80) return "the link local fe80::/10 block";
  if ((g[0] & 0xff00) === 0xff00) return "the IPv6 multicast ff00::/8 block";
  if (g[0] === 0x2001 && g[1] === 0x0db8) return "the documentation 2001:db8::/32 block";
  return null;
}

// ── The seam ───────────────────────────────────────────────────────────────

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** DNS, replaceable in a test. The guard that reads its answers is not. */
export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

export interface OpenRequest {
  url: URL;
  /** The single address the guard vetted. The connection is pinned to it. */
  address: string;
  family: number;
  accept: string;
  socketTimeoutMs: number;
  signal: AbortSignal;
}

export interface OpenResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** Read in chunks so the byte ceiling belongs to the caller. */
  body: AsyncIterable<Buffer>;
  /** Drop the connection without reading the body. Called on every redirect. */
  cancel(): void;
}

/**
 * The transport. Tests replace this whole object; they cannot replace the
 * guard, which runs in `fetchGuarded` before `open` is ever called.
 */
export interface PullIo {
  resolve: Resolver;
  open(req: OpenRequest): Promise<OpenResponse>;
}

const systemResolve: Resolver = async (host) => {
  const addrs = await dns.lookup(host, { all: true });
  return addrs.map((a) => ({ address: a.address, family: a.family }));
};

/**
 * The lookup Node is handed instead of the system resolver.
 *
 * Exported because the callback contract is the part that has silently broken
 * before. Node 20 and later ask with `{ all: true }` and read an ARRAY back;
 * handing them the string form fails as "Invalid IP address: undefined"
 * before any packet moves, and the older call shape is still used elsewhere.
 * Both shapes return the same one vetted address, so the pin holds either way.
 */
export function pinnedLookup(vetted: ResolvedAddress) {
  const family = vetted.family === 6 ? 6 : 4;
  return (
    _host: string,
    opts: any,
    cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    if (opts?.all) cb(null, [{ address: vetted.address, family }]);
    else cb(null, vetted.address, family);
  };
}

const openPinned = (req: OpenRequest): Promise<OpenResponse> =>
  new Promise<OpenResponse>((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname: req.url.hostname,
        port: req.url.port || 443,
        path: `${req.url.pathname}${req.url.search}`,
        method: "GET",
        timeout: req.socketTimeoutMs,
        signal: req.signal,
        // The name stays the name so the certificate still has to match it.
        // Only the address dialled is pinned.
        servername: req.url.hostname,
        headers: {
          Accept: req.accept,
          // Asked for explicitly so the byte ceiling counts what it thinks it
          // counts. An encoded body would be a compressed size on the wire and
          // a much larger one after decoding, which is a bomb with a small
          // Content-Length on it.
          "Accept-Encoding": "identity",
          "User-Agent": "village-site-pull/1",
        },
        lookup: pinnedLookup({ address: req.address, family: req.family }),
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          cancel: () => res.destroy(),
        });
      },
    );
    request.on("timeout", () => request.destroy(new PullRefused("timeout", "The site stopped answering.")));
    request.on("error", reject);
    request.end();
  });

/** The transport this module uses when nobody hands it another one. */
export const nodeIo: PullIo = { resolve: systemResolve, open: openPinned };

// ── The guard ──────────────────────────────────────────────────────────────

export type GuardResult =
  | { ok: true; url: URL; vetted: ResolvedAddress }
  | { ok: false; reason: PullRefusal; message: string };

/**
 * Normalise what a founder typed. A bare host is the common paste, so it gets
 * https:// on the front. Anything that already names a scheme keeps it, which
 * is what makes the http refusal below reachable instead of papered over.
 */
export function normaliseTypedUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Scheme, port, credentials, DNS, address range. Everything that has to be
 * true before a socket is opened, decided in one place and called again on
 * every redirect hop.
 */
export async function guardPullUrl(raw: string, resolve: Resolver = systemResolve): Promise<GuardResult> {
  const candidate = normaliseTypedUrl(raw);
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "not-a-url", message: "That is not an address this platform can read." };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "scheme",
      message:
        "This platform reads https addresses only. Plain http would let anyone on the network choose which pictures and colours your village copies.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "credentials-in-url",
      message: "That address carries a username and password in it, so this platform will not fetch it.",
    };
  }
  if (url.port && !SITE_PULL.ALLOWED_PORTS.has(Number(url.port))) {
    return {
      ok: false,
      reason: "port",
      message: `This platform fetches from port 443 only, and that address names port ${url.port}.`,
    };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, reason: "dns-failed", message: "That address did not resolve to anything." };
    }
  }
  if (!addresses.length) {
    return { ok: false, reason: "dns-failed", message: "That address did not resolve to anything." };
  }

  /*
   * ANY private answer disqualifies the host, and the loop runs to the end
   * before it decides. A name that answers with one public address and one
   * private one is not a name that mostly works; it is a round robin built so
   * that the check and the connection land on different rows.
   */
  for (const a of addresses) {
    const why = reservedAddress(a.address);
    if (why) {
      return {
        ok: false,
        reason: "private-address",
        message: `That address resolves to ${a.address}, which sits in ${why}. This platform will not fetch from inside its own network.`,
      };
    }
  }

  return { ok: true, url, vetted: addresses[0] };
}

// ── Reading, under a ceiling ───────────────────────────────────────────────

/**
 * Read a body, stopping at `maxBytes`.
 *
 * Content-Length is never consulted for the decision. It is a claim by the
 * other end, it is optional, and a chunked response has none at all, so a
 * ceiling that trusts it is a ceiling that a hostile server sets to zero. The
 * count here is bytes that actually arrived.
 */
async function readCapped(
  body: AsyncIterable<Buffer>,
  maxBytes: number,
): Promise<{ bytes: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (size + buf.length > maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - size));
      size = maxBytes;
      truncated = true;
      break;
    }
    chunks.push(buf);
    size += buf.length;
  }
  return { bytes: Buffer.concat(chunks), truncated };
}

interface FetchOutcome {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bytes: Buffer;
  truncated: boolean;
  finalUrl: string;
  /** Every address dialled, in order, starting with the one that was typed. */
  hops: string[];
}

interface FetchOptions {
  io: PullIo;
  accept: string;
  maxBytes: number;
  deadlineMs: number;
}

/**
 * One fetch, guarded at every hop.
 *
 * The redirect loop is written out instead of handed to the transport
 * precisely so the guard can run between hops. A library that follows
 * redirects for you range checks the address you gave it and then dials
 * wherever the far end points, which is the whole attack in one convenience.
 */
async function fetchGuarded(rawUrl: string, opts: FetchOptions): Promise<FetchOutcome> {
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new PullRefused("timeout", "That site took too long to answer.")),
    opts.deadlineMs,
  );
  const hops: string[] = [];
  try {
    let next = rawUrl;
    for (let hop = 0; hop <= SITE_PULL.MAX_REDIRECTS; hop += 1) {
      const guard = await guardPullUrl(next, opts.io.resolve);
      if (!guard.ok) throw new PullRefused(guard.reason, guard.message);
      hops.push(guard.url.toString());

      let res: OpenResponse;
      try {
        res = await opts.io.open({
          url: guard.url,
          address: guard.vetted.address,
          family: guard.vetted.family,
          accept: opts.accept,
          socketTimeoutMs: SITE_PULL.SOCKET_TIMEOUT_MS,
          signal: controller.signal,
        });
      } catch (e) {
        if (e instanceof PullRefused) throw e;
        if (controller.signal.aborted) throw new PullRefused("timeout", "That site took too long to answer.");
        throw new PullRefused("unreachable", "This platform could not reach that address.");
      }

      const location = res.headers.location;
      const redirect = typeof location === "string" ? location : null;
      if (res.status >= 300 && res.status < 400 && redirect) {
        // Drop the connection before the next hop, so a redirect chain cannot
        // hold five sockets open while it walks.
        res.cancel();
        next = new URL(redirect, guard.url).toString();
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        res.cancel();
        throw new PullRefused("upstream-status", `That site answered ${res.status}.`);
      }

      /*
       * A socket that dies part way through a read throws out of the loop,
       * and Express 4 turns anything that is not caught into a hung request.
       * It becomes a refusal with a code the route already knows how to
       * answer, and the connection is dropped either way.
       */
      let read: { bytes: Buffer; truncated: boolean };
      try {
        read = await readCapped(res.body, opts.maxBytes);
      } catch {
        if (controller.signal.aborted) throw new PullRefused("timeout", "That site took too long to answer.");
        throw new PullRefused("unreachable", "That site stopped answering part way through.");
      } finally {
        res.cancel();
      }
      return {
        status: res.status,
        headers: res.headers,
        bytes: read.bytes,
        truncated: read.truncated,
        finalUrl: guard.url.toString(),
        hops,
      };
    }
    throw new PullRefused("too-many-redirects", "That address redirected more times than this platform will follow.");
  } finally {
    clearTimeout(deadline);
  }
}

// ── The document ───────────────────────────────────────────────────────────

/**
 * What the fetcher hands to the extractor.
 *
 * This is the whole seam between the two lanes. `text` is a decoded string
 * and it never reaches a browser: the route returns what the extractor made
 * of it, so a hostile page cannot be rendered back at the founder inside this
 * deployment's own origin.
 */
export interface PulledDocument {
  /** The address the founder typed, after https was put on the front. */
  requestedUrl: string;
  /** The address that actually answered, after every hop. */
  finalUrl: string;
  /** Every hop dialled, in order. The audit line for a redirect chain. */
  hops: string[];
  status: number;
  /** The upstream Content-Type header, lowercased, parameters kept. */
  contentType: string;
  /** The character set the body was decoded with. */
  charset: string;
  /** The document. Never returned to a client for rendering. */
  text: string;
  /** Bytes actually read off the socket. */
  bytes: number;
  /** True when the ceiling cut the document short. */
  truncated: boolean;
}

const DOCUMENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "application/xml", "text/xml"];

/**
 * Decode with the charset the page claims, when it is one Node knows.
 *
 * Getting this wrong shows up as a tagline full of replacement characters, so
 * it is worth the six lines. An unknown charset falls back to utf-8, which is
 * what the web is.
 */
function decodeBody(bytes: Buffer, charset: string): string {
  const c = charset.toLowerCase();
  if (c === "iso-8859-1" || c === "latin1" || c === "windows-1252") return bytes.toString("latin1");
  if (c === "utf-16le" || c === "utf-16") return bytes.toString("utf16le");
  return bytes.toString("utf8");
}

/**
 * Fetch one page. The only thing a founder's pasted address does on its own.
 *
 * No sub-resource is touched here. Images cost a second, separate call that
 * carries a rights affirmation, because fetching a page is reading and
 * fetching its photographs is copying.
 */
export async function pullDocument(rawUrl: string, opts: { io?: PullIo } = {}): Promise<PulledDocument> {
  const io = opts.io ?? nodeIo;
  const out = await fetchGuarded(rawUrl, {
    io,
    accept: "text/html, application/xhtml+xml;q=0.9, text/plain;q=0.5",
    maxBytes: SITE_PULL.MAX_DOCUMENT_BYTES,
    deadlineMs: SITE_PULL.DOCUMENT_DEADLINE_MS,
  });

  const rawType = out.headers["content-type"];
  const contentType = String(Array.isArray(rawType) ? rawType[0] : (rawType ?? "")).toLowerCase();
  const mime = contentType.split(";")[0].trim();
  /*
   * An empty Content-Type is accepted: plenty of small servers omit it and
   * the extractor is lenient. A type that is positively something else is
   * refused, because a page that answers image/jpeg is not the founder's
   * homepage and feeding it to an HTML parser is how a parser gets fuzzed.
   */
  if (mime && !DOCUMENT_TYPES.includes(mime)) {
    throw new PullRefused("not-a-document", `That address answered with ${mime}, which is not a web page.`);
  }

  const charsetMatch = contentType.match(/charset=\s*"?([\w-]+)"?/);
  const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";

  return {
    requestedUrl: normaliseTypedUrl(rawUrl),
    finalUrl: out.finalUrl,
    hops: out.hops,
    status: out.status,
    contentType,
    charset,
    text: decodeBody(out.bytes, charset),
    bytes: out.bytes.length,
    truncated: out.truncated,
  };
}

// ── The sub-resources ──────────────────────────────────────────────────────

export interface PulledAsset {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  bytes: Buffer;
}

export interface AssetPullResult {
  fetched: PulledAsset[];
  refused: Array<{ url: string; reason: PullRefusal; message: string }>;
  /** How many addresses were dropped for sitting past the per-call ceiling. */
  skipped: number;
}

/**
 * Fetch the pictures, capped and one at a time.
 *
 * SEQUENTIAL ON PURPOSE. Eight parallel connections from a server, triggered
 * by one paste, is a small denial of service with this deployment's address
 * on it. One at a time under a shared budget costs a founder a few seconds
 * and costs the far end nothing it would notice.
 *
 * An oversized picture is REFUSED and not truncated, because half a JPEG is a
 * broken file that would still be stored and still be shown. A truncated
 * document is useful to a parser; a truncated image never is.
 *
 * The image test is the first bytes, never the header. A server that answers
 * an HTML error page with `Content-Type: image/png` on it is a server whose
 * header lied, and this codebase already decided that question for uploads:
 * `sniffKind` reads the file.
 */
export async function pullAssets(
  urls: string[],
  opts: { io?: PullIo; base?: string; limit?: number; now?: () => number } = {},
): Promise<AssetPullResult> {
  const io = opts.io ?? nodeIo;
  const now = opts.now ?? Date.now;
  const limit = Math.min(opts.limit ?? SITE_PULL.MAX_ASSETS_PER_PULL, SITE_PULL.MAX_ASSETS_PER_PULL);

  const seen = new Set<string>();
  const wanted: string[] = [];
  for (const raw of urls) {
    let resolved: string;
    try {
      resolved = opts.base ? new URL(String(raw), opts.base).toString() : normaliseTypedUrl(String(raw));
    } catch {
      resolved = String(raw);
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    wanted.push(resolved);
  }

  const take = wanted.slice(0, limit);
  const result: AssetPullResult = { fetched: [], refused: [], skipped: wanted.length - take.length };
  const startedAt = now();

  for (const url of take) {
    if (now() - startedAt > SITE_PULL.ASSET_BUDGET_MS) {
      result.refused.push({
        url,
        reason: "timeout",
        message: "This platform ran out of time before it reached this picture. Try it on its own.",
      });
      continue;
    }
    try {
      const out = await fetchGuarded(url, {
        io,
        accept: "image/*",
        // One byte over the ceiling is enough to know it is over the ceiling.
        maxBytes: SITE_PULL.MAX_ASSET_BYTES + 1,
        deadlineMs: SITE_PULL.ASSET_DEADLINE_MS,
      });
      if (out.bytes.length > SITE_PULL.MAX_ASSET_BYTES) {
        throw new PullRefused(
          "too-large",
          `That picture is over the ${Math.round(SITE_PULL.MAX_ASSET_BYTES / (1024 * 1024))} MB ceiling this platform will copy.`,
        );
      }
      if (sniffKind(out.bytes) !== "image") {
        throw new PullRefused("not-an-image", "What came back at that address is not a picture.");
      }
      const rawType = out.headers["content-type"];
      result.fetched.push({
        requestedUrl: url,
        finalUrl: out.finalUrl,
        contentType: String(Array.isArray(rawType) ? rawType[0] : (rawType ?? "")).toLowerCase(),
        bytes: out.bytes,
      });
    } catch (e) {
      const refusal = e instanceof PullRefused ? e : null;
      result.refused.push({
        url,
        reason: refusal?.reason ?? "unreachable",
        message: refusal?.message ?? "This platform could not reach that picture.",
      });
    }
  }

  return result;
}

// ── Rights ─────────────────────────────────────────────────────────────────

/**
 * THE SENTENCE THE FOUNDER AGREES TO, held here so the wording that was shown
 * is the wording that goes on the record.
 *
 * A checkbox whose label lives only in a component is a checkbox whose meaning
 * changes when somebody edits the component, and the record kept afterwards
 * says nothing about what was actually agreed. The screen renders this string,
 * the server stores this string, and the two cannot drift.
 */
export const RIGHTS_STATEMENT =
  "This project holds the rights to the pictures listed here, or has permission to use them.";

/** What the caller sends to affirm rights over a named set of pictures. */
export interface RightsAffirmation {
  confirmed: boolean;
  /** The page the pictures came from. Must match the page that was pulled. */
  sourceUrl: string;
  /** Every picture being copied, named one by one. */
  assetUrls: string[];
}

/** What goes on the record afterwards. Returned to the caller to store. */
export interface RightsRecord {
  at: string;
  by: string | null;
  sourceUrl: string;
  assetUrls: string[];
  statement: string;
}

const sameUrlSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
};

/**
 * The rights gate, and the reason it takes a LIST.
 *
 * IdentityPackPanel already asks a founder to confirm they hold rights to the
 * reference images they uploaded, and it asks after the upload. Uploading is
 * slow enough that a founder has looked at every file. Pulling from a URL is
 * one click, so a blanket "yes I have the rights" would cover photographs the
 * founder never saw, including the stock library the site licensed for its own
 * pages and nothing else.
 *
 * So the affirmation names what is being copied. The caller sends back the
 * exact addresses it is affirming, and the set has to match the set being
 * fetched, address for address. A founder who adds a picture to the list
 * affirms it or the call is refused. There is no way to write "all of them".
 */
export function checkRights(
  affirmation: unknown,
  pageUrl: string,
  requested: string[],
  actor: string | null,
  now: () => Date = () => new Date(),
): { ok: true; record: RightsRecord } | { ok: false; message: string } {
  const a = (affirmation ?? {}) as Partial<RightsAffirmation>;
  if (a.confirmed !== true) {
    return {
      ok: false,
      message: `Confirm your rights to these pictures first. ${RIGHTS_STATEMENT}`,
    };
  }
  const named = Array.isArray(a.assetUrls) ? a.assetUrls.map(String) : [];
  if (!named.length) {
    return { ok: false, message: "Name the pictures you are copying. A blanket confirmation covers nothing." };
  }
  if (String(a.sourceUrl ?? "") !== pageUrl) {
    return {
      ok: false,
      message: "The confirmation names a different site from the one these pictures came from.",
    };
  }
  if (!sameUrlSet(named, requested)) {
    return {
      ok: false,
      message:
        "The confirmation does not name the same pictures this call is asking for. Confirm each one you are copying.",
    };
  }
  return {
    ok: true,
    record: {
      at: now().toISOString(),
      by: actor,
      sourceUrl: pageUrl,
      assetUrls: [...named],
      statement: RIGHTS_STATEMENT,
    },
  };
}
