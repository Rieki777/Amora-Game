/**
 * The handshake, which decides who is allowed to federate at all.
 *
 * One line used to answer that: `info?.platform !== "custom-game-foundation"`.
 * A Peerdom organisation, a bioregional council or a hand-written static file
 * could answer every question correctly and still be refused, because it was
 * not a fork of this exact repository. That is the difference between a
 * protocol and a product feature, and `/.well-known/village.json` is what
 * closes it.
 *
 * Two rules these tests pin:
 *
 *  - The v1 discovery document is tried FIRST and needs no shared codebase.
 *  - The v0 path stays EXACTLY as strict as it was. It is the legacy branch,
 *    not a second and looser front door, so it still demands the literal
 *    platform string.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { discoverPeer } from "./network";
import * as toolcheck from "./toolcheck";

const WELL_KNOWN = "/.well-known/village.json";
const PLATFORM = "/api/platform/info";

/** Answers only the routes given; anything else throws, as a real 404 would. */
function serve(routes: Record<string, any>) {
  return vi.spyOn(toolcheck, "guardedFetchJson").mockImplementation(async (url: string) => {
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        if (body instanceof Error) throw body;
        return body;
      }
    }
    throw new Error(`404 ${url}`);
  });
}

const villageDoc = (over: Record<string, any> = {}) => ({
  protocol: "village/1",
  kind: "village",
  instanceId: "inst-abc",
  name: "Riverbend",
  platform: { name: "something-else-entirely", version: "3.2.1" },
  supports: ["org/1"],
  ...over,
});

const platformDoc = (over: Record<string, any> = {}) => ({
  instanceId: "inst-xyz",
  name: "Old Village",
  platform: "custom-game-foundation",
  version: "1.0.0",
  ...over,
});

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("the village handshake", () => {
  it("accepts a village that shares NO code with this platform", () => {
    // The whole point. This document names a different platform entirely and
    // is still a village, because `protocol` is the contract and the codebase
    // is not.
    serve({ [WELL_KNOWN]: villageDoc() });
    return discoverPeer("https://peer.example").then((id) => {
      expect(id).toEqual({
        instanceId: "inst-abc",
        name: "Riverbend",
        version: "3.2.1",
        protocol: "village/1",
        supports: ["org/1"],
      });
    });
  });

  it("prefers the discovery document when BOTH answer", async () => {
    serve({ [WELL_KNOWN]: villageDoc(), [PLATFORM]: platformDoc() });
    const id = await discoverPeer("https://peer.example");
    expect(id!.protocol).toBe("village/1");
    expect(id!.instanceId).toBe("inst-abc");
  });

  it("falls back to the v0 handshake, because an older village is not a broken one", async () => {
    serve({ [PLATFORM]: platformDoc() });
    const id = await discoverPeer("https://peer.example");
    expect(id).toEqual({
      instanceId: "inst-xyz",
      name: "Old Village",
      version: "1.0.0",
      protocol: "platform/0",
      supports: [],
    });
  });

  it("keeps the v0 branch exactly as strict as it always was", async () => {
    // The legacy path must not become a looser second front door. Without a
    // protocol field the platform string is the only thing identifying it.
    serve({ [PLATFORM]: platformDoc({ platform: "some-other-thing" }) });
    expect(await discoverPeer("https://peer.example")).toBeNull();
  });

  it("refuses a discovery document with no instanceId", async () => {
    // Identity is the one thing federation cannot work without: peers are
    // re-verified by uuid every sweep, because domains change hands.
    serve({ [WELL_KNOWN]: villageDoc({ instanceId: undefined }) });
    expect(await discoverPeer("https://peer.example")).toBeNull();
  });

  it("refuses a document that answers with some other protocol", async () => {
    serve({ [WELL_KNOWN]: villageDoc({ protocol: "activitypub/1" }) });
    expect(await discoverPeer("https://peer.example")).toBeNull();
  });

  it("accepts a later version of the same protocol", async () => {
    // Consumers branch on `supports`, never on version ordering, so a
    // village/2 document that still carries an instanceId is a village.
    serve({ [WELL_KNOWN]: villageDoc({ protocol: "village/2" }) });
    const id = await discoverPeer("https://peer.example");
    expect(id!.protocol).toBe("village/1");
    expect(id!.instanceId).toBe("inst-abc");
  });

  it("falls through to v0 when the discovery root exists but is junk", async () => {
    // A static host answering HTML, or a parked domain. One bad document must
    // not hide a working v0 handshake behind it.
    serve({ [WELL_KNOWN]: "<html>hello</html>", [PLATFORM]: platformDoc() });
    const id = await discoverPeer("https://peer.example");
    expect(id!.protocol).toBe("platform/0");
  });

  it("returns null when nothing at the address answers either document", async () => {
    serve({});
    expect(await discoverPeer("https://peer.example")).toBeNull();
  });

  it("survives a discovery root that throws, rather than giving up on the peer", async () => {
    serve({ [WELL_KNOWN]: new Error("ECONNRESET"), [PLATFORM]: platformDoc() });
    const id = await discoverPeer("https://peer.example");
    expect(id!.instanceId).toBe("inst-xyz");
  });

  it("tolerates a village that claims no capabilities at all", async () => {
    // A village with its org export dark publishes `supports: []`. It is still
    // a village and still peerable; there is just nothing to read from it yet.
    serve({ [WELL_KNOWN]: villageDoc({ supports: [] }) });
    const id = await discoverPeer("https://peer.example");
    expect(id!.supports).toEqual([]);
    expect(id!.instanceId).toBe("inst-abc");
  });

  it("surfaces an SSRF refusal instead of reporting the peer as gone dark", async () => {
    // The one failure an operator most needs to see. A peered village whose
    // domain changed hands starts redirecting the handshake into a private
    // range; the guarded dialer refuses, and swallowing that would record the
    // peer as having simply stopped answering.
    serve({ [WELL_KNOWN]: new Error("resolves to a private address") });
    await expect(discoverPeer("https://peer.example")).rejects.toThrow("private address");
  });

  it("treats an ordinary HTTP miss as a miss, not a refusal", async () => {
    // A bare status is how the dialer reports a 404, and a village that simply
    // has no discovery root must fall through quietly to the v0 handshake.
    serve({ [WELL_KNOWN]: new Error("404"), [PLATFORM]: platformDoc() });
    const id = await discoverPeer("https://peer.example");
    expect(id!.protocol).toBe("platform/0");
  });

  it("still refuses loudly when the fallback ALSO hits a refusal", async () => {
    serve({ [WELL_KNOWN]: new Error("404"), [PLATFORM]: new Error("too many redirects") });
    await expect(discoverPeer("https://peer.example")).rejects.toThrow("too many redirects");
  });

  it("caps every field a stranger now writes into our columns", async () => {
    // version is varchar(20) and instance_id is varchar(64). Before the
    // discovery handshake these came from a peer running this exact platform,
    // so they were a short semver and a uuid. Now they are whatever a stranger
    // publishes, and under STRICT_TRANS_TABLES an over-long value fails the
    // admin's request rather than the peer's.
    serve({ [WELL_KNOWN]: villageDoc({
      instanceId: "i".repeat(200),
      name: "n".repeat(400),
      platform: { version: "2.1.0+build.2026-08-04.a91f3c7.long" },
      supports: Array.from({ length: 500 }, () => "c".repeat(500)),
    }) });
    const id = (await discoverPeer("https://peer.example"))!;
    expect(id.instanceId.length).toBe(64);
    expect(id.name!.length).toBe(120);
    expect(id.version!.length).toBe(20);
    expect(id.supports.length).toBe(32);
    expect(id.supports.every((c) => c.length <= 64)).toBe(true);
  });

  it("reports a missing version as null rather than an empty string", async () => {
    serve({ [WELL_KNOWN]: villageDoc({ platform: {} }) });
    const id = (await discoverPeer("https://peer.example"))!;
    expect(id.version).toBeNull();
  });

  it("never dials anything but the two known documents", async () => {
    // Every outbound call goes through the pinned, SSRF-guarded dialer, and
    // the set of URLs it is asked for is part of that guarantee.
    const spy = serve({ [WELL_KNOWN]: villageDoc() });
    await discoverPeer("https://peer.example");
    for (const call of spy.mock.calls) {
      expect(String(call[0])).toMatch(/\/\.well-known\/village\.json$|\/api\/platform\/info$/);
    }
  });
});
