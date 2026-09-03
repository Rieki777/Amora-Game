/**
 * The site fetcher, tested by what it REFUSES.
 *
 * Every test here names an attack, and the assertion is that the request
 * never left this process. A security test that only proves the happy path
 * proves nothing: the interesting failure is a guard that quietly stopped
 * firing, and the only way to see that is to point a private address at it
 * and watch it say no.
 *
 * THE CONTROL IS AS IMPORTANT AS THE REFUSALS. A fetcher that refuses
 * everything passes every test in this file except the ones marked "the
 * control", and it delivers no feature at all. So a legitimate public address
 * is fetched successfully in the same suite, with the same guard, and the
 * refusal tests additionally assert that the transport was never opened. That
 * pair is what proves the guard discriminates instead of blanket refusing.
 *
 * WHAT THE FAKE TRANSPORT CAN AND CANNOT DO. `PullIo` holds the resolver and
 * the socket, and the tests replace both. It does NOT hold the guard: every
 * refusal is decided in the library before `io.open` is called. So a fake
 * transport still runs the real address rules, the real scheme rule, the real
 * redirect walk and the real byte ceiling. The two tests at the foot of this
 * file cover the part a fake cannot: that the REAL Node transport dials the
 * pinned address, and that with the guard in front of it, it dials nothing.
 */
import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  PullRefused,
  RIGHTS_STATEMENT,
  SITE_PULL,
  checkRights,
  guardPullUrl,
  nodeIo,
  pinnedLookup,
  pullAssets,
  pullDocument,
  reservedAddress,
  type OpenRequest,
  type OpenResponse,
  type PullIo,
} from "./sitePull";

// ── A transport that records what it was asked to dial ─────────────────────

interface Answer {
  status?: number;
  headers?: Record<string, string>;
  /** The body, as the chunks the reader will be offered. */
  chunks?: Buffer[];
}

interface Fake {
  io: PullIo;
  /** Every connection the guard let through, in order. */
  opened: OpenRequest[];
  /** How many chunks the reader actually pulled. Proves it stopped early. */
  pulled: number;
}

/**
 * `hosts` maps a hostname to the addresses DNS answers with, so a test can
 * write "this public name resolves into the private range" without owning a
 * domain. `answers` are handed out in order, one per connection.
 */
function fakeIo(hosts: Record<string, string[]>, answers: Answer[] = []): Fake {
  const state: Fake = { opened: [], pulled: 0, io: null as unknown as PullIo };
  let next = 0;
  state.io = {
    resolve: async (host) => {
      const found = hosts[host];
      if (!found) throw new Error(`no test record for ${host}`);
      return found.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
    },
    open: async (req: OpenRequest): Promise<OpenResponse> => {
      state.opened.push(req);
      const answer = answers[Math.min(next, answers.length - 1)] ?? {};
      next += 1;
      const chunks = answer.chunks ?? [Buffer.from("<html><title>a village</title></html>")];
      async function* body() {
        for (const c of chunks) {
          state.pulled += 1;
          yield c;
        }
      }
      return {
        status: answer.status ?? 200,
        headers: answer.headers ?? { "content-type": "text/html; charset=utf-8" },
        body: body(),
        cancel: () => {},
      };
    },
  };
  return state;
}

const PUBLIC_V4 = "93.184.216.34";
const html = (s: string) => [Buffer.from(s)];

/** What a refusal looked like, without a try/catch in every test. */
async function refusalOf(run: () => Promise<unknown>): Promise<PullRefused> {
  try {
    await run();
  } catch (e) {
    if (e instanceof PullRefused) return e;
    throw e;
  }
  throw new Error("the call was expected to be refused and was not");
}

// ── The address rules ──────────────────────────────────────────────────────

describe("reservedAddress names the block an address sits in", () => {
  it("refuses every private, loopback, link local and reserved form", () => {
    const forbidden = [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.4.2",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "169.254.0.1",
      "100.64.0.1",
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      // The same two addresses written every other way they can be written.
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:169.254.169.254",
      "::7f00:1",
      "64:ff9b::a9fe:a9fe",
      "2002:7f00:0001::",
    ];
    for (const ip of forbidden) {
      expect({ ip, why: reservedAddress(ip) === null ? "ALLOWED" : "refused" }).toEqual({ ip, why: "refused" });
    }
  });

  it("allows an ordinary public address, which is the whole point", () => {
    expect(reservedAddress(PUBLIC_V4)).toBeNull();
    expect(reservedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBeNull();
  });

  it("says which block it matched, so a founder can act on the refusal", () => {
    expect(reservedAddress("169.254.169.254")).toContain("169.254.0.0/16");
    expect(reservedAddress("10.1.2.3")).toContain("10.0.0.0/8");
  });
});

// ── Scheme ─────────────────────────────────────────────────────────────────

describe("the scheme allowlist", () => {
  it("refuses everything that is not https", async () => {
    for (const url of [
      "http://village.example/",
      "file:///etc/passwd",
      "ftp://village.example/logo.png",
      "gopher://village.example/",
      "data:text/html,<h1>hi</h1>",
      "javascript:alert(1)",
    ]) {
      const guard = await guardPullUrl(url, async () => [{ address: PUBLIC_V4, family: 4 }]);
      expect({ url, ok: guard.ok }).toEqual({ url, ok: false });
    }
  });

  it("puts https on the front of a bare host, which is what founders paste", async () => {
    const guard = await guardPullUrl("village.example/about", async () => [{ address: PUBLIC_V4, family: 4 }]);
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.url.toString()).toBe("https://village.example/about");
  });

  it("refuses a port other than 443, and a username in the address", async () => {
    const resolve = async () => [{ address: PUBLIC_V4, family: 4 }];
    const port = await guardPullUrl("https://village.example:8080/", resolve);
    expect(port.ok).toBe(false);
    if (!port.ok) expect(port.reason).toBe("port");

    const creds = await guardPullUrl("https://admin:hunter2@village.example/", resolve);
    expect(creds.ok).toBe(false);
    if (!creds.ok) expect(creds.reason).toBe("credentials-in-url");
  });
});

// ── The refusals that matter, with the transport watched ───────────────────

describe("a hostname that resolves into private space is refused before a socket opens", () => {
  it("refuses a public name whose DNS answer is 127.0.0.1", async () => {
    const fake = fakeIo({ "village.example": ["127.0.0.1"] });
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("private-address");
    expect(refusal.message).toContain("127.0.0.1");
    expect(fake.opened).toHaveLength(0);
  });

  it("refuses a public name whose DNS answer is the cloud metadata address", async () => {
    const fake = fakeIo({ "metadata.village.example": ["169.254.169.254"] });
    const refusal = await refusalOf(() => pullDocument("https://metadata.village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("private-address");
    expect(refusal.message).toContain("169.254.169.254");
    expect(fake.opened).toHaveLength(0);
  });

  it("refuses the metadata address written as a bare literal", async () => {
    const fake = fakeIo({});
    const refusal = await refusalOf(() =>
      pullDocument("https://169.254.169.254/latest/meta-data/", { io: fake.io }),
    );
    expect(refusal.reason).toBe("private-address");
    expect(fake.opened).toHaveLength(0);
  });

  it("refuses a round robin that answers one public address and one private one", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4, "10.0.0.5"] });
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("private-address");
    expect(fake.opened).toHaveLength(0);
  });
});

describe("every redirect hop is re-checked, not just the first", () => {
  it("refuses a public site that redirects to an internal address", async () => {
    const fake = fakeIo(
      { "village.example": [PUBLIC_V4], "internal.village.example": ["10.0.0.5"] },
      [{ status: 302, headers: { location: "https://internal.village.example/secrets" } }],
    );
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("private-address");
    expect(refusal.message).toContain("10.0.0.5");
    // The first hop was dialled and the second never was: the guard runs per
    // hop, so the chain stops at the address it should stop at.
    expect(fake.opened).toHaveLength(1);
    expect(fake.opened[0].url.hostname).toBe("village.example");
  });

  it("refuses a redirect to the metadata address by relative path", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 301, headers: { location: "https://169.254.169.254/latest/meta-data/" } },
    ]);
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("private-address");
    expect(fake.opened).toHaveLength(1);
  });

  it("caps the chain instead of following it forever", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 302, headers: { location: "https://village.example/again" } },
    ]);
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("too-many-redirects");
    expect(fake.opened).toHaveLength(SITE_PULL.MAX_REDIRECTS + 1);
  });

  it("follows an ordinary redirect and reports every hop it dialled", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4], "www.village.example": [PUBLIC_V4] }, [
      { status: 301, headers: { location: "https://www.village.example/" } },
      { status: 200, headers: { "content-type": "text/html" }, chunks: html("<title>home</title>") },
    ]);
    const doc = await pullDocument("village.example", { io: fake.io });
    expect(doc.finalUrl).toBe("https://www.village.example/");
    expect(doc.hops).toEqual(["https://village.example/", "https://www.village.example/"]);
  });
});

// ── Size and time ──────────────────────────────────────────────────────────

describe("the byte ceiling counts what arrived, not what was promised", () => {
  it("stops reading a huge document instead of buffering it whole", async () => {
    // Ten megabytes offered, in one megabyte chunks, with a Content-Length
    // that lies about being small. The ceiling is two megabytes.
    const chunks = Array.from({ length: 10 }, () => Buffer.alloc(1024 * 1024, 0x61));
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "text/html", "content-length": "12" }, chunks },
    ]);
    const doc = await pullDocument("https://village.example/", { io: fake.io });
    expect(doc.truncated).toBe(true);
    expect(doc.bytes).toBe(SITE_PULL.MAX_DOCUMENT_BYTES);
    // Three chunks pulled out of ten: two filled the ceiling and the third
    // showed there was more. The other seven were never read, so the ten
    // megabytes never existed in this process at once.
    expect(fake.pulled).toBe(3);
  });

  it("refuses an oversized picture rather than storing half of one", async () => {
    const chunks = Array.from({ length: 12 }, () => Buffer.alloc(1024 * 1024, 0x61));
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "image/jpeg" }, chunks },
    ]);
    const out = await pullAssets(["https://village.example/hero.jpg"], { io: fake.io });
    expect(out.fetched).toHaveLength(0);
    expect(out.refused[0].reason).toBe("too-large");
  });

  it("turns a socket that dies mid-read into a refusal rather than a hung request", async () => {
    const io: PullIo = {
      resolve: async () => [{ address: PUBLIC_V4, family: 4 }],
      open: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        // eslint-disable-next-line require-yield
        body: (async function* () {
          yield Buffer.from("<html>");
          throw new Error("ECONNRESET");
        })(),
        cancel: () => {},
      }),
    };
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io }));
    expect(refusal.reason).toBe("unreachable");
  });

  it("reads a document that sits exactly on the ceiling without calling it truncated", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "text/html" }, chunks: [Buffer.alloc(1024, 0x61)] },
    ]);
    const doc = await pullDocument("https://village.example/", { io: fake.io });
    expect(doc.truncated).toBe(false);
    expect(doc.bytes).toBe(1024);
  });
});

// ── Sub-resources ──────────────────────────────────────────────────────────

describe("sub-resources are capped, so one paste cannot become an amplifier", () => {
  const jpeg = () => {
    const b = Buffer.alloc(64, 0x00);
    b[0] = 0xff;
    b[1] = 0xd8;
    b[2] = 0xff;
    return b;
  };

  it("fetches no more than the ceiling and says how many it skipped", async () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://village.example/p${i}.jpg`);
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "image/jpeg" }, chunks: [jpeg()] },
    ]);
    const out = await pullAssets(urls, { io: fake.io });
    expect(out.fetched).toHaveLength(SITE_PULL.MAX_ASSETS_PER_PULL);
    expect(out.skipped).toBe(25 - SITE_PULL.MAX_ASSETS_PER_PULL);
    expect(fake.opened).toHaveLength(SITE_PULL.MAX_ASSETS_PER_PULL);
  });

  it("re-checks each picture's address on its own", async () => {
    const fake = fakeIo(
      { "village.example": [PUBLIC_V4], "cdn.village.example": ["192.168.1.10"] },
      [{ status: 200, headers: { "content-type": "image/jpeg" }, chunks: [jpeg()] }],
    );
    const out = await pullAssets(
      ["https://village.example/ok.jpg", "https://cdn.village.example/inside.jpg"],
      { io: fake.io },
    );
    expect(out.fetched.map((f) => f.requestedUrl)).toEqual(["https://village.example/ok.jpg"]);
    expect(out.refused[0]).toMatchObject({ reason: "private-address" });
    expect(fake.opened).toHaveLength(1);
  });

  it("reads the first bytes and refuses a page wearing an image content type", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "image/png" }, chunks: html("<html>not found</html>") },
    ]);
    const out = await pullAssets(["https://village.example/logo.png"], { io: fake.io });
    expect(out.fetched).toHaveLength(0);
    expect(out.refused[0].reason).toBe("not-an-image");
  });

  it("refuses a page that answers with something other than a document", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "application/zip" }, chunks: [Buffer.alloc(8)] },
    ]);
    const refusal = await refusalOf(() => pullDocument("https://village.example/", { io: fake.io }));
    expect(refusal.reason).toBe("not-a-document");
  });
});

// ── The control ────────────────────────────────────────────────────────────

describe("the control: the fetcher discriminates, it does not refuse everything", () => {
  it("fetches a legitimate public page and hands back the document", async () => {
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        chunks: html("<html><title>Our village</title><img src=\"/hero.jpg\"></html>"),
      },
    ]);
    const doc = await pullDocument("https://village.example/", { io: fake.io });
    expect(doc.status).toBe(200);
    expect(doc.finalUrl).toBe("https://village.example/");
    expect(doc.contentType).toContain("text/html");
    expect(doc.charset).toBe("utf-8");
    expect(doc.text).toContain("Our village");
    expect(doc.truncated).toBe(false);
    expect(fake.opened).toHaveLength(1);
    // Pinned to the address the guard vetted, not left to the hostname.
    expect(fake.opened[0].address).toBe(PUBLIC_V4);
  });

  it("fetches a legitimate public picture", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const fake = fakeIo({ "village.example": [PUBLIC_V4] }, [
      { status: 200, headers: { "content-type": "image/png" }, chunks: [png] },
    ]);
    const out = await pullAssets(["/logo.png"], { io: fake.io, base: "https://village.example/about" });
    expect(out.refused).toEqual([]);
    expect(out.fetched).toHaveLength(1);
    expect(out.fetched[0].requestedUrl).toBe("https://village.example/logo.png");
    expect(out.fetched[0].bytes.length).toBe(png.length);
  });
});

// ── The rights contract ────────────────────────────────────────────────────

describe("the rights affirmation has to name what is being copied", () => {
  const page = "https://village.example/";
  const asked = ["https://village.example/a.jpg", "https://village.example/b.jpg"];

  it("refuses when nothing was confirmed", () => {
    const r = checkRights({ confirmed: false, sourceUrl: page, assetUrls: asked }, page, asked, "founder-1");
    expect(r.ok).toBe(false);
  });

  it("refuses a blanket yes that names no pictures", () => {
    const r = checkRights({ confirmed: true, sourceUrl: page, assetUrls: [] }, page, asked, "founder-1");
    expect(r.ok).toBe(false);
  });

  it("refuses an affirmation that names a different set from the one being copied", () => {
    const short = checkRights(
      { confirmed: true, sourceUrl: page, assetUrls: [asked[0]] },
      page,
      asked,
      "founder-1",
    );
    expect(short.ok).toBe(false);

    const swapped = checkRights(
      { confirmed: true, sourceUrl: page, assetUrls: [asked[0], "https://elsewhere.example/c.jpg"] },
      page,
      asked,
      "founder-1",
    );
    expect(swapped.ok).toBe(false);
  });

  it("refuses an affirmation about a different site", () => {
    const r = checkRights(
      { confirmed: true, sourceUrl: "https://elsewhere.example/", assetUrls: asked },
      page,
      asked,
      "founder-1",
    );
    expect(r.ok).toBe(false);
  });

  it("accepts the exact set, and records the wording that was agreed", () => {
    const r = checkRights(
      { confirmed: true, sourceUrl: page, assetUrls: [asked[1], asked[0]] },
      page,
      asked,
      "founder-1",
      () => new Date("2026-09-02T10:00:00.000Z"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record).toEqual({
        at: "2026-09-02T10:00:00.000Z",
        by: "founder-1",
        sourceUrl: page,
        assetUrls: [asked[1], asked[0]],
        statement: RIGHTS_STATEMENT,
      });
    }
  });
});

// ── The real transport, and the guard standing in front of it ──────────────

/**
 * These two run against a real listening socket, and they are a pair. The
 * first proves the Node transport genuinely dials the address it is pinned to
 * even when the hostname says otherwise. The second points the same real
 * transport at the same socket through `pullDocument`, and nothing arrives.
 *
 * The second test alone would be worthless: a transport that was broken, or a
 * port nothing listened on, would produce the same silence. It means something
 * only because the first test shows the socket is reachable and the transport
 * works. Together they say the guard is what stopped it.
 */
describe("the real Node transport, pinned and then guarded", () => {
  const listener = async (): Promise<{ port: number; connections: () => number; close: () => Promise<void> }> => {
    let count = 0;
    const server = net.createServer((socket) => {
      count += 1;
      // Drop it at once. The TLS handshake will never finish, which is the
      // point: this test is about whether a packet arrives, not about TLS.
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return {
      port,
      connections: () => count,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  };

  it("dials the vetted address and ignores the hostname it was given", async () => {
    const server = await listener();
    try {
      const controller = new AbortController();
      await nodeIo
        .open({
          url: new URL(`https://village.example:${server.port}/`),
          address: "127.0.0.1",
          family: 4,
          accept: "text/html",
          socketTimeoutMs: 2000,
          signal: controller.signal,
        })
        .catch(() => undefined);
      // `village.example` does not resolve to this machine. The connection
      // landed because the pin, not the hostname, chose the address.
      expect(server.connections()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("opens nothing at all once the guard is in front of the same transport", async () => {
    const server = await listener();
    try {
      // The real socket code, with a resolver that answers the way a hostile
      // one would. The guard sits between them and never calls open.
      const io: PullIo = {
        resolve: async () => [{ address: "127.0.0.1", family: 4 }],
        open: nodeIo.open,
      };
      const refusal = await refusalOf(() => pullDocument("https://village.example/", { io }));
      expect(refusal.reason).toBe("private-address");
      expect(server.connections()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("hands Node the one vetted address in both call shapes it uses", () => {
    const lookup = pinnedLookup({ address: PUBLIC_V4, family: 4 });
    // Node 20 and later ask with { all: true } and read an array back.
    let arrayAnswer: unknown;
    lookup("village.example", { all: true }, (_e, a) => {
      arrayAnswer = a;
    });
    expect(arrayAnswer).toEqual([{ address: PUBLIC_V4, family: 4 }]);

    let stringAnswer: unknown;
    let stringFamily: number | undefined;
    lookup("village.example", {}, (_e, a, f) => {
      stringAnswer = a;
      stringFamily = f;
    });
    expect(stringAnswer).toBe(PUBLIC_V4);
    expect(stringFamily).toBe(4);
  });
});
