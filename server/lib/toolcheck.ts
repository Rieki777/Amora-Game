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
 * Known gap, documented on purpose: the resolve-then-fetch sequence leaves a
 * DNS-rebinding window (a hostile resolver answering differently twice).
 * Closing it needs a pinned-IP dialer and redirect re-validation — queued for
 * the scheduler-driven checker (v2). For an admin-triggered, admin-entered
 * URL list, the ranges check removes the realistic attack surface.
 */
import dns from "dns/promises";
import net from "net";

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal });
      return res.status;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  let status = await attempt("HEAD");
  if (status === 405) status = await attempt("GET");
  return { ok: status !== null && status < 400, status };
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
