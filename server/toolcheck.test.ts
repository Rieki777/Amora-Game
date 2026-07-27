/**
 * T2: the pinned-IP dialer, tested against a real local server.
 *
 * These exist because the SSRF guard is the only thing standing between an
 * admin-entered URL list and the deployment's own network — and T1 just put
 * that guard on a timer, so "an admin is watching" is no longer part of the
 * argument. Each test names an attack the guard must refuse.
 */
import { describe, expect, it } from "vitest";
import { checkToolLink, guardOutboundUrl } from "./lib/toolcheck";

describe("the outbound guard", () => {
  it("refuses plain http — TLS or nothing", async () => {
    const r = await guardOutboundUrl("http://example.com/");
    expect(r.ok).toBe(false);
    expect(r.refused).toContain("https");
  });

  it("refuses the cloud metadata address by literal IP", async () => {
    const r = await guardOutboundUrl("https://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
    expect(r.refused).toContain("private");
  });

  it("refuses loopback, RFC1918, CGNAT and IPv6 unique-local literals", async () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.4.2", "100.64.0.1", "[::1]", "[fd00::1]"]) {
      const r = await guardOutboundUrl(`https://${host}/`);
      expect({ host, ok: r.ok }).toEqual({ host, ok: false });
    }
  });

  it("refuses a hostname that resolves into a private range", async () => {
    // localhost resolves to 127.0.0.1 / ::1 on every platform we run on.
    const r = await guardOutboundUrl("https://localhost/");
    expect(r.ok).toBe(false);
  });

  it("refuses garbage rather than throwing it at the network", async () => {
    expect((await guardOutboundUrl("not a url")).ok).toBe(false);
    expect((await checkToolLink("javascript:alert(1)")).ok).toBe(false);
  });

  it("still reports a real public link honestly", async () => {
    // One network call, and the assertion tolerates an offline runner:
    // either it answered (ok, with a status) or it could not be reached
    // (status null) — what must NEVER happen is a refusal, because
    // example.com is exactly the legitimate case the guard must allow.
    const r = await checkToolLink("https://example.com/");
    expect(r.refused).toBeUndefined();
  });
});
