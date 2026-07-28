/**
 * The tools link checker (S15) — with the SSRF guard WRITTEN, not assumed.
 *
 * "Admin-only" is not a defense (spec risk note): the checker fetches
 * arbitrary URLs from inside the deployment's network, so before any request
 * leaves this process we:
 *   1. accept https only (also enforced at write time on tools.url);
 *   2. resolve DNS ourselves and REFUSE private, loopback, link-local and
 *      unique-local ranges — the classic cloud-metadata / internal-service
 *      targets;
 *   3. HEAD with a 5s timeout, falling back to GET on 405.
 *
 * T2 (Wave 1) CLOSED that gap, because T1 made the checker unattended.
 * The resolve-then-fetch sequence left a DNS-rebinding window: a hostile
 * resolver answers publicly for the check and privately for the fetch. Now
 * the vetted IP is PINNED into the connection (a custom dispatcher whose
 * lookup returns only the address we validated), and redirects are followed
 * MANUALLY so every hop is re-resolved and re-range-checked before it is
 * dialled. A redirect chain can no longer walk from a public host to
 * 169.254.169.254.
 *
 * These two shipped together on purpose. The old range check was accepted
 * only because a human triggered each run; putting it on a scheduler
 * without the dialer would have converted a bounded risk into an
 * unattended one.
 */
import dns from "dns/promises";
import net from "net";
import https from "https";
import type { LookupAddress } from "dns";

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
  if (lower.startsWith("::ffff:")) return ipIsPrivate(lower.slice(7)); // v4-mapped
  return false;
}

export interface LinkCheckResult {
  ok: boolean;
  status: number | null;
  refused?: string;
}

export async function checkToolLink(rawUrl: string): Promise<LinkCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: null, refused: "not a valid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, status: null, refused: "https only" };
  }
  // Literal-IP hosts get the same range check without a lookup.
  const host = url.hostname;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    for (const a of addrs) {
      if (ipIsPrivate(a.address)) {
        return { ok: false, status: null, refused: `resolves to a private address (${a.address})` };
      }
    }
  } catch {
    return { ok: false, status: null, refused: "DNS resolution failed" };
  }

  const attempt = async (method: "HEAD" | "GET"): Promise<number | null> => {
    try {
      const r = await dialPinned(url.toString(), method);
      return r.status;
    } catch {
      return null;
    }
  };

  let status = await attempt("HEAD");
  if (status === 405) status = await attempt("GET");
  return { ok: status !== null && status < 400, status };
}

/**
 * The guarded JSON fetch, for any caller that must reach an admin-entered
 * host. Same pinned dialer, same per-hop re-validation — exported so the
 * peer registry cannot quietly grow a second, unguarded fetch path (it did:
 * server/lib/network.ts used bare global fetch with redirects followed,
 * which range-checked the first host and then dialled wherever a redirect
 * pointed, including private addresses).
 */
export async function guardedFetchJson(rawUrl: string, timeoutMs = 10_000): Promise<any> {
  const guard = await guardOutboundUrl(rawUrl);
  if (!guard.ok) throw new Error(guard.refused ?? "refused");
  return dialPinnedJson(rawUrl, timeoutMs);
}

/**
 * T2: one request to ONE vetted address.
 *
 * `lookup` is the seam that closes DNS rebinding. Node calls it instead of
 * the system resolver, and ours ignores the hostname entirely and hands
 * back the exact IP `guardOutboundUrl` already range-checked. Between the
 * check and the connection there is no second resolution for a hostile
 * resolver to answer differently.
 *
 * Redirects are followed BY HAND (max 5) so every hop goes through the
 * same guard before it is dialled — an open redirect on a public host can
 * no longer bounce the checker into a private range.
 */
/**
 * Same pinning and per-hop guarding, but reads the body and parses JSON.
 * Bounded at 1 MB: a peer that answers with a gigabyte is a peer that takes
 * this village's memory down.
 */
async function dialPinnedJson(rawUrl: string, timeoutMs: number, hops = 0): Promise<any> {
  if (hops > 5) throw new Error("too many redirects");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("https only");
  const host = url.hostname;
  const addrs = net.isIP(host)
    ? [{ address: host, family: net.isIPv6(host) ? 6 : 4 }]
    : await dns.lookup(host, { all: true });
  if (addrs.some((a) => ipIsPrivate(a.address))) throw new Error("resolves to a private address");
  const vetted = addrs[0];

  const res = await new Promise<{ status: number; location: string | null; body: string }>((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:", hostname: host, port: url.port || 443,
        path: url.pathname + url.search, method: "GET", timeout: timeoutMs, servername: host,
        headers: { Accept: "application/json" },
        lookup: (_h: string, _o: any, cb: (e: Error | null, a: string | LookupAddress[], f?: number) => void) => {
          cb(null, vetted.address, (vetted as any).family === 6 ? 6 : 4);
        },
      },
      (r) => {
        let body = "";
        let size = 0;
        r.on("data", (c) => {
          size += c.length;
          if (size > 1_000_000) { req.destroy(new Error("response too large")); return; }
          body += c;
        });
        r.on("end", () => resolve({
          status: r.statusCode ?? 0,
          location: typeof r.headers.location === "string" ? r.headers.location : null,
          body,
        }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });

  if (res.status >= 300 && res.status < 400 && res.location) {
    return dialPinnedJson(new URL(res.location, url).toString(), timeoutMs, hops + 1);
  }
  if (res.status < 200 || res.status >= 300) throw new Error(String(res.status));
  return JSON.parse(res.body);
}

async function dialPinned(rawUrl: string, method: "HEAD" | "GET", hops = 0): Promise<{ status: number }> {
  if (hops > 5) throw new Error("too many redirects");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("https only");

  const host = url.hostname;
  const addrs = net.isIP(host)
    ? [{ address: host, family: net.isIPv6(host) ? 6 : 4 }]
    : await dns.lookup(host, { all: true });
  const vetted = addrs.find((a) => !ipIsPrivate(a.address));
  if (!vetted || addrs.some((a) => ipIsPrivate(a.address))) {
    // ANY private answer disqualifies the host: a round-robin that returns
    // one public and one private address is exactly the attack.
    throw new Error("resolves to a private address");
  }

  const { status, location } = await new Promise<{ status: number; location: string | null }>((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: host,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        timeout: 5000,
        // SNI and Host stay the ORIGINAL hostname (certificate validation
        // must still pass); only the address dialled is pinned.
        servername: host,
        lookup: (_hostname: string, _opts: any, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
          cb(null, vetted.address, (vetted as any).family === 6 ? 6 : 4);
        },
      },
      (res) => {
        res.resume(); // drain; we only want the status line and Location
        const loc = res.headers.location;
        resolve({ status: res.statusCode ?? 0, location: typeof loc === "string" ? loc : null });
      },
    );
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });

  // Every hop re-enters this function, so it re-resolves and re-range-checks
  // before dialling. That is the whole point: the guard is per-hop, not
  // per-chain.
  if (status >= 300 && status < 400 && location) {
    return dialPinned(new URL(location, url).toString(), method, hops + 1);
  }
  return { status };
}

/**
 * S67: the same guard, exported for the peer registry. Validates an
 * OUTBOUND base URL (https, public address ranges) without fetching it —
 * callers do their own fetch afterwards. Same documented rebinding gap,
 * same reasoning: peer URLs are admin-entered and range-checked.
 */
export async function guardOutboundUrl(rawUrl: string): Promise<{ ok: boolean; refused?: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, refused: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, refused: "https only" };
  const host = url.hostname;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    for (const a of addrs) {
      if (ipIsPrivate(a.address)) return { ok: false, refused: `resolves to a private address (${a.address})` };
    }
  } catch {
    return { ok: false, refused: "DNS resolution failed" };
  }
  return { ok: true };
}
